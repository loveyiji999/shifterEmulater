import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import {RoadWorld} from '../src/road.mjs';
import {fixture,base} from './road-v3-fixture.mjs';
await RAPIER.init();
const core=fixture({...base,seed:'LEVEL-2'},48),world=new RAPIER.World({x:0,y:0,z:0});
const road=new RoadWorld(RAPIER,world,new THREE.Scene(),core),s=9263.190525093225;
road.ensure(s);world.step();
const f=road.chunks.get(Math.floor(s/100)).components.find(f=>f.kind==='foundation'&&f.s===s&&f.l===-9);
assert.ok(f&&f.supportKind==='anchorage');
const c=Math.cos(f.heading),sin=Math.sin(f.heading),results=[];
for(const along of [0,.5,-.5]){
  const origin={x:f.x+c*(f.hx+2)+sin*along,y:(f.topY+f.footTop)/2,z:f.z-sin*(f.hx+2)+c*along};
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true).setTranslation(origin.x,origin.y,origin.z));
  const collider=world.createCollider(RAPIER.ColliderDesc.cuboid(.12,.12,.12).setFriction(0).setRestitution(0),body);
  body.setLinvel({x:-c*8,y:0,z:sin*8},true);
  let contact=false,maxTravel=0;
  for(let step=0;step<90;step++){
    world.step();const p=body.translation();maxTravel=Math.max(maxTravel,-(p.x-origin.x)*c+(p.z-origin.z)*sin);
    world.contactPairsWith(collider,other=>{if(road.barrierHandles.has(other.handle))contact=true;});
  }
  assert.ok(contact,'actual foundation contact required');
  assert.ok(maxTravel<2.1,'CCD body crossed the near foundation face');
  results.push({along,maxTravelM:maxTravel,structureContact:contact});world.removeRigidBody(body);
}
road.clear();road.assertClean();assert.equal(world.colliders.len(),0);world.free();
console.log('PASS actual anchorage CCD, including central triangle-edge trajectory: '+JSON.stringify(results));
