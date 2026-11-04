import * as THREE from 'three';
import {collectPerformanceBaseline} from './performance-baseline.mjs';
export async function collectStreamingProfile({getContext,stepOnce,setPause},options={}){
  const {core:d,road,bridge}=getContext();
  const manager=road.streamer;
  if(options.synchronous&&manager){manager.invalidate();road.streamer=null;}
  if(d.route.config.generator!==3||!options.natural&&(d.route.config.turnChance||d.route.config.slopeChance))throw Error('Flat V3 trace required unless natural traversal is requested');
  if(options.disableCCD)bridge.rigidBody.enableCcd(false);
  const mode=document.getElementById('drive-mode');mode.value='manual';mode.dispatchEvent(new Event('change'));
  setPause(true);d.inputKeys.clear();d.releaseKeyboardOverride();d.requestGear(0);
  Object.assign(d.hostControls,{active:true,steer:0,throttle:0,brake:0,clutch:1,parkPawl:false});
  const place=()=>{road.ensure(70);bridge.teleport({roadPoint:{...d.roadPointAt(70),y:road.position(70,0).y},angle:options.collision?Math.PI/2:0,speed:options.collision?20:options.speed??14});};
  place();let origin=bridge.rigidBody.translation(),end=origin,capturing=false;setPause(false);
  const events=[],revealEvents=[],original=road.ensure,gl=getContext().renderer.getContext();
  const originalUpload=gl.bufferData,originalBounds=THREE.BufferGeometry.prototype.computeBoundingSphere,originalPump=road.pumpStreaming;
  let captureStart=0,uploadPhase=false;const restorePhases=[];
  if(options.reveal){
    if(manager?.prepareMesh){const originalPrepare=manager.prepareMesh;manager.prepareMesh=function(...args){uploadPhase=true;try{return originalPrepare.apply(this,args);}finally{uploadPhase=false;}};restorePhases.push(()=>manager.prepareMesh=originalPrepare);}
    const wasProfiling=bridge.world.profilerEnabled;bridge.world.profilerEnabled=!!options.profilePhysics;restorePhases.push(()=>bridge.world.profilerEnabled=wasProfiling);
    for(const [object,name] of [[bridge.world,'step'],[bridge.world,'castRayAndGetNormal'],[bridge,'beforeForces'],[bridge,'captureContacts']]){
      const original=object[name];object[name]=function(...args){const start=performance.now();try{return original.apply(this,args);}
        finally{const ms=performance.now()-start;if(capturing&&ms>.5)revealEvents.push({kind:name,timeMs:performance.now()-captureStart,ms,...(name==='step'&&options.profilePhysics?Object.fromEntries(['timingStep','timingBroadPhase','timingNarrowPhase','timingSolver','timingCcd'].map(k=>[k,bridge.world[k]()] )):{})});}};
      restorePhases.push(()=>object[name]=original);
    }
    gl.bufferData=function(...args){const start=performance.now();try{return originalUpload.apply(this,args);}
      finally{if(capturing)revealEvents.push({kind:'upload',phase:uploadPhase?'hidden-preparation':'visible-render',timeMs:performance.now()-captureStart,ms:performance.now()-start,bytes:args[1]?.byteLength??args[1]??0});}};
    THREE.BufferGeometry.prototype.computeBoundingSphere=function(...args){const start=performance.now();try{return originalBounds.apply(this,args);}
      finally{if(capturing)revealEvents.push({kind:'bounds',phase:uploadPhase?'hidden-preparation':'visible-render',timeMs:performance.now()-captureStart,ms:performance.now()-start});}};
    road.pumpStreaming=function(...args){const before=this.streamingStats().commits,result=originalPump.apply(this,args);
      if(capturing&&this.streamingStats().commits!==before)revealEvents.push({kind:'commit',timeMs:performance.now()-captureStart});return result;};
  }
  road.ensure=function(...args){const start=performance.now();try{return original.apply(this,args);}
    finally{const ms=performance.now()-start;if(capturing&&ms>1)events.push({s:args[0],ms});}};
  if(options.natural){
    const advance=d.advancePhysics;
    d.advancePhysics=function(...args){
      const m=d.vehicleMotion,target=road.position(Math.min(d.roadTotalDistance(),d.route.distance+6+Math.min(5,Math.abs(d.state.velocity)*.35)),0);
      const angle=Math.atan2(Math.sin(Math.atan2(target.x-m.x,target.z-m.z)-m.heading),Math.cos(Math.atan2(target.x-m.x,target.z-m.z)-m.heading));
      d.hostControls.steer=Math.max(-1,Math.min(1,Math.atan(2*d.params.wheelbase*Math.sin(angle)/Math.max(3,Math.hypot(target.x-m.x,target.z-m.z)))/d.maximumSteerAngle(d.state.velocity)));
      return advance.apply(this,args);
    };
    restorePhases.push(()=>d.advancePhysics=advance);
  }
  try{
    const result=await collectPerformanceBaseline({renderer:getContext().renderer,road,core:d,getContext},
      {warmupSeconds:options.warmupSeconds??1,captureSeconds:options.captureSeconds??25,requireNative:!!options.requireNative,
        beforeCapture:options.warmupSeconds?place:undefined,onCaptureStart:()=>{origin=bridge.rigidBody.translation();captureStart=performance.now();capturing=true;},
        onCaptureStop:()=>{end=bridge.rigidBody.translation();capturing=false;}});
    setPause(true);
    return {...result,traceMode:options.collision?'lateral-guardrail-impact':options.natural?'natural-road-pure-pursuit-coast':'flat-coast',initialSpeedMps:options.collision?20:options.speed??14,scope:options.disableCCD?'diagnostic CCD-disabled comparison; not a shipping fix or performance acceptance':'moving real-vehicle terrain streaming trace; CCD enabled; not P3 completion',streamEvents:events,
      sceneryEnd:road.terrain?.sceneryStats?.()??null,collision:{count:bridge.collisionCount,railHits:bridge.railHits,barrierHits:bridge.barrierHits,maxImpulse:bridge.maxImpactImpulse},revealEvents,distanceM:Math.hypot(end.x-origin.x,end.z-origin.z),streaming:road.streamingStats?.()??{mode:'synchronous'}};
  }finally{if(options.disableCCD)bridge.rigidBody.enableCcd(true);for(const restore of restorePhases)restore();road.ensure=original;road.pumpStreaming=originalPump;gl.bufferData=originalUpload;THREE.BufferGeometry.prototype.computeBoundingSphere=originalBounds;setPause(true);if(options.synchronous&&manager){road.streamer=manager;manager.warmed();}}
}
