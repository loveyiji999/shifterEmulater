// SHIFT LAB v1.8.9.3 PRND selector. The driver chooses a RANGE;
// SHIFT LAB's original gearbox remains the authority for mechanical gears.
// Only D may choose 1..6; R requests the original -1 gear through its synchro.
import {chooseAutomaticGear} from './automatic-transmission.mjs';

export const AUTOMATIC_RANGES=Object.freeze(['P','R','N','D']);
export const RANGE_SPEED_LIMIT_MPS=.35;
export const RANGE_BRAKE_THRESHOLD=.20;

export function checkAutomaticRange({current,target,speedMps,brake=0,paused=false,pendingGear=null}){
  if(!AUTOMATIC_RANGES.includes(target))return {ok:false,reason:'無效的自排檔位'};
  if(target===current)return {ok:true,reason:'已在 '+target+' 檔'};
  if(target==='N')return {ok:true,reason:'已選擇 N 空檔'};
  const speed=Math.abs(Number(speedMps));
  if(!Number.isFinite(speed)||speed>RANGE_SPEED_LIMIT_MPS)
    return {ok:false,reason:'請將車輛完全停穩後再切換 P／R／D'};
  if(pendingGear!==null&&pendingGear!==undefined&&target!=='P')
    return {ok:false,reason:'同步器正在換檔，請先切 N 或等待完成'};
  if(!paused&&Number(brake)<RANGE_BRAKE_THRESHOLD)
    return {ok:false,reason:'請踩住煞車，再切入 '+target+' 檔'};
  return {ok:true,reason:'已選擇 '+target+' 檔'};
}

// Return null for no new request, 0 to disengage, -1 for original reverse gear,
// or a numbered forward gear. Neutral always cancels a pending synchronizer.
export function automaticRangeRequest({range,gear,pendingGear,speedMps,
  throttle=0,brake=0,params,secondsSinceShift=Infinity}){
  if(range==='P'||range==='N')
    return gear!==0||pendingGear!==null&&pendingGear!==undefined?0:null;
  if(pendingGear!==null&&pendingGear!==undefined)return null;
  if(range==='R')return gear===-1?null:gear!==0?0:-1;
  if(range==='D'){
    if(gear===-1)return 0;
    return chooseAutomaticGear({gear,pendingGear,speedMps,throttle,brake,
      params,secondsSinceShift});
  }
  return null;
}

export function automaticDisplayGear(range,gear){
  if(range==='P'||range==='N')return range;
  if(range==='R')return gear===-1?'R':'N';
  return gear>0?String(gear):'N';
}
