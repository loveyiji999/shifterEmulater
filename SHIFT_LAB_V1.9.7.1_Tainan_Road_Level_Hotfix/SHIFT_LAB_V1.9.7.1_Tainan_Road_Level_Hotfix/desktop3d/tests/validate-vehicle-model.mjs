import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {RapierChassisBridge} from '../src/chassis.mjs';
import {captureLegacyVehicle,VEHICLE_IDS} from '../src/vehicle-definition.mjs';
import {createVehicleVisual,syncVehicleVisual,disposeVehicleVisual} from '../src/vehicle-visual.mjs';
import {vehicleParams} from './vehicle-core-fixture.mjs';
await RAPIER.init();
const reports=[];
for(const calibrated of [false,true])for(const id of VEHICLE_IDS){
  const P=vehicleParams(id,calibrated),definition=captureLegacyVehicle(id,P);
  const world=new RAPIER.World({x:0,y:0,z:0}),scene=new THREE.Scene();
  const physics={params:P,WHEEL_IDS:['FL','FR','RL','RR'],wheelModel:{},
    state:{time:0},vehicleMotion:{guardrailHits:0},suspension:{}};
  const road={groundHandles:new Set(),railHandles:new Set(),barrierHandles:new Set()};
  const bridge=new RapierChassisBridge(RAPIER,world,road,physics);bridge.create(P);
  world.step();
  assert.equal(bridge.colliders.length,definition.appearance.collisionParts.length);
  const b=bridge.rigidBody;
  assert.ok(Math.abs(b.mass()-P.mass)<.01,'zero-density body/cabin must preserve mass');
  const inertia=b.principalInertia();
  for(const [axis,value] of Object.entries({x:Math.max(200,P.pitchInertia),y:P.yawInertia,z:Math.max(200,P.rollInertia)}))
    assert.ok(Math.abs(inertia[axis]-value)<.02,'inertia must remain unchanged');
  assert.ok(Math.hypot(...Object.values(b.localCom()))<1e-7);
  const visual=createVehicleVisual(definition);scene.add(visual.group);
  let maxHullError=0;
  for(const [i,mesh] of visual.collisionMeshes.entries()){
    mesh.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(mesh);
    const actual=bridge.colliders[i],part=visual.layout.colliders[i],center=actual.translation();
    let colliderBounds;
    if(part.kind==='convex')colliderBounds=new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(actual.vertices(),3))
      .translate(new THREE.Vector3(center.x,center.y,center.z));
    else{const half=actual.halfExtents();colliderBounds=new THREE.Box3(
      new THREE.Vector3(center.x-half.x,center.y-half.y,center.z-half.z),new THREE.Vector3(center.x+half.x,center.y+half.y,center.z+half.z));}
    for(const axis of ['x','y','z']){
      maxHullError=Math.max(maxHullError,Math.abs(bounds.min[axis]-colliderBounds.min[axis]),
        Math.abs(bounds.max[axis]-colliderBounds.max[axis]));
    }
  }
  assert.ok(maxHullError<visual.layout.bodyHullToleranceM,'model and real Rapier hull bounds');
  for(const w of visual.wheels){physics.wheelModel[w.id]={steer:w.id[0]==='F'?.2:0,omega:8};}
  const wheelState=Object.fromEntries(visual.wheels.map(w=>[w.id,{hubLocalY:-.2}]));
  const phases=Object.fromEntries(visual.wheels.map(w=>[w.id,Math.PI/2]));
  syncVehicleVisual(visual,b,physics.wheelModel,wheelState,0,phases);
  visual.group.updateMatrixWorld(true);
  for(const wheel of visual.wheels){
    assert.equal(wheel.pivot.position.y,-.2);
    assert.equal(wheel.pivot.rotation.y,physics.wheelModel[wheel.id].steer);
    assert.equal(wheel.spin.rotation.x,Math.PI/2);
    const marker=new THREE.Vector3(0,P.wheelRadius,0).applyQuaternion(wheel.spin.quaternion);
    assert.ok(marker.z>0&&Math.abs(marker.y)<1e-8,'forward rolling rotates the upper tread toward +Z');
  }
  syncVehicleVisual(visual,b,physics.wheelModel,wheelState,100,phases);
  assert.equal(visual.wheels[0].spin.rotation.x,Math.PI/2,'unchanged physics phase must remain frozen across rendered frames');
  const oldBody=bridge.rigidBody,oldCount=world.colliders.len();
  assert.throws(()=>bridge.create({...P,mass:NaN}));assert.equal(bridge.rigidBody,oldBody);
  // Simulate allocation failure after creating the candidate body: old body and
  // both colliders must survive, candidate resources must be rolled back.
  const create=world.createCollider,oldStopHandles=bridge.bumpStopHandles;
  for(const failedAllocation of [2,bridge.colliders.length+3]){
    let allocations=0;
    world.createCollider=function(...args){if(++allocations===failedAllocation)throw Error('allocation fixture');return create.apply(this,args);};
    assert.throws(()=>bridge.create(P),/allocation fixture/);world.createCollider=create;
    assert.equal(bridge.rigidBody,oldBody);assert.equal(world.colliders.len(),oldCount);
    assert.equal(bridge.bumpStopHandles,oldStopHandles);
  }
  const roofHit=world.castRay(new RAPIER.Ray({x:0,y:1,z:-.16},{x:0,y:-1,z:0}),2,true);
  assert.equal(roofHit.collider.handle,bridge.colliders[1].handle,'visible cabin must block an overhead ray');
  const obstacle=world.createCollider(RAPIER.ColliderDesc.cuboid(.2,.1,.2).setTranslation(0,.6,-.16));
  road.barrierHandles.add(obstacle.handle);
  for(let i=0;i<4;i++){world.step();bridge.captureContacts(1/480);}
  assert.ok(bridge.barrierHits>0,'roof-only contact must be counted');
  road.barrierHandles.delete(obstacle.handle);world.removeCollider(obstacle,true);
  b.setTranslation({x:0,y:0,z:0},true);b.setRotation({x:0,y:0,z:0,w:1},true);
  b.setLinvel({x:0,y:0,z:20},true);b.setAngvel({x:0,y:0,z:0},true);
  const overhead=world.createCollider(RAPIER.ColliderDesc.cuboid(.5,.1,.4).setTranslation(0,.6,2));
  road.barrierHandles.add(overhead.handle);bridge.resetImpactTelemetry();
  world.timestep=1/480;
  for(let i=0;i<96&&bridge.barrierHits===0;i++){world.step();bridge.captureContacts(1/480);}
  assert.ok(bridge.barrierHits>0&&b.translation().z<1.5,'20 m/s cabin must collide with overhead obstruction');
  bridge.resetImpactTelemetry();
  for(const wheel of Object.values(physics.wheelModel))wheel.contact=false;
  for(let i=0;i<48;i++)bridge.stepForces(0,0,0,0,1/480);
  for(const phase of Object.values(bridge.wheelPhases))assert.ok(Math.abs(phase-.8)<1e-10,
    'visible phase must integrate actual omega once per microstep, including airborne wheels');
  const ownedGeometry=new Set(),ownedMaterial=new Set(),counts=new Map();
  for(const mesh of visual.collisionMeshes)ownedGeometry.add(mesh.geometry);
  visual.group.traverse(o=>{if(o.geometry)ownedGeometry.add(o.geometry);if(o.material)ownedMaterial.add(o.material);});
  for(const object of [...ownedGeometry,...ownedMaterial])object.addEventListener('dispose',()=>counts.set(object,(counts.get(object)||0)+1));
  disposeVehicleVisual(visual);assert.equal(scene.children.length,0);
  assert.ok([...ownedGeometry,...ownedMaterial].every(o=>counts.get(o)===1),'shared assets disposed exactly once');
  reports.push({id,calibrated,maxHullErrorM:maxHullError,massKg:b.mass(),roofContact:true,colliders:bridge.colliders.length});bridge.dispose();world.free();
}
const sources=['src/vehicle-layout.mjs','src/vehicle-visual.mjs','src/vehicle-definition.mjs','src/chassis.mjs','public/physics.html','tests/validate-vehicle-model.mjs'];
writeFileSync(new URL('../../artifacts/tests/p1-vehicle-model-2026-10-29.json',import.meta.url),JSON.stringify({
  schema:'shiftlab.reference-vehicle.verification.v1',recordedAt:new Date().toISOString(),layoutRevision:3,
  scope:'reference procedural model geometry and actual Rapier; not full vehicle creator or P3 performance',
  bodyHullToleranceM:.001,decorativeLampOverhangM:.01,wheelSurfaceToleranceM:.015,
  checks:['body/cabin actual bounds','unchanged mass/inertia/COM','independent steering and axle spin',
    'pause invariance','overhead ray and 20 m/s roof collision','atomic body allocation rollback',
    '480 Hz phase integration including airborne wheels','unique shared resource disposal'],
  reports,sourceHashes:Object.fromEntries(sources.map(path=>[path,createHash('sha256').update(readFileSync(new URL('../'+path,import.meta.url))).digest('hex')]))
},null,2)+'\n');
console.log('PASS shared model, real Rapier body/cabin bounds, unchanged mass/inertia, steering/spin/pause, roof contacts, atomic create rollback and unique disposal: '+JSON.stringify(reports));
