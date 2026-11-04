import {assertColliderTriangles} from './collider-geometry-check.mjs';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import {RoadWorld} from '../src/road.mjs';
import {buildRoadChunkV3} from '../src/road-geometry-v3.mjs';
import {fixture,engine,base} from './road-v3-fixture.mjs';
await RAPIER.init();
const world=new RAPIER.World({x:0,y:-9.81,z:0}),scene=new THREE.Scene();
const core=fixture(),road=new RoadWorld(RAPIER,world,scene,core);
const state=core.route.v3State;
assert.ok(engine.audit(state).ok);
assert.ok(state.crossings.length>0);assert.ok(state.features.some(f=>f.kind==='tunnel'));
const hit=(p,direction,max=30,filter=()=>true)=>world.castRay(new RAPIER.Ray(p,direction),max,true,undefined,undefined,undefined,undefined,filter);
let checked=0;
for(const crossing of state.crossings){
  road.ensure(crossing.lower);world.step();
  assert.ok(road.chunks.has(Math.floor(crossing.upper/100)),'both crossing chainages must stream');
  for(const side of [-3.4,-1.7,0,1.7,3.4]){
    const p=road.position(crossing.lower,side);
    const floor=hit({...p,y:p.y+1},{x:0,y:-1,z:0},2,c=>road.groundHandles.has(c.handle));
    assert.ok(floor,'lower pavement missing');assert.ok(Math.abs(floor.timeOfImpact-1)<.15);
    const overhead=hit({...p,y:p.y+.15},{x:0,y:1,z:0},40);
    assert.ok(overhead,'upper deck missing over lower lane');assert.ok(overhead.timeOfImpact+.15>=engine.design.clearance,
      'full lane overhead clearance '+(overhead.timeOfImpact+.15));
    checked++;
  }
  for(const arc of [crossing.upper,crossing.lower]){
    const p=core.roadPointAt(arc),snap=engine.nearest(state,p.x,p.y+.6,p.z,arc,p.heading);
    assert.ok(Math.abs(snap.s-arc)<1,'projection jumped between decks');
  }
}
for(const f of state.features.filter(f=>f.kind==='tunnel')){
  const s=(f.start+f.end)/2;road.ensure(s);world.step();
  for(const lateral of [-3.4,0,3.4]){
    const p=road.position(s,lateral),ceiling=hit({...p,y:p.y+.2},{x:0,y:1,z:0},10,c=>road.barrierHandles.has(c.handle));
    assert.ok(ceiling,'tunnel has no physical ceiling');assert.ok(ceiling.timeOfImpact>5.5);
    const floor=hit({...p,y:p.y+1},{x:0,y:-1,z:0},2,c=>road.groundHandles.has(c.handle));
    assert.ok(floor);assert.ok(Math.abs(floor.timeOfImpact-1)<.15);
  }
  const p=road.position(s,0),r=core.roadPointAt(s);
  const wall=hit({...p,y:p.y+1},{x:Math.cos(r.heading),y:0,z:-Math.sin(r.heading)},8,c=>road.barrierHandles.has(c.handle));
  assert.ok(wall,'tunnel wall lacks physical collision');
  // CCD rigid bodies must stop at the shell, not just return a ray hit.
  const priorGravity={...world.gravity};world.gravity={x:0,y:0,z:0};
  for(const mode of ['wall','ceiling']){
    const start=mode==='wall'?road.position(s,5.55):road.position(s,0);
    const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true)
      .setTranslation(start.x,start.y+1,start.z));
    world.createCollider(RAPIER.ColliderDesc.cuboid(.18,.18,.18).setFriction(0),body);
    body.setLinvel(mode==='wall'?{x:Math.cos(r.heading)*8,y:0,z:-Math.sin(r.heading)*8}:{x:0,y:8,z:0},true);
    for(let n=0;n<100;n++)world.step();
    const q=body.translation();
    if(mode==='wall')assert.ok((q.x-p.x)*Math.cos(r.heading)-(q.z-p.z)*Math.sin(r.heading)<6.35,'CCD body passed through wall');
    else assert.ok(q.y-p.y<engine.design.tunnelHeight+.1,'CCD body passed through ceiling');
    world.removeRigidBody(body);
  }
  world.gravity=priorGravity;
}
road.clear();road.assertClean();assert.equal(scene.children.length,0);
// Same-level node has one clipped common platform, no walls or rails across arms.
const junctionCore=fixture({...base,seed:'JUNCTION-4',turnChance:65,hairpinChance:30,slopeChance:0});
assert.ok(junctionCore.route.v3State.junctions.length>0);
const junctionRoad=new RoadWorld(RAPIER,world,scene,junctionCore);
for(const j of junctionCore.route.v3State.junctions){
  junctionRoad.ensure(j.a);world.step();
  assert.ok(junctionRoad.chunks.has(Math.floor(j.b/100)));
  const hits=[];world.intersectionsWithRay(new RAPIER.Ray({x:j.x,y:j.y+2,z:j.z},{x:0,y:-1,z:0}),3,true,(h)=>{if(junctionRoad.groundHandles.has(h.collider.handle))hits.push(h);return true;});
  assert.ok(hits.length>0,'junction platform missing');
  assert.equal(new Set(hits.map(h=>junctionRoad.surfaceAtHit(h).layerId)).size,1,'junction has distinct support layers');
  assert.ok(Math.max(...hits.map(h=>h.timeOfImpact))-Math.min(...hits.map(h=>h.timeOfImpact))<.001,'junction has stacked support heights');
  for(const h of hits)assert.ok(Math.abs(h.timeOfImpact-2)<.02);
  for(const chunk of junctionRoad.chunks.values())assertColliderTriangles(chunk.objects.filter(m=>!m.userData.nonPhysicalFinish),chunk.colliders.map(x=>x.collider));
  for(const arc of [j.a,j.b])for(const offset of [-15,0,15]){
    const p=junctionRoad.position(arc+offset,0);
    assert.ok(hit({...p,y:p.y+1},{x:0,y:-1,z:0},2,c=>junctionRoad.groundHandles.has(c.handle)),'junction arm missing');
    assert.equal(junctionCore.roadRailEnabled(junctionCore.roadPointAt(arc+offset),1),false);
  }
  const p=junctionCore.roadPointAt(j.b+10);
  const snap=engine.nearest(junctionCore.route.v3State,p.x,p.y+.6,p.z,j.a,p.heading);
  assert.ok(Math.abs(snap.s-(j.b+10))<1,'declared junction must allow entering another arm');
}
junctionRoad.clear();junctionRoad.assertClean();
// Real generated gorge spans contain towers, main cables, hangers and anchorages.
const spanCore=fixture({...base,seed:'LEVEL-0'}),spanState=spanCore.route.v3State;
const spans=spanState.features.filter(f=>f.kind==='suspension');assert.ok(spans.length>0);
for(const f of spans){
  const components=[];
  for(let i=Math.floor(f.start/100);i<=Math.floor(f.end/100);i++){
    const data=buildRoadChunkV3(spanCore,i);components.push(...data.components);
    for(const mesh of Object.values(data.meshes))assert.ok(mesh.vertices.every(Number.isFinite));
  }
  assert.ok(components.filter(c=>c.kind==='tower').length>=2);
  assert.ok(components.filter(c=>c.kind==='anchorage').length>=2);
  assert.ok(components.some(c=>c.kind==='hanger'));
}
// Rendering and Rapier contain the same oriented Float32 triangles after compact spatial partitioning.
road.ensure(state.crossings[0].upper);world.step();
for(const chunk of road.chunks.values()){
  const physical=chunk.colliders.map(x=>x.collider);
  const rendered=chunk.objects.filter(x=>!x.userData.nonPhysicalFinish);
  assertColliderTriangles(rendered,physical);
  for(const collider of physical)if(road.barrierHandles.has(collider.handle))assert.equal(road.groundHandles.has(collider.handle),false);
}
road.clear();road.assertClean();assert.equal(scene.children.length,0);assert.equal(world.colliders.len(),0);
// Same revision number on a different generated map must rebuild the XY index.
const replacement=fixture({...base,seed:'LEVEL-2'});
Object.assign(core,replacement);const pair=core.route.v3State.crossings[0];
road.ensure(pair.lower);assert.ok(road.chunks.has(Math.floor(pair.upper/100)),'stale spatial index after map switch');
for(const c of core.route.v3State.crossings.slice(0,24)){
  road.ensure(c.lower);world.step();
  for(const side of [-3.4,-1.7,0,1.7,3.4]){
    const p=road.position(c.lower,side),overhead=hit({...p,y:p.y+.15},{x:0,y:1,z:0},Math.max(30,core.roadPointAt(c.upper).y-p.y+20));
    assert.ok(overhead,'multi-deck overhead missing '+JSON.stringify({c,side,lowerY:p.y,upperY:core.roadPointAt(c.upper).y,loaded:road.chunks.has(Math.floor(c.upper/100))}));assert.ok(overhead.timeOfImpact+.15>=engine.design.clearance,'multi-deck lane clearance');checked++;
  }
}
road.clear();road.assertClean();assert.equal(world.colliders.len(),0);
world.free();
console.log('PASS real Rapier V3: '+checked+' lane clearance checks; upper/lower streaming, tunnel shell, single junction platform, topology, suspension components, shared mesh and disposal');
