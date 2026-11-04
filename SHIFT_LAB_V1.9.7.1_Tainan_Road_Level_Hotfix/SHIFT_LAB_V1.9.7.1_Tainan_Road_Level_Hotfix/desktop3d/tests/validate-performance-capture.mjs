import assert from 'node:assert/strict';
import {collectPerformanceBaseline} from './performance-baseline.mjs';

const keys=['performance','requestAnimationFrame','navigator','devicePixelRatio'];
const saved=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
try{
  for(const key of keys)Object.defineProperty(globalThis,key,{value:null,writable:true,configurable:true});
  globalThis.navigator={userAgent:'deterministic test double',hardwareConcurrency:4};globalThis.devicePixelRatio=1;
  async function run({software=false,paused=false,disjoint=false,postRenderPreparation=false,stopOnPause=false,callbackFailure=false,startCallbackFailure=false,changeConfigOnPause=false}={}){
    let clock=0,frame=0,active=null,deleted=0,target=null;
    const queries=[];
    globalThis.performance={now:()=>clock};
    const ext={TIME_ELAPSED_EXT:10,GPU_DISJOINT_EXT:11};
    const gl={RENDERER:1,QUERY_RESULT_AVAILABLE:2,QUERY_RESULT:3,drawingBufferWidth:1280,drawingBufferHeight:720,
      getExtension(name){return name==='WEBGL_debug_renderer_info'?{UNMASKED_RENDERER_WEBGL:4}:ext;},
      getParameter(key){return key===11?disjoint:software?'SwiftShader':'Native test GPU';},
      createQuery(){const q={frame};queries.push(q);return q;},
      beginQuery(type,q){assert.equal(active,null);active=q;},endQuery(){active=null;},
      getQueryParameter(q,key){return key===2?frame-q.frame>2:2000000;},
      deleteQuery(q){assert.ok(!q.deleted);q.deleted=true;deleted++;},isContextLost(){return false;}};
    const core={state:{time:0},route:{config:{seed:'fixed'}},advancePhysics(){clock+=1;core.state.time+=1/60;}};
    const road={ensure(){clock+=.25;}};
    const renderer={getContext:()=>gl,getRenderTarget:()=>target,render(){clock+=2;this.info.render={calls:target?0:5,triangles:target?0:600};},
      info:{render:{calls:5,triangles:600},memory:{geometries:3,textures:2}}};
    const context={paused:false,locked:false,dropSteps:0,visualVehicleId:'standard'};
    const originals={render:renderer.render,advance:core.advancePhysics,ensure:road.ensure};
    globalThis.requestAnimationFrame=callback=>queueMicrotask(()=>{
      frame++;const end=clock+1000/60;
      road.ensure();core.advancePhysics();renderer.render();
      if(postRenderPreparation){target={};renderer.render();target=null;}
      clock=end;
      context.paused=paused&&frame>5;
      if(context.paused&&changeConfigOnPause){core.route.config={seed:'changed-after-pause'};road.surfaceMap={pavementMaterial:'steel'};gl.drawingBufferWidth=640;gl.drawingBufferHeight=360;globalThis.devicePixelRatio=2;}
      callback(clock-100);
    });
    let result;
    try{result=await collectPerformanceBaseline({renderer,road,core,getContext:()=>context},
      {warmupSeconds:0,captureSeconds:1,requireNative:true,stopOnPause,
        onCaptureStart:startCallbackFailure?()=>{throw Error('start callback failure');}:undefined,
        onFrame:callbackFailure?()=>{throw Error('frame callback failure');}:undefined});}
    finally{
      assert.equal(renderer.render,originals.render);assert.equal(core.advancePhysics,originals.advance);
      assert.equal(road.ensure,originals.ensure);assert.equal(deleted,queries.length,'all GPU queries deleted');
    }
    return result;
  }
  const measured=await run();
  assert.ok(measured.frames.length>=60);
  assert.ok(measured.frames.every(f=>f.frameMs>=0),'stale RAF timestamps cannot create negative intervals');
  assert.ok(measured.gpuTimer.samples>0);
  assert.ok(measured.gpuTimer.samples<=measured.frames.length,'GPU drain cannot create new measurement queries');
  assert.equal(measured.physicsCpuMs.p95,1);assert.equal(measured.streamCpuMs.p95,.25);
  assert.equal(measured.gpuRenderMs.p95,2);assert.equal(measured.resourceMemoryBytes,null);
  assert.ok(Math.abs(measured.simulationRatio-1)<1e-8,'GPU drain must not inflate measured simulation time');
  const postRender=await run({postRenderPreparation:true});
  assert.ok(postRender.frames.every(f=>f.calls===5&&f.triangles===600),'hidden preparation after visible render must not erase visible draw statistics');
  const invalid=await run({disjoint:true});assert.equal(invalid.gpuTimer.samples,0);
  assert.ok(invalid.gpuTimer.disjointSamples>0);
  await assert.rejects(run({software:true}),/Native GPU required/);
  await assert.rejects(run({paused:true}),/paused/);
  const partial=await run({paused:true,stopOnPause:true});assert.equal(partial.stopReason,'paused');
  assert.equal(partial.frames.length,5);assert.ok(partial.wallSeconds<1);
  await assert.rejects(run({callbackFailure:true}),/frame callback failure/);
  await assert.rejects(run({startCallbackFailure:true}),/start callback failure/);
  const changed=await run({paused:true,stopOnPause:true,changeConfigOnPause:true});
  assert.equal(changed.metadata.map.seed,'fixed');assert.equal(changed.metadata.pavementMaterial,'asphalt_dense');
  assert.deepEqual(changed.metadata.drawingBuffer,[1280,720]);assert.equal(changed.metadata.devicePixelRatio,1);
  console.log('PASS capture accounting: async GPU availability/disjoint disposal, CPU intervals, simulation clock excludes drain, native-only gate and interruption restoration');
}finally{
  for(const key of keys){if(saved[key])Object.defineProperty(globalThis,key,saved[key]);else delete globalThis[key];}
}
