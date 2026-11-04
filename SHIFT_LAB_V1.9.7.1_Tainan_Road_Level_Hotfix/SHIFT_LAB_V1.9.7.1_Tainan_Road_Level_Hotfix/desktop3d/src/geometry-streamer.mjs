import {roadSnapshot} from './road-snapshot.mjs';
const key=(x,z)=>x+','+z;
export class GeometryStreamer {
  constructor(road,{workerFactory,getVelocity=()=>({x:0,z:0}),budgetMs=2,prepareMesh=null}={}){
    this.road=road;this.getVelocity=getVelocity;this.budgetMs=budgetMs;this.prepareMesh=prepareMesh;this.visualQueue=[];this.colliderQueue=[];
    this.worker=workerFactory?workerFactory():new Worker(new URL('./streaming.worker.mjs',import.meta.url),{type:'module'});
    this.epoch=0;this.id=0;this.busy=null;this.ready=null;this.stagedRoads=[];this.stagedTerrain=[];
    this.bootstrap=true;this.disabled=false;this.snapshotRevision=null;this.plan=null;this.planKey='';
    this.metrics={jobs:0,discarded:0,commits:0,waits:0,maxWorkerMs:0,maxPrepareMs:0,maxActivateMs:0,maxUploadMs:0,preparedMeshes:0,preparedColliders:0,maxColliderMs:0,preparationYields:0,error:null};
    this.worker.onmessage=event=>{
      const message=event.data;if(this.busy?.id!==message.id)return;
      this.busy=null;
      if(message.epoch!==this.epoch||message.revision!==this.road.physics.route.v3State?.revision){this.metrics.discarded++;return;}
      if(message.error){this.fail(message.error);return;}this.ready=message;
      this.metrics.maxWorkerMs=Math.max(this.metrics.maxWorkerMs,message.workerMs);
    };
    this.worker.onerror=event=>this.fail(event.message||'Geometry worker failed');
  }
  discardStaged(){
    this.colliderQueue=[];
    for(const [index,chunk] of this.stagedRoads)this.road.disposeChunk(index,chunk,false);
    for(const [,tile] of this.stagedTerrain)this.road.terrain.dispose(tile);
    this.stagedRoads=[];this.stagedTerrain=[];this.visualQueue=[];this.ready=null;
  }
  invalidate(){this.epoch++;this.discardStaged();this.bootstrap=true;this.snapshotRevision=null;this.plan=null;this.planKey='';}
  fail(error){this.metrics.error=error;this.epoch++;this.busy=null;this.discardStaged();this.disabled=true;this.worker.terminate();
    this.road.spatialState=null;console.warn('Background geometry failed; using synchronous loading:',error);}
  warmed(){
    this.bootstrap=false;const revision=this.road.physics.route.v3State.revision;
    for(const chunk of this.road.chunks.values())chunk.streamRevision=revision;
    for(const tile of this.road.terrain.tiles.values())tile.streamRevision=revision;
  }
  update(s,position){
    const road=this.road,state=road.physics.route.v3State,v=this.getVelocity(),speed=Math.hypot(v.x,v.z);
    const distance=Math.max(48,speed*2),scale=speed>1?distance/speed:0;
    const predicted={x:position.x+v.x*scale,z:position.z+v.z*scale};
    const signature=[state.revision,Math.floor(s/25),Math.floor(position.x/32),Math.floor(position.z/32),
      Math.floor(predicted.x/128),Math.floor(predicted.z/128)].join(':');
    if(this.plan?.state!==state||this.plan?.revision!==state.revision){
      this.epoch++;this.discardStaged();this.snapshotRevision=null;this.planKey='';
    }
    if(signature!==this.planKey){
      const roads=new Set([...road.neededV3(s,position),...road.neededV3(s,predicted)]),terrain=new Map();
      for(const p of [position,predicted])for(let x=Math.floor(p.x/128)-1;x<=Math.floor(p.x/128)+1;x++)
        for(let z=Math.floor(p.z/128)-1;z<=Math.floor(p.z/128)+1;z++)terrain.set(key(x,z),[x,z]);
      this.plan={state,revision:state.revision,roads,terrain};this.planKey=signature;
    }
    this.request();const covered=this.covered(s,position);if(!covered)this.metrics.waits++;return covered;
  }
  covered(s,p){
    const road=this.road,total=road.physics.roadTotalDistance();
    for(const at of [Math.max(0,s-5),Math.min(total-1,s+5)])if(!road.chunks.has(Math.floor(at/100)))return false;
    for(const x of [p.x-5,p.x+5])for(const z of [p.z-5,p.z+5])if(!road.terrain.tiles.has(key(Math.floor(x/128),Math.floor(z/128))))return false;
    return true;
  }
  request(){
    if(this.disabled||this.bootstrap||this.busy||this.ready||!this.plan)return;
    const p=this.plan,roads=[...p.roads].filter(i=>i*100<this.road.physics.roadTotalDistance()&&this.road.chunks.get(i)?.streamRevision!==p.revision);
    const terrain=[...p.terrain].filter(([k])=>this.road.terrain.tiles.get(k)?.streamRevision!==p.revision).map(([,v])=>v);
    if(!roads.length&&!terrain.length)return;
    const request={id:++this.id,epoch:this.epoch,revision:p.revision,roads,terrain};
    if(this.snapshotRevision!==p.revision){request.snapshot=roadSnapshot(this.road.physics);this.snapshotRevision=p.revision;}
    const xs=[...p.terrain.values()].map(v=>v[0]*128),zs=[...p.terrain.values()].map(v=>v[1]*128);
    request.bounds={minX:Math.min(...xs),maxX:Math.max(...xs)+128,minZ:Math.min(...zs),maxZ:Math.max(...zs)+128};
    this.busy={id:request.id};this.metrics.jobs++;
    try{this.worker.postMessage(request);}catch(error){this.fail(error.message);}
  }
  pump(){
    if(this.disabled||!this.ready)return;
    const message=this.ready;
    if(message.epoch!==this.epoch||message.revision!==this.road.physics.route.v3State?.revision){this.discardStaged();return;}
    const start=performance.now();let prepared=false;
    try{
      do{
        if(message.roads.length){prepared=true;const {index,data}=message.roads.shift();
          const chunk=this.road.makeChunkV3(index,data,true,create=>this.colliderQueue.push(create));if(chunk){this.stagedRoads.push([index,chunk]);if(this.prepareMesh)this.visualQueue.push(...chunk.objects);}}
        else if(message.terrain.length){prepared=true;const data=message.terrain.shift(),tile=this.road.terrain.make(data.tx,data.tz,data,true,create=>this.colliderQueue.push(create));
          if(tile){this.stagedTerrain.push([key(data.tx,data.tz),tile]);if(this.prepareMesh)this.visualQueue.push(tile.mesh,...(tile.scenery?.objects||[]));}}
        else break;
      }while(performance.now()-start<this.budgetMs);
      this.metrics.maxPrepareMs=Math.max(this.metrics.maxPrepareMs,performance.now()-start);
      if(message.roads.length||message.terrain.length)return;
      // A final construction batch can already exhaust the CPU soft budget.
      // Do not stack GPU preparation or atomic activation on that same frame.
      if(prepared){this.metrics.preparationYields++;return;}
      if(this.colliderQueue.length){
        const colliders=performance.now();
        do{this.colliderQueue.shift()();this.metrics.preparedColliders++;}
        while(this.colliderQueue.length&&performance.now()-colliders<this.budgetMs);
        this.metrics.maxColliderMs=Math.max(this.metrics.maxColliderMs,performance.now()-colliders);
        return;
      }
      // Upload at most one hidden mesh per frame. Visibility/collision still
      // commit together only after every member of this reply is GPU-ready.
      if(this.visualQueue.length){
        const upload=performance.now();this.prepareMesh(this.visualQueue[0]);this.visualQueue.shift();
        this.metrics.maxUploadMs=Math.max(this.metrics.maxUploadMs,performance.now()-upload);this.metrics.preparedMeshes++;
        return;
      }
      const activate=performance.now(),road=this.road;
      for(const [index,chunk] of this.stagedRoads){
        const old=road.chunks.get(index);if(old)road.disposeChunk(index,old,false);
        for(const mesh of chunk.objects)mesh.visible=!mesh.userData.hiddenForPavement;
        for(const {collider} of chunk.colliders)collider.setEnabled(true);
        chunk.streamRevision=message.revision;road.chunks.set(index,chunk);
      }
      for(const [k,tile] of this.stagedTerrain){
        const old=road.terrain.tiles.get(k);if(old)road.terrain.dispose(old);
        road.terrain.activate(tile);tile.streamRevision=message.revision;road.terrain.tiles.set(k,tile);
      }
      this.stagedRoads=[];this.stagedTerrain=[];this.visualQueue=[];this.ready=null;
      if(this.plan){
        for(const [i,chunk] of road.chunks)if(!this.plan.roads.has(i))road.disposeChunk(i,chunk);
        for(const [k,tile] of road.terrain.tiles)if(!this.plan.terrain.has(k)){road.terrain.dispose(tile);road.terrain.tiles.delete(k);}
        for(const k of road.terrain.data.keys())if(!this.plan.terrain.has(k))road.terrain.data.delete(k);
      }
      this.metrics.commits++;this.metrics.maxActivateMs=Math.max(this.metrics.maxActivateMs,performance.now()-activate);
      this.request();
    }catch(error){this.fail(error.message);}
  }
  stats(){return {mode:this.disabled?'synchronous-fallback':'worker',...this.metrics,pending:this.busy?1:0,
    prepared:this.stagedRoads.length+this.stagedTerrain.length,colliderPending:this.colliderQueue.length,visualPending:this.visualQueue.length,ready:!!this.ready};}
}
