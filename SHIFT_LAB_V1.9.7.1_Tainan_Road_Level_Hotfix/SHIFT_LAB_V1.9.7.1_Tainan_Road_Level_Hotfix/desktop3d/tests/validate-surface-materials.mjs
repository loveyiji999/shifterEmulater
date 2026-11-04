import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildSurfaceMaps,MATERIAL_STYLES,SurfaceMaterialLibrary} from '../src/surface-materials.mjs';
import {surfaceUV} from '../src/surface-uv.mjs';
import {buildRoadChunkV3} from '../src/road-geometry-v3.mjs';
import {fixture,base} from './road-v3-fixture.mjs';
const library=new SurfaceMaterialLibrary(64),hashes=new Set();let disposedTextures=0,disposedMaterials=0;
for(const id of Object.keys(MATERIAL_STYLES)){
  const maps=buildSurfaceMaps(id,64);assert.deepEqual(buildSurfaceMaps(id,64),maps);
  assert.equal(maps.reliefMeters,MATERIAL_STYLES[id].relief);assert.ok(maps.reliefMeters<=.002);
  const material=library.material(id),again=library.material(id);assert.equal(material,again);
  assert.equal(material.map.colorSpace,THREE.SRGBColorSpace);
  for(const texture of [material.normalMap,material.roughnessMap])assert.equal(texture.colorSpace,THREE.NoColorSpace);
  assert.equal(material.map.repeat.x,1/maps.meters);assert.ok(material.map.generateMipmaps);
  for(let i=0;i<maps.normal.length;i+=4){
    const n=Array.from(maps.normal.slice(i,i+3),v=>(v/255-.5)*2);
    assert.ok(Math.abs(Math.hypot(...n)-1)<.015);assert.ok(n[2]>0);
  }
  let fingerprint=0;for(const v of maps.color)fingerprint=(Math.imul(fingerprint,31)+v)>>>0;hashes.add(fingerprint);
  for(const texture of Object.values(library.textures(id)))texture.addEventListener('dispose',()=>disposedTextures++);
  material.addEventListener('dispose',()=>disposedMaterials++);
}
assert.equal(hashes.size,10,'ten distinct authored material patterns');
library.configureAnisotropy(16);for(const maps of library.maps.values())for(const texture of Object.values(maps))assert.equal(texture.anisotropy,8);
const wet=library.material('asphalt_dense','wet',{roughness:.24});wet.addEventListener('dispose',()=>disposedMaterials++);
assert.equal(wet.map,library.material('asphalt_dense').map);assert.equal(wet.roughness,.24);
library.dispose();library.dispose();assert.equal(disposedTextures,30);assert.equal(disposedMaterials,11);
assert.throws(()=>library.material('earth'));assert.throws(()=>buildSurfaceMaps('unknown'));assert.throws(()=>buildSurfaceMaps('earth',30));
const core=fixture({...base,turnChance:0,hairpinChance:0,slopeChance:0},12),before=JSON.stringify(core.route.v3State);
const boundaries=[];
for(const index of [0,1]){
  const data=buildRoadChunkV3(core,index),v=new Float32Array(data.meshes.asphalt.vertices),uv=surfaceUV(core,index,'asphalt',v);
  const edge=new Map();for(let i=0;i<v.length;i+=3)if(Math.abs(v[i+2]-100)<1e-5)edge.set(v[i].toFixed(6),[uv[i/3*2],uv[i/3*2+1]]);
  boundaries.push([...edge].sort());assert.ok(uv.every(Number.isFinite));
}
assert.deepEqual(boundaries[0],boundaries[1],'metre UVs must agree across road chunks');
for(const [,uv] of boundaries[0])assert.equal(uv[1],100);
assert.equal(JSON.stringify(core.route.v3State),before);
console.log('PASS 10 PBR material maps, deterministic data, colour spaces, bounded relief, normal vectors, texture sharing/disposal, anisotropy and continuous metre road UVs');
