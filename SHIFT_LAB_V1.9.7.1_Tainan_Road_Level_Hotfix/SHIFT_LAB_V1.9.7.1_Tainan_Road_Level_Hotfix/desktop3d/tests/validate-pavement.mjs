import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import {PAVEMENT_MATERIAL_IDS,pavementHasMarkings} from '../src/pavement-definition.mjs';
import {RoadWorld} from '../src/road.mjs';
import {fixture,base} from './road-v3-fixture.mjs';
import {vehicleParams} from './vehicle-core-fixture.mjs';
await RAPIER.init();
const core=fixture({...base,turnChance:0,slopeChance:0,hairpinChance:0},12);
core.params=vehicleParams('diesel');core.state={surface:'dry'};
const world=new RAPIER.World({x:0,y:-9.81,z:0}),road=new RoadWorld(RAPIER,world,new THREE.Scene(),core);
const expected={asphalt_dense:[1.02,.68,.32,.13],concrete:[.98,.65,.31,.13],gravel:[.72,.52,.30,.12],asphalt_open:[.99,.7,.32,.13],concrete_paver:[.92,.6,.3,.12],clay_paver:[.88,.55,.29,.12],natural_stone:[.9,.57,.3,.12],earth:[.62,.38,.28,.12],timber:[.75,.45,.28,.12],steel:[.74,.42,.24,.1]};
try{
  road.ensure(70);world.step();const original=new Set(road.groundHandles),material=road.surfaceMaterial;
  const contact=side=>{const p=road.position(70,side);const hit=world.castRayAndGetNormal(new RAPIER.Ray({...p,y:p.y+1},{x:0,y:-1,z:0}),2,true,
    undefined,undefined,undefined,undefined,c=>road.groundHandles.has(c.handle));assert.ok(hit);return road.surfaceAtHit(hit);};
  for(const [id,coefficients] of Object.entries(expected))for(const [i,condition] of ['dry','wet','snow','ice'].entries()){
    road.setPavementMaterial(id);core.state.surface=condition;road.ensure(70);
    const actual=contact(1),profile=road.surfaceMap.pavementProfile(id,condition);
    assert.equal(actual.material,id);assert.equal(actual.profileId,profile.id);assert.equal(actual.tireMu,coefficients[i]);
    assert.equal(actual.rollingCoefficient,id==='asphalt_dense'?core.params.rollingCoeff:profile.contact.rollingCoefficient);
    assert.equal(material.color.getHexString(),profile.pbr.color.slice(1));assert.equal(material.roughness,profile.pbr.roughness);assert.equal(material.metalness,profile.pbr.metalness);assert.equal(actual.colliderFriction,.65);
    assert.equal(material.map,road.materialLibrary.textures(id).color);
    for(const chunk of road.chunks.values())for(const mesh of chunk.objects)if(mesh.material===road.markMaterial)assert.equal(mesh.visible,pavementHasMarkings(id));
    assert.equal(contact(5.6).material,null,'legacy shoulder classification must stay separate');
    assert.deepEqual(road.groundHandles,original,'material selection cannot change contact geometry');
  }
  assert.equal(road.surfaceMaterial,material,'existing meshes keep their shared material reference');
  assert.deepEqual(new Set(Object.keys(expected)),new Set(PAVEMENT_MATERIAL_IDS));
  assert.throws(()=>road.setPavementMaterial('unknown'));assert.equal(road.surfaceMap.pavementMaterial,'steel');
  const staged=road.makeChunkV3(0,null,true);road.streamer={stagedRoads:[[0,staged]]};
  for(const id of ['earth','steel','asphalt_open']){road.setPavementMaterial(id);for(const m of staged.objects)if(m.material===road.markMaterial){assert.equal(m.visible,false);assert.equal(m.userData.hiddenForPavement,!pavementHasMarkings(id));}}
  road.streamer=null;road.disposeChunk(0,staged,false);road.setPavementMaterial('gravel');
  const textures=road.materialLibrary.textures;road.materialLibrary.textures=()=>{throw Error('texture allocation fixture');};
  assert.throws(()=>road.setPavementMaterial('concrete'),/texture allocation/);road.materialLibrary.textures=textures;
  assert.equal(road.surfaceMap.pavementMaterial,'gravel');assert.equal(contact(1).material,'gravel');
  core.state.surface='dry';road.setSurfaceZones([{id:'concrete-wet',profileId:'concrete.wet',layerIds:['v3:0:asphalt'],bounds:{minX:-6,maxX:0,minZ:0,maxZ:100}}]);world.step();
  assert.equal(contact(-1).profileId,'concrete.wet');assert.equal(contact(1).profileId,'gravel.dry');
  assert.equal(contact(-1).tireMu,.65);assert.equal(contact(1).tireMu,.72);
  core.route.config.generator=2;assert.throws(()=>road.setPavementMaterial('concrete'),/require V3/);road.ensure(70);assert.equal(road.surfaceMap.pavementMaterial,'asphalt_dense');
}finally{road.clear();road.assertClean();world.free();}
console.log('PASS 10 pavements x 4 conditions, actual Rapier face profiles, independent rolling/mu, shared PBR, zones, unchanged geometry, texture failure rollback and frozen-map restriction');
