// Gear selection from the PAUSED settings panel. Do not bypass SHIFT LAB's
// clutch, synchronizers, shaft inertia or reverse lockout to set state.gear.
// A request is only automated while the vehicle is nearly stationary.
export async function engageParkedManualGear({core,gear,step,yieldFrame=async()=>{},
  maxSteps=420,extraSpeed=0}){
  if(!core?.state||!core?.hostControls||typeof core.requestGear!=='function'||typeof step!=='function')
    throw Error('缺少原始傳動系統或物理步進器');
  if(!Number.isInteger(gear)||gear < -1||gear > 6)throw Error('無效的手排檔位');
  if(core.state.pendingGear!==null)return {ok:false,reason:'同步器正在換檔，請稍候'};
  const speed=Math.max(Math.abs(core.state.velocity||0),Math.abs(extraSpeed));
  if(gear!==0&&speed>.28)return {ok:false,reason:'車輛尚未完全停穩；禁止從設定畫面強制入檔'};
  if(gear===0){
    const ok=core.requestGear(0);
    return {ok,reason:ok?'已排入空檔':'原始變速箱拒絕空檔請求'};
  }
  if(core.state.gear===gear)return {ok:true,reason:'目前已在該檔位'};
  const host=core.hostControls;
  const before={active:host.active,clutch:host.clutch,throttle:host.throttle,brake:host.brake};
  try{
    host.active=true;host.clutch=1;host.throttle=0;host.brake=1;
    // Let the ORIGINAL pedal slew dynamics reach the fully-separated clutch.
    let ready=false;
    for(let i=0;i<45;i++){
      step();
      if(core.state.clutch>=.85){ready=true;break;}
      if(i%20===19)await yieldFrame();
    }
    if(!ready)return {ok:false,reason:'離合器未能分離，已取消排檔'};
    if(!core.requestGear(gear))return {ok:false,reason:'原始變速箱拒絕此檔位（可能為倒檔鎖定或同步器條件）'};
    for(let i=0;i<maxSteps;i++){
      step();
      if(core.state.gear===gear&&core.state.pendingGear===null)
        return {ok:true,reason:'已透過原始離合器及同步器排入 '+(gear===-1?'R':gear)+' 檔'};
      if(core.state.pendingGear===null)
        return {ok:false,reason:'原始同步器未能完成排檔'};
      if(i%20===19)await yieldFrame();
    }
    // If the original synchronizer is still pending, DO NOT force an engagement.
    return {ok:false,reason:'同步器逾時；請排回空檔重新操作'};
  }finally{
    host.active=before.active;
    host.clutch=before.clutch;host.throttle=before.throttle;host.brake=before.brake;
  }
}
