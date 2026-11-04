import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import {RapierChassisBridge} from '../src/chassis.mjs';

await RAPIER.init();
const P={mass:1280,pitchInertia:1350,yawInertia:2400,rollInertia:510,
  cgHeight:.51,wheelbase:2.7,frontStaticLoad:.59,springFront:26000,springRear:20000,
  damperFront:2500,damperRear:2050,droopTravel:.145,bumpTravel:.11,wheelRadius:.31,trackFront:1.56,trackRear:1.56};
const ids=['FL','FR','RL','RR'];
const coords=id=>({x:(id[1]==='L'?-1:1)*.78,
  z:id[0]==='F'?P.wheelbase*(1-P.frontStaticLoad):-P.wheelbase*P.frontStaticLoad});
const reports=[];
for(const name of ['flat','single-wheel-bump','side-slope','airborne','landing']){
  const world=new RAPIER.World({x:0,y:-9.81,z:0});
  const groundHandles=new Set();
  const wheelModel=Object.fromEntries(ids.map(id=>[id,{front:id[0]==='F'}]));
  const physics={params:P,WHEEL_IDS:ids,wheelModel,wheelCoords:coords,suspension:{}};
  const bridge=new RapierChassisBridge(RAPIER,world,{groundHandles},physics);
  bridge.create(P);
  const b=bridge.rigidBody;
  b.setTranslation({x:0,y:name==='airborne'?3:P.cgHeight,z:0},true);
  const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),name==='side-slope'?.08:0);
  b.setRotation(rotation,true);
  for(const id of ids){
    const corner=coords(id),height=name==='single-wheel-bump'&&id==='FL'?.08:0;
    const collider=world.createCollider(RAPIER.ColliderDesc.cuboid(.4,.1,.4)
      .setTranslation(corner.x,height-.1,corner.z));
    groundHandles.add(collider.handle);
  }
  world.timestep=1/480;world.step();
  if(name==='landing'){
    b.setTranslation({x:0,y:1.3,z:0},true);b.setLinvel({x:0,y:-1,z:0},true);
    for(let i=0;i<600;i++){bridge.beforeForces(1/480);world.step();}
  }
  bridge.beforeForces(1/480);
  let contacts=0,maxError=0;
  for(const id of ids){
    const v=bridge.wheelVisualState[id];
    assert.ok(Number.isFinite(v.hubLocalY));
    assert.equal(v.contact,wheelModel[id].contact);
    if(v.contact){
      contacts++;
      const corner=coords(id),rot=b.rotation(),pos=b.translation();
      const q=new THREE.Quaternion(rot.x,rot.y,rot.z,rot.w);
      const hub=new THREE.Vector3(corner.x,v.hubLocalY,corner.z).applyQuaternion(q).add(pos);
      const origin=new THREE.Vector3(corner.x,-.15,corner.z).applyQuaternion(q).add(pos);
      const up=new THREE.Vector3(0,1,0).applyQuaternion(q);
      const hit=world.castRay(new RAPIER.Ray(origin,up.clone().multiplyScalar(-1)),2,true,
        undefined,undefined,bridge.collider,b,c=>groundHandles.has(c.handle));
      assert.ok(hit);
      const expected=origin.clone().addScaledVector(up,P.wheelRadius-hit.timeOfImpact);
      const error=hub.distanceTo(expected);maxError=Math.max(maxError,error);
      assert.ok(error<1e-6,'visible hub must follow actual suspension ray');
    }else assert.equal(v.hubLocalY,-P.cgHeight+P.wheelRadius-P.droopTravel);
  }
  assert.equal(contacts,name==='airborne'?0:4,name+' support count');
  if(name==='single-wheel-bump')assert.ok(Math.abs(
    bridge.wheelVisualState.FL.hubLocalY-bridge.wheelVisualState.FR.hubLocalY-.08)<1e-6);
  reports.push({name,contacts,maxHubRayErrorM:maxError});
  bridge.dispose();world.free();
}
console.log('PASS real Rapier wheel visualization: '+JSON.stringify(reports));
