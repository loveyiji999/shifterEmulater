import {collectPerformanceBaseline} from './performance-baseline.mjs';

// Opt-in DEV diagnostics: observe normal play without applying a map, controls,
// pose, render size or physics settings. All data remains in a local JSON file.
export async function collectManualPerformance({getContext},options={}){
  const captureSeconds=options.captureSeconds??60,warmupSeconds=options.warmupSeconds??0;
  if(!Number.isFinite(captureSeconds)||captureSeconds<1||captureSeconds>120||
    !Number.isFinite(warmupSeconds)||warmupSeconds<0||warmupSeconds>10)throw Error('Invalid manual capture duration');
  const {renderer,road,core,bridge}=getContext(),world=bridge.world,gl=renderer.getContext();
  const events=[],frames=[],browserEntries=[],runtimeErrors=[],restore=[],observers=[];
  const limits={events:4096,browserEntries:256,runtimeErrors:32},overflow={events:0,browserEntries:0,runtimeErrors:0},cursor={events:0,browserEntries:0,runtimeErrors:0};
  let begin=null,end=null,capturing=false,initial=null,final=null,stepCpu=0,contactCpu=0,maxStep=0;
  const append=(kind,value)=>{const list={events,browserEntries,runtimeErrors}[kind];
    if(list.length<limits[kind])list.push(value);
    else{list[cursor[kind]]=value;cursor[kind]=(cursor[kind]+1)%limits[kind];overflow[kind]++;}};
  const ordered=(kind,list)=>overflow[kind]?list.slice(cursor[kind]).concat(list.slice(0,cursor[kind])):list;
  const view=()=>({width:typeof window==='undefined'?null:window.innerWidth,height:typeof window==='undefined'?null:window.innerHeight,
    dpr:typeof window==='undefined'?null:window.devicePixelRatio,visibility:typeof document==='undefined'?null:document.visibilityState,
    focused:typeof document==='undefined'?null:document.hasFocus(),drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight]});
  const state=()=>{
    const c=getContext(),p=bridge.rigidBody.translation();
    return {view:view(),map:{...core.route.config},preset:c.visualVehicleId,surface:core.state.surface,
      pavement:road.surfaceMap.pavementMaterial,routeS:core.route.distance,position:{x:p.x,y:p.y,z:p.z},
      collisions:bridge.collisionCount,railHits:bridge.railHits,barrierHits:bridge.barrierHits,
      maxImpulse:bridge.maxImpactImpulse,colliders:world.colliders.len(),streaming:road.streamingStats()};
  };
  const record=(kind,ms,extra={})=>{if(capturing)append('events',{kind,timeMs:performance.now()-begin,ms,...extra});};
  const wrap=(object,name,observe)=>{
    if(typeof object[name]!=='function')return;
    const original=object[name],wrapper=function(...args){
      const start=performance.now();try{return original.apply(this,args);}finally{if(capturing)observe(performance.now()-start);}
    };
    object[name]=wrapper;restore.push(()=>{if(object[name]===wrapper)object[name]=original;});
  };
  const profilePhysics=options.profilePhysics!==false,wasProfiling=world.profilerEnabled;
  world.profilerEnabled=profilePhysics;
  restore.push(()=>world.profilerEnabled=wasProfiling);
  wrap(world,'step',ms=>{
    stepCpu+=ms;maxStep=Math.max(maxStep,ms);
    if(ms>=1){const timings=profilePhysics?Object.fromEntries(['timingBroadPhase','timingNarrowPhase','timingSolver','timingCcd']
      .map(name=>[name,world[name]()] )):{};record('physics-step',ms,timings);}
  });
  wrap(bridge,'captureContacts',ms=>{contactCpu+=ms;if(ms>=.5)record('contact-report',ms);});
  wrap(world,'castRayAndGetNormal',ms=>{if(ms>=.5)record('wheel-ray',ms);});
  let previousStream=null;
  wrap(road,'pumpStreaming',ms=>{
    const s=road.streamingStats();
    if(ms>=1||!previousStream||s.commits!==previousStream.commits||s.mode!==previousStream.mode||s.error!==previousStream.error)
      record('streaming',ms,{...s,activeColliders:world.colliders.len()});
    previousStream=s;
  });
  const consume=entries=>{
    if(begin===null)return;
    for(const entry of entries)if(entry.startTime>=begin&&(end===null||entry.startTime<=end))
      append('browserEntries',{kind:entry.entryType,timeMs:entry.startTime-begin,duration:entry.duration,
        blockingDuration:entry.blockingDuration??null,renderStart:entry.renderStart?entry.renderStart-begin:null,
        scripts:Array.from(entry.scripts||[]).slice(0,8).map(s=>({duration:s.duration,
          invokerType:s.invokerType,sourceFunctionName:s.sourceFunctionName||null}))});
  };
  const observerSupport={'longtask':false,'long-animation-frame':false};
  if(typeof PerformanceObserver!=='undefined')for(const type of ['longtask','long-animation-frame']){
    observerSupport[type]=PerformanceObserver.supportedEntryTypes?.includes(type)||false;
    if(observerSupport[type])try{
      const observer=new PerformanceObserver(list=>consume(list.getEntries()));observer.observe({type});observers.push(observer);
    }catch{observerSupport[type]=false;}
  }
  const errorListener=e=>{if(capturing)append('runtimeErrors',{timeMs:performance.now()-begin,message:String(e.message||e.reason?.message||e.reason||'runtime error').slice(0,500)});};
  if(typeof window!=='undefined')for(const type of ['error','unhandledrejection']){
    window.addEventListener(type,errorListener);restore.push(()=>window.removeEventListener(type,errorListener));
  }
  const windowState=e=>record('window-state',0,{event:e.type,view:view()});
  if(typeof window!=='undefined')for(const type of ['resize','focus','blur']){
    window.addEventListener(type,windowState);restore.push(()=>window.removeEventListener(type,windowState));
  }
  if(typeof document!=='undefined'){
    document.addEventListener('visibilitychange',windowState);restore.push(()=>document.removeEventListener('visibilitychange',windowState));
  }
  const stop=()=>{
    if(!capturing)return;
    try{final=state();}catch(cause){final={snapshotError:String(cause?.message||cause)};}
    end=performance.now();capturing=false;
    for(const observer of observers)consume(observer.takeRecords());
  };
  let baseline=null,error=null;
  try{
    baseline=await collectPerformanceBaseline({renderer,road,core,getContext},{warmupSeconds,captureSeconds,
      requireNative:false,stopOnPause:true,
      onCaptureStart(){begin=performance.now();initial=state();capturing=true;stepCpu=0;contactCpu=0;maxStep=0;},
      onCaptureStop:stop,
      onFrame(frame){
        const s=road.streamingStats();
        Object.assign(frame,{visibilityState:typeof document==='undefined'?null:document.visibilityState,
          windowFocused:typeof document==='undefined'?null:document.hasFocus(),
          drawingBufferWidth:gl.drawingBufferWidth,drawingBufferHeight:gl.drawingBufferHeight,
          devicePixelRatio:typeof window==='undefined'?null:window.devicePixelRatio,physicsStepCpuMs:stepCpu,contactReportCpuMs:contactCpu,maxPhysicsStepMs:maxStep,
          activeColliders:world.colliders.len(),collisions:bridge.collisionCount,
          streamMode:s.mode,colliderPending:s.colliderPending??0,visualPending:s.visualPending??0,workerPending:s.pending??0});
        frames.push(frame);stepCpu=0;contactCpu=0;maxStep=0;
      }});
    baseline.scope='normal player session; instrumented diagnostic, not benchmark acceptance';
  }catch(cause){error=String(cause?.message||cause);}
  finally{
    stop();for(const observer of observers)observer.disconnect();
    for(const undo of restore.reverse())undo();
  }
  return {schema:'shiftlab.performance.manual.v1',status:error?'failed':'complete',error,
    scope:'instrumented normal player session; not performance acceptance or proof of root cause',
    recordedAt:new Date().toISOString(),profilePhysics,observerSupport,
    view:typeof window==='undefined'?null:{width:window.innerWidth,height:window.innerHeight,dpr:window.devicePixelRatio},
    initial,final,baseline,frames:baseline?undefined:frames,
    events:ordered('events',events),browserEntries:ordered('browserEntries',browserEntries),
    runtimeErrors:ordered('runtimeErrors',runtimeErrors),overflow,retention:'latest bounded entries in chronological order'};
}

export function downloadManualPerformance(report){
  const blob=new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;
  link.download='shiftlab-performance-'+report.recordedAt.replace(/[^0-9TZ]/g,'-')+'.json';
  document.body.append(link);
  try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
