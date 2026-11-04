import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import RAPIER from '@dimforge/rapier3d-compat';
import {planRiverbed,buildRiverbedProposal} from '../src/riverbed-proposal.mjs';
import {riverbedFixture} from './riverbed-fixture.mjs';
import {rayContactDistance} from '../src/ray-contact.mjs';
await RAPIER.init();
function flat(tx){
  const vertices=[],indices=[];
  for(let z=0;z<=8;z++)for(let x=0;x<=8;x++)vertices.push(tx*64+x*8,0,z*8);
  for(let z=0;z<8;z++)for(let x=0;x<8;x++){const a=z*9+x;indices.push(a,a+9,a+1,a+1,a+9,a+10);}
  return {tx,tz:0,vertices:new Float32Array(vertices),indices:new Uint32Array(indices)};
}
const route=points=>({status:'window-boundary',points:points.map(([x,z])=>({x,z,groundY:0}))});
const left=flat(0),right=flat(1),source=left.vertices.slice(),plan=planRiverbed(route([[8,24],[120,40]]));
const proposal=buildRiverbedProposal([left,right],plan);
assert.equal(proposal.status,'geometry-candidate',JSON.stringify(proposal.summary));
assert.equal(proposal.outletStatus,'window-continuation-required');assert.equal(proposal.requiresSurfaceRebake,true);
assert.deepEqual(proposal,buildRiverbedProposal([right,left],plan),'input tile order cannot change geometry or normals');
assert.deepEqual(left.vertices,source);assert.ok(proposal.summary.changedVertices>0);
const edge=(meshes,x)=>new Set(Array.from({length:meshes.vertices.length/3},(_,i)=>
  meshes.vertices[i*3]===x?Array.from(meshes.vertices.slice(i*3,i*3+3)).join(','):null).filter(Boolean));
assert.deepEqual(edge(proposal.ground[0],64),edge(proposal.ground[1],64),'shared bed vertices match');
assert.deepEqual(edge(proposal.water[0],64),edge(proposal.water[1],64),'clipped water shoreline matches across tiles');
const center=planRiverbed(route([[32,8],[32,56]]));
const protectedPolygon=[{x:28,z:28},{x:36,z:28},{x:36,z:36},{x:28,z:36}];
const blocked=buildRiverbedProposal([left],center,{protectedPolygons:[protectedPolygon]});
assert.equal(blocked.status,'rejected');assert.ok(blocked.issues.includes('incomplete-water-path'));
for(let i=0;i<left.vertices.length;i+=3)if(left.vertices[i]>=24&&left.vertices[i]<=40&&left.vertices[i+2]>=24&&left.vertices[i+2]<=40)
  assert.equal(blocked.ground[0].vertices[i+1],0,'foundation footprint / incident triangles remain supported');
assert.ok(buildRiverbedProposal([left],planRiverbed(route([[32,8],[32,56]]),{maxCut:1})).issues.includes('excavation-limit'));
const authoredNormals=new Float32Array(left.vertices.length);for(let i=0;i<authoredNormals.length;i+=3)authoredNormals.set([.1,Math.sqrt(.99),0],i);
const shaded=buildRiverbedProposal([{...left,normals:authoredNormals}],planRiverbed(route([[48,8],[48,56]])));
assert.deepEqual(shaded.ground[0].normals.slice(0,3),authoredNormals.slice(0,3),'unmodified triangle stars retain original shading');
assert.throws(()=>planRiverbed(route([[0,0],[8,8],[0,8],[8,0]])),/Self-intersecting/);
assert.throws(()=>planRiverbed(route([[0,0],[8,0],[4,0]])),/Backtracking/);
assert.throws(()=>buildRiverbedProposal([left],{...plan,minGrade:NaN}),/minGrade/);
assert.throws(()=>buildRiverbedProposal([left],{...plan,sourceBedY:0}),/Inconsistent/);
assert.throws(()=>planRiverbed({status:'unresolved-outlet',points:[]}),/resolved/);
assert.throws(()=>buildRiverbedProposal([left],plan,{protectedPolygons:[[{x:0,z:0},{x:1,z:1},{x:2,z:2}]]}),/convex/);
function basin(open=false){
  const mesh=flat(0);
  for(let i=0;i<mesh.vertices.length;i+=3){const x=mesh.vertices[i],z=mesh.vertices[i+2];
    if(x>=32&&(open||x<=48)&&z>=16&&z<=48)mesh.vertices[i+1]=-4;
  }
  return mesh;
}
const narrow=planRiverbed(route([[24,8],[24,56]]),{halfWidth:2,bankWidth:2});
const closedBasin=buildRiverbedProposal([basin()],narrow);
assert.equal(closedBasin.status,'geometry-candidate',JSON.stringify(closedBasin.summary));
assert.ok(closedBasin.summary.wetMaskEdges>0,'fixture must cross the old arbitrary corridor mask');
assert.ok(closedBasin.summary.outsideCorridorTriangles>0,'connected water extends to the actual basin shore');
assert.equal(closedBasin.summary.openWaterEdges,0);
const basinPair=[flat(0),flat(1)];
for(const mesh of basinPair)for(let i=0;i<mesh.vertices.length;i+=3)if(mesh.vertices[i]>=56&&mesh.vertices[i]<=96&&mesh.vertices[i+2]>=16&&mesh.vertices[i+2]<=48)mesh.vertices[i+1]=-4;
const joinedPlan=planRiverbed(route([[48,8],[48,56]]),{halfWidth:2,bankWidth:2}),joined=buildRiverbedProposal(basinPair,joinedPlan);
assert.equal(joined.status,'geometry-candidate',JSON.stringify(joined.summary));assert.equal(joined.summary.openInteriorEdges,0);
assert.ok(joined.water[1].indices.length>0,'connected inundation crosses the tile boundary');
assert.deepEqual(edge(joined.water[0],64),edge(joined.water[1],64),'inundation shore / water level match across tiles');
assert.deepEqual(joined,buildRiverbedProposal(basinPair.slice().reverse(),joinedPlan));
const openBasin=buildRiverbedProposal([basin(true)],narrow);
assert.equal(openBasin.status,'rejected');assert.ok(openBasin.issues.includes('open-water-boundary'));
assert.ok(openBasin.summary.openWaterEdges>0,'a wet unparsed boundary cannot become a shoreline');
assert.ok(openBasin.summary.openOuterEdges>0);
const isolated=flat(0);
for(let i=0;i<isolated.vertices.length;i+=3)if(isolated.vertices[i]>=48&&isolated.vertices[i]<=56&&isolated.vertices[i+2]>=24&&isolated.vertices[i+2]<=40)isolated.vertices[i+1]=-4;
const disconnected=buildRiverbedProposal([isolated],planRiverbed(route([[16,8],[16,56]]),{halfWidth:2,bankWidth:2}));
assert.equal(disconnected.status,'geometry-candidate');assert.ok(disconnected.summary.discardedWaterTriangles>0);
for(let i=0;i<disconnected.water[0].vertices.length;i+=3)assert.ok(disconnected.water[0].vertices[i]<32,'a separate basin must stay dry');
const hole=basin();hole.indices=Uint32Array.from(Array.from({length:hole.indices.length/3},(_,i)=>Array.from(hole.indices.slice(i*3,i*3+3)))
  .filter(tri=>!tri.every(i=>hole.vertices[i*3]>=32&&hole.vertices[i*3]<=40&&hole.vertices[i*3+2]>=24&&hole.vertices[i*3+2]<=32)).flat());
const holeResult=buildRiverbedProposal([hole],narrow);
assert.ok(holeResult.issues.includes('open-water-boundary'),'wet missing terrain requires an explicit connection');
assert.ok(holeResult.summary.openInteriorEdges>0);
assert.deepEqual(closedBasin,buildRiverbedProposal([basin()],narrow),'shoreline components are deterministic');
const dryShore=flat(0),shorePlan=planRiverbed(route([[16,8],[16,56]]),{halfWidth:2,bankWidth:2});
for(let i=0;i<dryShore.vertices.length;i+=3)dryShore.vertices[i+1]=shorePlan.sourceBedY+shorePlan.waterDepth-.003*(dryShore.vertices[i+2]-8)+(16-dryShore.vertices[i])*.1;
const shoreOnly=buildRiverbedProposal([dryShore],shorePlan,{protectedPolygons:[[{x:-1,z:-1},{x:65,z:-1},{x:65,z:65},{x:-1,z:65}]]});
assert.equal(shoreOnly.status,'rejected');assert.ok(shoreOnly.issues.includes('incomplete-water-path'));
assert.equal(shoreOnly.summary.waterTriangles,0,'zero-depth shoreline contact does not seed a water component');
function groundY(mesh,face,x,z){
  const v=mesh.vertices,t=Array.from(mesh.indices.slice(face*3,face*3+3),i=>({x:v[i*3],y:v[i*3+1],z:v[i*3+2]}));
  const [a,b,c]=t,den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
  const u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/den,w=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/den;
  assert.ok(Math.min(u,w,1-u-w)>-1e-4);return u*a.y+w*b.y+(1-u-w)*c.y;
}
function contactCheck(p,limit=250){
  const world=new RAPIER.World({x:0,y:0,z:0});let queries=0,maxError=0;
  try{
    for(const mesh of p.ground)world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.vertices,mesh.indices));world.step();
    for(let part=0;part<p.water.length;part++){
      const mesh=p.water[part],step=Math.max(1,Math.floor(mesh.sourceFaces.length/limit));
      for(let i=0;i<mesh.sourceFaces.length;i+=step){
        const x=Math.fround((mesh.vertices[i*9]+mesh.vertices[i*9+3]+mesh.vertices[i*9+6])/3),
          y=(mesh.vertices[i*9+1]+mesh.vertices[i*9+4]+mesh.vertices[i*9+7])/3,
          z=Math.fround((mesh.vertices[i*9+2]+mesh.vertices[i*9+5]+mesh.vertices[i*9+8])/3);
        const expected=groundY(p.ground[part],mesh.sourceFaces[i],x,z);assert.ok(y>=expected-.0001);
        const originY=Math.fround(y+2),hit=world.castRayAndGetNormal(new RAPIER.Ray({x,y:originY,z},{x:0,y:-1,z:0}),100,true),distance=rayContactDistance(hit,100);
        assert.notEqual(distance,null);maxError=Math.max(maxError,Math.abs(originY-distance-expected));queries++;
        const normal=mesh.normals.slice(i*9,i*9+3);assert.ok(normal[1]>0);assert.ok(Math.abs(Math.hypot(...normal)-1)<1e-5);
      }
    }
    assert.equal(world.colliders.len(),p.ground.length,'water has no wheel-support collider');
    assert.ok(queries>0);assert.ok(maxError<.0002,'actual Rapier bed / visible triangle mismatch: '+maxError);
    return {queries,maxError};
  }finally{world.free();}
}
const syntheticContacts=contactCheck(proposal),inundationContacts=contactCheck(closedBasin),inundationSeamContacts=contactCheck(joined),reports=[];
for(const seed of ['LEVEL-1','LEVEL-2','ROAD-38274CD4']){
  const f=riverbedFixture(seed),built=f.proposal,contacts=contactCheck(built,40);
  reports.push({seed,pathPoints:f.pathPoints,foundations:f.foundations,roadProtections:f.roadProtections,status:built.status,
    issues:built.issues,outletStatus:built.outletStatus,summary:built.summary,contacts,sourceHash:f.sourceHash});
}
writeFileSync(new URL('../../artifacts/tests/p2-riverbed-latest.json',import.meta.url),JSON.stringify({
  scope:'actual-terrain construction proposals; not connected river network, game integration or hydraulic simulation',syntheticContacts,inundationContacts,inundationSeamContacts,
  inundationCases:{closed:closedBasin.summary,joined:joined.summary,isolated:disconnected.summary,
    open:{status:openBasin.status,issues:openBasin.issues,summary:openBasin.summary},
    hole:{status:holeResult.status,issues:holeResult.issues,summary:holeResult.summary},
    dryShore:{status:shoreOnly.status,issues:shoreOnly.issues,summary:shoreOnly.summary}},reports},null,2)+'\n');
console.log('PASS riverbed proposal: connected basin shore, rejected wet domain / holes, isolated pools excluded, protected footprint, source ownership, canonical shared bed / water seams, water path coverage and actual Rapier ground support: '+JSON.stringify(reports));
