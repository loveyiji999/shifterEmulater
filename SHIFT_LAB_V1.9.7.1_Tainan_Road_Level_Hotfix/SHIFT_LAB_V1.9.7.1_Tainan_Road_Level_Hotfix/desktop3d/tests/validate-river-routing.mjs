import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {findRiverRoute} from '../src/river-routing.mjs';
import {planRiverbed,buildRiverbedProposal} from '../src/riverbed-proposal.mjs';
import {riverbedFixture} from './riverbed-fixture.mjs';

function grid(width=4,height=4,cellSize=8){return {width,height,cellSize,originX:0,originZ:0,
  heights:new Float64Array(width*height),valid:new Uint8Array(width*height).fill(1)};}
// Exhaust all simple paths on a tiny grid, independently of the heap/state
// implementation. First heading is free; subsequent bends have a positive cost.
function oracle(g,start){
  let best=Infinity;const used=new Set([start]),bed=g.heights[start]-3;
  function visit(cell,cost,heading){
    if(cost>=best)return;
    const x=cell%g.width,z=Math.floor(cell/g.width);
    if(x===0||z===0||x===g.width-1||z===g.height-1){best=cost;return;}
    for(let nz=z-1;nz<=z+1;nz++)for(let nx=x-1;nx<=x+1;nx++){
      if(nx===x&&nz===z||nx<0||nz<0||nx>=g.width||nz>=g.height)continue;
      const next=nz*g.width+nx;if(used.has(next)||!g.valid[next])continue;
      if(nx!==x&&nz!==z&&(!g.valid[z*g.width+nx]||!g.valid[nz*g.width+x]))continue;
      const cut=Math.max(0,g.heights[next]-bed),before=Math.max(0,g.heights[cell]-bed);
      if(cut>32)continue;
      const angle=Math.atan2(nz-z,nx-x),length=Math.hypot(nx-x,nz-z)*g.cellSize;
      const extra=length*(1+4*(cut*cut+before*before)/2)+(heading===null?0:g.cellSize*.2*(1-Math.cos(angle-heading)));
      used.add(next);visit(next,cost+extra,angle);used.delete(next);
    }
  }
  visit(start,0,null);return best;
}
for(let n=0;n<16;n++){
  const g=grid();for(let i=0;i<g.heights.length;i++)g.heights[i]=((i*13+n*7)%17-8)/4;
  const source=5,route=findRiverRoute(g,source),expected=oracle(g,source);
  assert.equal(route.status,'window-boundary');assert.ok(Math.abs(route.cost-expected)<1e-8,JSON.stringify({n,expected,actual:route.cost}));
  assert.equal(route.outletStatus,'window-continuation-required');assert.deepEqual(route,findRiverRoute(g,source));
  assert.equal(new Set(route.points.map(p=>p.cell)).size,route.points.length,'route cannot loop');
  planRiverbed(route);
}
const obstacleGrid=grid(17,17),source=8*17+3,outlet=8*17+16,
  footprint=[{x:64,z:40},{x:72,z:40},{x:72,z:88},{x:64,z:88}],before=structuredClone(obstacleGrid);
const detour=findRiverRoute(obstacleGrid,source,{protectedPolygons:[footprint],clearance:0,outletCells:[outlet]});
assert.equal(detour.status,'window-boundary');assert.equal(detour.points.at(-1).cell,outlet);
assert.ok(detour.points.some(p=>p.z<40||p.z>88),'route must travel around the protected structure');
for(const p of detour.points)assert.ok(Math.hypot(Math.max(64-p.x,0,p.x-72),Math.max(40-p.z,0,p.z-88))>detour.clearance);
assert.deepEqual(obstacleGrid,before,'routing cannot mutate terrain buffers');planRiverbed(detour);
const sealed=structuredClone(obstacleGrid);for(let z=0;z<17;z++)sealed.valid[z*17+8]=0;
assert.equal(findRiverRoute(sealed,source,{outletCells:[outlet]}).status,'no-local-route');
assert.equal(findRiverRoute(obstacleGrid,8*17+8,{protectedPolygons:[footprint],clearance:0}).status,'blocked-source');
assert.equal(findRiverRoute(obstacleGrid,0).status,'source-on-boundary');
const corner=grid(3,3);corner.valid.fill(0);corner.valid[4]=corner.valid[0]=1;
assert.equal(findRiverRoute(corner,4).status,'no-local-route','no diagonal crossing of missing corners');
assert.throws(()=>findRiverRoute(grid(),5,{outletCells:[5]}),/outlets/);
assert.throws(()=>findRiverRoute(grid(),5,{turnWeight:NaN}),/turnWeight/);
assert.throws(()=>findRiverRoute({...grid(),valid:new Uint8Array(1)},5),/grid/);
const invalid=grid();invalid.heights[0]=NaN;assert.throws(()=>findRiverRoute(invalid,5),/sample/);
const pentagon=Array.from({length:5},(_,i)=>({x:Math.cos(i*Math.PI*2/5)*8,z:Math.sin(i*Math.PI*2/5)*8}));
assert.throws(()=>findRiverRoute(grid(),5,{protectedPolygons:[[0,2,4,1,3].map(i=>pentagon[i])]}),/convex/,'a self-crossing star is not a convex protection footprint');

const reports=[];
for(const seed of ['LEVEL-1','LEVEL-2','ROAD-38274CD4']){
  const f=riverbedFixture(seed),r=f.routing;
  assert.equal(r.status,'window-boundary',seed);assert.ok(r.points.length>=2);planRiverbed(r);
  const proposal=buildRiverbedProposal(f.meshes,planRiverbed(r),{protectedPolygons:f.polygons});
  assert.equal(proposal.summary.minPathCoverage,1,'routed center path must remain connected: '+seed);
  assert.ok(proposal.summary.maxCut<32,'existing excavation budget still applies: '+seed);
  reports.push({seed,routing:{points:r.points.length,length:r.length,cost:r.cost,visited:r.visited,outletStatus:r.outletStatus},
    status:proposal.status,issues:proposal.issues,summary:proposal.summary,sourceHash:f.sourceHash});
}
writeFileSync(new URL('../../artifacts/tests/p2-river-routing-latest.json',import.meta.url),JSON.stringify({
  scope:'local construction routing with protected footprints; regional outlets / river network and runtime integration still incomplete',
  exhaustiveOracleCases:16,previousResults:'p2-riverbed-results-2026-11-02.json',reports},null,2)+'\n');
console.log('PASS local river routing: 16 exhaustive oracles, deterministic costs, footprint detour, no-data barriers, source ownership and actual terrain: '+JSON.stringify(reports));
