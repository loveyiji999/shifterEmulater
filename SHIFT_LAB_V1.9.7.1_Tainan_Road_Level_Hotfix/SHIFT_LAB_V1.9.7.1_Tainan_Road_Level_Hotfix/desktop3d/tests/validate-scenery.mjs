import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {readFileSync} from 'node:fs';
import {RoadWorld} from '../src/road.mjs';
import {RapierChassisBridge} from '../src/chassis.mjs';
import {fixture,base} from './road-v3-fixture.mjs';
import {vehicleParams} from './vehicle-core-fixture.mjs';
import {SceneryPlanner,buildScenery} from '../src/scenery-geometry.mjs';
import {assertColliderTriangles} from './collider-geometry-check.mjs';
await RAPIER.init();
const core=fixture({...base,seed:'SCENERY-V1',turnChance:0,hairpinChance:0,slopeChance:0},24);
core.params=vehicleParams('standard');core.state={surface:'dry',time:0};
const original=JSON.stringify(core.route.v3State);
const world=new RAPIER.World({x:0,y:0,z:0}),scene=new THREE.Scene(),road=new RoadWorld(RAPIER,world,scene,core);
let rockModel,rockCollider,rockMesh,treeModel,treeCollider,activeBridge=null,activeBody=null;
try{
  road.ensure(70);world.step();scene.updateMatrixWorld(true);
  let trees=0,rocks=0;const ids=new Set();
  for(const [key,tile] of road.terrain.tiles){
    const [tx,tz]=key.split(',').map(Number),data=road.terrain.sceneryFor(tx,tz);
    assert.deepEqual(road.terrain.sceneryFor(tx,tz),data,'revisiting a tile cannot change scenery');
    const scenery=tile.scenery;
    for(const model of scenery.models){
      assert.equal(Math.floor(model.x/128),tx);assert.equal(Math.floor(model.z/128),tz);
      assert.ok(!ids.has(model.id),'tile ownership must be unique');ids.add(model.id);
      assert.ok(road.terrain.planner.clearOfRoad(model.x,model.z,model.radius));
      assert.ok(model.y<=model.minGround,'roots/rock bases must be embedded');
      assert.ok(model.y+model.height*.65>model.maxGround,'solid shape must emerge above ground');
      if(model.kind==='tree')trees++;else rocks++;
    }
    for(const kind of ['trunk','rock'])assertColliderTriangles(scenery.objects.filter(m=>m.userData.sceneryKind===kind),scenery.colliders.filter(c=>c.kind===kind).map(c=>c.collider));
    for(const entry of scenery.colliders){
      assert.equal(road.groundHandles.has(entry.collider.handle),entry.kind==='rock');
      assert.equal(road.barrierHandles.has(entry.collider.handle),entry.kind==='trunk');
      if(entry.kind==='rock'&&!rockCollider){rockCollider=entry.collider;rockModel=scenery.models.find(m=>m.id===entry.id);rockMesh=scenery.objects.find(m=>m.userData.sceneryKind==='rock');}
      if(entry.kind==='trunk'&&!treeCollider){treeCollider=entry.collider;treeModel=scenery.models.find(m=>m.id===entry.id);}
    }
  }
  assert.ok(trees>20&&rocks>5,'actual forest and boulder coverage required');
  const flat={footprint:()=>({minY:0,maxY:0})};
  const otherSeed={...core,route:{...core.route,seedHash:core.route.seedHash^0x123456}};
  assert.notDeepEqual(new SceneryPlanner(core).plan(flat,0,0),new SceneryPlanner(otherSeed).plan(flat,0,0),'map seed must affect scenery without changing the road source');
  for(const tile of road.terrain.tiles.values())for(const mesh of tile.scenery.objects){
    for(const attr of Object.values(mesh.geometry.attributes))assert.ok(attr.array.every(Number.isFinite));
    assert.ok(mesh.geometry.index.array.every(i=>i<mesh.geometry.attributes.position.count));
  }
  assert.equal(JSON.stringify(core.route.v3State),original,'scenery cannot advance V3 RNG or edit its alignment');
  const x=rockModel.x+rockModel.radius*.123,z=rockModel.z+rockModel.radius*.177;
  const origin=new THREE.Vector3(x,rockModel.y+rockModel.height+2,z),direction=new THREE.Vector3(0,-1,0);
  const visual=new THREE.Raycaster(origin,direction,0,10).intersectObject(rockMesh)[0];assert.ok(visual);
  const hit=world.castRayAndGetNormal(new RAPIER.Ray(origin,direction),10,true,undefined,undefined,undefined,undefined,c=>c.handle===rockCollider.handle);
  assert.ok(hit);assert.ok(Math.abs(hit.timeOfImpact-visual.distance)<1e-4);
  for(const [condition,mu] of [['dry',.9],['wet',.6],['snow',.32],['ice',.13]]){
    core.state.surface=condition;road.syncSurfaceCondition();const contact=road.surfaceAtHit(hit);
    assert.equal(contact.material,'natural_stone');assert.equal(contact.tireMu,mu);assert.equal(contact.faceIndex,visual.faceIndex);
    assert.equal(contact.layerId,rockMesh.userData.surfaceLayerId);
    assert.equal(road.terrain.scenery.materials.rock.color.getHexString(),road.surfaceMap.profile('natural_stone.'+condition).pbr.color.slice(1));
  }
  const P=core.params,ids4=['FL','FR','RL','RR'];core.WHEEL_IDS=ids4;
  core.wheelModel=Object.fromEntries(ids4.map(id=>[id,{front:id[0]==='F',left:id[1]==='L',omega:0,steer:0}]));
  core.wheelModel.splitMu='same';core.suspension={};core.wheelCoords=id=>({x:(id[1]==='L'?-1:1)*(id[0]==='F'?P.trackFront:P.trackRear)/2,z:id[0]==='F'?P.wheelbase*(1-P.frontStaticLoad):-P.wheelbase*P.frontStaticLoad});
  const bridge=new RapierChassisBridge(RAPIER,world,road,core);activeBridge=bridge;bridge.create(P);const corner=core.wheelCoords('FL');
  bridge.rigidBody.setTranslation({x:x-corner.x,y:origin.y-visual.distance+P.cgHeight,z:z-corner.z},true);world.step();
  const source=readFileSync(new URL('../public/physics.html',import.meta.url),'utf8');
  const helpers=source.slice(source.indexOf('function contactSurfaceAverage('),source.indexOf('function wheelAlignment('));
  const localMu=new Function('P','wheelModel',`let chassisBridge={};const WHEEL_IDS=['FL','FR','RL','RR'];${helpers};return ()=>wheelSurfaceMu('FL',1.02);`)(P,core.wheelModel);
  for(const [condition,mu] of [['dry',.9],['wet',.6],['snow',.32],['ice',.13]]){
    core.state.surface=condition;bridge.beforeForces(1/480);
    assert.equal(core.wheelModel.FL.contactSurface?.material,'natural_stone');assert.ok(core.wheelModel.FL.normal>0);
    assert.equal(localMu(),mu,'actual suspension hit must reach original tire mu helper');
  }
  bridge.dispose();activeBridge=null;
  const n={x:Math.sin(treeModel.angle+Math.PI/10),z:Math.cos(treeModel.angle+Math.PI/10)};
  const start={x:treeModel.x+n.x*(treeModel.trunkRadius+1.5),y:treeModel.y+treeModel.height*.3,z:treeModel.z+n.z*(treeModel.trunkRadius+1.5)};
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true).setTranslation(start.x,start.y,start.z));
  activeBody=body;const ball=world.createCollider(RAPIER.ColliderDesc.ball(.12).setFriction(0),body);body.setLinvel({x:-n.x*20,y:0,z:-n.z*20},true);
  world.timestep=1/480;let contacted=false,maxTravel=0;
  for(let i=0;i<90;i++){world.step();const p=body.translation();maxTravel=Math.max(maxTravel,Math.hypot(p.x-start.x,p.z-start.z));world.contactPair(ball,treeCollider,m=>{if(m.numContacts())contacted=true;});}
  assert.ok(contacted&&maxTravel<1.7,'tree trunk must block a CCD impact');world.removeRigidBody(body);activeBody=null;
  const oldCount=world.colliders.len(),oldObjects=new Set(scene.children),data=road.terrain.dataFor(3,3);
  const prepared={...data,scenery:road.terrain.sceneryFor(3,3)};
  const staged=road.terrain.make(3,3,prepared,true);
  assert.ok(staged.scenery.objects.every(m=>!m.visible));assert.ok(staged.scenery.colliders.every(c=>!c.collider.isEnabled()));
  road.terrain.activate(staged);assert.ok(staged.scenery.objects.every(m=>m.visible));assert.ok(staged.scenery.colliders.every(c=>c.collider.isEnabled()));
  road.terrain.dispose(staged);assert.equal(world.colliders.len(),oldCount);assert.deepEqual(new Set(scene.children),oldObjects);
  const create=world.createCollider;let allocated=0;world.createCollider=function(...args){if(++allocated===3)throw Error('scenery allocation fixture');return create.apply(this,args);};
  assert.throws(()=>road.terrain.scenery.create(prepared.scenery),/scenery allocation fixture/);world.createCollider=create;
  assert.equal(world.colliders.len(),oldCount);assert.deepEqual(new Set(scene.children),oldObjects);
  const a=road.terrain.dataFor(0,0),b=road.terrain.dataFor(1,0),edge=d=>{const m=new Map();for(let i=0;i<d.vertices.length;i+=3)if(d.vertices[i]===128)m.set(d.vertices[i+2],Array.from(d.colors.slice(i,i+3)));return m;};
  const ea=edge(a),eb=edge(b);for(const [z,value] of ea)assert.deepEqual(eb.get(z),value,'terrain tint must match across seams');
  console.log('PASS scenery: '+JSON.stringify({trees,rocks,rockRayErrorM:Math.abs(hit.timeOfImpact-visual.distance),treeCcdMaxTravelM:maxTravel})+'; exact mesh/collision union, tile ownership, unchanged V3, actual tire mu, weather, staged enable, allocation rollback and cleanup');
}finally{activeBridge?.dispose();if(activeBody)world.removeRigidBody(activeBody);road.clear();road.assertClean();assert.equal(world.colliders.len(),0);assert.equal(scene.children.length,0);world.free();}
