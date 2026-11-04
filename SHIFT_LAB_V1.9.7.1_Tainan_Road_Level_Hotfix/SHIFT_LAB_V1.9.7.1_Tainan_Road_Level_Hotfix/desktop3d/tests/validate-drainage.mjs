import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {analyzeDrainage,sampleDrainageGrid,traceDrainage} from '../src/terrain-drainage.mjs';
import {TerrainWorld} from '../src/terrain-world.mjs';
import {fixture,base,engine} from './road-v3-fixture.mjs';

const grid=(w,h,values,valid=values.map(()=>1))=>({width:w,height:h,cellSize:8,originX:0,originZ:0,
  heights:Float64Array.from(values),valid:Uint8Array.from(valid)});
// Independent repeated minimax relaxation, deliberately without the heap or
// flood visitation order used by the implementation.
function reference(g){
  const {width:w,height:h}=g,d=Array(w*h).fill(Infinity);
  for(let i=0;i<d.length;i++)if(g.valid[i]&&(i<w||i>=w*(h-1)||i%w===0||i%w===w-1))d[i]=g.heights[i];
  for(let pass=0;pass<d.length;pass++){
    let changed=false;
    for(let z=0;z<h;z++)for(let x=0;x<w;x++)if(g.valid[z*w+x]){
      const i=z*w+x;
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dz||x+dx<0||x+dx>=w||z+dz<0||z+dz>=h)continue;
        const j=(z+dz)*w+x+dx;
        if(!g.valid[j]||dx&&dz&&(!g.valid[z*w+x+dx]||!g.valid[(z+dz)*w+x]))continue;
        const candidate=Math.max(g.heights[i],d[j]);if(candidate<d[i]){d[i]=candidate;changed=true;}
      }
    }
    if(!changed)break;
  }
  return d;
}
function check(g){
  const original=g.heights.slice(),mask=g.valid.slice(),a=analyzeDrainage(g),r=reference(g);
  assert.deepEqual(a,analyzeDrainage(g));assert.deepEqual(g.heights,original);assert.deepEqual(g.valid,mask);
  let area=0;
  for(let i=0;i<r.length;i++){
    const path=traceDrainage(a,i);
    if(!g.valid[i]){assert.equal(a.receiver[i],-3);assert.equal(path.status,'blocked');continue;}
    if(!Number.isFinite(r[i])){assert.equal(a.receiver[i],-2);assert.equal(path.status,'unresolved-outlet');continue;}
    assert.equal(a.spillElevation[i],r[i]);assert.equal(path.status,'window-boundary');
    assert.ok(path.points.length<=g.heights.length);assert.ok(a.areaM2[i]>=g.cellSize*g.cellSize);
    if(a.receiver[i]===-1)area+=a.areaM2[i];
    for(let k=1;k<path.points.length;k++){
      const p=path.points[k-1],q=path.points[k];assert.ok(q.spillY<=p.spillY);
      const dx=q.cell%g.width-p.cell%g.width,dz=Math.floor(q.cell/g.width)-Math.floor(p.cell/g.width);
      assert.ok(Math.abs(dx)<=1&&Math.abs(dz)<=1);
      if(dx&&dz){assert.ok(g.valid[p.cell+dx]);assert.ok(g.valid[p.cell+dz*g.width]);}
    }
  }
  assert.equal(area,a.summary.reachableCells*g.cellSize*g.cellSize,'contributing area conserved at window outlets');
  return a;
}
const bowl=grid(5,5,Array.from({length:25},(_,i)=>i<5||i>=20||i%5===0||i%5===4?4:0));
assert.equal(check(bowl).summary.maxFillDepth,4);assert.equal(check(bowl).summary.fillCells,9);
const plane=grid(5,5,Array.from({length:25},(_,i)=>4-Math.floor(i/5)));
assert.equal(check(plane).receiver[12],17,'steepest descent on an unfilled slope');
assert.equal(check(plane).summary.fillCells,0);
const island=grid(5,5,Array(25).fill(1),Array.from({length:25},(_,i)=>i===12?1:0));
assert.equal(check(island).summary.unresolvedCells,1);
const diagonal=grid(3,3,Array(9).fill(0),[1,0,0,0,1,0,0,0,0]);
assert.equal(check(diagonal).receiver[4],-2,'do not route diagonally through two blocked corners');
let seed=92071;
for(let test=0;test<32;test++){
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  const values=Array.from({length:49},()=>test%2?Math.round(random()*200)/10:Math.floor(random()*20));
  check(grid(7,7,values,values.map(()=>random()>.22?1:0)));
}
const rectangle={...grid(7,5,Array.from({length:35},(_,i)=>10-Math.floor(i/7)+.1*(i%7))),originX:-64,originZ:-128};
const rectangular=check(rectangle),first=traceDrainage(rectangular,17).points[0];assert.equal(first.x,-40);assert.equal(first.z,-112);
assert.throws(()=>sampleDrainageGrid({prepare(){},surfaceAt:()=>({y:NaN})},{width:3,height:3,cellSize:8,originX:0,originZ:0}),/elevation/);
assert.throws(()=>analyzeDrainage({...plane,heights:new Float64Array(2)}),/buffers/);
assert.throws(()=>analyzeDrainage({...plane,cellSize:0}),/coordinates/);
assert.throws(()=>analyzeDrainage({...plane,heights:Float64Array.from(plane.heights,()=>NaN)}),/elevation/);
assert.throws(()=>sampleDrainageGrid({prepare(){throw Error('must validate first');}},{width:1e9,height:3,cellSize:8,originX:0,originZ:0}),/3..129/);
const forged=check(plane);forged.receiver[12]=12;assert.throws(()=>traceDrainage(forged,12),/Cyclic/);

const reports=[];
for(const seed of ['LEVEL-1','LEVEL-2','ROAD-38274CD4']){
  const config={...base,seed},core=fixture(config,48),state=core.route.v3State;
  const feature=state.features.find(f=>f.kind==='suspension'||f.kind==='bridge');assert.ok(feature);
  const center=core.roadPointAt((feature.start+feature.end)/2),terrain=new TerrainWorld({physics:core});
  const fingerprint=JSON.stringify(state.points),beforeRevision=state.revision;
  try{
    const sampled=sampleDrainageGrid(terrain,{originX:Math.floor(center.x/8)*8-128,originZ:Math.floor(center.z/8)*8-128});
    const data=analyzeDrainage(sampled);assert.ok(data.summary.reachableCells>0);
    let checked=0;
    for(let i=0;i<sampled.heights.length;i++){
      const hit=terrain.surfaceAt(sampled.originX+i%33*8,sampled.originZ+Math.floor(i/33)*8);
      assert.equal(sampled.valid[i],hit?1:0);
      if(hit){assert.equal(sampled.heights[i],hit.y);checked++;}
      if(data.receiver[i]>=0)assert.equal(traceDrainage(data,i).status,'window-boundary');
    }
    assert.equal(JSON.stringify(state.points),fingerprint);assert.equal(state.revision,beforeRevision);
    const source=createHash('sha256').update(Buffer.from(sampled.heights.buffer)).update(sampled.valid).digest('hex');
    const deepest=Array.from(data.order).sort((a,b)=>data.fillDepth[b]-data.fillDepth[a])[0];
    reports.push({seed,feature:feature.kind,chainage:(feature.start+feature.end)/2,samplesChecked:checked,
      sourceHash:source,summary:data.summary,deepestPath:traceDrainage(data,deepest)});
    const fresh=fixture(config,48);engine.extend(state,1);engine.extend(fresh.route.v3State,1);
    assert.equal(JSON.stringify(state.points),JSON.stringify(fresh.route.v3State.points),'analysis cannot consume road RNG or change next bend');
  }finally{terrain.clear();terrain.depthMaterial.dispose();}
}
writeFileSync(new URL('../../artifacts/tests/p2-drainage-latest.json',import.meta.url),JSON.stringify({
  scope:'local actual-terrain drainage analysis; not water geometry / hydraulic simulation / game integration',reports},null,2)+'\n');
console.log('PASS priority-flood against independent minimax oracle, no-data barriers / diagonal exclusion, deterministic acyclic receivers, area conservation and actual Float32 terrain samples: '+JSON.stringify(reports.map(r=>({seed:r.seed,samples:r.samplesChecked,...r.summary}))));
