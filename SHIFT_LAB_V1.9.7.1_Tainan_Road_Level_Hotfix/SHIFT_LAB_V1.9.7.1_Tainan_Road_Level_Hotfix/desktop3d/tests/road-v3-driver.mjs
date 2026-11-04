// Development-only real-vehicle traversal; never imported by production.
export function driveRoadV3Check({getContext,stepOnce,setPause,snapshot},options){
  const {core:d,bridge,road,labReady}=getContext();if(!labReady||d.route.config.generator!==3)throw Error('V3 not ready');
  setPause(true);
  const control=document.getElementById('drive-mode');control.value='manual';control.dispatchEvent(new Event('change'));
  d.inputKeys.clear();d.releaseKeyboardOverride();d.requestGear(0);
  Object.assign(d.hostControls,{active:true,steer:0,throttle:0,brake:0,clutch:1,parkPawl:false});
  const direction=options.reverse?-1:1,start=options.start,end=options.end,speed=options.speed||12;
  const startPoint=d.roadPointAt(start),side=options.side??1.5;
  road.ensure(start);
  const point=road.position(start,side),bank=d.roadBankAt(startPoint),slope=startPoint.grade/100;
  bridge.teleport({roadPoint:{...startPoint,y:point.y,surfaceNormal:{
    x:-Math.sin(startPoint.heading)*slope-Math.cos(startPoint.heading)*bank,y:1,
    z:-Math.cos(startPoint.heading)*slope+Math.sin(startPoint.heading)*bank}},
    side,angle:direction<0?Math.PI:0,speed});
  let contactFrames=0,maxHeightError=0,frames=0,travel=0,previous=bridge.rigidBody.translation();
  const angle=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
  let exit=false;
  const targetEnd=road.position(end,side);
  for(;frames<2400;frames++){
    const m=d.vehicleMotion,look=6+Math.min(5,Math.abs(d.state.velocity)*.35);
    let target;
    if(options.junction){
      const j=options.junction;
      if(Math.hypot(m.x-j.x,m.z-j.z)<10)exit=true;
      target=exit?targetEnd:{x:j.x,z:j.z};
    }else target=road.position(Math.max(0,Math.min(d.roadTotalDistance(),d.route.distance+direction*look)),side);
    const error=angle(Math.atan2(target.x-m.x,target.z-m.z),m.heading);
    const distance=Math.max(3,Math.hypot(target.x-m.x,target.z-m.z));
    d.hostControls.steer=Math.max(-1,Math.min(1,Math.atan(2*d.params.wheelbase*Math.sin(error)/distance)/d.maximumSteerAngle(d.state.velocity)));
    stepOnce();
    const pos=bridge.rigidBody.translation();travel+=Math.hypot(pos.x-previous.x,pos.z-previous.z);previous=pos;
    if(d.suspension.contacts>0)contactFrames++;
    const local=d.roadPointAt(d.route.distance);maxHeightError=Math.max(maxHeightError,Math.abs(pos.y-local.y-d.params.cgHeight));
    if(Math.hypot(pos.x-targetEnd.x,pos.z-targetEnd.z)<2.5&&frames>30)break;
    if(!options.junction&&direction*(d.route.distance-end)>1)break;
    if(frames>120&&Math.abs(d.state.velocity)<.1)break;
  }
  const result={...snapshot(),frames,travel,contactFraction:contactFrames/Math.max(1,frames+1),maxHeightError,
    endDistance:Math.hypot(bridge.rigidBody.translation().x-targetEnd.x,bridge.rigidBody.translation().z-targetEnd.z)};
  Object.assign(d.hostControls,{steer:0,throttle:0,brake:0,clutch:0});return result;
}
