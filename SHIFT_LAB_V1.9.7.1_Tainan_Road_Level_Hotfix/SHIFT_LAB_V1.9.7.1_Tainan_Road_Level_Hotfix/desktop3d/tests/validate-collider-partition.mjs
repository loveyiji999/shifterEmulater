import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {partitionColliderMesh} from '../src/collider-partition.mjs';
import {assertColliderTriangles} from './collider-geometry-check.mjs';
await RAPIER.init();
const vertices=new Float32Array([-6,0,0,-6,1,0,-6,0,100,-6,1,100,6,0,0,6,1,0,6,0,100,6,1,100]);
const indices=new Uint32Array([0,1,2,2,1,3,4,6,5,6,7,5]);
const pieces=partitionColliderMesh(vertices,indices,8);
assert.deepEqual(partitionColliderMesh(vertices,indices,8),pieces,'deterministic packing');
const faces=pieces.flatMap(p=>Array.from(p.faces));assert.deepEqual(faces.sort((a,b)=>a-b),[0,1,2,3]);
const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));
geometry.setIndex(new THREE.BufferAttribute(indices,1));
const world=new RAPIER.World({x:0,y:0,z:0});
try{
  const full=world.createCollider(RAPIER.ColliderDesc.trimesh(vertices,indices));world.step();
  const candidates=()=>{let n=0;world.collidersWithAabbIntersectingAabb({x:0,y:.5,z:50},{x:1,y:1,z:1},()=>{n++;return true;});return n;};
  assert.equal(candidates(),1,'combined opposite rails have a broad AABB through the road');
  world.removeCollider(full,true);
  const colliders=pieces.map(p=>world.createCollider(RAPIER.ColliderDesc.trimesh(p.vertices,p.indices)));world.step();
  assert.equal(candidates(),0,'local shapes exclude the road interior before CCD shape casts');
  assertColliderTriangles([{geometry}],colliders);
  for(const [partIndex,p] of pieces.entries()){
    assert.equal(new Set(p.indices).size,p.vertices.length/3,'compact buffers must not keep remote unused vertices');
    const shape=colliders[partIndex];
    for(let f=0;f<p.faces.length;f++)for(let corner=0;corner<3;corner++)for(let axis=0;axis<3;axis++)
      assert.equal(shape.vertices()[shape.indices()[f*3+corner]*3+axis],vertices[indices[p.faces[f]*3+corner]*3+axis]);
  }
  for(const c of colliders)world.removeCollider(c,true);
  assert.equal(world.colliders.len(),0);
}finally{world.free();geometry.dispose();}
console.log('PASS exact collider triangle union, winding/face remap, compact bounds, deterministic partitions and actual Rapier exclusion of opposite-rail AABBs');
