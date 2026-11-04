// v1.8.9.1 AMT schedule, regression revalidated in v1.8.9.2; no physical gearbox rewrite.
// This module only decides WHICH gear and clutch command to request. The
// original SHIFT LAB synchronizers, shafts, engine and tires remain authoritative.
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));

export function gearSpeedRPM(speedMps,gear,params){
  if(!params || !(Number(params.wheelRadius)>0) || !(Number(params.finalDrive)>0))return 0;
  const ratio=Math.abs(Number(params.ratios?.[gear])||0);
  return Math.abs(Number(speedMps)||0)*ratio*params.finalDrive/params.wheelRadius*60/(2*Math.PI);
}

export function isAutomaticMode(mode){return mode==='assisted';}

export function chooseAutomaticGear({gear,pendingGear,speedMps,throttle=0,brake=0,
  params,secondsSinceShift=Infinity}){
  if(!params||pendingGear!==null&&pendingGear!==undefined)return null;
  if(!Number.isInteger(gear)||gear<0||gear>6)return null;
  const speed=Math.abs(Number(speedMps)||0);
  const pedal=clamp(Number(throttle)||0,0,1);
  const brakePedal=clamp(Number(brake)||0,0,1);
  const idle=Math.max(500,Number(params.idleRPM)||800);
  const redline=Math.max(idle*2.4,Number(params.redlineRPM)||6800);
  const downRPM=Math.max(idle*1.75,redline*(.215+.12*pedal))+380*brakePedal;
  const upRPM=redline*(.47+.36*pedal);
  const rpm=gearSpeedRPM(speed,gear,params);
  const ready=secondsSinceShift>=1.0;

  // A stalled or manually neutralized car can re-engage without being forced
  // into first at motorway speed. The free-drive mode starts from neutral.
  if(gear===0){
    for(let candidate=1;candidate<=6;candidate++){
      if(gearSpeedRPM(speed,candidate,params)<=redline*.72)return candidate;
    }
    return 6;
  }

  // Approaching a halt, select first promptly; otherwise shifting every gear
  // one by one can leave a stalled engine in sixth while the car is stopped.
  if(gear>1&&speed<2.5&&gearSpeedRPM(speed,1,params)<redline*.88)return 1;

  // Use wheel-speed/gear-ratio RPM rather than the idle-governed engine RPM:
  // the latter can stay above 1200 while the clutch slips during deceleration.
  if(gear>1&&rpm<downRPM){
    const lower=gear-1;
    if(gearSpeedRPM(speed,lower,params)<redline*.89 &&
      (ready||rpm<idle*1.12))return lower;
  }
  if(ready&&brakePedal<.15&&gear<6&&rpm>upRPM &&
    gearSpeedRPM(speed,gear+1,params)>idle*1.32)return gear+1;
  return null;
}

export function automaticClutch({gear,pendingGear,shiftRequested,speedMps,
  throttle=0,engineOn=true,engineRPM=0,params}){
  if(!engineOn||pendingGear!==null&&pendingGear!==undefined||shiftRequested||gear===0||gear < -1)return 1;
  const speed=Math.abs(Number(speedMps)||0);
  const pedal=clamp(Number(throttle)||0,0,1);
  const idle=Number(params?.idleRPM)||800;
  if(gear>1&&engineRPM<idle*1.12)return 1; // stall protection during heavy deceleration
  if(speed<.55&&pedal<.05)return 1;
  if((gear===1||gear===-1)&&speed<4)return Math.max(.09,.66-speed*.135-pedal*.09);
  return 0;
}
