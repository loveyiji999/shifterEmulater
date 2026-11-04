import {inspectTunnelLighting} from './tunnel-lighting-driver.mjs';
import {inspectTerrainBlend} from './terrain-blend-driver.mjs';
import {inspectScenery,driveRockContact} from './scenery-driver.mjs';
import {driveRoadV3Check} from './road-v3-driver.mjs';
import {isAutomaticMode} from '../src/automatic-transmission.mjs';
import {collectPerformanceBaseline} from './performance-baseline.mjs';
import {collectManualPerformance,downloadManualPerformance} from './manual-performance.mjs';
import {driveSurfaceBraking} from './surface-driver.mjs';
import {configurePBRPreview} from './pbr-preview.mjs';
import {collectStreamingProfile} from './streaming-profile.mjs';
import {legacyDirectionalKey,legacySteerFromVisualAxis,visualSteeringFromLegacy} from '../src/steering-input.mjs';

// Loaded by main.mjs only in Vite development mode, never in the game build.
export function installGameDriver({getContext,stepOnce,updateHud,applyMap,openGameMode,
  selectAutomaticRange,driveProcedural,setPause,frameView}){
  const $=id=>document.getElementById(id);
  let baseline={status:'idle',result:null,error:null},manualCapture={status:'idle',result:null,error:null};
function currentSnapshot(){
  const {core:d,bridge,road,vehicle,labReady,paused,autoRange,visualVehicleId,gameModes,userMapConfig,physicsMs,dropSteps,trackedKeys}=getContext();
  if(!labReady)return {ready:false,error:$('input-status').textContent};
  const b=bridge.rigidBody,v=b.linvel(),t=b.translation();
  return {ready:true,scenario:'free',paused,step:d.state.time,
    gear:d.state.gear,pendingGear:d.state.pendingGear,clutch:d.state.clutch,
    engineOn:d.state.engineOn,driveMode:$('drive-mode').value,
    autoRange:isAutomaticMode($('drive-mode').value)?autoRange:null,
    parkPawl:!!d.state.parkPawl,
    x:t.x,y:t.y,z:t.z,vx:v.x,vy:v.y,vz:v.z,
    signedVelocity:d.state.velocity,
    speed:Math.hypot(v.x,v.y,v.z),yaw:d.vehicleMotion.yawRate,
    roll:d.vehicleMotion.roll,pitch:d.vehicleMotion.pitch,
    contacts:d.suspension.contacts,rayHits:bridge.wheelCastHits,
    wheelSurfaces:d.WHEEL_IDS.map(id=>({id,contact:d.wheelModel[id].contact,
      surface:d.wheelModel[id].contactSurface??null,normal:d.wheelModel[id].normal})),
    vehicleSchema:vehicle.definition.schema,
    vehicleLayoutRevision:vehicle.layout.revision,chassisColliderCount:bridge.colliders.length,
    bumpStopCount:Object.keys(bridge.bumpStops).length,
    wheelVisuals:vehicle.wheels.map(({id,pivot,spin})=>({id,localY:pivot.position.y,
      expectedLocalY:bridge.wheelVisualState[id]?.hubLocalY??null,steer:pivot.rotation.y,
      expectedSteer:d.wheelModel[id].steer,spin:spin.rotation.x,expectedSpin:bridge.wheelPhases[id]??0,
      omega:d.wheelModel[id].omega})),
    invalidWheelLoads:bridge.invalidWheelLoads,contactMicrosteps:bridge.contactMicrosteps,
    forceResetCount:bridge.forceResetCount,maxExternalForceN:bridge.maxExternalForceN,
    maxExternalTorqueNm:bridge.maxExternalTorqueNm,bodyMassKg:b.mass(),
    railHits:bridge.railHits,
    barrierHits:bridge.barrierHits,collisionCount:bridge.collisionCount,
    impact:bridge.maxImpactImpulse,penetration:bridge.maxBarrierPenetration,
    routeS:d.route.distance,physicsMs,frameDrops:dropSteps,
    driverMode:$('drive-mode').value,inputKeys:[...trackedKeys],mapSeed:d.route.config.seed,
    roadEnvironment:'procedural',
    uiMode:gameModes?.mode||'drive',
    driverSteer:visualSteeringFromLegacy(d.vehicleMotion.steerInput),
    legacySteer:d.vehicleMotion.steerInput,roadSurface:d.state.surface,roadMaterial:road.surfaceMap.pavementMaterial,
    vehiclePreset:visualVehicleId,roadResources:road.resourceStats(),
    focus:document.activeElement?.id||document.activeElement?.tagName||'none'};
}
  window.__SHIFT_LAB_3D_QA__={
    getTunnelLightingState:()=>{const l=getContext().sceneLighting.tunnel;return {sky:l.vehicleSky.value,tunnelId:l.vehicleTunnel.value,activeLights:l.active.length,totalLights:l.lights.length};},
    inspectTunnelLighting:(view)=>inspectTunnelLighting({getContext,stepOnce,setPause,frameView},view),
    inspectTerrainBlend:(overview=false)=>inspectTerrainBlend(getContext(),overview),
    inspectScenery:()=>inspectScenery(getContext()),
    driveRockContact:()=>driveRockContact({getContext,stepOnce,setPause}),
    startStreamingTrace(options){
      if(baseline.status==='running'||manualCapture.status==='running')throw Error('Trace already running');
      baseline={status:'running',result:null,error:null};
      collectStreamingProfile({getContext,stepOnce,setPause},options).then(result=>{baseline={status:'complete',result,error:null};})
        .catch(error=>{baseline={status:'failed',result:null,error:error.message};});
    },
    configurePBRPreview:options=>configurePBRPreview(getContext(),options),
    driveSurfaceBraking:(condition,material='asphalt_dense',options={})=>driveSurfaceBraking({getContext,stepOnce,setPause},condition,false,material,options),
    driveTerrainBraking:(condition='dry',options={})=>driveSurfaceBraking({getContext,stepOnce,setPause},condition,true,'asphalt_dense',{maxSteps:5400,...options}),
    startBaseline(options){
      if(baseline.status==='running'||manualCapture.status==='running')throw Error('Baseline already running');
      const context=getContext();
      if(context.paused||context.locked)throw Error('Baseline needs active simulation');
      baseline={status:'running',result:null,error:null};
      collectPerformanceBaseline({renderer:context.renderer,road:context.road,core:context.core,getContext},options)
        .then(result=>{baseline={status:'complete',result,error:null};})
        .catch(error=>{baseline={status:'failed',result:null,error:error.message};});
      return {status:baseline.status};
    },
    startManualCapture(options={}){
      if(baseline.status==='running'||manualCapture.status==='running')throw Error('Capture already running');
      const context=getContext();
      if(context.paused||context.locked)throw Error('Manual capture needs active simulation');
      manualCapture={status:'running',result:null,error:null};
      collectManualPerformance({getContext},options).then(result=>{
        manualCapture={status:result.status,result,error:result.error};
        if(options.download!==false)downloadManualPerformance(result);
      }).catch(error=>{manualCapture={status:'failed',result:manualCapture.result,error:error.message};});
      return {status:manualCapture.status};
    },
    get manualCapture(){return manualCapture;},
    get baseline(){return baseline;},
    frameView,version:'1.9.7.1',steeringMapping:{visualLeft:legacyDirectionalKey('a'),
      visualRight:legacyDirectionalKey('d'),visualPadRight:legacySteerFromVisualAxis(1)},
    get ready(){return getContext().labReady;},get paused(){return getContext().paused;},
    snapshot:currentSnapshot,
    step(n=1){const {labReady,locked}=getContext();if(!labReady||locked)throw Error('busy/not ready');
      setPause(true);
      for(let i=0;i<Math.max(0,Math.min(10000,Math.trunc(n)));i++)stepOnce();
      updateHud(true);return currentSnapshot();},
    driveRoadV3(options){return driveRoadV3Check({getContext,stepOnce,setPause,snapshot:currentSnapshot},options);},
    get map(){return {...getContext().core.route.config};},
    get savedMap(){return {...getContext().userMapConfig};},
    get roadQuality(){const q=getContext().core.route.quality;return q?{...q}:null;},
    driveProcedural(){driveProcedural();return currentSnapshot();},
    applyMap(config){applyMap(config);return currentSnapshot();},
    openMode:openGameMode,selectAutomaticRange
  };
  const url=new URL(window.location.href),duration=url.searchParams.get('capture-performance');
  if(duration!==null){
    url.searchParams.delete('capture-performance');window.history.replaceState(null,'',url);
    const seconds=Number(duration);
    if(Number.isFinite(seconds)&&seconds>=1&&seconds<=120){
      openGameMode('drive');window.__SHIFT_LAB_3D_QA__.startManualCapture({captureSeconds:seconds});
    }
  }
}
