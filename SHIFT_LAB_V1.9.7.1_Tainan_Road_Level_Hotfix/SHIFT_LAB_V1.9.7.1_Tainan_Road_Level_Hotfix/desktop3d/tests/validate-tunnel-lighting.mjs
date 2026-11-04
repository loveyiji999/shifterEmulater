import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {fixture,base,engine} from './road-v3-fixture.mjs';
import {TunnelLightField} from '../src/tunnel-light-field.mjs';
import {TunnelLighting,TUNNEL_LIGHT_LIMIT} from '../src/tunnel-lighting.mjs';
import {RoadWorld} from '../src/road.mjs';

const core=fixture(base,48),original=JSON.stringify(core.route.v3State),field=new TunnelLightField(core);
const tunnels=core.route.v3State.features.filter(f=>f.kind==='tunnel');assert.ok(tunnels.length);
let samples=0;
for(const f of tunnels){
  let previous=1;
  for(let distance=0;distance<=Math.min(24,(f.end-f.start)/2);distance++){
    const p=core.roadPointAt(f.start+distance),value=field.sample({...p,y:p.y+1});
    assert.ok(value<=previous+1e-6);assert.ok(value>=.06-1e-12&&value<=1);previous=value;samples++;
  }
  const p=core.roadPointAt((f.start+f.end)/2);
  if(f.end-f.start>=48)assert.ok(Math.abs(field.sample({...p,y:p.y+1})-.06)<1e-10);
  for(const y of [p.y+field.height+1,p.y-1])assert.equal(field.sample({...p,y}),1,'no upper/lower-layer darkening');
  for(const sign of [-1,1])assert.equal(field.sample({x:p.x+Math.cos(p.heading)*8*sign,z:p.z-Math.sin(p.heading)*8*sign,y:p.y+1}),1,'outside walls stays in daylight');
}
await RAPIER.init();
const world=new RAPIER.World({x:0,y:0,z:0}),scene=new THREE.Scene(),road=new RoadWorld(RAPIER,world,scene,core),lighting=new TunnelLighting(scene,road);
let fixtures=0;
try{
  const f=tunnels[0],s=(f.start+f.end)/2,p=core.roadPointAt(s);road.ensure(s);world.step();lighting.update({...p,y:p.y+1});
  assert.equal(lighting.lights.length,TUNNEL_LIGHT_LIMIT);assert.ok(lighting.active.length>0&&lighting.active.length<=TUNNEL_LIGHT_LIMIT);
  const ids=new Set();
  for(const chunk of road.chunks.values())for(const c of chunk.components||[])if(c.kind==='tunnel-luminaire'){
    assert.ok(!ids.has(c.id),'half-open chunk fixture ownership');ids.add(c.id);fixtures++;
    const origin={...c.ceilingPosition,y:c.ceilingPosition.y-1};
    const h=world.castRayAndGetNormal(new RAPIER.Ray(origin,{x:0,y:1,z:0}),2,true,undefined,undefined,undefined,undefined,x=>road.barrierHandles.has(x.handle));
    assert.ok(h&&Math.abs(h.timeOfImpact-1)<1e-4,'emissive finish must coincide with the actual physical roof');
  }
  assert.ok(fixtures>5);
  for(const side of [-6.1,6.1]){
    const p=road.position(s,side),hit=world.castRayAndGetNormal(new RAPIER.Ray({...p,y:p.y+1},{x:0,y:-1,z:0}),2,true,undefined,undefined,undefined,undefined,c=>road.groundHandles.has(c.handle));
    assert.ok(hit&&hit.normal.y>0);assert.equal(road.surfaceAtHit(hit).renderKind,'shoulder','paved verge must reach the actual wall');
    assert.equal(road.terrain.surfaceAt(p.x,p.z),null,'no terrain can rise into the bore verge');
  }
  for(const chunk of road.chunks.values())for(const mesh of chunk.objects){
    const sky=mesh.geometry.attributes.skyVisibility,id=mesh.geometry.attributes.tunnelId;
    assert.equal(sky.count,mesh.geometry.attributes.position.count);assert.equal(id.count,sky.count);
    assert.ok(sky.array.every(v=>Number.isFinite(v)&&v>=.059999&&v<=1));
  }
  let boreQueries=0;
  for(const f of tunnels)for(let at=Math.ceil((f.start+2)/8)*8;at<f.end-2;at+=8)for(const lateral of [-6.1,6.1]){
    const q=road.position(at,lateral);assert.equal(road.terrain.surfaceAt(q.x,q.z),null,'terrain inside tunnel wall at '+at+','+lateral);boreQueries++;
  }
  assert.ok(boreQueries>20);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  road.surfaceMaterial.onBeforeCompile(shader);assert.ok(shader.fragmentShader.includes('tunnelLightIds[i]'));assert.ok(shader.fragmentShader.includes('irradiance*=vTunnelSky'));
  lighting.update({...p,y:p.y+20});assert.equal(lighting.vehicleSky.value,1);assert.equal(lighting.vehicleTunnel.value,0);
  assert.equal(JSON.stringify(core.route.v3State),original,'light queries must not consume V3 RNG');
  const oldField=road.terrain.skyField,colliderCount=world.colliders.len(),oldTunnelCount=tunnels.length;
  engine.extend(core.route.v3State,96);core.route.points=core.route.v3State.points;core.route.segments=core.route.v3State.segments;
  const next=core.route.v3State.features.filter(f=>f.kind==='tunnel')[oldTunnelCount];assert.ok(next,'extended route tunnel required');
  const nextPoint=core.roadPointAt((next.start+next.end)/2);lighting.update({...nextPoint,y:nextPoint.y+1});
  assert.ok(lighting.vehicleSky.value<.1);assert.equal(lighting.field.revision,core.route.v3State.revision);
  assert.equal(road.terrain.skyField,oldField);assert.equal(world.colliders.len(),colliderCount,'lighting revision refresh must not clear active geometry');
  road.clear();lighting.update(p);assert.equal(lighting.active.length,0);assert.ok(lighting.lights.every(l=>l.intensity===0));
  const material=new THREE.MeshStandardMaterial(),originalCompile=material.onBeforeCompile,originalKey=material.customProgramCacheKey;
  lighting.registerMaterial(material);lighting.dispose();assert.equal(material.onBeforeCompile,originalCompile);assert.equal(material.customProgramCacheKey,originalKey);
  const replacement=new TunnelLighting(scene,road);replacement.registerMaterial(material);replacement.dispose();material.dispose();
  console.log('PASS tunnel sky field: '+JSON.stringify({samples,fixtures,boreQueries,lightLimit:TUNNEL_LIGHT_LIMIT})+'; portal continuity, XYZ/layer exclusion, exact physical roof, bounded lights and reset ownership');
}finally{road.clear();lighting.dispose();road.assertClean();assert.equal(world.colliders.len(),0);assert.equal(scene.children.length,0);world.free();}
