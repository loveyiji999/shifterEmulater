import {assertColliderTriangles} from './collider-geometry-check.mjs';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import {TerrainField} from '../src/terrain-geometry.mjs';
import {RoadWorld} from '../src/road.mjs';
import {fixture,base} from './road-v3-fixture.mjs';
import {vehicleParams} from './vehicle-core-fixture.mjs';
await RAPIER.init();
const core=fixture({...base,seed:'TERRAIN-CONTACT-V1',turnChance:0,hairpinChance:0,slopeChance:0},12);
core.params=vehicleParams('standard');core.state={surface:'dry'};
const before=JSON.stringify(core.route.v3State),field=new TerrainField(core);
const left=field.buildTile(-1,0),right=field.buildTile(0,0);
assert.deepEqual(field.buildTile(-1,0),left,'repeat generation must be deterministic');
const reverse=new TerrainField(core);reverse.buildTile(0,0);
assert.deepEqual(reverse.buildTile(-1,0),left,'tile load order must not change geometry');
assert.equal(JSON.stringify(core.route.v3State),before,'terrain must not mutate route or RNG');
const edge=(mesh,axis,value)=>{
  const points=new Map();for(let i=0;i<mesh.vertices.length;i+=3){
    if(mesh.vertices[i+axis]===value){const p=Array.from(mesh.vertices.slice(i,i+3));points.set(p.join(','),p);}}
  return [...points.values()].sort((a,b)=>a[0]-b[0]||a[2]-b[2]);
};
const farther=field.buildTile(-2,0);
assert.deepEqual(edge(farther,0,-128),edge(left,0,-128),'shared tile boundary must have identical Float32 vertices');
const edges=new Map();
for(let i=0;i<left.vertices.length;i+=9)for(let n=0;n<3;n++){
  const a=Array.from(left.vertices.slice(i+n*3,i+n*3+3)),j=i+(n+1)%3*3,b=Array.from(left.vertices.slice(j,j+3));
  const key=[a.join(','),b.join(',')].sort().join('|');
  if(!edges.has(key))edges.set(key,{a,b,count:0});edges.get(key).count++;
}
for(const {a,b,count} of edges.values()){
  assert.ok(count<=2,'terrain faces must not overlap');
  if(count===1)assert.ok(a[0]===b[0]&&[-128,-6].includes(a[0])||a[2]===b[2]&&[0,128].includes(a[2]),
    'unshared internal terrain edge: '+JSON.stringify({a,b}));
}
const seamNormals=mesh=>{
  const result=new Map();for(let i=0;i<mesh.vertices.length;i+=3)if(mesh.vertices[i]===-128){
    const key=Array.from(mesh.vertices.slice(i,i+3)).join(',');result.set(key,Array.from(mesh.normals.slice(i,i+3)));}
  return [...result].sort(([a],[b])=>a.localeCompare(b));
};
assert.deepEqual(seamNormals(farther),seamNormals(left),'halo normals must agree across tiles');
let roadEdges=0;
for(const mesh of [left,right])for(let i=0;i<mesh.vertices.length;i+=3){
  const [x,y,z]=mesh.vertices.slice(i,i+3);
  assert.ok([x,y,z].every(Number.isFinite));
  if(Math.abs(Math.abs(x)-6)<1e-5&&z>=0&&z<=128){
    const a=core.roadPointAt(Math.floor(z/4)*4),b=core.roadPointAt(Math.floor(z/4)*4+4);
    const ya=a.y+core.roadCrossElevation(a,x),yb=b.y+core.roadCrossElevation(b,x);
    assert.ok(Math.abs(y-ya-(yb-ya)*(z-a.s)/4)<1e-5);roadEdges++;}
}
assert.ok(roadEdges>10,'exact road/verge boundary must be represented');
const mountainCore=fixture(base,48),mountain=new TerrainField(mountainCore);
for(const s of [700,1700,2700]){
  const p=mountainCore.roadPointAt(s),tx=Math.floor(p.x/128),tz=Math.floor(p.z/128);
  const a=mountain.buildTile(tx,tz),b=mountain.buildTile(tx+1,tz);
  assert.deepEqual(edge(a,0,(tx+1)*128),edge(b,0,(tx+1)*128),'curved and graded road tile seam at '+s);
}
const world=new RAPIER.World({x:0,y:-9.81,z:0}),scene=new THREE.Scene(),road=new RoadWorld(RAPIER,world,scene,core);
road.ensure(70);world.step();
assert.equal(road.terrain.tiles.size,9);
for(const {mesh,colliders} of road.terrain.tiles.values())assertColliderTriangles([mesh],colliders);
const ray=(x,y,z,max=100)=>world.castRayAndGetNormal(new RAPIER.Ray({x,y,z},{x:0,y:-1,z:0}),max,true,
  undefined,undefined,undefined,undefined,c=>road.groundHandles.has(c.handle));
for(const x of [-110,-40,-6.01,6.01,40,110]){
  const h=ray(x,60,70);assert.ok(h,'terrain must exist outside corridor');
  const contact=road.surfaceAtHit(h,{x,z:70});assert.equal(contact.material,'terrain_mix');
  for(const key of ['tireMu','rollingCoefficient'])assert.ok(Math.abs(contact[key]-contact.components.reduce((n,c)=>n+c.weight*road.surfaceMap.profile(c.profileId).contact[key],0))<1e-12);
  assert.equal(contact.scope,'project-illustrative-terrain-blend');
  assert.ok(h.normal.y>0,'terrain winding must point upward');
}
const roadHit=ray(0,10,70,11);assert.equal(road.surfaceAtHit(roadHit).material,'asphalt_dense');
const hits=[];world.intersectionsWithRay(new RAPIER.Ray({x:0,y:10,z:70},{x:0,y:-1,z:0}),30,true,h=>{
  if(road.groundHandles.has(h.collider.handle))hits.push(h);return true;});
assert.ok(hits.length>0);
assert.ok(hits.every(hit=>road.surfaceAtHit(hit).material==='asphalt_dense'),'terrain cannot hide the pavement');
assert.equal(new Set(hits.map(hit=>road.surfaceAtHit(hit).layerId+':'+hit.timeOfImpact.toFixed(5))).size,1,'partition edges must still resolve one geometric support layer');
for(const [condition,mu,rolling] of [['wet',.38,.045],['snow',.28,.03],['ice',.12,.02]]){
  core.state.surface=condition;road.ensure(70);
  const contact=road.surfaceAtHit(ray(40,60,70));
  assert.equal(contact.condition,condition);
  for(const key of ['tireMu','rollingCoefficient'])assert.ok(Math.abs(contact[key]-contact.components.reduce((n,c)=>n+c.weight*road.surfaceMap.profile(c.profileId).contact[key],0))<1e-12);
}
const oldTiles=new Map(road.terrain.tiles),oldObjects=new Set(scene.children),oldCount=world.colliders.len();
const create=world.createCollider;let count=0;
world.createCollider=function(...args){if(++count===3)throw Error('terrain allocation fixture');return create.apply(this,args);};
assert.throws(()=>road.terrain.ensure({x:500,z:70}),/terrain allocation fixture/);world.createCollider=create;
assert.deepEqual(road.terrain.tiles,oldTiles);assert.equal(world.colliders.len(),oldCount);
assert.deepEqual(new Set(scene.children),oldObjects,'candidate failure must preserve active terrain');
road.ensure(70,{x:500,z:70});assert.equal(road.terrain.tiles.size,9,'stream around actual offroad body position');
const streamed=new Map(road.terrain.tiles);
for(let x=1000;x<=3000;x+=500)road.terrain.ensure({x,z:70});
assert.ok(road.terrain.field.heightConstraints.size<=256,'height sample cache must stay local during offroad streaming');
for(const tile of streamed.values())assert.equal(road.groundHandles.has(tile.collider.handle),false);
road.clear();road.assertClean();assert.equal(world.colliders.len(),0);assert.equal(scene.children.length,0);
assert.equal(road.terrain.field,null);world.free();
console.log('PASS continuous terrain: deterministic tiles, Float32 seams, exact road cuts, actual Rapier support, shared buffers, soil contact states, body-position streaming, allocation rollback and zero reset residue');
