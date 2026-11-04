// Fail closed on non-finite dynamics before corrupt values reach WebGL or QA.
// A valid crash is reported rather than silently teleported away.
export function assertPhysicsHealth(body,core,{maxPosition=100000,maxSpeed=1000}={}){
  if(!body||!core)throw Error('3D 物理核心未建立');
  for(const [label,vector] of [
    ['position',body.translation()],['linearVelocity',body.linvel()],
    ['angularVelocity',body.angvel()],['rotation',body.rotation()]]){
    if(!vector||!['x','y','z'].every(axis=>Number.isFinite(vector[axis]))||
      (label==='rotation'&&!Number.isFinite(vector.w)))
      throw new Error('3D 剛體 '+label+' 出現非有限數值');
  }
  const p=body.translation(),v=body.linvel();
  if(Math.max(Math.abs(p.x),Math.abs(p.y),Math.abs(p.z))>maxPosition)
    throw new Error('3D 剛體超出安全空間界限');
  if(Math.hypot(v.x,v.y,v.z)>maxSpeed)
    throw new Error('3D 剛體速度異常');
  const state=core.state;
  for(const key of ['velocity','engineOmega','clutch','throttle','brake'])
    if(!Number.isFinite(state[key]))throw new Error('傳動系統 '+key+' 出現非有限數值');
  for(const id of core.WHEEL_IDS||[]){
    const wheel=core.wheelModel[id];
    for(const key of ['omega','normal'])
      if(!Number.isFinite(wheel?.[key]))throw new Error('車輪 '+id+'.'+key+' 出現非有限數值');
  }
  return true;
}
