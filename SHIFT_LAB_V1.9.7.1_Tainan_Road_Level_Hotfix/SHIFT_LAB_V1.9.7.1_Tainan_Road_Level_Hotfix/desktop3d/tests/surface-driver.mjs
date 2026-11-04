// DEV-only physical stopping experiment; the game imports this via its test
// driver only. Set up using public controls and original gearbox requests.
export function driveSurfaceBraking({getContext,stepOnce,setPause},condition,terrain=false,pavement='asphalt_dense',{maxSteps=1800,speed=12}={}){
  const {core:d,road,bridge}=getContext();
  if(!['dry','wet','snow','ice'].includes(condition)||d.route.config.generator!==3||
    d.route.config.turnChance||d.route.config.slopeChance)throw Error('Flat V3 surface fixture required');
  const selector=document.getElementById('road-material');selector.value=pavement;selector.dispatchEvent(new Event('change'));
  const mode=document.getElementById('drive-mode');mode.value='manual';mode.dispatchEvent(new Event('change'));
  setPause(true);d.inputKeys.clear();d.releaseKeyboardOverride();d.requestGear(0);
  Object.assign(d.hostControls,{active:true,steer:0,throttle:0,brake:1,clutch:1,parkPawl:false});
  road.setSurfaceZones(terrain?[]:[{id:'braking-'+condition,profileId:road.surfaceMap.pavementProfile(pavement,condition).id,
    layerIds:Array.from({length:7},(_,i)=>`v3:${i}:asphalt`),
    bounds:{minX:-12,maxX:12,minZ:-20,maxZ:700}}]);
  const point=d.roadPointAt(40),surface=road.position(40,0);
  let target={...point,y:surface.y,surfaceNormal:{x:0,y:1,z:0}};
  if(terrain){
    target={...target,x:10};road.ensure(40,target);road.world.step();
    const hit=road.world.castRayAndGetNormal(new road.rapier.Ray({x:10,y:100,z:point.z},{x:0,y:-1,z:0}),200,true,
      undefined,undefined,undefined,undefined,c=>road.groundHandles.has(c.handle));
    if(!hit||!['earth','terrain_mix'].includes(road.surfaceAtHit(hit)?.material))throw Error('Actual terrain support required');
    target.y=100-hit.timeOfImpact;target.surfaceNormal=hit.normal;
  }
  road.ensure(40,target);bridge.teleport({roadPoint:target,speed});
  const start=bridge.rigidBody.translation(),samples=[];
  let stopped=false,steps=0;
  for(;steps<maxSteps;steps++){
    stepOnce();
    const v=bridge.rigidBody.linvel(),p=bridge.rigidBody.translation();
    if(steps%12===0)samples.push({time:d.state.time,x:p.x,z:p.z,speed:Math.hypot(v.x,v.y,v.z),
      wheelSurface:d.WHEEL_IDS.map(id=>d.wheelModel[id].contactSurface),
      wheelFx:d.WHEEL_IDS.map(id=>d.wheelModel[id].fx),wheelCapacity:d.WHEEL_IDS.map(id=>d.wheelModel[id].capacity),
      contacts:d.suspension.contacts});
    if(steps>60&&Math.hypot(v.x,v.y,v.z)<.08){stopped=true;break;}
  }
  const end=bridge.rigidBody.translation();
  return {condition,pavement,globalSurfaceCondition:d.state.surface,stopped,steps,distance:Math.hypot(end.x-start.x,end.z-start.z),
    elapsedSeconds:d.state.time,samples,collisions:bridge.collisionCount,
    invalidWheelLoads:bridge.invalidWheelLoads,fixedHz:120,microstepHz:480,
    scope:terrain?'project illustrative soil gameplay experiment; not field calibration':pavement==='asphalt_dense'?'legacy asphalt condition gameplay experiment; not measured real-world braking':'project illustrative pavement gameplay experiment; not field calibration'};
}
