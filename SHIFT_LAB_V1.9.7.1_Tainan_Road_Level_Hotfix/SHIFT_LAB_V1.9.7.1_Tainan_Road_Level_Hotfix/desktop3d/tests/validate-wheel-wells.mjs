import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {RapierChassisBridge} from '../src/chassis.mjs';
import {captureLegacyVehicle,VEHICLE_IDS,readVehicleDefinition} from '../src/vehicle-definition.mjs';
import {vehicleLayoutV2} from '../src/vehicle-layout.mjs';
import {createVehicleVisual,disposeVehicleVisual} from '../src/vehicle-visual.mjs';
import {vehicleParams} from './vehicle-core-fixture.mjs';
await RAPIER.init();
const reports=[];
for(const calibrated of [false,true])for(const id of VEHICLE_IDS){
  const P=vehicleParams(id,calibrated),definition=captureLegacyVehicle(id,P),visual=createVehicleVisual(definition);
  const layout=visual.layout,well=layout.wheelWells;
  const world=new RAPIER.World({x:0,y:0,z:0});
  const bridge=new RapierChassisBridge(RAPIER,world,{},{});bridge.create(P);world.step();
  const cylinder=new RAPIER.Cylinder(well.wheelHalfWidthM,P.wheelRadius);
  const axle=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/2);
  let poses=0,queries=0,minDistance=Infinity;
  for(const wheel of definition.appearance.wheels){
    const travels=[-P.droopTravel,0,...Array.from({length:9},(_,i)=>-P.droopTravel+(P.droopTravel+P.bumpTravel)*i/8)];
    for(const travel of travels)for(let i=0;i<=12;i++){
      const angle=-P.maxRoadWheelAngle+2*P.maxRoadWheelAngle*i/12;
      const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),angle).multiply(axle);
      const position={x:wheel.mount.x,y:-P.cgHeight+P.wheelRadius+travel,z:wheel.mount.z};
      poses++;
      for(const collider of bridge.colliders){
        assert.ok(!collider.intersectsShape(cylinder,position,rotation),`${id} ${wheel.id}: shell intersects tire at travel ${travel}, steer ${angle}`);
        const contact=collider.contactShape(cylinder,position,rotation,.1);queries++;
        if(contact){minDistance=Math.min(minDistance,contact.distance);
          assert.ok(contact.distance>=well.clearanceM-.0001,`${id} clearance ${contact.distance}`);}
      }
    }
  }
  // Analytical certificate covers the continuum between sampled poses: every
  // orientation is inside the same sphere; lowering its center only lowers the
  // upper envelope. Each panel's line bounds that upper semicircle everywhere.
  assert.ok(well.enclosingRadiusM>=Math.hypot(P.wheelRadius,well.wheelHalfWidthM)+.02-1e-12);
  assert.ok(Math.min(P.trackFront,P.trackRear)/2-well.innerHalfWidth>=well.enclosingRadiusM-1e-12);
  assert.ok(layout.cabin.center.y-layout.cabin.height/2>=well.maxHubY+well.enclosingRadiusM+.009,
    'cabin must remain above the whole vertical wheel sweep');
  for(const part of layout.colliders.filter(p=>p.kind==='convex'&&p.id.includes('flat'))){
    const a=part.vertices[2],b=part.vertices[8];
    for(const z of Object.values(well.axles)){
      const distance=z>=a&&z<=b?0:Math.min(Math.abs(a-z),Math.abs(b-z));
      assert.ok(distance>=well.enclosingRadiusM-1e-6,'flat panel must be outside both axle sweep footprints');
    }
  }
  for(const part of layout.colliders.filter(p=>p.kind==='convex'&&p.id.includes('arch'))){
    const vertices=new Float32Array(part.vertices),a=vertices[2],b=vertices[8],f0=vertices[1],f1=vertices[7];
    const z=part.id.includes('rear')?well.axles.rear:well.axles.front,r=well.enclosingRadiusM;
    const slope=(f1-f0)/(b-a),critical=Math.max(a,Math.min(b,z-slope*r/Math.sqrt(1+slope*slope)));
    const envelope=well.maxHubY+Math.sqrt(Math.max(0,r*r-(critical-z)**2));
    assert.ok(f0+slope*(critical-a)>=envelope-1e-6,'panel tangent must conservatively bound complete wheel sweep');
  }
  // The batched visible body must contain exactly the corresponding panel
  // vertices, in the same body coordinates, rather than filling the holes.
  const rendered=visual.body.geometry.getAttribute('position');
  const sourcePoints=[];
  for(const mesh of visual.collisionMeshes){if(mesh===visual.cabin)continue;
    const p=mesh.geometry.getAttribute('position');
    for(let i=0;i<p.count;i++)sourcePoints.push([p.getX(i)+mesh.position.x,p.getY(i)+mesh.position.y,p.getZ(i)+mesh.position.z]);}
  for(let i=0;i<rendered.count;i++)assert.ok(sourcePoints.some(p=>Math.hypot(rendered.getX(i)-p[0],
    rendered.getY(i)-p[1],rendered.getZ(i)-p[2])<1e-6),'visible union vertex must match a collision panel vertex');
  visual.group.updateMatrixWorld(true);
  for(const wheel of definition.appearance.wheels)for(const travel of [-P.droopTravel,0,P.bumpTravel]){
    const side=wheel.id[1]==='L'?-1:1;
    const origin=new THREE.Vector3(side*1.6,-P.cgHeight+P.wheelRadius+travel,wheel.mount.z);
    const ray=new THREE.Raycaster(origin,new THREE.Vector3(-side,0,0),0,1.6-Math.abs(wheel.mount.x));
    assert.equal(ray.intersectObject(visual.body).length,0,'visible side profile must leave an open wheel well');
  }
  // Frozen earlier reference files remain readable; new captures use revision 3.
  const old=structuredClone(definition),v2=vehicleLayoutV2(P);
  Object.assign(old.appearance,{revision:2,body:v2.body,cabin:v2.cabin,collisionParts:v2.colliders,
    hull:{halfExtents:v2.colliders[0].halfExtents,density:0}});
  assert.equal(readVehicleDefinition(JSON.stringify(old)).appearance.revision,2);
  reports.push({id,calibrated,poses,queries,minClearanceM:minDistance,requiredClearanceM:well.clearanceM,
    analyticCertificate:true,batchedRenderMatchesColliders:true});
  disposeVehicleVisual(visual);bridge.dispose();world.free();
}
const sources=['src/vehicle-layout.mjs','src/vehicle-visual.mjs','src/vehicle-definition.mjs','src/chassis.mjs','tests/validate-wheel-wells.mjs'];
writeFileSync(new URL('../../artifacts/tests/p1-wheel-wells-2026-10-29.json',import.meta.url),JSON.stringify({
  schema:'shiftlab.wheel-wells.verification.v1',recordedAt:new Date().toISOString(),layoutRevision:3,reports,
  scope:'rigid tire/rim enclosing cylinder and conservative vertical-sweep certificate; not deforming tire or new tire collision physics',
  sourceHashes:Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(readFileSync(new URL('../'+p,import.meta.url))).digest('hex')]))
},null,2)+'\n');
console.log('PASS wheel wells: '+JSON.stringify(reports));
