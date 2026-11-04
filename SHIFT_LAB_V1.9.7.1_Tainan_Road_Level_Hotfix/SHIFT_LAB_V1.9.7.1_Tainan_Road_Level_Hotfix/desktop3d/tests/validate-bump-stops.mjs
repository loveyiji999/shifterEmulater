import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {RapierChassisBridge} from '../src/chassis.mjs';
import {vehicleParams} from './vehicle-core-fixture.mjs';
await RAPIER.init();
const P=vehicleParams('standard');
for(const drivable of [false,true]){
  const world=new RAPIER.World({x:0,y:0,z:0}),groundHandles=new Set();
  const road={groundHandles},bridge=new RapierChassisBridge(RAPIER,world,road,{});bridge.create(P);
  assert.equal(Object.keys(bridge.bumpStops).length,4);
  for(const stop of Object.values(bridge.bumpStops)){
    assert.equal(stop.friction(),0);assert.equal(stop.frictionCombineRule(),RAPIER.CoefficientCombineRule.Min);
    assert.equal(stop.restitution(),0);
  }
  const x=-P.trackFront/2,z=P.wheelbase*(1-P.frontStaticLoad);
  const bottom=-P.cgHeight+P.bumpTravel;
  const obstacle=world.createCollider(RAPIER.ColliderDesc.cuboid(.05,.02,.05)
    .setTranslation(x,bottom-.01,z).setFriction(1));
  if(drivable)groundHandles.add(obstacle.handle);
  bridge.rigidBody.setLinvel({x:.05,y:0,z:0},true);
  world.timestep=1/480;
  for(let i=0;i<32;i++)world.step(bridge.eventQueue,bridge.physicsHooks);
  const movement=bridge.rigidBody.translation();
  if(drivable)assert.ok(movement.y>.001,'actual Rapier hard-stop normal impulse required');
  else assert.ok(Math.hypot(movement.y,movement.z)<1e-7,'stop must not collide with non-ground obstacle: '+JSON.stringify(movement));
  assert.ok(Math.abs(bridge.rigidBody.linvel().x-.05)<.0001,'hard stop must not introduce duplicate tire friction');
  assert.ok(Math.abs(bridge.rigidBody.mass()-P.mass)<.01);
  bridge.dispose();world.free();
}
console.log('PASS mechanical jounce stops: 4 zero-mass/zero-min-friction contacts, real Rapier ground impulse, non-ground filter, unchanged body mass');
