import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {terrainWeights,terrainWeightsAt} from '../src/terrain-surface.mjs';
import {RoadWorld} from '../src/road.mjs';
import {RapierChassisBridge} from '../src/chassis.mjs';
import {fixture,base} from './road-v3-fixture.mjs';
import {vehicleParams} from './vehicle-core-fixture.mjs';
import {inspectTerrainBlend} from './terrain-blend-driver.mjs';

const triangle={vertices:new Float32Array([0,0,0,0,0,10,10,0,0]),indices:new Uint32Array([0,1,2]),weights:new Float32Array([1,0,0,0,1,0,0,0,1])};
assert.deepEqual(terrainWeightsAt(triangle,0,{x:5,z:3}),[.2,.3,.5]);
for(const [point,expected] of [[{x:0,z:0},[1,0,0]],[{x:0,z:10},[0,1,0]],[{x:10,z:0},[0,0,1]]])assert.deepEqual(terrainWeightsAt(triangle,0,point),expected);
await RAPIER.init();
const core=fixture(base,48);core.params=vehicleParams('standard');core.state={surface:'dry'};
const before=JSON.stringify(core.route.v3State),world=new RAPIER.World({x:0,y:0,z:0}),scene=new THREE.Scene();
const road=new RoadWorld(RAPIER,world,scene,core);let bridge=null,queries=0,maxError=0,maximumRock=0,maximumGravel=0;
try{
  for(const station of [70,...core.route.v3State.features.filter(f=>f.kind==='suspension').slice(0,1).map(f=>(f.start+f.end)/2)]){
    road.ensure(station);world.step();
    let previous=null;
    for(const condition of ['dry','wet','snow','ice']){
      core.state.surface=condition;road.syncSurfaceCondition();
      const result=inspectTerrainBlend({road,renderer:{getContext:()=>({}),info:{programs:[]}}});
      queries+=result.queries;maxError=Math.max(maxError,result.maxWeightError);
      maximumRock=Math.max(maximumRock,result.ranges[2][1]);maximumGravel=Math.max(maximumGravel,result.ranges[1][1]);
      if(previous)assert.deepEqual(result.ranges,previous.ranges);previous=result;
      assert.ok(result.maxHeightError<1e-4&&result.maxWeightError<1e-5);
      for(const sample of result.samples){
        assert.equal(sample.condition,condition);
        for(const key of ['tireMu','rollingCoefficient'])assert.ok(Math.abs(sample[key]-sample.components.reduce((sum,c)=>sum+c.weight*road.surfaceMap.profile(c.profileId).contact[key],0))<1e-12);
      }
      const profiles=['earth','terrain_gravel','natural_stone'].map(id=>road.surfaceMap.profile(id+'.'+condition));
      profiles.forEach((p,i)=>assert.ok(Math.abs(road.terrain.material.uniforms.terrainRough.value.getComponent(i)-p.pbr.roughness)<1e-12));
    }
    const tile=road.terrain.tiles.values().next().value,g=tile.mesh.geometry;
    const data={vertices:g.attributes.position.array,indices:g.index.array,normals:g.attributes.normal.array};
    assert.deepEqual(g.attributes.terrainWeights.array,terrainWeights(data,core.route.seedHash));
    assert.notDeepEqual(g.attributes.terrainWeights.array,terrainWeights(data,core.route.seedHash+1));
  }
  assert.ok(maximumRock>.5&&maximumGravel>.5,'real road valleys must expose rock and gravel');
  road.ensure(70);world.step();core.state.surface='dry';road.syncSurfaceCondition();
  const a=road.terrain.dataFor(0,0),b=road.terrain.dataFor(1,0);
  const edge=d=>{const m=new Map();for(let i=0;i<d.vertices.length;i+=3)if(d.vertices[i]===128)m.set(d.vertices[i+2],Array.from(d.weights.slice(i,i+3)));return m;};
  const ea=edge(a),eb=edge(b);for(const [z,w] of ea)assert.deepEqual(eb.get(z),w,'shared Float32 material seam');
  const P=core.params,ids=['FL','FR','RL','RR'];core.WHEEL_IDS=ids;core.suspension={};
  core.wheelModel=Object.fromEntries(ids.map(id=>[id,{front:id[0]==='F',left:id[1]==='L',omega:0,steer:0}]));core.wheelModel.splitMu='same';
  core.wheelCoords=id=>({x:(id[1]==='L'?-1:1)*(id[0]==='F'?P.trackFront:P.trackRear)/2,z:id[0]==='F'?P.wheelbase*(1-P.frontStaticLoad):-P.wheelbase*P.frontStaticLoad});
  bridge=new RapierChassisBridge(RAPIER,world,road,core);bridge.create(P);
  const target=inspectTerrainBlend({road,renderer:{getContext:()=>({}),info:{programs:[]}}}).samples.find(s=>s.components[1].weight>.15&&s.components[1].weight<.85);assert.ok(target,'mixed wheel footprint required');
  const x=target.x,z=target.z,hit=world.castRayAndGetNormal(new RAPIER.Ray({x,y:60,z},{x:0,y:-1,z:0}),100,true,undefined,undefined,undefined,undefined,c=>road.surfaceMap.bindings.get(c.handle)?.terrain);
  assert.ok(hit);const corner=core.wheelCoords('FL');bridge.rigidBody.setTranslation({x:x-corner.x,y:60-hit.timeOfImpact+P.cgHeight,z:z-corner.z},true);world.step();
  const source=readFileSync(new URL('../public/physics.html',import.meta.url),'utf8');
  const helpers=source.slice(source.indexOf('function contactSurfaceAverage('),source.indexOf('function wheelAlignment('));
  const tireMu=new Function('P','wheelModel',`let chassisBridge={};const WHEEL_IDS=['FL','FR','RL','RR'];${helpers};return ()=>wheelSurfaceMu('FL',1.02);`)(P,core.wheelModel);
  for(const condition of ['dry','wet','snow','ice']){
    core.state.surface=condition;bridge.beforeForces(1/480);const c=core.wheelModel.FL.contactSurface;
    assert.equal(c.material,'terrain_mix');assert.ok(c.components[1].weight>.1);assert.ok(core.wheelModel.FL.normal>0);
    assert.equal(tireMu(),c.tireMu,'actual wheel contact reaches original tire helper');
  }
  assert.equal(JSON.stringify(core.route.v3State),before,'material generation must not advance road RNG');
  console.log('PASS real terrain blend: '+JSON.stringify({queries,maxError,maximumRock,maximumGravel})+'; exact Three barycentric mask, four weather profiles, original tire helper, seams, seed isolation and shared geometry');
}finally{bridge?.dispose();road.clear();road.assertClean();assert.equal(world.colliders.len(),0);assert.equal(scene.children.length,0);world.free();}
