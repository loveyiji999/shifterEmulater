// Browser regressions for development driving, production isolation, or standalone acceptance.
// Requires Node 22+ and local Chrome/Edge; uses an isolated profile and owned Vite process.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const processes=[];
let profile=null,cdp=null,browserDiagnostics='';
class CDP {
  constructor(socket){
    this.socket=socket;this.pending=new Map();this.next=0;this.errors=[];
    socket.addEventListener('message',event=>{
      const message=JSON.parse(event.data),pending=this.pending.get(message.id);
      if(pending){clearTimeout(pending.timer);this.pending.delete(message.id);
        if(message.error)pending.reject(Error(JSON.stringify(message.error)));else pending.resolve(message.result);}
      if(message.method==='Runtime.exceptionThrown')this.errors.push(message.params.exceptionDetails);
    });
    socket.addEventListener('close',()=>{
      for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(Error('CDP closed during '+pending.method));}
      this.pending.clear();
    });
  }
  static async open(url){
    const socket=new WebSocket(url);
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('CDP connection timeout')),10000);
      socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
      socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('CDP connection failed'));},{once:true});
    });
    return new CDP(socket);
  }
  send(method,params={},sessionId){
    if(this.socket.readyState!==WebSocket.OPEN)return Promise.reject(Error('CDP socket is not open'));
    const id=++this.next;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout: '+method));},45000);
      this.pending.set(id,{resolve,reject,timer,method});
      this.socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
    });
  }
  async evaluate(expression,session){
    const result=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},session);
    if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result.value;
  }
}

async function stop(child){
  if(!child||child.exitCode!==null||child.signalCode!==null)return;
  const closed=once(child,'close');child.kill();await Promise.race([closed,delay(5000)]);
}

async function main(){
  assert.equal(typeof WebSocket,'function','Browser QA requires Node 22+ with built-in WebSocket');
  let browser=process.argv.slice(2).find(arg=>!arg.startsWith('--'));
  if(!browser){
    const candidates=process.platform==='win32'?[
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
    ]:['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'];
    for(const candidate of candidates)try{await fs.access(candidate);browser=candidate;break;}catch{}
  }
  assert.ok(browser,'Pass a Chrome/Edge executable path as the first argument');
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
  const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const production=process.argv.includes('--production'),riverbedPreview=process.argv.includes('--riverbed-preview');
  const previewName=process.argv.find(arg=>arg.startsWith('--preview-name='))?.slice(15)||'p2-riverbed';
  assert.ok(/^p2-[a-z-]+$/.test(previewName),'Invalid preview name');
  const acceptance=process.argv.includes('--acceptance');
  const vehicleDiagnostics=process.argv.includes('--vehicle-diagnostics');
  const surfaceContact=process.argv.includes('--surface-contact');
  const materialGallery=process.argv.includes('--material-gallery');
  const baselinePerformance=process.argv.includes('--baseline-performance');
  const nativeGpu=process.argv.includes('--native-gpu');
  assert.ok(!baselinePerformance||nativeGpu,'Performance baseline requires --native-gpu');
  assert.ok(!(production&&acceptance),'Acceptance runs only from the development server');
  const vite=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),
    ...(production?['preview']:[]),
    '--host','127.0.0.1','--port',String(port),'--strictPort'],
    {cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true});processes.push(vite);
  let viteLog='';
  for(const stream of [vite.stdout,vite.stderr])stream.on('data',chunk=>{viteLog=(viteLog+chunk).slice(-10000);});
  const url=`http://127.0.0.1:${port}/`;
  let ready=false;
  for(let attempt=0;attempt<100;attempt++){
    if(vite.exitCode!==null)throw Error('Vite exited: '+viteLog);
    try{const response=await fetch(url);if(response.ok){await response.text();ready=true;break;}}catch{}
    await delay(100);
  }
  assert.ok(ready,'Vite startup timeout: '+viteLog);
  console.log('Browser QA: local Vite ready');
  profile=await fs.mkdtemp(path.join(os.tmpdir(),'shiftlab-procedural-browser-'));
  const chrome=spawn(browser,['--headless=new','--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check',
    '--disable-background-networking','--disable-sync','--disable-extensions','--disable-component-update',
    ...(nativeGpu?[]:['--use-angle=swiftshader','--enable-unsafe-swiftshader']),'about:blank'],
    {stdio:['ignore','ignore','pipe'],windowsHide:true});processes.push(chrome);
  let browserLog='',endpoint='';
  chrome.stderr.on('data',chunk=>{browserLog=(browserLog+chunk).slice(-10000);
    browserDiagnostics=browserLog;
    endpoint=browserLog.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1]||endpoint;});
  chrome.on('exit',(code,signal)=>{browserDiagnostics+='\nBrowser exit '+JSON.stringify({code,signal});});
  for(let attempt=0;!endpoint&&attempt<150;attempt++){
    if(chrome.exitCode!==null)throw Error('Browser exited: '+browserLog);
    await delay(100);
  }
  assert.ok(endpoint,'Browser startup timeout: '+browserLog);
  cdp=await CDP.open(endpoint);
  const target=await cdp.send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  await cdp.send('Page.enable',{},sessionId);await cdp.send('Runtime.enable',{},sessionId);

  const requests=[],httpErrors=[];
  cdp.socket.addEventListener('message',event=>{
    const msg=JSON.parse(event.data);
    if(msg.method==='Network.requestWillBeSent')requests.push(msg.params.request.url);
    if(msg.method==='Network.responseReceived'&&msg.params.response.status>=400&&
      new URL(msg.params.response.url).pathname!=='/favicon.ico')
      httpErrors.push({url:msg.params.response.url,status:msg.params.response.status});
  });
  await cdp.send('Network.enable',{},sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride',
    {width:1440,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  await cdp.send('Page.navigate',{url:riverbedPreview?pathToFileURL(path.join(root,'../artifacts/tests/'+previewName+'-preview-2026-11-02.html')).href:materialGallery?url+'tests/material-gallery/index.html':vehicleDiagnostics?url+'tests/vehicle-diagnostics/index.html':acceptance?url+'tests/acceptance/index.html':url},sessionId);
  let gameReady=false;
  for(let i=0;i<200;i++){
    gameReady=await cdp.evaluate(riverbedPreview?'!!window.__SHIFT_LAB_RIVERBED_PREVIEW__?.ready':materialGallery?'!!window.__SHIFT_LAB_MATERIAL_GALLERY__?.snapshot':vehicleDiagnostics?'!!window.__SHIFT_LAB_VEHICLE_DIAGNOSTICS__?.ready':acceptance?'!!window.__SHIFT_LAB_ACCEPTANCE__?.ready':production?
      "!!document.getElementById('dash-speed')&&!document.getElementById('screen-overlay')":
      '!!window.__SHIFT_LAB_3D_QA__?.ready',sessionId);
    if(gameReady)break;
    if(cdp.errors.length)throw Error(JSON.stringify(cdp.errors));
    await delay(100);
  }
  assert.ok(gameReady,'Game startup timeout');
  const evaluate=expression=>cdp.evaluate(expression,sessionId);
  if(riverbedPreview){
    const views={};
    for(const [name,value] of [['before',false],['after',true]]){
      await evaluate(`window.__SHIFT_LAB_RIVERBED_PREVIEW__.showAfter(${value})`);
      views[name]=await evaluate('window.__SHIFT_LAB_RIVERBED_PREVIEW__.snapshot()');
      assert.equal(views[name].afterVisible,value);assert.equal(views[name].status,'geometry-candidate');assert.ok(views[name].waterTriangles>0);
      if(nativeGpu)assert.ok(!/swiftshader|software|llvmpipe/i.test(views[name].device));
      await fs.writeFile(path.join(root,'../artifacts/tests/'+previewName+'-'+name+'-2026-11-02.png'),Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
    }
    assert.deepEqual(views.before.camera,views.after.camera);assert.deepEqual(views.before.target,views.after.target);
    assert.deepEqual(cdp.errors,[]);assert.deepEqual(httpErrors,[]);
    await fs.writeFile(path.join(root,'../artifacts/tests/'+previewName+'-preview-verification-2026-11-02.json'),JSON.stringify(views,null,2)+'\n');
    console.log('PASS standalone native riverbed preview: same camera / lighting, before and after geometry, no runtime / HTTP errors; not game integration or performance acceptance');return;
  }
  if(process.argv.includes('--manual-performance')){
    const before=await evaluate(`(()=>{const q=window.__SHIFT_LAB_3D_QA__;q.applyMap({...q.map,generator:3,seed:'ROAD-38274CD4'});const select=document.getElementById('car-preset');select.value='city';select.dispatchEvent(new Event('change'));q.openMode('drive');const snapshot=q.snapshot();q.startManualCapture({captureSeconds:1,download:false});let concurrentRejected=false;try{q.startBaseline({captureSeconds:1});}catch{concurrentRejected=true;}return {snapshot,concurrentRejected};})()`);
    assert.ok(before.concurrentRejected,'instrumentation sessions cannot overlap');
    const waitManual=async()=>{
      let report;
      for(let i=0;i<500;i++){
        report=await evaluate('window.__SHIFT_LAB_3D_QA__.manualCapture');
        if(report.status==='complete'||report.status==='failed')return report;
        await delay(100);
      }throw Error('Manual capture timeout');
    };
    const full=await waitManual();assert.equal(full.status,'complete',JSON.stringify(full.error));
    assert.equal(full.result.schema,'shiftlab.performance.manual.v1');assert.ok(full.result.baseline.frames.length>0);
    assert.equal(full.result.initial.map.seed,'ROAD-38274CD4');assert.equal(full.result.initial.preset,'city');
    assert.ok(full.result.baseline.frames.every(f=>f.activeColliders>0&&Number.isFinite(f.physicsStepCpuMs)));
    const after=await evaluate('window.__SHIFT_LAB_3D_QA__.snapshot()');
    for(const key of ['mapSeed','vehiclePreset','roadMaterial','chassisColliderCount','bumpStopCount'])assert.equal(after[key],before.snapshot[key]);
    assert.ok(Math.hypot(after.x-before.snapshot.x,after.z-before.snapshot.z)<.1,'idle recording must not reposition the car');
    await evaluate("window.__manualDownloadUrl=URL.createObjectURL;URL.createObjectURL=()=>{throw Error('Injected local download failure');};window.__SHIFT_LAB_3D_QA__.startManualCapture({captureSeconds:1})");
    const exportFailure=await waitManual();await evaluate('URL.createObjectURL=window.__manualDownloadUrl;delete window.__manualDownloadUrl');
    assert.equal(exportFailure.status,'failed');assert.match(exportFailure.error,/Injected local download failure/);
    assert.ok(exportFailure.result.baseline.frames.length>0,'download failure must preserve collected diagnostics');
    await evaluate('window.__SHIFT_LAB_3D_QA__.startManualCapture({captureSeconds:10,download:false})');
    await delay(250);await evaluate("window.__SHIFT_LAB_3D_QA__.openMode('settings')");
    const partial=await waitManual();assert.equal(partial.status,'complete');assert.equal(partial.result.baseline.stopReason,'paused');
    assert.ok(partial.result.baseline.frames.length>0);assert.ok(partial.result.baseline.wallSeconds<5);
    assert.equal(await evaluate('window.__SHIFT_LAB_3D_QA__.paused'),true,'recorder must not unpause manual play');
    const directory=path.join(root,'../artifacts/tests/manual-performance-downloads-2026-10-30');await fs.mkdir(directory,{recursive:true});
    const existing=new Set(await fs.readdir(directory));
    await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:directory});
    await cdp.send('Page.navigate',{url:url+'tests/performance/index.html'},sessionId);
    let launcherReady=false;
    for(let i=0;i<200;i++){launcherReady=await evaluate("document.title==='SHIFT LAB 手動效能擷取'");if(launcherReady)break;await delay(50);}
    assert.ok(launcherReady);assert.equal(await evaluate("document.querySelector('a').getAttribute('href')"),'../../?capture-performance=60');
    if(process.argv.includes('--screenshot'))await fs.writeFile(path.join(root,'../artifacts/tests/manual-performance-launcher-2026-10-30.png'),Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
    await cdp.send('Page.navigate',{url:url+'?capture-performance=1'},sessionId);
    for(let i=0;i<500;i++){if(await evaluate('!!window.__SHIFT_LAB_3D_QA__?.ready'))break;await delay(100);}
    const boot=await waitManual();assert.equal(boot.status,'complete',boot.error);
    assert.equal(await evaluate("new URL(location.href).searchParams.has('capture-performance')"),false);
    let downloaded;
    for(let i=0;i<200;i++){
      downloaded=(await fs.readdir(directory)).find(name=>!existing.has(name)&&name.startsWith('shiftlab-performance-')&&name.endsWith('.json'));
      if(downloaded)break;await delay(100);
    }
    assert.ok(downloaded,'local JSON download must complete');
    const saved=JSON.parse(await fs.readFile(path.join(directory,downloaded),'utf8'));
    assert.equal(saved.schema,'shiftlab.performance.manual.v1');assert.equal(saved.initial.map.seed,'ROAD-38274CD4');assert.equal(saved.initial.preset,'city');
    assert.ok(saved.baseline.frames.length>0);assert.deepEqual(saved.view,{width:1440,height:900,dpr:1});
    await fs.writeFile(path.join(root,'../artifacts/tests/manual-performance-browser-latest.json'),JSON.stringify({full:full.result,partial:partial.result,exportFailure,download:downloaded},null,2)+'\n');
    const previousTimeOrigin=await evaluate('performance.timeOrigin');
    await cdp.send('Page.reload',{},sessionId);
    for(let i=0;i<500;i++){if(await evaluate(`performance.timeOrigin!==${previousTimeOrigin}&&!!window.__SHIFT_LAB_3D_QA__?.ready`))break;await delay(100);}
    assert.equal(await evaluate('window.__SHIFT_LAB_3D_QA__.manualCapture.status'),'idle','reload cannot restart an already consumed capture request');
    assert.deepEqual(cdp.errors,[]);assert.deepEqual(httpErrors,[]);
    console.log('PASS real browser manual diagnostics: unchanged player setup / idle pose, concurrent capture rejection, pause preserves samples, standalone launcher, local JSON download and no repeated capture on reload');return;
  }
  if(process.argv.includes('--streaming-performance')||process.argv.includes('--reveal-performance')||process.argv.includes('--scenery-performance')){
    assert.ok(nativeGpu,'Streaming timing requires native GPU');
    const reveal=process.argv.includes('--reveal-performance')||process.argv.includes('--scenery-performance');
    if(process.argv.includes('--cpu-profile')){await cdp.send('Profiler.enable',{},sessionId);await cdp.send('Profiler.start',{},sessionId);}
    const traceSeed=process.argv.find(a=>a.startsWith('--trace-seed='))?.slice(13)||'STREAM-TIMING-V1';
    const tracePavement=process.argv.find(a=>a.startsWith('--pavement='))?.slice(11)||'asphalt_dense';
    const collisionTrace=process.argv.includes('--collision-trace'),naturalTrace=process.argv.includes('--natural-trace');
    const traceOptions={natural:naturalTrace,collision:collisionTrace,captureSeconds:reveal?(process.argv.includes('--short-profile')?15:40):25,speed:naturalTrace?20:reveal?45:14,reveal,profilePhysics:process.argv.includes('--short-profile'),disableCCD:process.argv.includes('--diagnose-ccd'),requireNative:true,warmupSeconds:process.argv.includes('--warm')?10:1,synchronous:!reveal&&process.argv.includes('--before')};
    await evaluate(`(()=>{const q=window.__SHIFT_LAB_3D_QA__;q.applyMap({...q.map,generator:3,seed:${JSON.stringify(traceSeed)},turnChance:${naturalTrace?58:0},hairpinChance:${naturalTrace?20:0},slopeChance:${naturalTrace?52:0}});const select=document.getElementById('road-material');if(!Array.from(select.options).some(o=>o.value===${JSON.stringify(tracePavement)}))throw Error('Unsupported trace pavement');select.value=${JSON.stringify(tracePavement)};select.dispatchEvent(new Event('change'));q.startStreamingTrace(${JSON.stringify(traceOptions)});})()`);
    let trace;
    for(let i=0;i<800;i++){trace=await evaluate('window.__SHIFT_LAB_3D_QA__.baseline');
      if(trace.status==='complete'||trace.status==='failed')break;await delay(100);}
    if(process.argv.includes('--cpu-profile')){const profile=await cdp.send('Profiler.stop',{},sessionId);await fs.writeFile(path.join(root,'../artifacts/tests/terrain-reveal-cpu-2026-10-29.json'),JSON.stringify(profile));}
    assert.equal(trace.status,'complete',JSON.stringify(trace));
    if(collisionTrace)assert.ok(trace.result.collision.count>0,'collision trace must produce real contact');
    else assert.ok(trace.result.distanceM>180,'trace must cross multiple terrain boundaries');
    assert.deepEqual(cdp.errors,[]);assert.deepEqual(httpErrors,[]);
    const suffix=(process.argv.includes('--diagnose-ccd')?'diagnostic-ccd':process.argv.includes('--short-profile')?'diagnostic-physics':process.argv.includes('--before')?'before':'after')+(process.argv.includes('--warm')?'-warm':'');
    const label=process.argv.find(a=>a.startsWith('--capture-label='))?.slice(16).replace(/[^a-z0-9-]/gi,'');
    await fs.writeFile(path.join(root,'../artifacts/tests/'+(label?label+'-':'')+(process.argv.includes('--scenery-performance')?'p2-scenery-performance-':reveal?'terrain-reveal-':'streaming-')+suffix+'-2026-10-29.json'),JSON.stringify(trace.result,null,2)+'\n');
    console.log('PASS native moving streaming capture: '+JSON.stringify({frame:trace.result.frameMs,stream:trace.result.streamCpuMs,gpu:trace.result.gpuRenderMs,mode:trace.result.streaming,distance:trace.result.distanceM,ratio:trace.result.simulationRatio,drops:trace.result.droppedSteps}));return;
  }
  if(materialGallery){
    const result=await evaluate('window.__SHIFT_LAB_MATERIAL_GALLERY__.snapshot()');
    assert.equal(result.materialIds.length,10);assert.equal(result.materials,10);assert.equal(result.textures,30);assert.ok(result.shadow&&result.environment);
    await fs.writeFile(path.join(root,'../artifacts/tests/material-gallery-2026-10-29.png'),
      Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
    assert.deepEqual(httpErrors,[]);assert.deepEqual(cdp.errors,[]);
    await fs.writeFile(path.join(root,'../artifacts/tests/material-gallery-2026-10-29.json'),JSON.stringify(result,null,2)+'\n');
    console.log('PASS 10-material PBR gallery, shared daylight/shadows/environment and no runtime errors');return;
  }
  if(baselinePerformance){
    const results=[],gates={frameP95Ms:20,frameP99Ms:33.34,simulationRatioMin:.98,droppedSteps:0};
    const info=await cdp.send('SystemInfo.getInfo');
    const browserVersion=await cdp.send('Browser.getVersion');
    await evaluate(`(()=>{const q=window.__SHIFT_LAB_3D_QA__;
      q.applyMap({...q.map,generator:3,seed:'P0-NATIVE-BASELINE-V1',turnChance:0,hairpinChance:0,slopeChance:0});
      document.getElementById('car-preset').value='standard';q.driveProcedural();})()`);
    for(let repetition=1;repetition<=3;repetition++){
      await evaluate('window.__SHIFT_LAB_3D_QA__.startBaseline({warmupSeconds:10,captureSeconds:60,requireNative:true})');
      let status;
      const start=Date.now();
      while(Date.now()-start<100000){
        status=await evaluate('({status:window.__SHIFT_LAB_3D_QA__.baseline.status,error:window.__SHIFT_LAB_3D_QA__.baseline.error})');
        if(status.status==='failed')throw Error(status.error);
        if(status.status==='complete')break;
        await delay(1000);
      }
      assert.equal(status.status,'complete','Baseline capture timed out');
      const result=await evaluate('window.__SHIFT_LAB_3D_QA__.baseline.result');
      assert.ok(result.frames.length>100&&result.simSeconds>0);
      result.gates=gates;result.gatesMet=result.frameMs.p95<=gates.frameP95Ms&&result.frameMs.p99<=gates.frameP99Ms&&
        result.simulationRatio>=gates.simulationRatioMin&&result.droppedSteps===0;
      results.push(result);
      console.log(JSON.stringify({repetition,device:result.metadata.device,frameMs:result.frameMs,
        simulationRatio:result.simulationRatio,droppedSteps:result.droppedSteps,gatesMet:result.gatesMet}));
    }
    assert.deepEqual(httpErrors,[]);assert.deepEqual(cdp.errors,[]);
    const directory=path.join(root,'../artifacts/tests/performance');await fs.mkdir(directory,{recursive:true});
    await fs.writeFile(path.join(directory,'p0-native-baseline-2026-10-28.json'),JSON.stringify({
      scope:'P0 stationary existing scene; not P3 ten environment cases',gates,browserVersion,
      gpuDevices:info.gpu.devices,results},null,2)+'\n');
    await fs.writeFile(path.join(directory,'p0-native-baseline-2026-10-28.png'),
      Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
    console.log('PASS native GPU baseline capture: 3 x 60s; quality gates reported separately');return;
  }
  if(process.argv.includes('--terrain-overview')||process.argv.includes('--engineering-overview')||process.argv.includes('--pbr-shadow-study')){
    const engineering=process.argv.includes('--engineering-overview')||process.argv.includes('--pbr-shadow-study');
    const feature=await evaluate(`(()=>{const q=window.__SHIFT_LAB_3D_QA__;q.applyMap({...q.map,generator:3,
      seed:'LEVEL-1',turnChance:70,hairpinChance:35,slopeChance:30,maxGrade:9});
      return document.getElementById('physics').contentWindow.__SHIFT_LAB_DEBUG__.route.v3State.features.find(f=>f.kind===${JSON.stringify(engineering?'tunnel':'suspension')});})()`);
    assert.ok(feature);
    const report=await evaluate(`window.__SHIFT_LAB_3D_QA__.driveRoadV3(${JSON.stringify({start:feature.start-40,end:feature.start-30})})`);
    assert.ok(report.contactFraction===1&&report.collisionCount===0);
    if(process.argv.includes('--pbr-shadow-study')){
      await evaluate('window.__SHIFT_LAB_3D_QA__.step(0)');
      const results=[];
      for(const [name,options] of [['off',{shadows:false}],['baseline',{shadows:true,shadowSize:1024,bias:-.00008,normalBias:.04}],
        ['tuned',{shadowSize:2048,bias:-.0003,normalBias:.08}],['no-normal',{normalMaps:false}]]){
        const result=await evaluate(`window.__SHIFT_LAB_3D_QA__.configurePBRPreview(${JSON.stringify(options)})`);
        await evaluate('window.__SHIFT_LAB_3D_QA__.frameView()');
        await fs.writeFile(path.join(root,'../artifacts/tests/pbr-shadow-'+name+'-2026-10-29.png'),
          Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
        results.push({name,options,result});
      }
      await fs.writeFile(path.join(root,'../artifacts/tests/pbr-shadow-study-2026-10-29.json'),JSON.stringify({scope:'functional shadow artifact comparison, not performance measurement',results},null,2)+'\n');
      assert.deepEqual(httpErrors,[]);assert.deepEqual(cdp.errors,[]);console.log('PASS actual PBR shadow comparison captures');return;
    }
    await evaluate('window.__SHIFT_LAB_3D_QA__.frameView()');
    await fs.writeFile(path.join(root,engineering?'../artifacts/tests/pbr-portal-2026-10-29.png':'../artifacts/tests/pbr-suspension-2026-10-29.png'),
      Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
    assert.deepEqual(httpErrors,[]);assert.deepEqual(cdp.errors,[]);
    console.log('PASS engineering overview capture with actual vehicle support');return;
  }
  if(process.argv.includes('--tunnel-performance')){
    assert.ok(nativeGpu,'Tunnel timing requires native GPU');
    const setup=await evaluate("(()=>{const q=window.__SHIFT_LAB_3D_QA__;q.applyMap({...q.map,generator:3,seed:'LEVEL-1',turnChance:70,hairpinChance:35,slopeChance:30});const s=q.inspectTunnelLighting('interior');delete s.withLights.image;delete s.withoutLights.image;if(!q.selectAutomaticRange('P'))throw Error('P rejected');q.openMode('settings');q.openMode('drive');q.startBaseline({warmupSeconds:10,captureSeconds:30,requireNative:true});return s;})()");
    let trace;for(let i=0;i<700;i++){trace=await evaluate('window.__SHIFT_LAB_3D_QA__.baseline');if(trace.status==='complete'||trace.status==='failed')break;await delay(100);}
    assert.equal(trace.status,'complete',JSON.stringify(trace));
    const final=await evaluate('({lighting:window.__SHIFT_LAB_3D_QA__.getTunnelLightingState(),vehicle:window.__SHIFT_LAB_3D_QA__.snapshot()})');
    assert.ok(final.lighting.sky<.1);assert.ok(final.lighting.activeLights>0);assert.equal(final.vehicle.invalidWheelLoads,0);
    await fs.writeFile(path.join(root,'../artifacts/tests/p2-tunnel-native-performance-2026-10-29.json'),JSON.stringify({scope:'single interior stationary gameplay case; not P3 completion',setup,result:trace.result,final},null,2)+'\n');
    assert.deepEqual(httpErrors,[]);assert.deepEqual(cdp.errors,[]);
    console.log('PASS native tunnel rendering capture: '+JSON.stringify({frame:trace.result.frameMs,gpu:trace.result.gpuRenderMs,ratio:trace.result.simulationRatio,drops:trace.result.droppedSteps,lighting:final.lighting}));return;
  }
  if(process.argv.includes('--tunnel-lighting')){
    await evaluate("(()=>{const q=window.__SHIFT_LAB_3D_QA__;q.applyMap({...q.map,generator:3,seed:'LEVEL-1',turnChance:70,hairpinChance:35,slopeChance:30});})()");
    const results=[];
    for(const view of ['entry','threshold','interior','exit']){
      const result=await evaluate(`window.__SHIFT_LAB_3D_QA__.inspectTunnelLighting(${JSON.stringify(view)})`);
      assert.ok(result.contacts>0);assert.equal(result.invalidWheelLoads,0);assert.equal(result.exposure,1.05);
      assert.equal(result.totalLights,6);assert.ok(result.activeLights<=6);
      if(view==='interior'){assert.ok(result.sky<.1);assert.ok(result.withLights.meanDisplayLuma>result.withoutLights.meanDisplayLuma+1);}
      if(view==='entry'||view==='exit')assert.equal(result.sky,1);
      for(const variant of ['withLights','withoutLights']){
        await fs.writeFile(path.join(root,'../artifacts/tests/p2-tunnel-'+view+'-'+variant+'-2026-10-29.png'),Buffer.from(result[variant].image.split(',')[1],'base64'));
        delete result[variant].image;
      }
      results.push(result);
    }
    await fs.writeFile(path.join(root,'../artifacts/tests/p2-tunnel-lighting-browser-2026-10-29.json'),JSON.stringify(results,null,2)+'\n');
    assert.deepEqual(httpErrors,[]);assert.deepEqual(cdp.errors,[]);
    console.log('PASS live tunnel lighting: '+JSON.stringify(results.map(r=>({view:r.view,sky:r.sky,lights:r.activeLights,lumaOn:r.withLights.meanDisplayLuma,lumaOff:r.withoutLights.meanDisplayLuma}))));return;
  }
  if(process.argv.includes('--terrain-blend')){
    await evaluate("(()=>{const q=window.__SHIFT_LAB_3D_QA__;q.applyMap({...q.map,generator:3,seed:'LEVEL-1',turnChance:70,hairpinChance:35,slopeChance:30});q.step(12);q.frameView();})()");
    const results=[];
    for(const condition of ['dry','wet','snow','ice']){
      await evaluate(`(()=>{const el=document.getElementById('road-surface');el.value=${JSON.stringify(condition)};el.dispatchEvent(new Event('change'));window.__SHIFT_LAB_3D_QA__.step(12);window.__SHIFT_LAB_3D_QA__.frameView();})()`);
      const {image,...result}=await evaluate('window.__SHIFT_LAB_3D_QA__.inspectTerrainBlend(true)');
      assert.equal(result.condition,condition);assert.ok(result.queries>50);
      assert.ok(result.maxHeightError<.0001);assert.ok(result.maxWeightError<.00001);
      assert.ok(result.ranges[1][1]>.1,'actual gravel patches required');
      if(results.length)assert.deepEqual(result.ranges,results[0].ranges,'weather must not move material boundaries');
      results.push(result);
      await fs.writeFile(path.join(root,'../artifacts/tests/p2-terrain-blend-'+condition+'-2026-10-29.png'),Buffer.from(image.split(',')[1],'base64'));
    }
    await fs.writeFile(path.join(root,'../artifacts/tests/p2-terrain-blend-browser-2026-10-29.json'),JSON.stringify(results,null,2)+'\n');
    await evaluate("(()=>{const q=window.__SHIFT_LAB_3D_QA__;q.applyMap({...q.map,seed:'TERRAIN-CONTACT-V1',turnChance:0,hairpinChance:0,slopeChance:0});})()");
    const braking=[];
    for(const condition of ['dry','wet','snow','ice']){
      await evaluate(`(()=>{const el=document.getElementById('road-surface');el.value=${JSON.stringify(condition)};el.dispatchEvent(new Event('change'));window.__SHIFT_LAB_3D_QA__.step(12);})()`);
      const result=await evaluate(`window.__SHIFT_LAB_3D_QA__.driveTerrainBraking(${JSON.stringify(condition)},{speed:6,maxSteps:3600})`);
      await fs.writeFile(path.join(root,'../artifacts/tests/p2-terrain-blend-braking-'+condition+'-2026-10-29.json'),JSON.stringify(result,null,2)+'\n');
      assert.ok(result.distance>1&&result.distance<100,JSON.stringify({condition,distance:result.distance}));
      if(condition==='ice')assert.ok(result.stopped||result.samples.at(-1).speed<.2,'bounded ice braking must reduce 6 m/s to under .2 m/s; residual creep remains reported');
      else assert.ok(result.stopped,condition+' must actually stop');assert.equal(result.invalidWheelLoads,0);assert.equal(result.collisions,0,'braking must not be stopped by an obstacle');
      const contacts=result.samples.flatMap(s=>s.wheelSurface).filter(Boolean);
      assert.ok(contacts.length>20&&contacts.every(s=>s.material==='terrain_mix'&&s.condition===condition));
      assert.ok(result.samples.some(s=>s.contacts===4&&s.wheelFx.some(fx=>fx< -20)));
      braking.push(result);
    }
    await fs.writeFile(path.join(root,'../artifacts/tests/p2-terrain-blend-braking-2026-10-29.json'),JSON.stringify(braking,null,2)+'\n');
    assert.deepEqual(cdp.errors,[]);assert.deepEqual(httpErrors,[]);
    console.log('PASS live three-layer terrain shader links, actual visual/Rapier masks and four conditions: '+JSON.stringify({queries:results[0].queries,error:results[0].maxWeightError,ranges:results[0].ranges}));return;
  }
  if(process.argv.includes('--terrain-contact')){
    await evaluate(`(()=>{const q=window.__SHIFT_LAB_3D_QA__;q.applyMap({...q.map,generator:3,
      seed:'TERRAIN-CONTACT-V1',turnChance:0,hairpinChance:0,slopeChance:0});
      const car=document.getElementById('car-preset');car.value='standard';car.dispatchEvent(new Event('change'));})()`);
    const result=await evaluate('window.__SHIFT_LAB_3D_QA__.driveTerrainBraking()');
    await fs.writeFile(path.join(root,'../artifacts/tests/terrain-contact-2026-10-29.json'),JSON.stringify(result,null,2)+'\n');
    assert.ok(result.stopped&&result.distance>1&&result.distance<150,JSON.stringify({stopped:result.stopped,distance:result.distance,last:result.samples.at(-1)}));
    assert.equal(result.invalidWheelLoads,0);assert.equal(result.collisions,0);
    const contacts=result.samples.flatMap(s=>s.wheelSurface).filter(Boolean);
    assert.ok(contacts.length>20&&contacts.every(s=>s.material==='terrain_mix'&&s.components.length===3&&s.tireMu>=.12&&s.tireMu<=.9&&s.rollingCoefficient>=.015&&s.rollingCoefficient<=.045));
    assert.ok(result.samples.some(s=>s.contacts===4&&s.wheelFx.some(fx=>fx< -100)),'actual soil tire force and four-wheel support required');
    assert.deepEqual(httpErrors,[]);assert.deepEqual(cdp.errors,[]);
    await fs.writeFile(path.join(root,'../artifacts/tests/terrain-contact-2026-10-29.json'),JSON.stringify(result,null,2)+'\n');
    await evaluate('window.__SHIFT_LAB_3D_QA__.frameView()');
    await fs.writeFile(path.join(root,'../artifacts/tests/terrain-contact-2026-10-29.png'),
      Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
    console.log('PASS actual terrain braking, four-wheel soil contact and original tire force: '+JSON.stringify({distance:result.distance,seconds:result.elapsedSeconds}));return;
  }
  if(process.argv.includes('--scenery')){
    await evaluate(`(()=>{const q=window.__SHIFT_LAB_3D_QA__;q.applyMap({...q.map,generator:3,seed:'SCENERY-V1',turnChance:70,hairpinChance:35,slopeChance:30});q.step(12);})()`);
    const first=await evaluate('window.__SHIFT_LAB_3D_QA__.inspectScenery()');
    assert.ok(first.trees>30&&first.rocks>8&&first.batches<=36&&first.maxErrorM<.001,JSON.stringify(first));
    assert.ok(first.rockQueries>=10&&first.trunkQueries>=10);
    for(const condition of ['wet','snow','ice','dry']){
      await evaluate(`(()=>{const s=document.getElementById('road-surface');s.value=${JSON.stringify(condition)};s.dispatchEvent(new Event('change'));window.__SHIFT_LAB_3D_QA__.step(24);})()`);
      const current=await evaluate('window.__SHIFT_LAB_3D_QA__.inspectScenery()');assert.equal(current.condition,condition);assert.equal(current.signature,first.signature);assert.ok(current.maxErrorM<.001);
    }
    await evaluate('window.__SHIFT_LAB_3D_QA__.frameView()');
    await fs.writeFile(path.join(root,'../artifacts/tests/p2-scenery-2026-10-29.png'),Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
    await evaluate("(()=>{const q=window.__SHIFT_LAB_3D_QA__;q.applyMap({...q.map,generator:1});q.step(12);})()");
    const legacy=await evaluate('window.__SHIFT_LAB_3D_QA__.inspectScenery()');assert.equal(legacy.batches,0);assert.equal(legacy.colliders,0);
    await evaluate("(()=>{const q=window.__SHIFT_LAB_3D_QA__;q.applyMap({...q.map,generator:3});q.step(12);})()");
    const restored=await evaluate('window.__SHIFT_LAB_3D_QA__.inspectScenery()');assert.equal(restored.signature,first.signature);
    const rockContact=await evaluate('window.__SHIFT_LAB_3D_QA__.driveRockContact()');
    assert.equal(rockContact.invalidWheelLoads,0);
    assert.ok(rockContact.samples.filter(s=>s.contacts.some(w=>w.surface?.material==='natural_stone'&&w.normal>1&&w.capacity>0)).length>2,'actual core must compute positive boulder wheel load and tire capacity');
    assert.ok(rockContact.samples.every(s=>Object.values(s.pose).every(Number.isFinite)));
    assert.deepEqual(httpErrors,[]);assert.deepEqual(cdp.errors,[]);
    await fs.writeFile(path.join(root,'../artifacts/tests/p2-scenery-browser-2026-10-29.json'),JSON.stringify({first,legacy,restored,rockContact},null,2)+'\n');
    console.log('PASS real scenery visual/physics rays, weather, deterministic rebuild, frozen maps and resource removal: '+JSON.stringify({trees:first.trees,rocks:first.rocks,batches:first.batches,maxErrorM:first.maxErrorM}));return;
  }
  if(process.argv.includes('--pavement-contact')||process.argv.includes('--all-pavements')){
    const allPavements=process.argv.includes('--all-pavements'),lastMaterial=allPavements?'steel':'gravel';
    const materials=allPavements?['asphalt_dense','asphalt_open','concrete','concrete_paver','clay_paver','natural_stone','gravel','earth','timber','steel']:['asphalt_dense','concrete','gravel'];
    await evaluate(`(()=>{const q=window.__SHIFT_LAB_3D_QA__;q.applyMap({...q.map,generator:3,seed:'P2-PAVEMENT-V1',turnChance:0,hairpinChance:0,slopeChance:0});})()`);
    const results=[];
    for(const material of materials){
      const group=[];
      for(const condition of ['dry','wet','snow','ice']){
        const result=await evaluate('window.__SHIFT_LAB_3D_QA__.driveSurfaceBraking('+JSON.stringify(condition)+','+JSON.stringify(material)+','+JSON.stringify({maxSteps:allPavements?3600:1800})+')');
        assert.ok(result.stopped&&result.distance>1&&result.distance<220,JSON.stringify({material,condition,distance:result.distance,stopped:result.stopped}));
        assert.equal(result.collisions,0);assert.equal(result.invalidWheelLoads,0);
        const contacts=result.samples.flatMap(s=>s.wheelSurface).filter(Boolean);
        assert.ok(contacts.length>20&&contacts.every(s=>s.material===material&&s.condition===condition));
        assert.ok(result.samples.some(s=>s.contacts===4&&s.wheelFx.some(fx=>fx< -20)));
        group.push(result);results.push(result);
        if(allPavements)await fs.writeFile(path.join(root,'../artifacts/tests/p2-ten-pavements-braking-2026-10-30.json'),JSON.stringify({scope:'authored gameplay coefficients, not field calibration',results},null,2)+'\n');
        if(condition==='dry'&&process.argv.includes('--screenshot')){
          await evaluate('window.__SHIFT_LAB_3D_QA__.frameView()');
          await fs.writeFile(path.join(root,'../artifacts/tests/'+(allPavements?'p2-ten-pavement-':'p2-pavement-')+material+(allPavements?'-2026-10-30.png':'-2026-10-29.png')),Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
        }
      }
      assert.ok(group[0].distance<group[1].distance&&group[1].distance<group[2].distance&&group[2].distance<group[3].distance,material+' condition stopping order');
    }
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('shiftlab.v189.settings'))['road-material']"),lastMaterial);
    const previousOrigin=await evaluate('performance.timeOrigin');
    await cdp.send('Page.reload',{},sessionId);
    let restored=false;for(let i=0;i<200;i++){restored=await evaluate('performance.timeOrigin!=='+previousOrigin+'&&!!window.__SHIFT_LAB_3D_QA__?.ready');if(restored)break;await delay(100);}
    assert.ok(restored);
    assert.equal(await evaluate("document.getElementById('road-material').value"),lastMaterial);
    const persisted=await evaluate('window.__SHIFT_LAB_3D_QA__.step(180)');assert.equal(persisted.roadMaterial,lastMaterial);
    assert.ok(persisted.wheelSurfaces.every(w=>w.surface?.material===lastMaterial));
    await evaluate("(()=>{const s=document.getElementById('road-surface');s.value='wet';s.dispatchEvent(new Event('change'));})()");
    const wet=await evaluate('window.__SHIFT_LAB_3D_QA__.step(24)');
    assert.ok(wet.wheelSurfaces.every(w=>w.surface?.condition==='wet'&&w.surface.tireMu===(allPavements ? .42 : .52)));
    await evaluate("(()=>{const q=window.__SHIFT_LAB_3D_QA__;q.applyMap({...q.map,generator:2});})()");
    assert.equal(await evaluate("document.getElementById('road-material').disabled"),true);
    assert.equal((await evaluate('window.__SHIFT_LAB_3D_QA__.snapshot()')).roadMaterial,'asphalt_dense');
    await evaluate("(()=>{const q=window.__SHIFT_LAB_3D_QA__;q.applyMap({...q.map,generator:3});})()");
    assert.equal((await evaluate('window.__SHIFT_LAB_3D_QA__.step(24)')).roadMaterial,lastMaterial);
    assert.equal(await evaluate("document.getElementById('road-material').disabled"),false);
    await evaluate('window.__SHIFT_LAB_3D_QA__.frameView()');
    await fs.writeFile(path.join(root,'../artifacts/tests/'+(allPavements?'p2-ten-pavements-2026-10-30.png':'p2-pavement-2026-10-29.png')),Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
    assert.deepEqual(httpErrors,[]);assert.deepEqual(cdp.errors,[]);
    await fs.writeFile(path.join(root,'../artifacts/tests/'+(allPavements?'p2-ten-pavements-braking-2026-10-30.json':'p2-pavement-braking-2026-10-29.json')),JSON.stringify({scope:'authored gameplay coefficients, not field calibration',results},null,2)+'\n');
    console.log('PASS '+materials.length+' pavements x 4 actual stopping experiments, tire forces, shared contact IDs, UI persistence, global weather and V1/V2 restriction: '+JSON.stringify(results.map(r=>({material:r.pavement,condition:r.condition,distance:r.distance}))));return;
  }
  if(surfaceContact){
    await evaluate(`(()=>{const q=window.__SHIFT_LAB_3D_QA__;q.applyMap({...q.map,generator:3,
      seed:'SURFACE-BRAKING-V1',turnChance:0,hairpinChance:0,slopeChance:0});
      const car=document.getElementById('car-preset');car.value='standard';car.dispatchEvent(new Event('change'));})()`);
    const results=[];
    for(const condition of ['dry','wet','snow','ice']){
      const result=await evaluate('window.__SHIFT_LAB_3D_QA__.driveSurfaceBraking('+JSON.stringify(condition)+')');
      assert.ok(result.stopped&&result.distance>1&&result.distance<150,JSON.stringify(result));
      assert.equal(result.collisions,0);assert.equal(result.invalidWheelLoads,0);
      assert.equal(result.globalSurfaceCondition,'dry','test must use local face overrides, not change the global selector');
      const contacts=result.samples.flatMap(s=>s.wheelSurface).filter(Boolean);
      assert.ok(contacts.length>20&&contacts.every(s=>s.condition===condition));
      assert.ok(result.samples.some(s=>s.wheelFx.some(fx=>fx< -100)),'actual braking tire force required');
      results.push(result);
    }
    assert.ok(results[0].distance<results[1].distance&&results[1].distance<results[2].distance&&results[2].distance<results[3].distance,
      'local surface grip must produce dry < wet < snow < ice stopping distance');
    assert.deepEqual(httpErrors,[]);assert.deepEqual(cdp.errors,[]);
    await fs.writeFile(path.join(root,'../artifacts/tests/surface-braking-2026-10-29.json'),JSON.stringify({
      scope:'actual legacy coefficient per-face braking; not real-world material calibration',results},null,2)+'\n');
    console.log('PASS actual per-face surface braking: '+JSON.stringify(results.map(r=>({condition:r.condition,distance:r.distance,seconds:r.elapsedSeconds}))));return;
  }
  if(vehicleDiagnostics){
    const results=[];
    for(const fixture of ['flat','bump','roll','airborne','slope','crest','bank','upper','lower','surface-split','surface-front','surface-upper','surface-lower'])for(const preset of ['standard','city','turbo','diesel']){
      const result=await evaluate(`(()=>{const q=window.__SHIFT_LAB_VEHICLE_DIAGNOSTICS__;
        const initial=q.reset(${JSON.stringify(preset)},${JSON.stringify(fixture)});
        const settled=q.step(360);return {initial,settled};})()`);
      assert.equal(result.initial.wheels.length,4);
      assert.ok(result.initial.wheels.every(w=>Number.isFinite(w.hubLocalY)));
      assert.equal(result.initial.rayReadings.length,4);
      assert.equal(result.initial.chassisColliderCount,40);assert.equal(result.initial.layoutRevision,3);
      assert.equal(result.initial.bumpStopCount,4);
      assert.equal(result.settled.wheelSurfaceToleranceM,.015);
      assert.ok(result.settled.maximumBumpExcessM<=.005,'mechanical jounce exceeded contact tolerance: '+JSON.stringify(result.settled));
      assert.ok(result.settled.rayReadings.every(ray=>Number.isFinite(ray.visibleTireGapM)&&Math.abs(ray.visibleTireGapM)<=.015),JSON.stringify(result.settled));
      assert.ok(result.settled.wheelVisuals.every(w=>Math.abs(w.phase-w.expectedPhase)<1e-9&&Math.abs(w.steer-w.expectedSteer)<1e-9));
      assert.ok(result.settled.rayReadings.every(ray=>ray.normal&&Number.isFinite(ray.distance)));
      if(fixture==='airborne')assert.ok(result.initial.wheels.every(w=>!w.contact));
      assert.ok(result.settled.wheels.filter(w=>w.contact).length>=2,JSON.stringify(result));
      if(fixture==='bump')assert.ok(result.initial.wheels[0].hubLocalY-result.initial.wheels[1].hubLocalY>.06,JSON.stringify(result.initial));
      if(fixture==='surface-split'||fixture==='surface-front')for(const wheel of result.settled.wheels){
        const wet=fixture==='surface-split'?wheel.id[1]==='L':wheel.id[0]==='F';
        assert.equal(wheel.surface.tireMu,wet?.68:1.02,JSON.stringify(result.settled));
        assert.equal(wheel.surface.condition,wet?'wet':'dry');
      }
      if(fixture==='surface-upper')assert.ok(result.settled.wheels.every(w=>w.surface.tireMu===.68));
      if(fixture==='surface-lower')assert.ok(result.settled.wheels.every(w=>w.surface.tireMu===1.02));
      if(fixture==='slope')assert.ok(Math.abs(result.initial.spawn.grade)>5);
      if(['upper','lower'].includes(fixture)){
        assert.ok(result.initial.spawn.crossing);assert.ok(Math.abs(result.settled.routeS-result.initial.spawn.s)<30,'projection changed road layer');
        assert.ok(result.settled.rayReadings.every(ray=>Math.abs(ray.point.y-result.initial.spawn.y)<1),'wheel ray jumped between decks');
      }
      results.push({preset,fixture,contacts:result.settled.wheels.filter(w=>w.contact).length,
        seed:result.initial.map.seed,spawn:result.initial.spawn,initial:result.initial,settled:result.settled});
    }
    assert.deepEqual(httpErrors,[]);assert.deepEqual(cdp.errors,[]);
    const output=path.join(root,'../artifacts/tests/vehicle-diagnostics-2026-10-28.json');
    await fs.writeFile(output,JSON.stringify({scope:'functional-software-renderer-not-performance',results},null,2)+'\n');
    await fs.writeFile(path.join(root,'../artifacts/tests/vehicle-diagnostics-2026-10-28.png'),
      Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
    for(const fixture of ['surface-split','surface-front']){
      await evaluate(`(()=>{const q=window.__SHIFT_LAB_VEHICLE_DIAGNOSTICS__;
        q.reset('standard',${JSON.stringify(fixture)});q.step(240);
        document.getElementById('collider-view').checked=false;document.getElementById('collider-view').dispatchEvent(new Event('change'));})()`);
      await fs.writeFile(path.join(root,'../artifacts/tests/'+fixture+'-2026-10-29.png'),
        Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
    }
    console.log('PASS independent vehicle diagnostics: '+JSON.stringify({cases:results.length,
      minimumSettledContacts:Math.min(...results.map(r=>r.contacts)),fixtures:[...new Set(results.map(r=>r.fixture))]}));return;
  }
  if(acceptance){
    const suite=await evaluate('window.__SHIFT_LAB_ACCEPTANCE__.runSuite()');
    assert.equal(suite.length,5,JSON.stringify(suite));
    assert.ok(suite.every(result=>result.pass),JSON.stringify(suite));
    assert.equal(await evaluate('typeof window.__SHIFT_LAB_3D_QA__'),'undefined');
    assert.deepEqual(httpErrors,[]);assert.deepEqual(cdp.errors,[]);
    console.log(JSON.stringify({standalone:true,scenarios:suite.map(r=>({id:r.scenario,pass:r.pass}))},null,2));
    console.log('PASS standalone Rapier physics acceptance: 5/5');return;
  }
  if(process.argv.includes('--road-v3')){
    const reports=[];
    const cases=[
      {seed:'LEVEL-1',turnChance:70,hairpinChance:35,slopeChance:30},
      {seed:'LEVEL-0',turnChance:70,hairpinChance:35,slopeChance:30},
      {seed:'JUNCTION-4',turnChance:65,hairpinChance:30,slopeChance:0}
    ];
    for(const config of cases){
      const geometry=await evaluate(`(()=>{
        const q=window.__SHIFT_LAB_3D_QA__;
        q.applyMap({...q.map,...${JSON.stringify(config)},generator:3,maxGrade:9});
        const core=document.getElementById('physics').contentWindow.__SHIFT_LAB_DEBUG__,s=core.route.v3State;
        return {features:s.features,crossings:s.crossings,junctions:s.junctions};
      })()`);
      const spans=[];
      for(const c of geometry.crossings.slice(0,2))for(const arc of [c.upper,c.lower])
        for(const reverse of [false,true])spans.push({kind:'crossing',start:arc+(reverse?19:-19),end:arc+(reverse?-19:19),reverse});
      for(const f of geometry.features.filter(f=>['tunnel','suspension'].includes(f.kind)).slice(0,3)){
        for(const s of [f.start,(f.start+f.end)/2,f.end])spans.push({kind:f.kind,start:s-18,end:s+18});
      }
      for(const j of geometry.junctions.slice(0,1)){
        for(const arc of [j.a,j.b])spans.push({kind:'junction-through',start:arc-22,end:arc+22});
        spans.push({kind:'junction-turn',start:j.a-25,end:j.b+25,junction:j,speed:9});
      }
      if(process.argv.includes('--screenshot')){
        const shots=[];
        if(geometry.crossings.length)shots.push({kind:'underpass',arc:geometry.crossings[0].lower},{kind:'overpass',arc:geometry.crossings[0].upper});
        for(const kind of ['tunnel','suspension']){const f=geometry.features.find(f=>f.kind===kind);if(f)shots.push({kind,arc:f.start});}
        if(geometry.junctions.length)shots.push({kind:'junction',arc:geometry.junctions[0].a});
        for(const shot of shots){
          await evaluate(`window.__SHIFT_LAB_3D_QA__.driveRoadV3(${JSON.stringify({start:Math.max(0,shot.arc-40),end:Math.max(5,shot.arc-30)})})`);
          await evaluate("window.__SHIFT_LAB_3D_QA__.frameView()");
          const png=await cdp.send('Page.captureScreenshot',{format:'png'},sessionId);
          const directory=path.join(root,'..','artifacts','tests','browser');await fs.mkdir(directory,{recursive:true});
          await fs.writeFile(path.join(directory,'v3-'+config.seed+'-'+shot.kind+'.png'),Buffer.from(png.data,'base64'));
        }
      }
      for(const span of spans){
        const result=await evaluate(`window.__SHIFT_LAB_3D_QA__.driveRoadV3(${JSON.stringify(span)})`);
        const report={seed:config.seed,kind:span.kind,reverse:!!span.reverse,endDistance:result.endDistance,
          contacts:result.contactFraction,heightError:result.maxHeightError,collisions:result.collisionCount,travel:result.travel};
        if(process.argv.includes('--verbose'))console.log(JSON.stringify(report));
        assert.ok(result.endDistance<3,JSON.stringify(report));
        assert.ok(result.contactFraction>.94,JSON.stringify(report));
        assert.ok(result.maxHeightError<1.25,JSON.stringify(report));
        assert.equal(result.collisionCount,0,JSON.stringify(report));assert.equal(result.invalidWheelLoads,0);
        reports.push(report);
      }
    }
    assert.ok(reports.some(r=>r.kind==='junction-turn'));
    assert.ok(reports.some(r=>r.kind==='suspension'));assert.ok(reports.some(r=>r.kind==='tunnel'));
    assert.deepEqual(httpErrors,[]);assert.deepEqual(cdp.errors,[]);
    const directory=path.join(root,'..','artifacts','tests');await fs.mkdir(directory,{recursive:true});
    await fs.writeFile(path.join(directory,'v3-driving-2026-10-28.json'),JSON.stringify({pass:true,cases:reports.length,reports},null,2)+'\n');
    console.log('V3 contacts minimum: '+Math.min(...reports.map(r=>r.contacts))+'; maximum height error: '+Math.max(...reports.map(r=>r.heightError)));
    console.log('PASS V3 real vehicle traversals: '+reports.length+' upper/lower, reverse, portals, gorge spans and connected junction arms');return;
  }
  const absent=await evaluate(`({
    ui:!!document.querySelector('#tests-panel,#open-tests,#scenario,#run-suite,#run-case,#export-report,#step,#qa-results'),
    acceptance:typeof window.__SHIFT_LAB_ACCEPTANCE__
  })`);
  assert.deepEqual(absent,{ui:false,acceptance:'undefined'});
  if(production){
    assert.equal(await evaluate('typeof window.__SHIFT_LAB_3D_QA__'),'undefined');
    await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{code:'F2',bubbles:true}))");
    assert.equal(await evaluate("document.getElementById('panel-overlay').hidden"),true);
    await evaluate("document.getElementById('hud-menu').click();document.getElementById('open-settings').click()");
    assert.equal(await evaluate("document.getElementById('settings-panel').hidden"),false);
    await evaluate(`(()=>{
      const car=document.getElementById('car-preset');car.value='city';car.dispatchEvent(new Event('change'));
      document.getElementById('map-seed').value='PRODUCTION-SEEDED-ROAD';
      document.getElementById('map-generate').click();
    })()`);
    assert.equal(await evaluate("document.getElementById('physics').contentWindow.__SHIFT_LAB_DEBUG__.route.config.seed"),'PRODUCTION-SEEDED-ROAD');
    await evaluate("document.getElementById('close-settings').click()");
    await delay(400);
    const state=await evaluate(`(()=>{
      const d=document.getElementById('physics').contentWindow.__SHIFT_LAB_DEBUG__;
      return {contacts:d.suspension.contacts,mass:d.params.mass,finite:Number.isFinite(d.vehicleMotion.y),generator:d.route.config.generator};
    })()`);
    assert.ok(state.contacts>0&&state.finite,JSON.stringify(state));
    assert.equal(state.generator,3);
    for(const condition of ['wet','snow','ice','dry']){
      await evaluate(`(()=>{const s=document.getElementById('road-surface');s.value=${JSON.stringify(condition)};s.dispatchEvent(new Event('change'));})()`);
      // Wait for the actual next physics contact, rather than assuming a
      // headless RAF will run within 300ms while other regression jobs run.
      let contacts;
      for(let attempt=0;attempt<50;attempt++){
        contacts=await evaluate(`(()=>{const d=document.getElementById('physics').contentWindow.__SHIFT_LAB_DEBUG__;
          return d.WHEEL_IDS.map(id=>d.wheelModel[id].contactSurface);})()`);
        if(contacts.every(surface=>surface?.condition===condition))break;
        await delay(100);
      }
      assert.ok(contacts.every(surface=>surface?.condition===condition),'production global condition must reach actual wheel bindings: '+JSON.stringify({condition,contacts}));
    }
    for(const material of ['concrete','gravel','asphalt_dense']){
      await evaluate(`(()=>{const s=document.getElementById('road-material');s.value=${JSON.stringify(material)};s.dispatchEvent(new Event('change'));})()`);
      let contacts;
      for(let attempt=0;attempt<50;attempt++){
        contacts=await evaluate(`(()=>{const d=document.getElementById('physics').contentWindow.__SHIFT_LAB_DEBUG__;return d.WHEEL_IDS.map(id=>d.wheelModel[id].contactSurface);})()`);
        if(contacts.every(surface=>surface?.material===material))break;
        await delay(100);
      }
      assert.ok(contacts.every(surface=>surface?.material===material),'production pavement selector must reach actual tire contacts: '+JSON.stringify({material,contacts}));
    }
    assert.ok(!requests.some(value=>/\/tests\/|scenarios\.mjs|obstacles\.mjs/.test(value)),
      'Production requested development/acceptance modules');
    const files=await fs.readdir(path.join(root,'dist'),{recursive:true});
    assert.ok(!files.some(value=>/acceptance|game-driver|scenarios|obstacles|vehicle-diagnostics|performance-baseline|surface-driver|pbr-preview|material-gallery|manual-performance|streaming-profile|scenery-driver|terrain-blend-driver|tunnel-lighting-driver/.test(value)));
    for(const file of files.filter(value=>/\.(?:js|html)$/.test(value))){
      const source=await fs.readFile(path.join(root,'dist',file),'utf8');
      assert.ok(!/AcceptanceObstacles|__SHIFT_LAB_3D_QA__|__SHIFT_LAB_ACCEPTANCE__|__SHIFT_LAB_VEHICLE_DIAGNOSTICS__|collectPerformanceBaseline|collectManualPerformance|startManualCapture|shiftlab.performance.manual.v1|capture-performance|collectStreamingProfile|startStreamingTrace|inspectScenery|inspectTerrainBlend|inspectTunnelLighting|getTunnelLightingState|driveRockContact|shiftlab.performance.baseline.v1|driveSurfaceBraking|runSuite|qa-results|tests-panel/.test(source),file);
    }
    assert.deepEqual(httpErrors,[]);assert.deepEqual(cdp.errors,[]);
    if(process.argv.includes('--screenshot')||process.argv.includes('--vehicle-screenshot')){
      const vehicleShot=process.argv.includes('--vehicle-screenshot');
      if(vehicleShot){
        await evaluate("document.getElementById('camera-mode').value='side';document.getElementById('camera-mode').dispatchEvent(new Event('change'))");
        await delay(1200);
      }else await evaluate("document.getElementById('hud-menu').click()");
      const shot=await cdp.send('Page.captureScreenshot',{format:'png'},sessionId);
      const directory=path.join(root,'..','artifacts','tests','browser');await fs.mkdir(directory,{recursive:true});
      await fs.writeFile(path.join(directory,vehicleShot?'production-vehicle-p1.png':'production-game.png'),Buffer.from(shot.data,'base64'));
    }
    console.log('PASS production game: settings, seed rebuild, wheel contacts, no acceptance UI/API/modules');return;
  }
  const initial=await evaluate('window.__SHIFT_LAB_3D_QA__.snapshot()');
  assert.equal(initial.roadEnvironment,'procedural');
  assert.equal(initial.scenario,'free');
  assert.ok(initial.roadResources.chunks>=2);
  assert.equal(await evaluate('window.__SHIFT_LAB_3D_QA__.map.generator'),3);
  const removed=await evaluate(`(()=>{
    const q=window.__SHIFT_LAB_3D_QA__,core=document.getElementById('physics').contentWindow.__SHIFT_LAB_DEBUG__;
    return {ui:!!document.querySelector('#city-panel,#drive-tainan,#open-city'),
      api:['city','openCity','driveCity','resetCity','cityStreetAudit','citySurfaceCoverage'].filter(k=>k in q),
      adapter:'setExternalRoadAdapter' in core};
  })()`);
  assert.deepEqual(removed,{ui:false,api:[],adapter:false});
  for(const mode of ['menu','settings','drive']){
    await evaluate(`window.__SHIFT_LAB_3D_QA__.openMode(${JSON.stringify(mode)})`);
    assert.equal((await evaluate('window.__SHIFT_LAB_3D_QA__.snapshot()')).uiMode,mode);
  }
  const vehicles=[];
  await evaluate("window.__SHIFT_LAB_3D_QA__.openMode('settings')");
  for(const preset of ['standard','city','turbo','diesel']){
    const state=await evaluate(`(()=>{
      const select=document.getElementById('car-preset');select.value=${JSON.stringify(preset)};
      select.dispatchEvent(new Event('change',{bubbles:true}));
      window.__SHIFT_LAB_3D_QA__.step(240);
      window.__SHIFT_LAB_3D_QA__.frameView();
      return window.__SHIFT_LAB_3D_QA__.snapshot();
    })()`);
    assert.equal(state.vehiclePreset,preset);
    assert.equal(state.vehicleSchema,'shiftlab.vehicle.v1');
    assert.equal(state.vehicleLayoutRevision,3);assert.equal(state.chassisColliderCount,40);
    assert.equal(state.bumpStopCount,4);
    assert.equal(state.wheelVisuals.length,4);
    for(const wheel of state.wheelVisuals){
      assert.ok(Number.isFinite(wheel.expectedLocalY));
      assert.ok(Math.abs(wheel.localY-wheel.expectedLocalY)<1e-8,'rendered wheel must follow suspension');
      assert.ok(Math.abs(wheel.steer-wheel.expectedSteer)<1e-9);
      assert.ok(Math.abs(wheel.spin-wheel.expectedSpin)<1e-9);
    }
    assert.equal(state.invalidWheelLoads,0);
    assert.ok(state.contacts>0&&state.speed<1,JSON.stringify(state));
    vehicles.push({preset,contacts:state.contacts,speed:state.speed});
  }
  const maps=[];
  for(const generator of [1,2,3]){
    const seed='SEEDED-ONLY-V'+generator;
    const result=await evaluate(`(()=>{
      const q=window.__SHIFT_LAB_3D_QA__,core=document.getElementById('physics').contentWindow.__SHIFT_LAB_DEBUG__;
      const config={...q.map,generator:${generator},seed:${JSON.stringify(seed)}};
      q.applyMap(config);
      const first=JSON.stringify(core.route.points.slice(0,100));
      q.applyMap({...config,seed:'TEMPORARY-OTHER-SEED'});q.applyMap(config);
      const same=first===JSON.stringify(core.route.points.slice(0,100));
      const state=q.step(120);
      return {same,state,quality:q.roadQuality,map:q.map,saved:q.savedMap};
    })()`);
    assert.ok(result.same,'Seed changed geometry after rebuild');
    assert.equal(result.map.seed,seed);assert.equal(result.saved.seed,seed);
    assert.equal(result.state.mapSeed,seed);assert.equal(result.state.roadResources.obstacles,0);
    assert.equal(result.state.invalidWheelLoads,0);assert.ok(result.state.contacts>0);
    if(generator>=2)assert.ok(result.quality.ok);
    maps.push({generator,seed,deterministic:result.same,contacts:result.state.contacts});
  }
  console.log('Browser QA: startup, modes, 4 vehicles and V3 driving and frozen v1/v2 playback passed');
  await evaluate(`(()=>{
    const mode=document.getElementById('drive-mode');mode.value='manual';mode.dispatchEvent(new Event('change'));
    const gear=document.getElementById('gear');gear.value='1';gear.dispatchEvent(new Event('change'));
  })()`);
  let manual=null;
  for(let i=0;i<100;i++){
    manual=await evaluate('window.__SHIFT_LAB_3D_QA__.snapshot()');
    if(manual.gear===1&&manual.pendingGear===null)break;await delay(30);
  }
  assert.equal(manual.gear,1);assert.equal(manual.pendingGear,null);
  assert.equal(manual.driveMode,'manual');
  assert.equal(await evaluate("document.getElementById('engine').disabled"),false);
  await evaluate(`(()=>{
    const mode=document.getElementById('drive-mode');mode.value='assisted';mode.dispatchEvent(new Event('change'));
    window.__SHIFT_LAB_3D_QA__.step(240);
    if(!window.__SHIFT_LAB_3D_QA__.selectAutomaticRange('D'))throw Error('D rejected at rest');
    window.__SHIFT_LAB_3D_QA__.openMode('drive');
  })()`);
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87},sessionId);
  const forward=await evaluate('window.__SHIFT_LAB_3D_QA__.step(300)');
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW',windowsVirtualKeyCode:87},sessionId);
  assert.ok(forward.signedVelocity>.3&&forward.gear>0,JSON.stringify(forward));
  console.log('Browser QA: parked manual selector and automatic forward driving passed');
  const pausedVisuals=await evaluate(`(()=>{const q=window.__SHIFT_LAB_3D_QA__;
    q.step(0);q.frameView();const a=q.snapshot();q.frameView();return {a,b:q.snapshot()};})()`);
  assert.ok(pausedVisuals.a.wheelVisuals.some(w=>Math.abs(w.omega)>1),'rolling wheels required for pause regression');
  assert.deepEqual(pausedVisuals.a.wheelVisuals,pausedVisuals.b.wheelVisuals,'paused render frames cannot spin the wheels');
  await evaluate('window.__SHIFT_LAB_3D_QA__.driveProcedural()');
  assert.equal(await evaluate('typeof window.__SHIFT_LAB_3D_QA__.runSuite'),'undefined');
  assert.equal(await evaluate('typeof window.__SHIFT_LAB_3D_QA__.loadScenario'),'undefined');
  assert.equal(await evaluate(`(()=>{try{window.__SHIFT_LAB_3D_QA__.openMode('tests');return false;}catch{return true;}})()`),true);
  await evaluate("window.__SHIFT_LAB_3D_QA__.openMode('drive')");
  const restored=await evaluate('window.__SHIFT_LAB_3D_QA__.snapshot()');
  assert.equal(restored.mapSeed,'SEEDED-ONLY-V3');
  assert.equal(restored.vehiclePreset,'diesel');
  assert.equal(restored.scenario,'free');assert.equal(restored.roadResources.obstacles,0);
  const pageLoaded=new Promise((resolve,reject)=>{
    const listener=event=>{
      const msg=JSON.parse(event.data);
      if(msg.method==='Page.loadEventFired'&&msg.sessionId===sessionId){
        clearTimeout(timer);cdp.socket.removeEventListener('message',listener);resolve();
      }
    };
    const timer=setTimeout(()=>{
      cdp.socket.removeEventListener('message',listener);reject(Error('Page reload timeout'));
    },20000);
    cdp.socket.addEventListener('message',listener);
  });
  await cdp.send('Page.reload',{},sessionId);await pageLoaded;
  let restoredAfterReload=false;
  for(let i=0;i<200;i++){
    restoredAfterReload=await evaluate('!!window.__SHIFT_LAB_3D_QA__?.ready');
    if(restoredAfterReload)break;await delay(100);
  }
  assert.ok(restoredAfterReload,'Reload timeout');
  const reloaded=await evaluate('window.__SHIFT_LAB_3D_QA__.snapshot()');
  assert.equal(reloaded.mapSeed,'SEEDED-ONLY-V3');
  assert.equal(reloaded.vehiclePreset,'diesel');
  assert.equal(reloaded.roadEnvironment,'procedural');
  assert.ok(!requests.some(value=>/\/data\/|city-[^/]+\.(?:mjs|json)|tainan|overture/i.test(value)),
    'Unexpected real-map network request');
  assert.deepEqual(httpErrors,[]);assert.deepEqual(cdp.errors,[]);
  if(process.argv.includes('--screenshot')){
    const shot=await cdp.send('Page.captureScreenshot',{format:'png'},sessionId);
    const directory=path.join(root,'..','artifacts','tests','browser');await fs.mkdir(directory,{recursive:true});
    await fs.writeFile(path.join(directory,'procedural-only.png'),Buffer.from(shot.data,'base64'));
  }
  console.log(JSON.stringify({vehicles,maps,
    restoredSeed:reloaded.mapSeed,httpErrors:0,runtimeExceptions:0,realMapRequests:0},null,2));
  console.log('PASS real Chromium/WebGL2/Rapier seeded-only driving');
}
try{await main();}
catch(error){console.error(error);if(browserDiagnostics)console.error(browserDiagnostics);process.exitCode=1;}
finally{
  if(cdp){try{await cdp.send('Browser.close');}catch{}cdp.socket.close();}
  for(const process of processes.reverse())await stop(process);
  if(profile){
    assert.equal(path.dirname(path.resolve(profile)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(profile).startsWith('shiftlab-procedural-browser-'));
    await fs.rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:250});
  }
}
