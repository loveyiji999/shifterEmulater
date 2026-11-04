import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {RoadWorld} from '../../src/road.mjs';
import {RapierChassisBridge} from '../../src/chassis.mjs';
import {DEFAULT_MAP} from '../../src/procedural-map.mjs';
import {captureLegacyVehicle} from '../../src/vehicle-definition.mjs';
import {createVehicleVisual,syncVehicleVisual,disposeVehicleVisual} from '../../src/vehicle-visual.mjs';
import {assertPhysicsHealth} from '../../src/physics-health.mjs';

const $=id=>document.getElementById(id);
let core,world,road,bridge,vehicle,definition,ready=false,fixtureBody=null;
let rayReadings=[];
let maximumBumpExcessM=0;
let mapKind='flat',spawnPoint=null;
const fixtureIds=['flat','bump','roll','airborne','slope','crest','bank','upper','lower','surface-split','surface-front','surface-upper','surface-lower'];
const scene=new THREE.Scene();scene.background=new THREE.Color(0x183044);
scene.add(new THREE.HemisphereLight(0xffffff,0x475744,3));
const renderer=new THREE.WebGLRenderer({canvas:$('view'),antialias:true});
renderer.setSize(1280,720,false);
const camera=new THREE.PerspectiveCamera(50,1280/720,.1,300);
const lines=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({vertexColors:true}));
scene.add(lines);
const rays=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({vertexColors:true,depthTest:false}));
rays.renderOrder=10;scene.add(rays);

let visualTime=0;
function disposeVehicle(){if(vehicle)disposeVehicleVisual(vehicle);}
function reset(preset=$('preset').value,fixture=$('fixture').value){
  if(!ready)throw Error('Diagnostic not ready');
  if(!fixtureIds.includes(fixture))throw Error('Unknown fixture');
  if(!['standard','city','turbo','diesel'].includes(preset))throw Error('Unknown preset');
  $('preset').value=preset;$('fixture').value=fixture;
  maximumBumpExcessM=0;
  if(fixtureBody){road.groundHandles.delete(fixtureBody.collider.handle);scene.remove(fixtureBody.mesh);
    fixtureBody.mesh.geometry.dispose();fixtureBody.mesh.material.dispose();world.removeCollider(fixtureBody.collider,true);fixtureBody=null;}
  const targetKind=['slope','crest'].includes(fixture)?'grade':['bank','upper','lower','surface-upper','surface-lower'].includes(fixture)?'levels':'flat';
  if(mapKind!==targetKind){
    road.clear();
    const config=targetKind==='grade'?{seed:'VEHICLE-GRADE-V1',turnChance:0,hairpinChance:0,slopeChance:100}:
      targetKind==='levels'?{seed:'LEVEL-1',turnChance:70,hairpinChance:35,slopeChance:30}:
      {seed:'VEHICLE-CONTACT-V1',turnChance:0,hairpinChance:0,slopeChance:0};
    core.generateRoad({...DEFAULT_MAP,...config,maxGrade:9});mapKind=targetKind;
  }
  core.reset();core.applyVehicle(preset);bridge.create(core.params);
  const state=core.route.v3State;
  let station=fixture==='surface-front'?80:70;
  if(fixture==='slope')station=state.points.find(p=>p.s>100&&Math.abs(p.grade)>5)?.s;
  if(fixture==='crest')station=state.points.find((p,i)=>i>5&&p.s>100&&state.points[i-1].grade>0&&p.grade<=0&&state.points[i+5]?.grade<0)?.s;
  if(fixture==='bank')station=state.points.find(p=>p.s>100&&Math.abs(p.curvature)>.008)?.s;
  if(fixture==='upper'||fixture==='lower')station=state.crossings[0]?.[fixture];
  if(fixture==='surface-upper')station=state.crossings[0]?.upper;
  if(fixture==='surface-lower')station=state.crossings[0]?.lower;
  if(!Number.isFinite(station))throw Error('Seed did not produce requested fixture: '+fixture);
  const point=core.roadPointAt(station);road.ensure(station);
  let zones=[];
  if(fixture==='surface-split')zones=[{id:'left-wet',profileId:'asphalt_dense.wet',layerIds:['v3:0:asphalt'],bounds:{minX:-12,maxX:0,minZ:-20,maxZ:100}}];
  if(fixture==='surface-front')zones=[{id:'front-wet',profileId:'asphalt_dense.wet',layerIds:['v3:0:asphalt'],bounds:{minX:-12,maxX:12,minZ:80,maxZ:100}}];
  if(fixture==='surface-upper'||fixture==='surface-lower')zones=[{id:'upper-wet',profileId:'asphalt_dense.wet',layerIds:[`v3:${Math.floor(state.crossings[0].upper/100)}:asphalt`],
    bounds:{minX:point.x-30,maxX:point.x+30,minZ:point.z-30,maxZ:point.z+30}}];
  road.setSurfaceZones(zones);
  world.timestep=1/480;world.step(bridge.eventQueue,bridge.physicsHooks);
  const normalHit=world.castRayAndGetNormal(new RAPIER.Ray({x:point.x,y:point.y+1,z:point.z},{x:0,y:-1,z:0}),2,true,
    RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,bridge.collider,bridge.rigidBody,c=>road.groundHandles.has(c.handle));
  if(!normalHit)throw Error('Requested fixture pavement missing');
  point.surfaceNormal={...normalHit.normal};spawnPoint={s:point.s,y:point.y,grade:point.grade,normal:point.surfaceNormal,
    crossing:['upper','lower','surface-upper','surface-lower'].includes(fixture)?{...state.crossings[0]}:null};
  bridge.teleport({roadPoint:point});
  definition=captureLegacyVehicle(preset,core.params);
  disposeVehicle();
  vehicle=createVehicleVisual(definition);scene.add(vehicle.group);visualTime=0;
  if(fixture==='bump'){
    const c=core.wheelCoords('FL'),surface=road.position(point.s+c.z,c.x);
    // Include the generated pavement crown; centerline elevation is not the
    // actual top of the contact surface at this wheel.
    const p={x:surface.x,y:surface.y+.04,z:surface.z};
    const collider=world.createCollider(RAPIER.ColliderDesc.cuboid(.4,.04,.4).setTranslation(p.x,p.y,p.z));
    road.groundHandles.add(collider.handle);
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(.8,.08,.8),new THREE.MeshStandardMaterial({color:0xa84634}));
    mesh.position.copy(p);scene.add(mesh);fixtureBody={collider,mesh};
  }
  if(fixture==='roll')bridge.rigidBody.setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,point.heading,.08,'YXZ')),true);
  if(fixture==='airborne')bridge.rigidBody.setTranslation({x:point.x,y:point.y+2,z:point.z},true);
  core.hostControls.active=true;Object.assign(core.hostControls,{steer:0,throttle:0,brake:0,clutch:1,parkPawl:false});
  world.timestep=1/480;world.step(bridge.eventQueue,bridge.physicsHooks);
  // Reset fixtures must begin outside the mechanical stops, including the
  // raised FL block. Rapier cannot undo an intentionally penetrating teleport
  // before its first solve. This is initial placement only, never a step fix.
  const rot=bridge.rigidBody.rotation(),up=new THREE.Vector3(0,1,0)
    .applyQuaternion(new THREE.Quaternion(rot.x,rot.y,rot.z,rot.w));
  const start=bridge.rigidBody.translation();let lift=0;
  for(const id of core.WHEEL_IDS){
    const c=core.wheelCoords(id),origin=new THREE.Vector3(c.x,-.15,c.z)
      .applyQuaternion(new THREE.Quaternion(rot.x,rot.y,rot.z,rot.w)).add(start);
    const hit=world.castRay(new RAPIER.Ray(origin,up.clone().multiplyScalar(-1)),2,true,
      RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,bridge.collider,bridge.rigidBody,c=>road.groundHandles.has(c.handle));
    if(hit)lift=Math.max(lift,core.params.cgHeight-.15-core.params.bumpTravel+.005-hit.timeOfImpact);
  }
  if(lift>0)bridge.rigidBody.setTranslation({x:start.x+up.x*lift,y:start.y+up.y*lift,z:start.z+up.z*lift},true);
  world.step(bridge.eventQueue,bridge.physicsHooks);bridge.beforeForces(1/480);
  camera.position.set(point.x+6,point.y+3,point.z+6);camera.lookAt(point.x,point.y+.5,point.z);
  draw();return snapshot();
}
function snapshot(){
  const p=bridge.rigidBody.translation(),q=bridge.rigidBody.rotation();
  return {preset:$('preset').value,fixture:$('fixture').value,schema:definition.schema,
    time:core.state.time,body:{position:{...p},rotation:{...q},massKg:bridge.rigidBody.mass()},
    map:{...core.route.config},spawn:spawnPoint,routeS:core.route.distance,
    wheels:core.WHEEL_IDS.map(id=>({id,contact:core.wheelModel[id].contact,
      normalN:core.wheelModel[id].normal,travelM:core.wheelModel[id].travel,
      surface:core.wheelModel[id].contactSurface,mu:core.wheelModel[id].mu,
      ...bridge.wheelVisualState[id]})),
    rayReadings,
    layoutRevision:vehicle.layout.revision,chassisColliderCount:bridge.colliders.length,
    bumpStopCount:Object.keys(bridge.bumpStops).length,
    wheelSurfaceToleranceM:vehicle.layout.wheelSurfaceToleranceM,
    maximumBumpExcessM,
    wheelVisuals:vehicle.wheels.map(({id,pivot,spin})=>({id,localY:pivot.position.y,
      steer:pivot.rotation.y,expectedSteer:core.wheelModel[id].steer,
      phase:spin.rotation.x,expectedPhase:bridge.wheelPhases[id]??0})),
    fixedHz:120,microstepHz:480,performanceStatus:'not-a-benchmark',
    renderer:renderer.getContext().getParameter(renderer.getContext().RENDERER)};
}
function draw(){
  lines.visible=$('collider-view').checked;
  const p=bridge.rigidBody.translation(),q=bridge.rigidBody.rotation();
  syncVehicleVisual(vehicle,bridge.rigidBody,core.wheelModel,bridge.wheelVisualState,Math.max(0,core.state.time-visualTime),bridge.wheelPhases);
  vehicle.group.updateMatrixWorld(true);
  visualTime=core.state.time;
  const vertices=[],colors=[],up=new THREE.Vector3(0,1,0).applyQuaternion(vehicle.group.quaternion);
  const segment=(a,b,color)=>{vertices.push(a.x,a.y,a.z,b.x,b.y,b.z);colors.push(...color,...color);};
  rayReadings=core.WHEEL_IDS.map(id=>{
    const corner=core.wheelCoords(id),origin=new THREE.Vector3(corner.x,-.15,corner.z)
      .applyQuaternion(vehicle.group.quaternion).add(p);
    const hit=world.castRayAndGetNormal(new RAPIER.Ray(origin,up.clone().multiplyScalar(-1)),1.5,true,
      RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,bridge.collider,bridge.rigidBody,c=>road.groundHandles.has(c.handle));
    const point=origin.clone().addScaledVector(up,-(hit?.timeOfImpact??1.5));
    segment(origin,point,hit?[1,.2,.1]:[1,.2,1]);
    if(hit)segment(point,point.clone().addScaledVector(hit.normal,.5),[0,1,1]);
    let visibleTireGapM=null;
    if(hit){
      const mesh=vehicle.wheels.find(w=>w.id===id).cylinder,positions=mesh.geometry.getAttribute('position');
      const vertex=new THREE.Vector3(),normal=new THREE.Vector3().copy(hit.normal).normalize();
      visibleTireGapM=Infinity;
      for(let i=0;i<positions.count;i++){
        vertex.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld).sub(point);
        visibleTireGapM=Math.min(visibleTireGapM,vertex.dot(normal));
      }
    }
    return {id,origin:{...origin},point:{...point},normal:hit?{...hit.normal}:null,
      colliderHandle:hit?.collider.handle??null,distance:hit?.timeOfImpact??null,visibleTireGapM};
  });
  rays.geometry.dispose();rays.geometry=new THREE.BufferGeometry();
  rays.geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  rays.geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const debug=world.debugRender();lines.geometry.dispose();lines.geometry=new THREE.BufferGeometry();
  lines.geometry.setAttribute('position',new THREE.BufferAttribute(debug.vertices,3));
  lines.geometry.setAttribute('color',new THREE.BufferAttribute(debug.colors,4));
  renderer.render(scene,camera);$('readout').textContent=JSON.stringify(snapshot(),null,2);
}
function step(count=120){
  if(!Number.isInteger(count)||count<0||count>1200)throw Error('Invalid step count');
  for(let i=0;i<count;i++){road.ensure(core.route.distance);core.advancePhysics(1/120);assertPhysicsHealth(bridge.rigidBody,core);
    for(const wheel of Object.values(bridge.wheelVisualState))maximumBumpExcessM=Math.max(maximumBumpExcessM,
      wheel.hubLocalY-(-core.params.cgHeight+core.params.wheelRadius+core.params.bumpTravel));}
  draw();return snapshot();
}
async function boot(){
  const frame=$('physics');core=frame.contentWindow?.__SHIFT_LAB_DEBUG__;
  if(!core){await new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));core=frame.contentWindow?.__SHIFT_LAB_DEBUG__;}
  if(!core)throw Error('Physics core unavailable');
  core.setExternalClock(true);core.generateRoad({...DEFAULT_MAP,seed:'VEHICLE-CONTACT-V1',turnChance:0,hairpinChance:0,slopeChance:0});
  await RAPIER.init();world=new RAPIER.World({x:0,y:-9.81,z:0});world.maxCcdSubsteps=4;
  road=new RoadWorld(RAPIER,world,scene,core);road.ensure(70);
  bridge=new RapierChassisBridge(RAPIER,world,road,core);bridge.create(core.params);
  if(!core.setChassisBridge(bridge))throw Error('Chassis bridge rejected');
  ready=true;reset();$('status').textContent='已就緒：固定步進，無性能結論';
  $('reset').onclick=()=>reset();$('step').onclick=()=>step();
  $('collider-view').onchange=()=>draw();
  $('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='vehicle-contact-diagnostic.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  window.__SHIFT_LAB_VEHICLE_DIAGNOSTICS__={get ready(){return ready;},reset,step,snapshot};
}
boot().catch(error=>{$('status').textContent=error.message;console.error(error);});
