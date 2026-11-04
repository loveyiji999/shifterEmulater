import assert from 'node:assert/strict';
import {collectManualPerformance} from './manual-performance.mjs';

const keys=['performance','requestAnimationFrame','navigator','devicePixelRatio','window','PerformanceObserver'];
const saved=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
try{
  for(const key of keys)Object.defineProperty(globalThis,key,{value:null,writable:true,configurable:true});
  globalThis.navigator={userAgent:'manual capture test double',hardwareConcurrency:4};globalThis.devicePixelRatio=1.5;
  async function run({paused=false,lost=false,profilePhysics=true,observerSupport=true}={}){
    let clock=0,frame=0,timingReads=0;const listeners=new Map(),observers=[];
    globalThis.performance={now:()=>clock};
    globalThis.window={innerWidth:1280,innerHeight:720,devicePixelRatio:1.5,
      addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(type,fn){assert.equal(listeners.get(type),fn);listeners.delete(type);}};
    globalThis.PerformanceObserver=observerSupport?class{
      static supportedEntryTypes=['longtask','long-animation-frame'];
      constructor(callback){this.callback=callback;observers.push(this);}
      observe({type}){this.type=type;}takeRecords(){return [];}disconnect(){this.disconnected=true;}
    }:undefined;
    const map={generator:3,seed:'ROAD-38274CD4',turnChance:58,slopeChance:52};
    const world={profilerEnabled:false,colliders:{len:()=>100},step(){clock+=1.2;},castRayAndGetNormal(){clock+=.6;}};
    for(const name of ['timingBroadPhase','timingNarrowPhase','timingSolver','timingCcd'])world[name]=()=>{timingReads++;return .1;};
    const bridge={world,rigidBody:{translation:()=>({x:1,y:2,z:3})},collisionCount:0,railHits:0,barrierHits:0,maxImpactImpulse:0,
      captureContacts(){clock+=.6;this.collisionCount++;}};
    const core={route:{config:map,distance:70},state:{time:0,surface:'dry'},advancePhysics(){
      world.step();world.castRayAndGetNormal();bridge.captureContacts();core.state.time+=1/60;
    }};
    const road={surfaceMap:{pavementMaterial:'gravel'},ensure(){clock+=.1;},pumpStreaming(){clock+=2;},
      streamingStats:()=>({mode:'worker',commits:frame>10?1:0,colliderPending:frame>10?0:20,visualPending:3,pending:0})};
    const gl={RENDERER:1,drawingBufferWidth:1920,drawingBufferHeight:1080,
      getExtension:()=>null,getParameter:()=> 'Software test GPU',isContextLost:()=>lost&&frame>5};
    const renderer={getContext:()=>gl,render(){clock+=2;},info:{render:{calls:5,triangles:600},memory:{geometries:3,textures:2}}};
    const context={core,road,bridge,renderer,paused:false,locked:false,dropSteps:0,visualVehicleId:'city'};
    const originals={step:world.step,ray:world.castRayAndGetNormal,contacts:bridge.captureContacts,advance:core.advancePhysics,pump:road.pumpStreaming};
    globalThis.requestAnimationFrame=callback=>queueMicrotask(()=>{
      frame++;const end=clock+1000/60;
      road.ensure();core.advancePhysics();renderer.render();road.pumpStreaming();clock=end;
      context.paused=paused&&frame>5;
      if(frame===3){
        for(const observer of observers)observer.callback({getEntries:()=>Array.from({length:300},()=>({entryType:observer.type,startTime:1,duration:75,scripts:[]}))});
        for(let i=0;i<40;i++)listeners.get('error')?.({message:'injected diagnostic error '+i});
      }
      callback(clock);
    });
    const result=await collectManualPerformance({getContext:()=>context},{captureSeconds:1,profilePhysics});
    assert.equal(world.step,originals.step);assert.equal(world.castRayAndGetNormal,originals.ray);
    assert.equal(bridge.captureContacts,originals.contacts);assert.equal(core.advancePhysics,originals.advance);
    assert.equal(road.pumpStreaming,originals.pump);assert.equal(world.profilerEnabled,false);
    assert.equal(listeners.size,0);assert.ok(observers.every(o=>o.disconnected));
    assert.deepEqual(core.route.config,map);assert.deepEqual(result.initial.map,map);
    assert.deepEqual(result.initial.position,{x:1,y:2,z:3});assert.equal(result.initial.preset,'city');assert.equal(result.initial.pavement,'gravel');
    assert.equal(result.browserEntries.length,observerSupport?256:0);assert.equal(result.overflow.browserEntries,observerSupport?344:0);
    assert.equal(result.runtimeErrors.length,32);assert.equal(result.overflow.runtimeErrors,8);
    assert.match(result.runtimeErrors[0].message,/error 8$/);assert.match(result.runtimeErrors.at(-1).message,/error 39$/);
    if(observerSupport)assert.ok(result.browserEntries.every(e=>e.kind==='long-animation-frame'),'retain most recent bounded observations');
    assert.equal(timingReads>0,profilePhysics);return result;
  }
  const full=await run();assert.equal(full.status,'complete');assert.equal(full.schema,'shiftlab.performance.manual.v1');
  assert.equal(full.baseline.metadata.device,'Software test GPU','diagnostics retain software renderer evidence');
  assert.deepEqual(full.baseline.metadata.drawingBuffer,[1920,1080]);assert.equal(full.view.dpr,1.5);
  assert.ok(full.baseline.frames.every(f=>f.activeColliders===100&&Math.abs(f.physicsStepCpuMs-1.2)<1e-8&&Math.abs(f.contactReportCpuMs-.6)<1e-8));
  assert.ok(full.events.some(e=>e.kind==='physics-step'&&e.timingBroadPhase===.1));
  assert.ok(full.events.some(e=>e.kind==='streaming'));assert.ok(full.events.some(e=>e.kind==='wheel-ray'));
  assert.ok(full.baseline.frames.some(f=>f.colliderPending===20));assert.ok(full.baseline.frames.some(f=>f.colliderPending===0));
  const partial=await run({paused:true});assert.equal(partial.status,'complete');assert.equal(partial.baseline.stopReason,'paused');assert.equal(partial.baseline.frames.length,5);
  const failed=await run({lost:true});assert.equal(failed.status,'failed');assert.match(failed.error,/Context lost/);assert.equal(failed.frames.length,5);
  const unsupported=await run({observerSupport:false});assert.equal(unsupported.status,'complete');assert.deepEqual(unsupported.observerSupport,{'longtask':false,'long-animation-frame':false});
  const unprofiled=await run({profilePhysics:false});assert.equal(unprofiled.status,'complete');assert.equal(unprofiled.profilePhysics,false);
  await assert.rejects(collectManualPerformance({getContext:()=>{throw Error('must not inspect invalid input');}},{captureSeconds:NaN}),/Invalid manual/);
  console.log('PASS manual diagnostics: original map / vehicle / pose, CPU and queue correlation, software renderer evidence, bounded buffers, pause / context loss preservation and complete instrumentation cleanup');
}finally{
  for(const key of keys){if(saved[key])Object.defineProperty(globalThis,key,saved[key]);else delete globalThis[key];}
}
