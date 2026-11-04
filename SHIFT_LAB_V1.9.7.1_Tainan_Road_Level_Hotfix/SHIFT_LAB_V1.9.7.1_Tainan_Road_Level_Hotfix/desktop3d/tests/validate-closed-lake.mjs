import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import RAPIER from '@dimforge/rapier3d-compat';
import {buildClosedLake,findClosedLake} from '../src/closed-lake.mjs';
import {lakeFixture} from './lake-fixture.mjs';
import {rayContactDistance} from '../src/ray-contact.mjs';
await RAPIER.init();
function bowl(tx=0,centerX=32){
  const vertices=[],indices=[];
  for(let z=0;z<=16;z++)for(let x=0;x<=16;x++){const wx=tx*64+x*4,wz=z*4;vertices.push(wx,-5+Math.hypot(wx-centerX,wz-32)*.25,wz);}
  for(let z=0;z<16;z++)for(let x=0;x<16;x++){const i=z*17+x;indices.push(i,i+17,i+1,i+1,i+17,i+18);}
  return {tx,tz:0,vertices:Float32Array.from(vertices),indices:Uint32Array.from(indices)};
}
const hash=meshes=>{const h=createHash('sha256');for(const m of meshes)h.update(m.vertices).update(m.indices);return h.digest('hex');};
const source=bowl(),before=hash([source]),closed=buildClosedLake([source],{sourceX:32,sourceZ:32,waterY:-1});
assert.equal(closed.status,'geometry-candidate');assert.equal(closed.summary.openWaterEdges,0);assert.equal(closed.summary.terminalWaterEdges,0);
assert.equal(closed.summary.maxDepth,4);assert.equal(closed.groundChanged,false);assert.equal(before,hash([source]));
for(const m of closed.water){assert.ok(m.flows.every(v=>v===0));for(let i=1;i<m.vertices.length;i+=3)assert.equal(m.vertices[i],closed.waterY);}
const pair=[bowl(0,64),bowl(1,64)],joined=buildClosedLake(pair,{sourceX:64,sourceZ:32,waterY:-1});
assert.equal(joined.status,'geometry-candidate');assert.ok(joined.water.every(m=>m.indices.length));
assert.deepEqual(joined,buildClosedLake(pair.slice().reverse(),{sourceX:64,sourceZ:32,waterY:-1}));
const edge=m=>new Set(Array.from({length:m.vertices.length/3},(_,i)=>m.vertices[i*3]===64?Array.from(m.vertices.subarray(i*3,i*3+3)).join(','):null).filter(Boolean));
assert.deepEqual(edge(joined.water[0]),edge(joined.water[1]));
const opened=buildClosedLake([source],{sourceX:32,sourceZ:32,waterY:4});
assert.equal(opened.status,'rejected');assert.ok(opened.issues.includes('open-water-boundary'));
const hole={...source,vertices:source.vertices.slice(),indices:source.indices.slice()};
const faces=Array.from({length:hole.indices.length/3},(_,i)=>Array.from(hole.indices.subarray(i*3,i*3+3))),
  missing=faces.findIndex(t=>t.every(i=>hole.vertices[i*3]>=36&&hole.vertices[i*3]<=40&&hole.vertices[i*3+2]>=32&&hole.vertices[i*3+2]<=36)),
  [a,b,c]=faces.splice(missing,1)[0];
faces.push([a,b,a],[b,c,b],[c,a,c]);hole.indices=Uint32Array.from(faces.flat());
const maskedHole=buildClosedLake([hole],{sourceX:32,sourceZ:32,waterY:-1});
assert.equal(maskedHole.status,'rejected');assert.ok(maskedHole.summary.openInteriorEdges>=3,'zero-area faces cannot conceal a wet hole');
const selected=findClosedLake([source],{sourceX:32,sourceZ:32,maxWaterY:10});
assert.equal(selected.status,'geometry-candidate');assert.equal(selected.search.status,'boundary-limited');
assert.ok(selected.waterY>2.9&&selected.waterY<=3.00001,'selected level remains below the analytic lowest outer rim');
assert.equal(buildClosedLake([source],{sourceX:32,sourceZ:32,waterY:selected.waterY+.1}).status,'rejected');
assert.equal(findClosedLake([source],{sourceX:32,sourceZ:32,maxWaterY:-5}).status,'rejected');
assert.equal(buildClosedLake([source],{sourceX:-20,sourceZ:-20,waterY:0}).status,'rejected');
assert.throws(()=>buildClosedLake([source],{sourceX:32,sourceZ:32,waterY:NaN}),/level/);
assert.throws(()=>findClosedLake([source],{sourceX:32,sourceZ:32,maxWaterY:0,iterations:100}),/search/);
assert.throws(()=>buildClosedLake([source,source],{sourceX:32,sourceZ:32,waterY:0}),/buffers/);

function contacts(meshes,lake,limit=250){
  const world=new RAPIER.World({x:0,y:0,z:0});let queries=0,maxError=0;
  try{
    for(const m of meshes)world.createCollider(RAPIER.ColliderDesc.trimesh(m.vertices,m.indices));world.step();
    for(let part=0;part<lake.water.length;part++){
      const water=lake.water[part],m=meshes.find(m=>m.tx===water.tx&&m.tz===water.tz),step=Math.max(1,Math.floor(water.sourceFaces.length/limit));
      for(let f=0;f<water.sourceFaces.length;f+=step){
        const x=Math.fround((water.vertices[f*9]+water.vertices[f*9+3]+water.vertices[f*9+6])/3),
          z=Math.fround((water.vertices[f*9+2]+water.vertices[f*9+5]+water.vertices[f*9+8])/3),
          tri=Array.from(m.indices.subarray(water.sourceFaces[f]*3,water.sourceFaces[f]*3+3),i=>({x:m.vertices[i*3],y:m.vertices[i*3+1],z:m.vertices[i*3+2]})),
          [a,b,c]=tri,den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z),
          u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/den,v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/den,
          expected=u*a.y+v*b.y+(1-u-v)*c.y,origin=Math.fround(lake.waterY+2),
          hit=world.castRayAndGetNormal(new RAPIER.Ray({x,y:origin,z},{x:0,y:-1,z:0}),128,true),distance=rayContactDistance(hit,128);
        assert.notEqual(distance,null);assert.ok(lake.waterY>=expected-.0001);
        maxError=Math.max(maxError,Math.abs(origin-distance-expected));queries++;
      }
    }
    assert.ok(queries>0);assert.ok(maxError<.0002,'unchanged actual ground below lake: '+maxError);
    assert.equal(world.colliders.len(),meshes.length,'lake adds no wheel-support collider');return {queries,maxError};
  }finally{world.free();}
}
const syntheticContacts=contacts(pair,joined),reports=[];
for(const seed of ['LEVEL-1','LEVEL-2','ROAD-38274CD4']){
  const f=lakeFixture(seed),p=f.proposal;
  const canonical=new Map();
  for(const m of f.meshes)for(let i=0;i<m.vertices.length;i+=3){
    const key=m.vertices[i]+','+m.vertices[i+2],sample=[m.vertices[i+1],...m.normals.subarray(i,i+3)];
    if(canonical.has(key))assert.deepEqual(sample,canonical.get(key),'same Float32 XZ shares height and normal: '+seed+' '+key);
    else canonical.set(key,sample);
  }
  assert.equal(p.status,'geometry-candidate',seed);assert.equal(p.summary.openWaterEdges,0);assert.equal(p.summary.terminalWaterEdges,0);
  assert.equal(hash(f.meshes),f.sourceHash);assert.ok(p.waterY<f.spillY);
  reports.push({seed,waterY:p.waterY,spillY:f.spillY,source:p.source,summary:p.summary,search:p.search,sourceHash:f.sourceHash,contacts:contacts(f.meshes,p,40)});
}
writeFileSync(new URL('../../artifacts/tests/p2-closed-lakes-latest.json',import.meta.url),JSON.stringify({scope:'closed static lake geometry; no regional river outlet, water contact forces or runtime integration',syntheticContacts,reports},null,2)+'\n');
console.log('PASS closed lakes: unchanged terrain, analytic rim level search, no terminal openings, Float32 tile seams, source ownership, actual ground support: '+JSON.stringify(reports));
