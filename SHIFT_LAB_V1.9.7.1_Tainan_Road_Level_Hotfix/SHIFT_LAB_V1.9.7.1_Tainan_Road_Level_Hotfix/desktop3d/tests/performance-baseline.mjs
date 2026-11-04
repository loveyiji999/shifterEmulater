// External DEV instrumentation. Never imported by production modules.
export async function collectPerformanceBaseline({renderer,road,core,getContext},options={}){
  const warmupSeconds=options.warmupSeconds??10,captureSeconds=options.captureSeconds??60;
  if(!Number.isFinite(warmupSeconds)||warmupSeconds<0||warmupSeconds>60||
    !Number.isFinite(captureSeconds)||captureSeconds<1||captureSeconds>600)throw Error('Invalid measurement duration');
  const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
  const device=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
  if(options.requireNative&&/swiftshader|llvmpipe|software|basic render/i.test(device))throw Error('Native GPU required: '+device);
  if(options.requireNative&&!debug)throw Error('Native renderer identity unavailable');
  const ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  await new Promise(resolve=>setTimeout(resolve,warmupSeconds*1000));
  options.beforeCapture?.();
  const frames=[],gpuMs=[],pending=[];
  let visibleRender=null,physics=0,stream=0,submit=0,active=null,disjointSamples=0,queryMisses=0,capturing=true;
  const originalRender=renderer.render,originalAdvance=core.advancePhysics,originalEnsure=road.ensure,originalPump=road.pumpStreaming;
  const poll=()=>{
    const disjoint=ext&&gl.getParameter(ext.GPU_DISJOINT_EXT);
    for(let i=pending.length-1;i>=0;i--){
      const query=pending[i];
      if(disjoint){pending.splice(i,1);gl.deleteQuery(query);disjointSamples++;}
      else if(gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)){
        gpuMs.push(gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6);gl.deleteQuery(query);pending.splice(i,1);
      }
    }
  };
  renderer.render=function(...args){
    poll();const start=performance.now();
    if(capturing&&ext&&!active&&pending.length<4){active=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,active);}
    else if(capturing&&ext)queryMisses++;
    try{return originalRender.apply(this,args);}finally{
      if(active){gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push(active);active=null;}
      submit+=performance.now()-start;
      if(!renderer.getRenderTarget?.())visibleRender={...renderer.info.render};
    }
  };
  core.advancePhysics=function(...args){const start=performance.now();
    try{return originalAdvance.apply(this,args);}finally{physics+=performance.now()-start;}};
  road.ensure=function(...args){const start=performance.now();
    try{return originalEnsure.apply(this,args);}finally{stream+=performance.now()-start;}};
  if(originalPump)road.pumpStreaming=function(...args){const start=performance.now();
    try{return originalPump.apply(this,args);}finally{stream+=performance.now()-start;}};
  const begin=performance.now(),initial=getContext(),simStart=core.state.time,dropsStart=initial.dropSteps,initialScenery=road.terrain?.sceneryStats?.()??null;
  const initialDrawingBuffer=[gl.drawingBufferWidth,gl.drawingBufferHeight],initialPixelRatio=devicePixelRatio;
  const initialMap={...core.route.config},initialPavement=road.surfaceMap?.pavementMaterial??'asphalt_dense';
  let previous=begin,stopReason='duration';
  try{
    options.onCaptureStart?.();
    await new Promise((resolve,reject)=>{
      // A synchronous setup can run inside an existing RAF batch. Its supplied
      // timestamp predates setup; use the actual observation clock consistently.
      const frame=()=>{
        const now=performance.now();
        if(gl.isContextLost()){reject(Error('Context lost during baseline'));return;}
        const context=getContext();
        if(context.paused||context.locked){
          if(options.stopOnPause){stopReason=context.locked?'locked':'paused';previous=now;resolve();}
          else reject(Error('Simulation paused during baseline'));
          return;
        }
        const info=renderer.info,render=visibleRender||info.render;
        frames.push({timeMs:now-begin,frameMs:now-previous,physicsCpuMs:physics,
          streamCpuMs:stream,renderSubmissionCpuMs:submit,calls:render.calls,
          triangles:render.triangles,geometries:info.memory.geometries,textures:info.memory.textures});
        try{options.onFrame?.(frames.at(-1));}catch(error){reject(error);return;}
        previous=now;physics=0;stream=0;submit=0;poll();
        if(now-begin>=captureSeconds*1000)resolve();else requestAnimationFrame(frame);
      };requestAnimationFrame(frame);
    });
    const wallSeconds=(previous-begin)/1000,simSeconds=core.state.time-simStart;
    const droppedSteps=getContext().dropSteps-dropsStart;
    capturing=false;
    options.onCaptureStop?.();
    // Freeze CPU/simulation interval BEFORE waiting for GPU results. Simulation
    // keeps advancing during the asynchronous drain, outside the measured span.
    // GPU reads stay asynchronous; unavailable results remain missing.
    for(let i=0;pending.length&&i<30;i++){await new Promise(resolve=>requestAnimationFrame(resolve));poll();}
    const quantiles=values=>{const sorted=values.slice().sort((a,b)=>a-b);
      const q=p=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor(p*(sorted.length-1)))]:null;
      return {p50:q(.5),p95:q(.95),p99:q(.99),max:sorted.length?sorted.at(-1):null};};
    return {schema:'shiftlab.performance.baseline.v1',scope:'current-game-stationary-baseline-not-P3-environment-completion',
      recordedAt:new Date().toISOString(),metadata:{browser:navigator.userAgent,device,backend:'WebGL2',
        drawingBuffer:initialDrawingBuffer,devicePixelRatio:initialPixelRatio,
        hardwareConcurrency:navigator.hardwareConcurrency,deviceMemoryGiB:navigator.deviceMemory??null,
        map:initialMap,scenery:initialScenery,pavementMaterial:initialPavement,preset:initial.visualVehicleId,warmupSeconds,captureSeconds},
      frameMs:quantiles(frames.map(f=>f.frameMs)),physicsCpuMs:quantiles(frames.map(f=>f.physicsCpuMs)),
      streamCpuMs:quantiles(frames.map(f=>f.streamCpuMs)),renderSubmissionCpuMs:quantiles(frames.map(f=>f.renderSubmissionCpuMs)),
      gpuRenderMs:quantiles(gpuMs),gpuTimer:{available:!!ext,samples:gpuMs.length,disjointSamples,queryMisses,unavailableSamples:pending.length},
      stopReason,wallSeconds,simSeconds,simulationRatio:simSeconds/wallSeconds,droppedSteps,
      resourceMemoryBytes:null,memoryStatus:'resource-counts-only-not-VRAM-bytes',
      frames,gpuMs};
  }finally{
    renderer.render=originalRender;core.advancePhysics=originalAdvance;road.ensure=originalEnsure;
    if(originalPump)road.pumpStreaming=originalPump;
    for(const query of pending)gl.deleteQuery(query);
  }
}
