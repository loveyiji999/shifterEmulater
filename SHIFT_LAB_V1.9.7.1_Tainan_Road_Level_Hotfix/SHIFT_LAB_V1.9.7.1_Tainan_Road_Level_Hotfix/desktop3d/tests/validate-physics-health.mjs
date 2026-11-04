import assert from 'node:assert/strict';
import {assertPhysicsHealth} from '../src/physics-health.mjs';
const body={translation:()=>({x:0,y:.5,z:70}),linvel:()=>({x:0,y:0,z:0}),
  angvel:()=>({x:0,y:0,z:0}),rotation:()=>({x:0,y:0,z:0,w:1})};
const core={state:{velocity:0,engineOmega:100,clutch:0,throttle:0,brake:0},
  WHEEL_IDS:['FL','FR','RL','RR'],wheelModel:Object.fromEntries(
    ['FL','FR','RL','RR'].map(x=>[x,{omega:0,normal:3200}]))};
assert.equal(assertPhysicsHealth(body,core),true);
const bad={...body,translation:()=>({x:NaN,y:0,z:0})};
assert.throws(()=>assertPhysicsHealth(bad,core),/position/);
assert.throws(()=>assertPhysicsHealth({...body,linvel:()=>({x:1001,y:0,z:0})},core),/速度異常/);
assert.throws(()=>assertPhysicsHealth({...body,rotation:()=>({x:0,y:0,z:0,w:NaN})},core),/rotation/);
core.wheelModel.FL.normal=Infinity;
assert.throws(()=>assertPhysicsHealth(body,core),/FL.normal/);
core.wheelModel.FL.normal=3200;core.state.engineOmega=NaN;
assert.throws(()=>assertPhysicsHealth(body,core),/engineOmega/);
console.log('PASS v1.8.9.2 3D/non-finite health gate: pose, velocity, rotation, drivetrain, each wheel');
