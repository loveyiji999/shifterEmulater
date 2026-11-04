import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GeometryUploadPreparer} from '../src/geometry-upload-preparer.mjs';

const originalTarget={},calls=[];
let currentTarget=originalTarget,fail=false;
const renderer={shadowMap:{autoUpdate:true},initRenderTarget(){},compile(){},
  getRenderTarget:()=>currentTarget,getActiveCubeFace:()=>2,getActiveMipmapLevel:()=>1,
  setRenderTarget(target,face,level){currentTarget=target;calls.push({target,face,level});},
  render(scene){
    assert.equal(this.shadowMap.autoUpdate,false);
    assert.notEqual(currentTarget,originalTarget);
    assert.deepEqual(scene.children[0].geometry.drawRange,{start:0,count:0});
    if(fail)throw Error('upload failure');
  }};
const preparer=new GeometryUploadPreparer(renderer),geometry=new THREE.BoxGeometry();
geometry.setDrawRange(3,12);
const source=new THREE.Mesh(geometry);source.visible=false;
for(const throws of [false,true]){
  fail=throws;
  if(throws)assert.throws(()=>preparer.prepare(source),/upload failure/);
  else preparer.prepare(source);
  assert.deepEqual(geometry.drawRange,{start:3,count:12});
  assert.ok(geometry.boundingSphere);
  assert.equal(source.visible,false);
  assert.equal(renderer.shadowMap.autoUpdate,true);
  assert.deepEqual(calls.at(-1),{target:originalTarget,face:2,level:1});
  assert.notEqual(preparer.mesh.geometry,geometry,'preparer must release streamed mesh reference');
}
let sourceDisposed=false;geometry.addEventListener('dispose',()=>sourceDisposed=true);
preparer.dispose();assert.equal(sourceDisposed,false,'chunk retains geometry ownership');geometry.dispose();
console.log('PASS hidden zero-count upload preparation restores draw range, visibility, target and shadow state on success/failure, without disposing chunk geometry');
