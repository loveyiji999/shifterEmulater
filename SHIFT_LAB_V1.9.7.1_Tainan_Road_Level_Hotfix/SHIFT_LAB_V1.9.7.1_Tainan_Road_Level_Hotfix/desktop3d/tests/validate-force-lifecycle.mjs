import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {rayContactDistance} from '../src/ray-contact.mjs';
import {vehicleLayout} from '../src/vehicle-layout.mjs';

// This executes the ACTUAL bridge logic with a deterministic Rapier-like test
// double, with Rapier's documented persistent-force semantics. It does NOT
// replace a browser/WASM acceptance test.
const here=dirname(fileURLToPath(import.meta.url));
let source=readFileSync(resolve(here,'../src/chassis.mjs'),'utf8')
  .replace("import * as THREE from 'three';",'')
  .replace("import {rayContactDistance} from './ray-contact.mjs';",'')
  .replace("import {vehicleLayout} from './vehicle-layout.mjs';",'')
  .replace('export class RapierChassisBridge','class RapierChassisBridge');
class V3 {
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
  applyQuaternion(){return this;}
  normalize(){const len=Math.hypot(this.x,this.y,this.z)||1;return this.multiplyScalar(1/len);}
  multiplyScalar(a){this.x*=a;this.y*=a;this.z*=a;return this;}
  add(b){this.x+=b.x;this.y+=b.y;this.z+=b.z;return this;}
  copy(b){return this.set(b.x,b.y,b.z);}
  addScaledVector(b,scale){return this.add(new V3(b.x*scale,b.y*scale,b.z*scale));}
  dot(b){return this.x*b.x+this.y*b.y+this.z*b.z;}
  cross(b){const {x,y,z}=this;return this.set(y*b.z-z*b.y,z*b.x-x*b.z,x*b.y-y*b.x);}
}
class Q {set(x,y,z,w){Object.assign(this,{x,y,z,w});return this;}}
class Euler {setFromQuaternion(){this.x=0;this.y=0;this.z=0;return this;}}
const THREE={Vector3:V3,Quaternion:Q,Euler};
const RapierChassisBridge=Function('THREE','rayContactDistance','vehicleLayout',source+'\nreturn RapierChassisBridge;')(THREE,rayContactDistance,vehicleLayout);

const P={mass:1280,pitchInertia:1350,yawInertia:2400,rollInertia:510,
  cgHeight:.51,wheelbase:2.7,frontStaticLoad:.59,springFront:26000,springRear:20000,
  damperFront:2500,damperRear:2050,droopTravel:.145,bumpTravel:.11,wheelRadius:.31};
class Body {
  constructor(){this.pos={x:0,y:P.cgHeight+.025,z:0};this.rot={x:0,y:0,z:0,w:1};
    this.v={x:0,y:0,z:0};this.omega={x:0,y:0,z:0};
    this.force={x:0,y:0,z:0};this.torque={x:0,y:0,z:0};this.clearForces=0;this.clearTorques=0;}
  translation(){return {...this.pos};}rotation(){return {...this.rot};}
  linvel(){return {...this.v};}angvel(){return {...this.omega};}mass(){return P.mass;}
  setTranslation(v){this.pos={...v};}setRotation(q){this.rot={...q};}
  setLinvel(v){this.v={...v};}setAngvel(v){this.omega={...v};}
  resetForces(){this.force={x:0,y:0,z:0};this.clearForces++;}
  resetTorques(){this.torque={x:0,y:0,z:0};this.clearTorques++;}
  userForce(){return {...this.force};}userTorque(){return {...this.torque};}
  addForce(f){for(const c of ['x','y','z'])this.force[c]+=f[c];}
  addForceAtPoint(f,p){this.addForce(f);const r={x:p.x-this.pos.x,y:p.y-this.pos.y,z:p.z-this.pos.z};
    this.torque.x+=r.y*f.z-r.z*f.y;
    this.torque.y+=r.z*f.x-r.x*f.z;
    this.torque.z+=r.x*f.y-r.y*f.x;}
}
const body=new Body();
const rapier={Ray:class {constructor(origin,direction){this.origin=origin;this.dir=direction;}},
  QueryFilterFlags:{EXCLUDE_DYNAMIC:1}};
const world={timestep:0,castRay(ray,maxDistance){
    if(ray.dir.y>=-.5)return null;
    const distance=ray.origin.y/(-ray.dir.y);
    return distance<=maxDistance&&distance>=0?{timeOfImpact:distance}:null;
  },step(){const h=this.timestep;
    for(const c of ['x','y','z']){
      body.v[c]+=(body.force[c]/P.mass+(c==='y'?-9.81:0))*h;
      body.pos[c]+=body.v[c]*h;
    }
  },contactPairsWith(){} };
const wheelModel={};
for(const id of ['FL','FR','RL','RR'])wheelModel[id]={id,front:id[0]==='F',left:id[1]==='L',
  contact:false,normal:0,travel:0,fxBody:0,fyBody:0};
const physics={params:P,WHEEL_IDS:Object.keys(wheelModel),wheelModel,suspension:{contacts:0,maxTravel:0},
  vehicleMotion:{guardrailHits:0,contactCooldown:0,heading:0,roll:0,pitch:0,yawRate:0,lateralVelocity:0},state:{velocity:0,time:0},
  wheelCoords(id){return {x:(id[1]==='L'?-1:1)*.78,
    z:id[0]==='F'?P.wheelbase*(1-P.frontStaticLoad):-P.wheelbase*P.frontStaticLoad};},route:{distance:70}};
const road={position(s,side){return {x:side,y:0,z:s};},groundHandles:new Set([1]),railHandles:new Set(),barrierHandles:new Set()};
const bridge=new RapierChassisBridge(rapier,world,road,physics);
bridge.rigidBody=body;bridge.collider={handle:2};
const h=1/480;let maxSpeed=0,maxForce=0,minContacts=4;
for(let i=0;i<480*3;i++){
  bridge.beforeForces(h);
  bridge.stepForces(0,0,0,0,h);
  maxSpeed=Math.max(maxSpeed,Math.abs(body.v.y));
  maxForce=Math.max(maxForce,Math.abs(body.force.y));
  minContacts=Math.min(minContacts,bridge.lastWheelContacts);
}
assert.equal(body.clearForces,480*3,'clear forces ONCE at the start of EVERY microstep');
assert.equal(body.clearTorques,480*3,'clear torques ONCE at the start of EVERY microstep');
assert.ok(maxForce<1.3*P.mass*9.81,`suspension force must not accumulate: ${maxForce}`);
assert.ok(maxSpeed<1.0,`parked chassis unexpectedly launched: ${maxSpeed}`);
assert.ok(Math.abs(body.pos.y-(P.cgHeight))<.14,`static ride-height diverged: ${body.pos.y}`);
assert.ok(minContacts>=2,`parked vehicle lost road contacts: ${minContacts}`);
body.addForce({x:9e5,y:0,z:0});body.torque.y=8e5;
bridge.teleport({roadPoint:{s:70,x:0,y:0,z:70,heading:0},speed:0});
assert.deepEqual(body.userForce(),{x:0,y:0,z:0},'teleport must clear stale forces');
assert.deepEqual(body.userTorque(),{x:0,y:0,z:0},'teleport must clear stale torques');
body.addForce({x:0,y:999999,z:0});body.torque.x=999999;
bridge.reset({x:0,y:0,z:0,heading:0},P);
assert.deepEqual(body.userForce(),{x:0,y:0,z:0},'hard reset must clear stale forces');
assert.deepEqual(body.userTorque(),{x:0,y:0,z:0},'hard reset must clear stale torques');
console.log('PASS real chassis bridge: persistent Rapier forces cleared per 480-Hz microstep; 3-s stationary stability and teleport reset');
