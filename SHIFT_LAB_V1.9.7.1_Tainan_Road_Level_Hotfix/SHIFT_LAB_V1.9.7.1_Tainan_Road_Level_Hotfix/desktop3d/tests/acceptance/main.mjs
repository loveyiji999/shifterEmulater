import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {RoadWorld} from '../../src/road.mjs';
import {RapierChassisBridge} from '../../src/chassis.mjs';
import {REFERENCE_MAP} from '../../src/procedural-map.mjs';
import {assertPhysicsHealth} from '../../src/physics-health.mjs';
import {AcceptanceObstacles} from './obstacles.mjs';
import {SCENARIOS,TEST_ORDER,gradeScenario} from './scenarios.mjs';

const $=id=>document.getElementById(id),frame=$('physics');
const FIXED_DT=1/120;
let d,road,bridge,obstacles,world,scene,ready=false,locked=false;
let lastResult=null,suiteResults=[];
function setBusy(value){
  locked=value;
  for(const id of ['scenario','run-case','run-suite','export-report'])$(id).disabled=value;
}
function resetScenario(id){
  const setting=SCENARIOS[id];
  if(!setting?.duration)throw Error('未知驗收工況 '+id);
  d.reset();
  if(!d.applyVehicle('standard'))throw Error('無法載入參考車型');
  const inner=frame.contentWindow.document;
  inner.getElementById('abs-enabled').checked=true;
  inner.getElementById('tcs-enabled').checked=true;
  inner.getElementById('surface-select').value='dry';
  d.setESCEnabled(true);d.setHandlingFeel('balanced');d.setHandlingBalance('neutral');
  d.setBrakeBias(.68);Object.assign(d.advancedSteering,d.ADV_STEER_PRESETS.balanced);
  d.hostControls.active=true;
  Object.assign(d.hostControls,{steer:0,throttle:0,brake:0,clutch:0,parkPawl:false});
  d.inputKeys.clear();
  const point=d.roadPointAt(setting.spawnS);
  road.ensure(point.s);obstacles.configure(id);
  bridge.teleport({roadPoint:point,side:setting.side,angle:setting.angle,speed:setting.speed});
  d.vehicleMotion.routeS=point.s;d.vehicleMotion.offroad=false;d.route.distance=point.s;
}
function stepOnce(){
  road.ensure(d.route.distance);d.advancePhysics(FIXED_DT);assertPhysicsHealth(bridge.rigidBody,d);
}
function measureBaseline(){
  const p=bridge.rigidBody.translation();
  return {finite:true,nonFiniteSteps:0,maxPositionAbs:0,maxSpeed:0,
    maxTiltDeg:0,maxWheelContacts:0,validWheelSteps:0,
    invalidWheelLoads:0,rayHits:0,maxImpactImpulse:0,
    forceResetCount:0,maxExternalForceN:0,maxExternalTorqueNm:0,bodyMassKg:bridge.rigidBody.mass(),
    barrierHits:0,railHits:0,maxBeyondBarrier:-1e9,
    maxBarrierPenetration:0,minY:p.y,maxY:p.y,
    x:p.x,z:p.z,travel:0,verticalExcursion:0,maxRouteS:d.route.distance,runtimeMs:0};
}
function observe(data,baseline){
  const b=bridge.rigidBody,p=b.translation(),v=b.linvel(),w=b.angvel();
  const vals=[p.x,p.y,p.z,v.x,v.y,v.z,w.x,w.y,w.z];
  if(!vals.every(Number.isFinite)){data.finite=false;data.nonFiniteSteps++;return false;}
  data.maxPositionAbs=Math.max(data.maxPositionAbs,...vals.slice(0,3).map(Math.abs));
  data.maxSpeed=Math.max(data.maxSpeed,Math.hypot(v.x,v.y,v.z));
  data.maxTiltDeg=Math.max(data.maxTiltDeg,
    Math.hypot(d.vehicleMotion.roll,d.vehicleMotion.pitch)*180/Math.PI);
  data.maxWheelContacts=Math.max(data.maxWheelContacts,d.suspension.contacts);
  if(d.suspension.contacts>=2)data.validWheelSteps++;
  data.invalidWheelLoads=bridge.invalidWheelLoads;
  data.rayHits=bridge.wheelCastHits;
  data.forceResetCount=bridge.forceResetCount;
  data.maxExternalForceN=bridge.maxExternalForceN;
  data.maxExternalTorqueNm=bridge.maxExternalTorqueNm;
  if(data.invalidWheelLoads>0){data.finite=false;data.nonFiniteSteps++;return false;}
  data.barrierHits=bridge.barrierHits;data.railHits=bridge.railHits;
  data.maxImpactImpulse=Math.max(data.maxImpactImpulse,bridge.maxImpactImpulse);
  data.maxBarrierPenetration=Math.max(data.maxBarrierPenetration,bridge.maxBarrierPenetration);
  data.maxBeyondBarrier=Math.max(data.maxBeyondBarrier,p.z-obstacles.barrierCenter.z);
  data.minY=Math.min(data.minY,p.y);data.maxY=Math.max(data.maxY,p.y);
  data.verticalExcursion=data.maxY-data.minY;
  data.travel=Math.hypot(p.x-baseline.x,p.z-baseline.z);
  data.maxRouteS=Math.max(data.maxRouteS,d.route.distance);
  return true;
}
function showResult(result){
  const item=document.createElement('li');item.className=result.pass?'pass':'fail';
  item.textContent=(result.pass?'PASS':'FAIL')+' · '+SCENARIOS[result.scenario].name+
    ' · '+result.checks.filter(c=>c.passed).length+'/'+result.checks.length;
  $('results').append(item);$('metrics').textContent=JSON.stringify(result,null,2);
}
async function runScenario(id,{fromSuite=false}={}){
  if(!ready||locked&&!fromSuite)throw Error('工具尚未就緒或正在驗收');
  if(!fromSuite){setBusy(true);$('results').replaceChildren();}
  try{
    resetScenario(id);
    const setting=SCENARIOS[id],data=measureBaseline(),start={x:data.x,z:data.z};
    const startTime=performance.now();
    for(let n=0,total=Math.round(setting.duration/FIXED_DT);n<total;n++){
      try{stepOnce();}
      catch(error){data.finite=false;data.nonFiniteSteps++;
        data.abortReason='物理健康檢查失敗：'+error.message;break;}
      if(!observe(data,start))break;
      if(data.maxSpeed>Math.max(36,setting.speed+45)||data.maxPositionAbs>5000){
        data.abortReason='3D 剛體失穩，停止此工況';break;
      }
      if(n%20===19)await new Promise(resolve=>requestAnimationFrame(resolve));
    }
    data.runtimeMs=performance.now()-startTime;
    const graded=gradeScenario(id,data);
    const result={scenario:id,pass:graded.pass,checks:graded.checks,metrics:{...data},
      runtimeMs:data.runtimeMs,engine:'Rapier 0.18 + SHIFT LAB four-wheel, 120 Hz / 4 microsteps',
      events:bridge.eventHistory.map(e=>({...e}))};
    lastResult=result;showResult(result);
    $('status').textContent=(result.pass?'PASS':'FAIL')+' · '+setting.name;
    return result;
  }finally{if(!fromSuite)setBusy(false);}
}
async function runSuite(){
  if(locked||!ready)throw Error('工具尚未就緒或正在驗收');
  setBusy(true);suiteResults=[];$('results').replaceChildren();
  try{
    for(const id of TEST_ORDER){
      $('status').textContent='正在執行 '+SCENARIOS[id].name+' …';
      const result=await runScenario(id,{fromSuite:true});suiteResults.push(result);
      if(id==='settle'&&!result.pass){$('status').textContent='靜止穩定未通過，停止後續工況';break;}
    }
    if(suiteResults.length===TEST_ORDER.length)$('status').textContent=
      '驗收完成：'+suiteResults.filter(r=>r.pass).length+'/'+suiteResults.length+' 通過';
    return suiteResults.map(r=>({...r}));
  }finally{setBusy(false);}
}
function report(){return {version:'1.9.7.1',createdAt:new Date().toISOString(),
  scope:'independent simulator acceptance',map:{...REFERENCE_MAP},vehicle:'standard',
  lastResult,suite:suiteResults.map(r=>({...r}))};}
function failure(error){$('status').textContent='驗收工具執行失敗：'+error.message;console.error(error);}
async function boot(){
  d=frame.contentWindow?.__SHIFT_LAB_DEBUG__;
  if(!d){
    await new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
    d=frame.contentWindow?.__SHIFT_LAB_DEBUG__;
  }
  if(!d)throw Error('物理核心未就緒');
  d.setExternalClock(true);d.generateRoad({...REFERENCE_MAP});d.route.gradeMode='route';
  d.reset();if(!d.applyVehicle('standard'))throw Error('無法載入參考車型');
  await RAPIER.init();
  scene=new THREE.Scene();world=new RAPIER.World({x:0,y:-9.81,z:0});world.maxCcdSubsteps=4;
  d.roadAppearance.guardrails='both';road=new RoadWorld(RAPIER,world,scene,d);road.ensure(70);
  obstacles=new AcceptanceObstacles(RAPIER,world,scene,road);
  bridge=new RapierChassisBridge(RAPIER,world,road,d);bridge.create(d.params);
  if(!d.setChassisBridge(bridge))throw Error('物理核心拒絕外部剛體橋接');
  // Refresh Rapier's mass/query data before sampling the fixed reference body.
  world.step();
  for(const id of TEST_ORDER){const option=document.createElement('option');
    option.value=id;option.textContent=SCENARIOS[id].name;$('scenario').append(option);}
  $('run-case').addEventListener('click',()=>runScenario($('scenario').value).catch(failure));
  $('run-suite').addEventListener('click',()=>runSuite().catch(failure));
  $('export-report').addEventListener('click',()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(report(),null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='SHIFT_LAB_Physics_Acceptance.json';
    link.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
  });
  ready=true;setBusy(false);$('status').textContent='參考車型與固定道路已就緒';
  window.__SHIFT_LAB_ACCEPTANCE__={get ready(){return ready;},runScenario,runSuite,report};
}
boot().catch(failure);
