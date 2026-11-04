import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {GeometryUploadPreparer} from './geometry-upload-preparer.mjs';
import {RoadWorld} from './road.mjs';
import {RapierChassisBridge} from './chassis.mjs';
import {legacyDirectionalKey,legacySteerFromVisualAxis} from './steering-input.mjs';
import {createSceneLighting} from './scene-lighting.mjs';
import {DEFAULT_MAP,MAP_FIELDS,normalizeMapConfig,readMapDocument,serializeMap,sameMap,makeMapSeed,describeRoute} from './procedural-map.mjs';
import {createGameModes} from './game-modes.mjs';
import {automaticClutch,isAutomaticMode} from './automatic-transmission.mjs';
import {engageParkedManualGear} from './manual-gear.mjs';
import {checkAutomaticRange,automaticRangeRequest,automaticDisplayGear} from './automatic-range.mjs';
import {assertPhysicsHealth} from './physics-health.mjs';
import {captureLegacyVehicle} from './vehicle-definition.mjs';
import {createVehicleVisual,syncVehicleVisual,disposeVehicleVisual} from './vehicle-visual.mjs';

const $=id=>document.getElementById(id);
const canvas=$('view'),overlay=$('screen-overlay'),message=$('overlay-message');
const frame=$('physics'),gearSelect=$('gear');
const FIXED_DT=1/120;
let d=null,road=null,bridge=null,world=null,renderer=null,scene=null,camera=null,vehicle=null;
let sceneLighting=null;
let paused=false,locked=false,accumulator=0,prevFrame=performance.now(),lastHud=0,renderFPS=60,dropSteps=0;
let chosenPad='auto',lastPadLabel='',lastPadIndex=null,steerFiltered=0,physicsMs=0;
let labReady=false;
let visualVehicleId='standard';
let gameModes=null,userMapConfig={...DEFAULT_MAP};
const MAP_STORAGE_KEY='shiftlab.v189.procedural-map';
const PREFERENCE_KEY='shiftlab.v189.settings'; // Preserve saved v1.8.9 choices.
const preferenceIds=['car-preset','road-material','road-surface','abs-toggle','tcs-toggle','esc','feel',
  'handling-balance','brake-bias','steering-preset','pad-invert','drive-mode','camera-mode'];
function savePreferences(){
  const record={};
  for(const id of preferenceIds){const el=$(id);if(el)record[id]=el.type==='checkbox'?el.checked:el.value;}
  try{localStorage.setItem(PREFERENCE_KEY,JSON.stringify(record));}catch{}
}
function restorePreferences(){
  try{
    const record=JSON.parse(localStorage.getItem(PREFERENCE_KEY)||'null');
    if(!record||typeof record!=='object')return;
    for(const id of preferenceIds){const el=$(id),value=record[id];if(!el)continue;
      if(el.type==='checkbox'&&typeof value==='boolean')el.checked=value;
      else if(typeof value==='string'&&[...el.options].some(item=>item.value===value))el.value=value;}
  }catch{}
}

function restoreMapPreference(){
  try{
    const str=localStorage.getItem(MAP_STORAGE_KEY);
    if(str)return normalizeMapConfig(JSON.parse(str),true);
  }catch(error){console.warn('Saved road config invalid:',error);}
  return {...DEFAULT_MAP};
}
function readMapForm(){
  return normalizeMapConfig({generator:Number($('map-generator').value),seed:$('map-seed').value,
    ...Object.fromEntries(MAP_FIELDS.map(key=>[key,Number($('map-'+key).value)]))},true);
}
function fillMapForm(config){
  $('map-generator').value='3';
  $('map-seed').value=config.seed;
  for(const key of MAP_FIELDS)$('map-'+key).value=String(config[key]);
  updateMapFieldLabels();
}
function updateMapFieldLabels(){
  for(const key of MAP_FIELDS)$('map-'+key+'-val').textContent=$('map-'+key).value+'%';
}
function mapMessage(text,error=false){
  const el=$('map-message');el.textContent=text;el.style.color=error?'#ffaaa8':'';
}
function routePreview(){
  if(!d)return;
  const canvas=$('route-preview'),context=canvas.getContext('2d');
  const width=canvas.width,height=canvas.height;
  context.clearRect(0,0,width,height);context.fillStyle='#071723';context.fillRect(0,0,width,height);
  const route=d.route,limit=Math.min(3700,d.roadTotalDistance());
  const pts=route.points.filter((p,i)=>p.s<=limit&&i%4===0);
  if(pts.length<2)return;
  const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x));
  const minZ=Math.min(...pts.map(p=>p.z)),maxZ=Math.max(...pts.map(p=>p.z));
  const scale=Math.min((width-46)/Math.max(70,maxX-minX),(height-32)/Math.max(70,maxZ-minZ));
  const cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
  const xy=p=>[width/2+(p.x-cx)*scale,height/2-(p.z-cz)*scale];
  context.lineWidth=3;context.strokeStyle='#2e665c';context.beginPath();
  pts.forEach((p,i)=>{const [x,y]=xy(p);i?context.lineTo(x,y):context.moveTo(x,y);});context.stroke();
  context.lineWidth=1.5;context.strokeStyle='#98edd1';context.stroke();
  if(route.config.generator===3){
    const colors={bridge:'#f2c878',suspension:'#ec9b75',tunnel:'#b7a1dd',underpass:'#7dabc2'};
    for(const feature of route.v3State.features){
      if(feature.start>limit)continue;
      context.lineWidth=3;context.strokeStyle=colors[feature.kind];context.beginPath();
      let first=true;for(const p of pts)if(p.s>=feature.start&&p.s<=feature.end){const [x,y]=xy(p);first?context.moveTo(x,y):context.lineTo(x,y);first=false;}
      context.stroke();
    }
    for(const c of route.v3State.crossings){
      if(c.a>limit||c.b>limit)continue;
      const [x,y]=xy(c),p=d.roadPointAt(c.upper),dx=Math.sin(p.heading)*6,dy=-Math.cos(p.heading)*6;
      context.lineWidth=6;context.strokeStyle='#071723';context.beginPath();context.moveTo(x-dx,y-dy);context.lineTo(x+dx,y+dy);context.stroke();
      context.lineWidth=2;context.strokeStyle='#f2c878';context.stroke();
    }
    for(const j of route.v3State.junctions)if(j.a<=limit&&j.b<=limit){const [x,y]=xy(j);
      context.fillStyle='#f4ebc4';context.beginPath();context.arc(x,y,3,0,Math.PI*2);context.fill();}
    context.font='10px system-ui';context.fillStyle='#a9beca';
    context.fillText('金：橋梁  橙：吊橋  紫：隧道  淺點：路口',13,height-8);
  }
  for(const [p,color] of [[pts[0],'#f2c878'],[pts.at(-1),'#9ad8ff']]){
    const [x,y]=xy(p);context.beginPath();context.arc(x,y,4.5,0,Math.PI*2);
    context.fillStyle=color;context.fill();
  }
  context.fillStyle='#9bbac8';context.font='12px system-ui';
  context.fillText('前 '+(limit/1000).toFixed(1)+' km · 平面路線預覽',13,18);
}
function updateMapInfo(){
  if(!d)return;
  const stats=describeRoute(d.route);
  $('map-stats').replaceChildren();
  for(const value of [stats.generator===3?'V3 生成器':'v'+stats.generator+' 舊圖相容',stats.distanceKm+' km',stats.bends+' 彎',stats.hairpins+' 髮夾彎',
    stats.climbs+' 上坡',stats.descents+' 下坡',
    ...(stats.quality?[stats.quality.ok?'幾何檢查 PASS':'幾何檢查 FAIL',
      ...(stats.generator===3?[stats.quality.crossings+' 處立體交會',stats.quality.junctions+' 處平面路口',
        '設計淨空 ≥ '+stats.quality.requiredVerticalClearance+' m']:
        ['最小間距 '+(stats.quality.minNonlocalDistanceMeters?.toFixed(1)??'—')+' m'])]:[])]){
    const item=document.createElement('strong');item.textContent=value;$('map-stats').append(item);
  }
  routePreview();
}
function rebuildRoad(config){
  if(!d||!road)throw Error('3D 場景尚未建立');
  const prior={...d.route.config};
  const priorDistance=d.route.distance;
  // Destroy route colliders before swapping centerlines.
  // The source generator remains the only authority for geometry and bank.
  const install=next=>{
    road.clear();road.assertClean();
    d.generateRoad(next);d.route.gradeMode='route';
    road.ensure(Math.max(70,Math.min(priorDistance,d.roadTotalDistance())));
    if(typeof world.updateSceneQueries==='function')world.updateSceneQueries();
  };
  try{install(config);updateMapInfo();}
  catch(error){
    try{install(prior);updateMapInfo();}
    catch(rollback){throw new Error('道路重建失敗，且舊道路無法還原：'+error.message+' / '+rollback.message);}
    throw new Error('道路重建失敗；已還原原始地圖：'+error.message);
  }
}
function applyMap(config){
  if(locked||!labReady)throw Error('操作進行中或 3D 引擎未就緒');
  const normalized=normalizeMapConfig(config,true);
  const previous={...userMapConfig};
  rebuildRoad(normalized);userMapConfig=normalized;
  try{resetDriving();}
  catch(error){userMapConfig=previous;rebuildRoad(previous);resetDriving();throw error;}
  try{localStorage.setItem(MAP_STORAGE_KEY,JSON.stringify(normalized));}catch{}
  setPause(true);
  fillMapForm(normalized);
  mapMessage(normalized.generator===3?'V3 地圖已更新，車輛回到起點。':
    '已依原版本讀取舊地圖；下次按設定生成時會使用 V3。');
}
function previewNextBend(){
  if(locked||!labReady)throw Error('3D 引擎尚未就緒');
  const bend=d.route.segments.find(x=>x.type!=='straight'&&x.start>d.route.distance+20);
  if(!bend)throw Error('目前地圖沒有可預覽的下一個彎道');
  d.reset();
  const target=d.roadPointAt(Math.max(0,bend.start-65));
  road.ensure(target.s);bridge.teleport({roadPoint:target});
  d.route.distance=target.s;d.vehicleMotion.routeS=target.s;
  updateMapInfo();setPause(true);
  mapMessage('已將車輛移至彎道前 65 公尺；返回駕駛後可繼續行駛。');
}
function openGameMode(next){
  if(locked||!gameModes)return;
  gameModes.open(next);
}
const autoDrive={lastShiftTime:-100,shiftTarget:0};
let autoRange='P'; // P is the safe starting range; not a mechanical gear number.
let rangeNoticeTimer=null;
function showRangeWarning(text){
  const label=$('range-message');label.textContent=text;
  if(rangeNoticeTimer!==null)clearTimeout(rangeNoticeTimer);
  rangeNoticeTimer=setTimeout(()=>{label.textContent='';rangeNoticeTimer=null;},2800);
}
function driveFocus(){
  const active=document.activeElement;
  if(active&&active!==canvas&&typeof active.blur==='function')active.blur();
  canvas.focus({preventScroll:true});
}
function driveStatus(text){$('input-status').textContent=text;}
function syncTransmissionUI(){
  const automatic=isAutomaticMode($('drive-mode').value);
  // Only PRND is selectable in automatic; only mechanical gears in manual.
  gearSelect.disabled=locked||automatic;
  $('auto-range').disabled=locked||!automatic;
  $('auto-range').value=autoRange;
  $('auto-shifter').hidden=!automatic;
  for(const button of document.querySelectorAll('#auto-shifter [data-range]')){
    const selected=button.dataset.range===autoRange;
    button.setAttribute('aria-pressed',String(selected));
    button.disabled=locked;
  }
  $('gear-mode-hint').textContent=automatic?
    '自排：P 駐車／R 倒車／N 空檔／D 自動前進。行駛時煞停並踩住煞車才能切 P／R／D；F 鍵 D、R 倒車、N 空檔、P 駐車。':
    '手排：駕駛時按住 Shift + 數字鍵／R；在設定畫面停穩後選檔，會經原始離合器及同步器入檔。';
}
function selectAutomaticRange(target){
  if(!d||locked||!isAutomaticMode($('drive-mode').value))return false;
  const v=bridge?.rigidBody?.linvel(),horizontal=v?Math.hypot(v.x,v.z):0;
  const speed=Math.max(Math.abs(d.state.velocity),horizontal);
  const brake=Math.max(d.inputKeys.has('s')?1:0,d.hostControls.brake||0,d.state.brake||0);
  // Settings is paused and cannot depress the physical brake. Treat the
  // stationary paused panel as a held brake; movement checks still apply.
  const result=checkAutomaticRange({current:autoRange,target,speedMps:speed,
    brake,paused:paused&&gameModes?.mode==='settings',pendingGear:d.state.pendingGear});
  if(!result.ok){
    driveStatus('自排拒絕：'+result.reason);
    showRangeWarning(result.reason);
    $('auto-range').value=autoRange;
    return false;
  }
  autoRange=target;
  d.hostControls.parkPawl=target==='P';
  if(target==='P'||target==='N')d.hostControls.clutch=1;
  driveStatus('自排：'+result.reason);
  $('range-message').textContent='';
  syncTransmissionUI();
  updateHud(true);
  return true;
}
function requestDriverGear(gear){
  if(!d||locked||isAutomaticMode($('drive-mode').value))return false;
  return d.requestGear(gear);
}
function setPause(value){
  paused=!!value;accumulator=0;
}

const binding={axis:0,gas:7,brake:6,clutch:4};
const keys={KeyW:'w',ArrowUp:'w',KeyS:'s',ArrowDown:'s',KeyA:'a',ArrowLeft:'a',KeyD:'d',ArrowRight:'d',ShiftLeft:'shift',ShiftRight:'shift'};
const trackedKeys=new Set();

function enterProceduralDriving(){
  if(!labReady||locked)return;
  resetDriving();
  openGameMode('drive');setPause(false);
  driveStatus('種子生成道路 · 自由駕駛');
}

function failure(e){
  labReady=false;console.error('v1.9.7.1 game:',e);
  $('input-status').textContent='載入或執行失敗';
  message.textContent='無法啟動遊戲：'+(e?.message||String(e))+'。請確認 npm install / npm run dev，並使用支援 WebGL2 的桌面瀏覽器。';
  if(!overlay.isConnected)document.body.append(overlay);
  overlay.hidden=false;
  const reload=$('reload-game');if(reload)reload.hidden=false;
}
function waitIframe(){
  return new Promise((resolve,reject)=>{
    const current=frame.contentWindow?.__SHIFT_LAB_DEBUG__;
    if(current){resolve(current);return;}
    const timeout=setTimeout(()=>reject(new Error('原始四輪物理引擎載入逾時')),20000);
    frame.addEventListener('load',()=>{
      clearTimeout(timeout);
      const api=frame.contentWindow?.__SHIFT_LAB_DEBUG__;
      api?resolve(api):reject(new Error('未取得物理核心 API；檢查 physics.html 是否載入'));
    },{once:true});
    frame.addEventListener('error',()=>{clearTimeout(timeout);reject(new Error('讀取 ./physics.html 失敗'));},{once:true});
  });
}
function selectOptions(){
  for(const [id,key,max] of [['pad-axis','axis',12],['pad-gas','gas',24],['pad-brake','brake',24],['pad-clutch','clutch',24]]){
    const select=$(id);
    for(let i=0;i<max;i++)select.add(new Option((key==='axis'?'軸 ':'按鈕 ')+i,String(i)));
    select.value=String(binding[key]);
    select.addEventListener('change',()=>binding[key]=Number(select.value));
  }
}
function readGamepad(){
  const available=typeof navigator.getGamepads==='function'?
    Array.from(navigator.getGamepads()||[]).filter(p=>p?.connected):[];
  const label=available.map(p=>p.index+':'+p.id).join('|');
  if(label!==lastPadLabel){
    const select=$('pad');
    select.replaceChildren(new Option('不使用手柄','off'),new Option('自動使用第一個','auto'));
    for(const pad of available)select.add(new Option(pad.id.slice(0,32),String(pad.index)));
    if(![...select.options].some(o=>o.value===chosenPad))chosenPad='auto';
    select.value=chosenPad;
    lastPadLabel=label;
  }
  if(chosenPad==='off')return null;
  return available.find(p=>String(p.index)===chosenPad)||(chosenPad==='auto'?available[0]:null)||null;
}
function readInputs(dt){
  if(!d||locked||gameModes?.mode!=='drive')return;
  const pad=readGamepad();
  if(!pad){
    lastPadIndex=null;steerFiltered=0;
    Object.assign(d.hostControls,{steer:0,throttle:0,brake:0,clutch:0});
    $('pad-status').textContent='未偵測到手柄；鍵盤仍可操作。';
    return;
  }
  if(lastPadIndex!==pad.index){lastPadIndex=pad.index;steerFiltered=0;}
  const raw=pad.axes?.[binding.axis]??0;
  // Ignore any historical hidden-panel pad-invert setting: the ONE visible
  // web panel controls inversion. Map the visual direction to legacy coordinates.
  const steer=d.normalizedAdvancedAxis(raw,{...d.advancedSteering,padInvert:false});
  const alpha=d.advancedSteering.padFilter>0?1-Math.exp(-dt/d.advancedSteering.padFilter):1;
  steerFiltered+=alpha*(steer-steerFiltered);
  if(Math.abs(steerFiltered)<.012&&Math.abs(steer)<.012)steerFiltered=0;
  const speed=Math.min(1,Math.abs(d.state.velocity)/38);
  d.hostControls.steer=legacySteerFromVisualAxis(steerFiltered,$('pad-invert').checked)*
    (1-.43*d.advancedSteering.padSpeed*speed);
  d.hostControls.throttle=Math.max(0,pad.buttons?.[binding.gas]?.value||0);
  d.hostControls.brake=Math.max(0,pad.buttons?.[binding.brake]?.value||0);
  d.hostControls.clutch=pad.buttons?.[binding.clutch]?.pressed?1:0;
  $('pad-status').textContent='已連接：'+pad.id.slice(0,40)+' · axis '+binding.axis+
    ' / gas '+binding.gas+' / brake '+binding.brake+' / clutch '+binding.clutch;
}
// Optional game accessibility aid. The four-wheel physics and mechanical
// gearbox stay authoritative: this host automates clutch/shift commands only.
function updateAutoDrive(){
  if(!d||!isAutomaticMode($('drive-mode').value)||locked)return;
  const s=d.state,speed=Math.abs(s.velocity),rpm=s.engineOmega*60/(2*Math.PI);
  const throttle=Math.max(s.throttle||0,d.inputKeys.has('w')?1:d.hostControls.throttle||0);
  const brake=Math.max(s.brake||0,d.inputKeys.has('s')?1:d.hostControls.brake||0);
  // Keep the independent parking restraint engaged even with no brake input.
  d.hostControls.parkPawl=autoRange==='P';
  const desired=automaticRangeRequest({range:autoRange,gear:s.gear,pendingGear:s.pendingGear,
    speedMps:speed,throttle,brake,params:d.params,
    secondsSinceShift:s.time-autoDrive.lastShiftTime});
  // Start/shift through the ORIGINAL mechanical clutch and synchronizer.
  // No direct assignment to state.gear, no R-to-D shift without neutral.
  const shiftRequested=desired!==null;
  d.hostControls.clutch=autoRange==='P'||autoRange==='N'?1:
    automaticClutch({gear:s.gear,pendingGear:s.pendingGear,
      shiftRequested,speedMps:speed,throttle,engineOn:s.engineOn,
      engineRPM:rpm,params:d.params});
  if(!s.engineOn && (s.clutch>.84 || s.gear===0))d.startEngine();
  if(shiftRequested){
    // N/P must be able to cancel a pending synchronizer instantly and safely.
    // All other requests must wait for the existing mechanical synchronizer.
    if(desired===0||s.pendingGear===null&&s.clutch>=.83){
      if(d.requestGear(desired)){
        autoDrive.lastShiftTime=s.time;
        autoDrive.shiftTarget=desired;
      }
    }
  }
  if(s.time%1<1/120)driveStatus('自排 '+autoRange+' · '+
    (s.pendingGear!==null?'同步器換檔中':s.gear===-1?'倒車檔':s.gear===0?'空檔':s.gear+' 檔')+
    ' · 按 M 切換手排');
}
function makeCar(){
  const result=createVehicleVisual(captureLegacyVehicle($('car-preset').value,d.params));
  scene.add(result.group);sceneLighting?.tunnel?.registerVehicle(result.group);return result;
}
function syncVisuals(dt){
  const b=bridge.rigidBody,t=b.translation();
  sceneLighting?.update(t);
  syncVehicleVisual(vehicle,b,d.wheelModel,bridge.wheelVisualState,dt,bridge.wheelPhases);
  const heading=d.vehicleMotion.heading;
  const fwd=new THREE.Vector3(Math.sin(heading),0,Math.cos(heading));
  const right=new THREE.Vector3(Math.cos(heading),0,-Math.sin(heading));
  const target=new THREE.Vector3(t.x,t.y+.4,t.z);
  const cameraType=$('camera-mode').value;
  const wish=target.clone();
  if(cameraType==='side')wish.addScaledVector(right,11).add(new THREE.Vector3(0,3,0));
  else if(cameraType==='top')wish.add(new THREE.Vector3(0,23,0)).addScaledVector(fwd,-.1);
  else wish.addScaledVector(fwd,-10.5).add(new THREE.Vector3(0,4.0,0));
  camera.position.lerp(wish,Math.max(.04,1-Math.exp(-dt*5)));
  camera.up.set(0,1,0);
  if(cameraType==='top')camera.up.set(0,0,1);
  camera.lookAt(target.clone().addScaledVector(fwd,cameraType==='chase'?5:0));
}
function updateHud(force=false){
  const now=performance.now();if(!force&&now-lastHud<90)return;
  lastHud=now;
  if(!labReady)return;
  const s=d.state,v=bridge.rigidBody.linvel();
  const speedKmh=Math.hypot(v.x,v.y,v.z)*3.6,rpmValue=s.engineOmega*60/(2*Math.PI);
  $('dash-speed').textContent=String(Math.round(speedKmh));
  $('dash-rpm').textContent=(Math.max(0,rpmValue)/1000).toFixed(1);
  $('dash-gear').textContent=isAutomaticMode($('drive-mode').value)?
    automaticDisplayGear(autoRange,s.gear):s.gear===-1?'R':s.gear===0?'N':String(s.gear);
  $('speed-dial').style.setProperty('--arc',(Math.max(0,Math.min(speedKmh,240))/240*255).toFixed(1)+'deg');
  $('rpm-dial').style.setProperty('--arc',(Math.max(0,Math.min(rpmValue,7500))/7500*255).toFixed(1)+'deg');
  $('engine').textContent=s.engineOn?'引擎已啟動':'啟動引擎 [I]';
  gearSelect.value=String(s.pendingGear??s.gear);
}
function resetDriving(){
  if(!d||!bridge||!road)return;
  d.reset(); // Also resets the single-authority Rapier body.
  // The visible page owns all driving settings; the iframe computes physics.
  const preset=$('car-preset').value;
  if(!d.applyVehicle(preset))throw new Error('無法載入車型 '+preset);
  if(preset!==visualVehicleId){
    if(vehicle)disposeVehicleVisual(vehicle);
    vehicle=makeCar();visualVehicleId=preset;
  }
  const inner=frame.contentWindow.document;
  inner.getElementById('abs-enabled').checked=$('abs-toggle').checked;
  inner.getElementById('tcs-enabled').checked=$('tcs-toggle').checked;
  inner.getElementById('surface-select').value=$('road-surface').value;
  d.setESCEnabled($('esc').value==='on');
  d.setHandlingFeel($('feel').value);
  d.setHandlingBalance($('handling-balance').value);
  d.setBrakeBias(Number($('brake-bias').value));
  const steeringPreset=$('steering-preset').value;
  Object.assign(d.advancedSteering,d.ADV_STEER_PRESETS[steeringPreset]);
  d.roadAppearance.guardrails='both';
  d.hostControls.active=true;
  Object.assign(d.hostControls,{steer:0,throttle:0,brake:0,clutch:0,parkPawl:false});
  trackedKeys.clear();d.inputKeys.clear();
  autoDrive.lastShiftTime=-100;autoDrive.shiftTarget=0;
  autoRange='P';
  if(isAutomaticMode($('drive-mode').value))d.hostControls.parkPawl=true;
  $('range-message').textContent='';
  $('road-material').disabled=locked||d.route.config.generator!==3;
  road.setPavementMaterial(d.route.config.generator===3?$('road-material').value:'asphalt_dense');
  const point=d.roadPointAt(70);
  road.ensure(point.s);
  bridge.teleport({roadPoint:point});
  d.vehicleMotion.routeS=point.s;
  d.vehicleMotion.offroad=false;
  d.route.distance=point.s;
  gearSelect.value='0';dropSteps=0;accumulator=0;
  syncTransmissionUI();
  updateHud(true);
}
function stepOnce(){
  if(road.ensure(d.route.distance,bridge.rigidBody.translation(),{stream:true})===false)return false;
  const begin=performance.now();
  updateAutoDrive();
  d.advancePhysics(FIXED_DT);
  assertPhysicsHealth(bridge.rigidBody,d);
  physicsMs=performance.now()-begin;
}
function setBusy(value){
  locked=value;
  for(const id of ['gear','auto-range','engine','drive-mode',
    'drive-procedural','menu-reset',...preferenceIds])$(id).disabled=value||(id==='road-material'&&d?.route.config.generator!==3);
  if(!value)syncTransmissionUI();
}
function installEvents(){
  selectOptions();restorePreferences();syncTransmissionUI();
  $('reload-game')?.addEventListener('click',()=>window.location.reload());
  gameModes=createGameModes(document,{onModeChange(next){
    trackedKeys.clear();if(d)d.inputKeys.clear();
    if(d)Object.assign(d.hostControls,{steer:0,throttle:0,brake:0,clutch:0});
    if(next==='drive'){
      setPause(false);driveFocus();
    }else{
      setPause(true);
      if(next==='settings')updateMapInfo();
    }
  }});
  for(const key of MAP_FIELDS){
    $('map-'+key).addEventListener('input',()=>{updateMapFieldLabels();mapMessage('參數尚未套用，點擊「按設定生成」。');});
  }
  $('map-seed').addEventListener('input',()=>mapMessage('種子尚未套用，點擊「按設定生成」。'));
  $('map-generate').addEventListener('click',()=>{
    try{applyMap(readMapForm());}catch(error){mapMessage(error.message,true);}
  });
  $('map-random').addEventListener('click',()=>{
    $('map-seed').value=makeMapSeed();
    try{applyMap(readMapForm());}catch(error){mapMessage(error.message,true);}
  });
  $('map-next-bend').addEventListener('click',()=>{
    try{previewNextBend();}catch(error){mapMessage(error.message,true);}
  });
  $('map-export').addEventListener('click',()=>{
    try{
      const blob=new Blob([serializeMap(userMapConfig)],{type:'application/json'});
      const href=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=href;link.download='SHIFT_LAB_Road_'+userMapConfig.seed+'.json';link.click();
      setTimeout(()=>URL.revokeObjectURL(href),3000);
    }catch(error){mapMessage(error.message,true);}
  });
  $('map-import').addEventListener('click',()=>$('map-import-file').click());
  $('map-import-file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{
      if(file.size>10000)throw Error('道路設定檔不得超過 10 KB');
      const config=readMapDocument(JSON.parse(await file.text()));
      applyMap(config);
    }catch(error){mapMessage('匯入失敗：'+error.message,true);}
    e.target.value='';
  });
  const bindMode=(id,next)=>$(id).addEventListener('click',()=>openGameMode(next));
  bindMode('hud-menu','menu');bindMode('resume-drive','drive');
  $('drive-procedural').addEventListener('click',enterProceduralDriving);
  bindMode('open-settings','settings');
  bindMode('close-settings','drive');
  $('menu-reset').addEventListener('click',()=>{if(!locked){resetDriving();openGameMode('drive');}});
  for(const id of preferenceIds){
    $(id).addEventListener('change',()=>{
      if(locked)return;
      savePreferences();
      if(!d||!labReady)return;
      if(id==='car-preset'){
        resetDriving();setPause(gameModes?.mode!=='drive');
        driveStatus('已切換車型並重置為自由駕駛；使用 W/A/S/D');
      }else if(id==='road-material'){
        const previous=road.surfaceMap.pavementMaterial;
        try{road.setPavementMaterial($('road-material').value);}
        catch(error){$('road-material').value=previous;savePreferences();driveStatus(error.message);return;}
      }else if(id==='road-surface'){
        frame.contentWindow.document.getElementById('surface-select').value=$('road-surface').value;
      }else if(id==='abs-toggle'){
        frame.contentWindow.document.getElementById('abs-enabled').checked=$('abs-toggle').checked;
      }else if(id==='tcs-toggle'){
        frame.contentWindow.document.getElementById('tcs-enabled').checked=$('tcs-toggle').checked;
      }else if(id==='handling-balance')d.setHandlingBalance($('handling-balance').value);
      else if(id==='brake-bias')d.setBrakeBias(Number($('brake-bias').value));
      else if(id==='steering-preset')Object.assign(d.advancedSteering,d.ADV_STEER_PRESETS[$('steering-preset').value]);
      if(gameModes?.mode==='drive')driveFocus();
    });
  }
  $('pad').addEventListener('change',e=>{chosenPad=e.target.value;if(gameModes?.mode==='drive')driveFocus();});
  $('auto-range').addEventListener('change',e=>selectAutomaticRange(e.target.value));
  for(const button of document.querySelectorAll('#auto-shifter [data-range]')){
    button.addEventListener('click',()=>{
      selectAutomaticRange(button.dataset.range);
      if(gameModes?.mode==='drive')driveFocus();
    });
  }
  $('drive-mode').addEventListener('change',()=>{
    syncTransmissionUI();
    if(!locked){resetDriving();setPause(gameModes?.mode!=='drive');}
  });
  canvas.addEventListener('pointerdown',driveFocus);
  $('engine').addEventListener('click',async()=>{
    if(!d||locked)return;
    // The paused Settings panel may contain a parked car already in gear.
    // Press the physical clutch before using the unmodified starter interlock.
    if(gameModes?.mode==='settings'&&d.state.gear!==0&&
      Math.abs(d.state.velocity)<.28&&d.state.clutch<.85){
      setBusy(true);
      const before=d.hostControls.clutch;
      try{
        d.hostControls.clutch=1;
        for(let i=0;i<42&&d.state.clutch<.86;i++)stepOnce();
        d.startEngine();
        driveStatus(d.state.engineOn?'離合器已分離並成功發動引擎':'發動失敗；請檢查原始引擎互鎖');
      }catch(error){driveStatus('發動失敗：'+error.message);}
      finally{d.hostControls.clutch=before;setBusy(false);updateHud(true);}
    }else d.startEngine();
  });
  gearSelect.addEventListener('change',async()=>{
    if(!d||locked)return;
    const target=Number(gearSelect.value);
    if(isAutomaticMode($('drive-mode').value)){
      gearSelect.value=String(d.state.pendingGear??d.state.gear);return;
    }
    if(gameModes?.mode!=='settings'){
      requestDriverGear(target);gearSelect.value=String(d.state.pendingGear??d.state.gear);return;
    }
    setBusy(true);
    try{
      const velocity=bridge?.rigidBody?.linvel();
      const extraSpeed=velocity?Math.hypot(velocity.x,velocity.y,velocity.z):0;
      const result=await engageParkedManualGear({core:d,gear:target,step:stepOnce,
        extraSpeed,yieldFrame:()=>new Promise(resolve=>requestAnimationFrame(resolve))});
      driveStatus((result.ok?'手排：':'未完成排檔：')+result.reason);
    }catch(error){driveStatus('手排操作失敗：'+error.message);}
    finally{setBusy(false);gearSelect.value=String(d.state.pendingGear??d.state.gear);updateHud(true);}
  });
  $('esc').addEventListener('change',()=>{d?.setESCEnabled($('esc').value==='on');});
  $('feel').addEventListener('change',()=>{d?.setHandlingFeel($('feel').value);});
  for(const id of ['pad-axis','pad-gas','pad-brake','pad-clutch','camera-mode']){
    $(id).addEventListener('change',()=>{if(gameModes?.mode==='drive')driveFocus();});
  }
  window.addEventListener('keydown',e=>{
    if(e.code==='Escape'){
      e.preventDefault();if(!e.repeat&&!locked)openGameMode(gameModes?.mode==='drive'?'menu':'drive');return;
    }
    if(e.code==='F1'){
      e.preventDefault();if(!e.repeat&&!locked)openGameMode('settings');return;
    }
    // Inputs in menus must never operate the car, including gear shortcuts.
    if(gameModes?.mode!=='drive')return;
    const editing=['INPUT','SELECT','TEXTAREA'].includes(e.target?.tagName);
    if(editing||locked)return;
    const key=keys[e.code];
    if(key){
      e.preventDefault();
      // Shift is ONLY the manual clutch. Letting it reach the hidden engine
      // in automatic mode interferes with the automatic clutch actuator.
      if(key==='shift'&&isAutomaticMode($('drive-mode').value))return;
      trackedKeys.add(key);if(d)d.inputKeys.add(legacyDirectionalKey(key));return;
    }
    if(e.repeat)return;
    if(e.code==='Space'){e.preventDefault();setPause(!paused);}
    else if(e.code==='KeyI'){e.preventDefault();d?.startEngine();}
    else if(e.code==='Backspace'){e.preventDefault();resetDriving();driveFocus();}
    else if(e.code==='KeyM'){
      e.preventDefault();$('drive-mode').value=$('drive-mode').value==='manual'?'assisted':'manual';
      savePreferences();syncTransmissionUI();
      resetDriving();setPause(false);driveFocus();
    }
    else if(isAutomaticMode($('drive-mode').value)&&['KeyP','KeyR','KeyN','KeyF'].includes(e.code)){
      e.preventDefault();
      selectAutomaticRange({KeyP:'P',KeyR:'R',KeyN:'N',KeyF:'D'}[e.code]);
    }
    else if(/^(Digit|Numpad)[0-6]$/.test(e.code)){
      e.preventDefault();requestDriverGear(Number(e.code.slice(-1)));
    }
    else if(e.code==='KeyR'){e.preventDefault();requestDriverGear(-1);}
  });
  window.addEventListener('keyup',e=>{
    const key=keys[e.code];if(key){
      e.preventDefault();trackedKeys.delete(key);
      if(d)d.inputKeys.delete(legacyDirectionalKey(key));
    }
  });
  window.addEventListener('blur',()=>{trackedKeys.clear();if(d)d.inputKeys.clear();});
}
function render(now){
  if(!labReady)return;
  try{
    const elapsed=Math.max(0,Math.min(.075,(now-prevFrame)/1000));prevFrame=now;
    renderFPS+=(1-Math.exp(-elapsed*3))*((elapsed>0?1/elapsed:renderFPS)-renderFPS);
    readInputs(elapsed);
    if(!paused&&!locked){
      accumulator+=elapsed;
      let count=0;
      while(accumulator>=FIXED_DT&&count<8){if(stepOnce()===false){accumulator=0;break;}accumulator-=FIXED_DT;count++;}
      if(accumulator>=FIXED_DT){dropSteps+=Math.floor(accumulator/FIXED_DT);accumulator=0;}
    }else accumulator=0;
    syncVisuals(elapsed);renderer.render(scene,camera);
    // Submit the current view before optional loading work, allowing the GPU
    // to draw while the CPU prepares future chunks. New chunks appear next frame.
    road.pumpStreaming();updateHud();
    requestAnimationFrame(render);
  }catch(e){failure(e);}
}
async function boot(){
  installEvents();
  d=await waitIframe();
  d.setExternalClock(true);
  userMapConfig=restoreMapPreference();
  // The hidden core produces BOTH road versions; one centerline is shared by
  // visible Three.js meshes, wheel contact, and Rapier road colliders.
  if(!sameMap(d.route.config,userMapConfig))d.generateRoad(userMapConfig);
  fillMapForm(userMapConfig);updateMapInfo();
  await RAPIER.init();
  if(!window.WebGL2RenderingContext)throw new Error('此瀏覽器不支援 WebGL2');
  scene=new THREE.Scene();scene.background=new THREE.Color(0xa2c0cb);scene.fog=new THREE.Fog(0xa2c0cb,170,650);
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  sceneLighting=createSceneLighting(renderer,scene);
  renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
  camera=new THREE.PerspectiveCamera(63,innerWidth/innerHeight,.1,900);
  const resize=()=>{renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);
    camera.aspect=Math.max(1,canvas.clientWidth)/Math.max(1,canvas.clientHeight);camera.updateProjectionMatrix();};
  window.addEventListener('resize',resize);resize();
  world=new RAPIER.World({x:0,y:-9.81,z:0});
  world.maxCcdSubsteps=4;
  road=new RoadWorld(RAPIER,world,scene,d);sceneLighting.attachRoad(road);d.roadAppearance.guardrails='both';road.ensure(70);
  road.materialLibrary.configureAnisotropy(renderer.capabilities.getMaxAnisotropy());
  bridge=new RapierChassisBridge(RAPIER,world,road,d);bridge.create(d.params);
  if(!d.setChassisBridge(bridge))throw new Error('原始物理核心拒絕外部剛體橋接');
  vehicle=makeCar();labReady=true;
  resetDriving();updateMapInfo();
  const uploadPreparer=new GeometryUploadPreparer(renderer);
  road.enableAsyncStreaming({getVelocity:()=>bridge.rigidBody.linvel(),prepareMesh:mesh=>uploadPreparer.prepare(mesh)});
  overlay.remove();
  prevFrame=performance.now();requestAnimationFrame(render);
  if(import.meta.env.DEV){
    const {installGameDriver}=await import('../tests/game-driver.mjs');
    installGameDriver({getContext:()=>({core:d,bridge,road,labReady,paused,locked,autoRange,
      renderer,camera,sceneLighting,vehicle,visualVehicleId,gameModes,userMapConfig,physicsMs,dropSteps,trackedKeys}),
      stepOnce,updateHud,applyMap,openGameMode,selectAutomaticRange,frameView:()=>{syncVisuals(10);renderer.render(scene,camera);},
      driveProcedural:enterProceduralDriving,setPause});
  }
}
boot().catch(failure);
