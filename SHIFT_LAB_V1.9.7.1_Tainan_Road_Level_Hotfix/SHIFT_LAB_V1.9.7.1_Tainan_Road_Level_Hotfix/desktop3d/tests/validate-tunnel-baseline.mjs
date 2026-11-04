// One-off source checkpoint comparison. Pass the original road geometry module
// extracted from p2-tunnel-lighting-before-2026-10-29.zip with its import fixed.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {fixture,base} from './road-v3-fixture.mjs';
import {buildRoadChunkV3} from '../src/road-geometry-v3.mjs';
if(!process.argv[2])throw Error('Original geometry module path required');
const {buildRoadChunkV3:original}=await import(pathToFileURL(path.resolve(process.argv[2])));
const core=fixture(base,48),indices=new Set();
for(const f of core.route.v3State.features.filter(f=>f.kind==='tunnel'))for(let i=Math.floor(f.start/100);i<=Math.floor(f.end/100);i++)indices.add(i);
const triangles=mesh=>{const m=new Map();for(let i=0;i<mesh.indices.length;i+=3){const p=[];
  for(let j=0;j<3;j++){const at=mesh.indices[i+j]*3;for(let k=0;k<3;k++)p.push(Math.fround(mesh.vertices[at+k]));}
  const key=p.join(',');m.set(key,(m.get(key)||0)+1);}return m;};
let addedVergeFaces=0,lights=0;
for(const i of indices){
  const a=original(core,i),b=buildRoadChunkV3(core,i);
  for(const kind of Object.keys(a.meshes))if(kind!=='shoulder')assert.deepEqual(b.meshes[kind],a.meshes[kind],kind+' physical geometry changed');
  const old=triangles(a.meshes.shoulder),now=triangles(b.meshes.shoulder);
  for(const [key,count] of old){assert.ok((now.get(key)||0)>=count,'existing verge triangle changed');now.set(key,now.get(key)-count);}
  addedVergeFaces+=[...now.values()].reduce((a,b)=>a+b,0);
  assert.deepEqual(b.components.filter(c=>c.kind!=='tunnel-luminaire'),a.components);
  lights+=b.components.filter(c=>c.kind==='tunnel-luminaire').length;
}
assert.ok(addedVergeFaces>0&&lights>0);
console.log('PASS original core road mesh comparison: '+JSON.stringify({chunks:indices.size,addedVergeFaces,lights})+'; existing asphalt/roof/walls/rails/earth and verge faces retained; engineering uses current actual terrain separately');
