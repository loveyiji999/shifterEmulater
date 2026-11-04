import {assertColliderTriangles} from './collider-geometry-check.mjs';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {RoadWorld} from '../src/road.mjs';
import {fixture,base} from './road-v3-fixture.mjs';
import {vehicleParams} from './vehicle-core-fixture.mjs';
await RAPIER.init();
const core=fixture({...base,seed:'SURFACE-CONTACT-V1',turnChance:0,hairpinChance:0,slopeChance:0},12);
core.params=vehicleParams('standard');core.state={surface:'dry'};
const world=new RAPIER.World({x:0,y:-9.81,z:0}),scene=new THREE.Scene(),road=new RoadWorld(RAPIER,world,scene,core);
const hitAt=(s,side=0)=>{const p=road.position(s,side);return world.castRayAndGetNormal(
  new RAPIER.Ray({...p,y:p.y+1},{x:0,y:-1,z:0}),2,true,undefined,undefined,undefined,undefined,c=>road.groundHandles.has(c.handle));};
road.ensure(70);world.step();
assert.equal(road.surfaceAtHit(hitAt(70,-1)).tireMu,1.02);
const unclassified=road.surfaceAtHit(hitAt(70,5.6));
assert.equal(unclassified.material,null);assert.equal(unclassified.scope,'legacy-unclassified-ground');
assert.equal(unclassified.profileId,'legacy-unclassified.dry','existing verges must not be mislabeled as calibrated asphalt');
const zone={id:'left-wet',profileId:'asphalt_dense.wet',layerIds:['v3:0:asphalt'],bounds:{minX:-12,maxX:0,minZ:-20,maxZ:100}};
road.setSurfaceZones([zone]);world.step();
const left=road.surfaceAtHit(hitAt(70,-1)),right=road.surfaceAtHit(hitAt(70,1));
assert.equal(left.tireMu,.68);assert.equal(right.tireMu,1.02);assert.equal(left.layerId,'v3:0:asphalt');
assert.equal(left.condition,'wet');assert.equal(right.condition,'dry');
const mesh=road.chunks.get(0).objects.find(m=>m.userData.surfaceLayerId===left.layerId);
assert.ok(Array.isArray(mesh.material)&&mesh.material.length===2);
for(const contact of [left,right]){
  const group=mesh.geometry.groups.find(g=>contact.faceIndex*3>=g.start&&contact.faceIndex*3<g.start+g.count);
  const key=mesh.userData.surfaceProfiles[group.materialIndex];
  assert.equal(key==='global'?'asphalt_dense.dry':key,contact.profileId,'rendered face and physics face must use the same profile');
}
core.state.surface='ice';road.ensure(70);assert.equal(road.surfaceAtHit(hitAt(70,1)).tireMu,.13);
assert.equal(road.surfaceAtHit(hitAt(70,-1)).tireMu,.68,'explicit local condition overrides global default');
assert.equal(road.surfaceMaterial.color.getHexString(),'93b5c1');
const oldMap=road.chunks,oldCount=world.colliders.len(),oldBindings=road.surfaceMap.bindings.size,oldObjects=new Set(scene.children);
assert.throws(()=>road.setSurfaceZones([{...zone,profileId:'unregistered-steel.dry'}]));assert.equal(road.chunks,oldMap);
assert.throws(()=>road.setSurfaceZones([zone,{...zone,id:'duplicate-area'}]));
const create=world.createCollider;let allocations=0;
world.createCollider=function(...args){if(++allocations===3)throw Error('surface allocation fixture');return create.apply(this,args);};
assert.throws(()=>road.setSurfaceZones([]),/surface allocation fixture/);world.createCollider=create;
assert.equal(road.chunks,oldMap);assert.equal(world.colliders.len(),oldCount);assert.equal(road.surfaceMap.bindings.size,oldBindings);
assert.deepEqual(new Set(scene.children),oldObjects,'failed rebuild must preserve visible ownership');
assert.equal(road.surfaceMap.zones[0].id,zone.id);
for(const chunk of road.chunks.values()){
  const meshes=chunk.objects.filter(m=>m.material!==road.markMaterial);
  assertColliderTriangles(meshes,chunk.colliders.map(({collider})=>collider));
}
road.clear();road.assertClean();assert.equal(road.surfaceMap.bindings.size,0);assert.equal(world.colliders.len(),0);
const layered=fixture(base,48);Object.assign(core,layered);core.state.surface='dry';
const cross=core.route.v3State.crossings[0];road.ensure(cross.upper);world.step();
const layer=`v3:${Math.floor(cross.upper/100)}:asphalt`;
road.setSurfaceZones([{id:'upper-wet',profileId:'asphalt_dense.wet',layerIds:[layer],
  bounds:{minX:cross.x-30,maxX:cross.x+30,minZ:cross.z-30,maxZ:cross.z+30}}]);world.step();
const upper=road.surfaceAtHit(hitAt(cross.upper)),lower=road.surfaceAtHit(hitAt(cross.lower));
assert.equal(upper.tireMu,.68);assert.equal(lower.tireMu,1.02);assert.notEqual(upper.layerId,lower.layerId);
assert.notEqual(upper.colliderHandle,lower.colliderHandle);
const newer=fixture({...base,seed:'LEVEL-2'},48);Object.assign(core,newer);road.ensure(70);
assert.equal(road.surfaceMap.zones.length,0,'new route state must not inherit zones for unrelated layers');
road.clear();road.assertClean();world.free();

// Execute actual core helpers, including the local-mu override and weighted
// rolling/handling aggregate. No duplicate tire force implementation.
const source=readFileSync(new URL('../public/physics.html',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('function contactSurfaceAverage('),source.indexOf('function wheelAlignment('));
const resist=source.slice(source.indexOf('function resistForce('),source.indexOf('function applyBrake('));
const P=vehicleParams('standard'),wheels={splitMu:'same'};
for(const id of ['FL','FR','RL','RR'])wheels[id]={left:id[1]==='L',contact:true,normal:1000,
  contactSurface:{tireMu:id[1]==='L'?.68:1.02,rollingCoefficient:P.rollingCoeff}};
const api=new Function('P','wheelModel',`let chassisBridge={};const state={grade:0};const WHEEL_IDS=['FL','FR','RL','RR'];
  ${helpers}\n${resist}\nreturn {mu:id=>wheelSurfaceMu(id,1.02),average:()=>contactSurfaceAverage('tireMu',1.02),
  resistance:resistForce,legacy:()=>{chassisBridge=null;}};`)(P,wheels);
assert.equal(api.mu('FL'),.68);assert.equal(api.mu('FR'),1.02);assert.equal(api.average(),.85);
const oldResistance=api.resistance(10);wheels.FL.contactSurface.rollingCoefficient=.04;
assert.ok(api.resistance(10)<oldResistance,'material rolling input must reach existing resistance force');
api.legacy();assert.equal(api.mu('FL'),1.02);assert.equal(api.average(),1.02);assert.equal(api.resistance(10),oldResistance);
console.log('PASS per-face surfaces: dry/wet split, renderer/collider identity, actual feature IDs, upper/lower isolation, global conditions, transactional rollback, reset cleanup and actual core force inputs');
