import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import {fixture,base} from './road-v3-fixture.mjs';
import {roadSnapshot,snapshotCore} from '../src/road-snapshot.mjs';
import {TerrainWorld} from '../src/terrain-world.mjs';
import {buildRoadChunkV3} from '../src/road-geometry-v3.mjs';
import {RoadWorld} from '../src/road.mjs';
import {GeometryStreamer} from '../src/geometry-streamer.mjs';

// A construction call is not preemptible. Even when it is the last item in a
// reply, the upload/commit must wait for another pump (another render frame).
for(const withUpload of [false,true]){
  const mesh={visible:false,userData:{}},collider={setEnabled(value){this.enabled=value;}},chunk={objects:[mesh],colliders:[{collider}]};
  let uploads=0;
  const mockRoad={physics:{route:{v3State:{revision:1}}},chunks:new Map(),terrain:{tiles:new Map(),data:new Map()},
    makeChunkV3(){return chunk;}};
  const streamer=new GeometryStreamer(mockRoad,{workerFactory:()=>({terminate(){}}),
    prepareMesh:withUpload?()=>{uploads++;}:null});
  streamer.ready={id:1,epoch:0,revision:1,roads:[{index:0,data:{}}],terrain:[]};
  streamer.pump();
  assert.equal(uploads,0,'construction frame must not also upload');
  assert.equal(streamer.metrics.commits,0,'construction frame must not also activate');
  assert.equal(mesh.visible,false);assert.equal(collider.enabled,undefined);
  assert.equal(streamer.metrics.preparationYields,1);
  streamer.pump();
  if(withUpload){assert.equal(uploads,1);assert.equal(streamer.metrics.commits,0);streamer.pump();}
  assert.equal(streamer.metrics.commits,1);assert.equal(mesh.visible,true);assert.equal(collider.enabled,true);
}

// Force a zero soft budget so each pump creates exactly one queued shape.
{
  const mesh={visible:false,userData:{}},chunk={objects:[mesh],colliders:[]};let created=0,disposed=0;
  const mockRoad={physics:{route:{v3State:{revision:1}}},chunks:new Map(),terrain:{tiles:new Map(),data:new Map()},
    makeChunkV3(index,data,staged,defer){
      for(let i=0;i<4;i++)defer(()=>{created++;chunk.colliders.push({collider:{enabled:false,setEnabled(v){this.enabled=v;}}});});
      return chunk;
    },disposeChunk(){disposed++;}};
  const streamer=new GeometryStreamer(mockRoad,{workerFactory:()=>({terminate(){}}),budgetMs:0});
  const reply=()=>({id:1,epoch:streamer.epoch,revision:1,roads:[{index:0,data:{}}],terrain:[]});
  streamer.ready=reply();streamer.pump();assert.equal(created,0);assert.equal(streamer.stats().colliderPending,4);
  for(let i=1;i<=4;i++){
    streamer.pump();assert.equal(created,i);assert.equal(streamer.metrics.commits,0);assert.equal(mesh.visible,false);
    assert.ok(chunk.colliders.every(c=>!c.collider.enabled),'partial collider preparation stays disabled');
  }
  streamer.pump();assert.equal(streamer.metrics.commits,1);assert.ok(chunk.colliders.every(c=>c.collider.enabled));
  streamer.ready=reply();streamer.pump();assert.equal(streamer.stats().colliderPending,4);
  streamer.invalidate();assert.equal(streamer.stats().colliderPending,0);streamer.pump();assert.equal(created,4);assert.equal(disposed,1);
}

const delay=ms=>new Promise(r=>setTimeout(r,ms));
const core=fixture(base,48),snapshot=structuredClone(roadSnapshot(core)),adapter=snapshotCore(snapshot);
for(let s=0;s<core.roadTotalDistance();s+=17.31){
  const a=core.roadPointAt(s),b=adapter.roadPointAt(s);
  for(const key of Object.keys(a))assert.equal(b[key],a[key]);
  for(const l of [-30,-7.8,-6.85,-6,-3.4,0,3.4,6,6.85,7.8,30])assert.equal(adapter.roadCrossElevation(b,l),core.roadCrossElevation(a,l));
  for(const side of [-1,1])assert.equal(adapter.roadRailEnabled(b,side),core.roadRailEnabled(a,side));
}
const worker=new Worker(new URL('./geometry-worker-node.mjs',import.meta.url));
try{
  const indices=[0,...core.route.v3State.features.filter(f=>['tunnel','suspension'].includes(f.kind)).slice(0,2).map(f=>Math.floor((f.start+f.end)/200))];
  const response=once(worker,'message');worker.postMessage({id:1,epoch:1,revision:snapshot.state.revision,snapshot,roads:indices,terrain:[[0,0]]});
  const [result]=await response;assert.ok(!result.error,result.error);
  const sampler=new TerrainWorld({physics:core});sampler.prepare();
  for(const {index,data} of result.roads){
    const expected=buildRoadChunkV3(core,index,{surfaceAt:(x,z)=>sampler.surfaceAt(x,z),groundFootprint:(p,h,x,z)=>sampler.footprint(p,h,x,z)});
    for(const [kind,part] of Object.entries(data.meshes)){
      assert.deepEqual(part.vertices,new Float32Array(expected.meshes[kind].vertices));
      assert.deepEqual(part.indices,new Uint32Array(expected.meshes[kind].indices));assert.ok(part.normals.every(Number.isFinite));
    }
    assert.deepEqual(data.components,expected.components);
  }
  for(const key of ['vertices','indices','normals','uv','colors','weights','sky','tunnelIds'])assert.deepEqual(result.terrain[0][key],sampler.dataFor(0,0)[key]);
  const repeat=once(worker,'message');worker.postMessage({id:2,epoch:1,revision:snapshot.state.revision,roads:[],terrain:[[0,0]]});
  const repeated=(await repeat)[0];
  for(const key of ['vertices','colors','weights','sky','tunnelIds','scenery'])assert.deepEqual(repeated.terrain[0][key],result.terrain[0][key],'transfer must preserve deterministic cached source data: '+key);sampler.clear();
}finally{await worker.terminate();}

await RAPIER.init();const flat=fixture({...base,turnChance:0,hairpinChance:0,slopeChance:0},12);
const world=new RAPIER.World({x:0,y:-9.81,z:0}),scene=new THREE.Scene(),road=new RoadWorld(RAPIER,world,scene,flat);
road.ensure(70);const node=new Worker(new URL('./geometry-worker-node.mjs',import.meta.url));
const wrapper={postMessage:m=>node.postMessage(m),terminate:()=>node.terminate()};
node.on('message',data=>wrapper.onmessage?.({data}));node.on('error',error=>wrapper.onerror?.(error));
const uploaded=new Set();let uploadsThisPump=0;
road.enableAsyncStreaming({workerFactory:()=>wrapper,getVelocity:()=>({x:0,z:14}),budgetMs:.1,
  prepareMesh:mesh=>{assert.equal(mesh.visible,false);assert.ok(!uploaded.has(mesh));uploaded.add(mesh);uploadsThisPump++;mesh.geometry.computeBoundingSphere();}});
try{
  let mainBuilds=0,observedStaging=false;
  const build=road.terrain.field.buildTile;road.terrain.field.buildTile=function(...args){mainBuilds++;return build.apply(this,args);};
  road.ensure(110,flat.roadPointAt(110),{stream:true});
  assert.equal(road.streamingStats().pending,1);
  for(let s=111;s<120;s++)road.ensure(s,flat.roadPointAt(s),{stream:true});
  assert.equal(road.streamingStats().jobs,1,'one in-flight job only');
  const limit=Date.now()+20000;
  while(!road.streamingStats().commits&&Date.now()<limit){
    uploadsThisPump=0;road.pumpStreaming();assert.ok(uploadsThisPump<=1,'at most one hidden geometry upload per frame');
    for(const [,tile] of road.streamer.stagedTerrain){observedStaging=true;assert.equal(tile.mesh.visible,false);assert.ok(tile.scenery.objects.every(m=>!m.visible));assert.ok(tile.scenery.colliders.every(c=>!c.collider.isEnabled()));for(const collider of tile.colliders)assert.equal(collider.isEnabled(),false);}
    for(const [,chunk] of road.streamer.stagedRoads){observedStaging=true;
      for(const mesh of chunk.objects)assert.equal(mesh.visible,false);
      for(const {collider} of chunk.colliders)assert.equal(collider.isEnabled(),false);
    }
    await delay(5);
  }
  assert.ok(observedStaging,'verify disabled and invisible resources before atomic commit');
  assert.equal(road.streamingStats().commits,1);assert.equal(mainBuilds,0,'moving stream must not generate terrain on main');
  assert.ok(road.terrain.tiles.has('0,2'));
  assert.ok(uploaded.size>0);assert.equal(road.streamingStats().visualPending,0);
  assert.ok(road.streamingStats().preparedColliders>0);assert.equal(road.streamingStats().colliderPending,0);
  for(const tile of road.terrain.tiles.values())assert.equal(tile.collider,tile.colliders[0],'deferred creation preserves first-collider alias');
  for(const tile of road.terrain.tiles.values())if(tile.streamRevision===flat.route.v3State.revision&&uploaded.has(tile.mesh))
    for(const mesh of [tile.mesh,...tile.scenery.objects])assert.ok(uploaded.has(mesh),'all terrain/scenery meshes warmed before atomic visibility');
  for(const tile of road.terrain.tiles.values())assert.ok(tile.mesh.visible&&tile.colliders.every(c=>c.isEnabled()));
  const retained=road.terrain.tiles.get('0,0');flat.route.v3State.revision++;
  road.ensure(120,flat.roadPointAt(120),{stream:true});
  assert.equal(retained.collider.isEnabled(),true,'revision keeps old ground until replacement ready');
  const revisionLimit=Date.now()+20000;
  while(road.streamingStats().commits<2&&Date.now()<revisionLimit){road.pumpStreaming();await delay(5);}
  assert.equal(road.streamingStats().commits,2);
  for(const tile of road.terrain.tiles.values())assert.equal(tile.streamRevision,flat.route.v3State.revision);
  assert.equal(mainBuilds,0,'revision regeneration remains in worker');
  for(const tile of road.terrain.tiles.values()){assert.ok(tile.scenery.objects.every(m=>m.visible));assert.ok(tile.scenery.colliders.every(c=>c.collider.isEnabled()));}
  road.ensure(220,flat.roadPointAt(220),{stream:true});
  const uploadLimit=Date.now()+20000;
  while(!road.streamer.visualQueue.length&&Date.now()<uploadLimit){road.pumpStreaming();await delay(5);}
  assert.ok(road.streamer.visualQueue.length,'exercise reset while hidden meshes await upload');
  const pendingMesh=road.streamer.visualQueue[0];let pendingDisposed=false;
  pendingMesh.geometry.addEventListener('dispose',()=>pendingDisposed=true);
  road.clear();road.assertClean();assert.equal(road.streamer.visualQueue.length,0);assert.equal(road.streamingStats().colliderPending,0);assert.ok(pendingDisposed);
  assert.equal(world.colliders.len(),0);assert.equal(scene.children.length,0);
  road.ensure(70);road.streamer.warmed();
  assert.equal(road.ensure(600,flat.roadPointAt(600),{stream:true}),false,'missing terrain prevents an unsafe physics step');
  assert.equal(road.streamingStats().pending,1);
  road.clear();road.assertClean();
  const staleLimit=Date.now()+20000;
  while(road.streamingStats().pending&&Date.now()<staleLimit)await delay(5);
  road.pumpStreaming();road.assertClean();
  assert.ok(road.streamingStats().discarded>=1,'late map reply must be discarded');
  assert.equal(road.streamer.visualQueue.length,0,'invalidation removes references to disposed GPU work');
  assert.equal(world.colliders.len(),0);assert.equal(scene.children.length,0);
}finally{road.clear();await node.terminate();world.free();}
const fallbackWorld=new RAPIER.World({x:0,y:-9.81,z:0}),fallbackRoad=new RoadWorld(RAPIER,fallbackWorld,new THREE.Scene(),flat);
try{
  assert.equal(fallbackRoad.enableAsyncStreaming(),false,'Node without Worker keeps sync path');
  const warn=console.warn;console.warn=()=>{};
  try{
    assert.equal(fallbackRoad.enableAsyncStreaming({workerFactory:()=>{throw Error('construction failure');}}),false);
    let terminated=false;const broken={postMessage(){},terminate(){terminated=true;}};
    fallbackRoad.enableAsyncStreaming({workerFactory:()=>broken});
    broken.onerror({message:'test failure'});
    assert.ok(terminated);assert.equal(fallbackRoad.streamingStats().mode,'synchronous-fallback');
    assert.equal(fallbackRoad.streamingStats().error,'test failure');
  }finally{console.warn=warn;}
  fallbackRoad.ensure(70,flat.roadPointAt(70),{stream:true});
  assert.ok(fallbackRoad.chunks.size&&fallbackRoad.terrain.tiles.size,'worker failure retains functional sync loading');
  fallbackRoad.streamer=null;
  const sendWarn=console.warn;console.warn=()=>{};
  try{
    fallbackRoad.enableAsyncStreaming({workerFactory:()=>({postMessage(){throw Error('transfer failure');},terminate(){}})});
    assert.doesNotThrow(()=>fallbackRoad.ensure(110,flat.roadPointAt(110),{stream:true}));
    assert.equal(fallbackRoad.streamingStats().mode,'synchronous-fallback');
    assert.equal(fallbackRoad.streamingStats().error,'transfer failure');
    assert.equal(fallbackRoad.streamingStats().pending,0,'failed sends cannot retain pending ownership');
  }finally{console.warn=sendWarn;}
  // A delayed Rapier allocation failure must release partially created shapes,
  // staged meshes and callbacks, while preserving all previously active ground.
  fallbackRoad.streamer=null;
  fallbackRoad.enableAsyncStreaming({workerFactory:()=>({postMessage(){},terminate(){}})});
  const queued=fallbackRoad.streamer,priorColliders=fallbackWorld.colliders.len(),priorMeshes=fallbackRoad.scene.children.length;
  queued.ready={id:1,epoch:queued.epoch,revision:flat.route.v3State.revision,roads:[{index:4,data:buildRoadChunkV3(flat,4)}],terrain:[]};
  queued.pump();assert.ok(queued.stats().colliderPending>1);
  const allocation=fallbackWorld.createCollider;let allocations=0;
  fallbackWorld.createCollider=function(...args){if(++allocations===2)throw Error('deferred allocation failure');return allocation.apply(this,args);};
  const deferredWarn=console.warn;console.warn=()=>{};
  try{queued.pump();}finally{fallbackWorld.createCollider=allocation;console.warn=deferredWarn;}
  assert.equal(queued.stats().mode,'synchronous-fallback');assert.equal(queued.stats().colliderPending,0);
  assert.equal(queued.stats().error,'deferred allocation failure');assert.equal(fallbackWorld.colliders.len(),priorColliders);
  assert.equal(fallbackRoad.scene.children.length,priorMeshes);assert.equal(queued.visualQueue.length,0);
}finally{fallbackRoad.clear();fallbackRoad.assertClean();fallbackWorld.free();}
console.log('PASS actual geometry worker: original profile parity, identical road/terrain buffers, transfer cache ownership, bounded queue, atomic visibility/collision, no main terrain generation and stale reply cleanup');
