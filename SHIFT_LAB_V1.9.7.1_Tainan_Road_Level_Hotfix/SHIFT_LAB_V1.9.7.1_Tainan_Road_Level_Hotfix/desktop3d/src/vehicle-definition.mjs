// The adapter reads current solver parameters; it never mutates the solver.
import {vehicleLayout,vehicleLayoutV2} from './vehicle-layout.mjs';
export const VEHICLE_SCHEMA='shiftlab.vehicle.v1';
export const VEHICLE_IDS=Object.freeze(['standard','city','turbo','diesel']);
export const WHEEL_IDS=Object.freeze(['FL','FR','RL','RR']);
export const VEHICLE_UNITS=Object.freeze({mass:'kg',wheelRadius:'m',wheelbase:'m',
  trackFront:'m',trackRear:'m',cgHeight:'m',yawInertia:'kg*m^2',
  pitchInertia:'kg*m^2',rollInertia:'kg*m^2',springFront:'N/m',springRear:'N/m',
  damperFront:'N*s/m',damperRear:'N*s/m',bumpTravel:'m',droopTravel:'m',
  finalDrive:'ratio',ratios:'ratio',torqueMap:'[rpm,N*m]'});
const positive=['mass','wheelRadius','wheelbase','trackFront','trackRear','cgHeight',
  'yawInertia','pitchInertia','rollInertia','springFront','springRear',
  'damperFront','damperRear','bumpTravel','droopTravel','finalDrive'];

function dataCopy(value,path='document'){
  if(typeof value==='number'&&!Number.isFinite(value))throw new Error(path+': non-finite number');
  if(value===null||['string','number','boolean'].includes(typeof value))return value;
  if(Array.isArray(value))return value.map((item,i)=>dataCopy(item,`${path}[${i}]`));
  if(typeof value!=='object')throw new Error(path+': plain data required');
  const copy={};
  for(const key of Object.keys(value)){
    if(['__proto__','prototype','constructor'].includes(key))throw new Error(path+': unsafe key');
    copy[key]=dataCopy(value[key],path+'.'+key);
  }
  return copy;
}

export function captureLegacyVehicle(id,params){
  if(!VEHICLE_IDS.includes(id))throw new Error('Unknown legacy vehicle: '+id);
  const p=dataCopy(params,'physics');
  const layout=vehicleLayout(p);
  const wheels=WHEEL_IDS.map(wheelId=>{
    const front=wheelId[0]==='F';
    return {id:wheelId,mount:{x:(wheelId[1]==='L'?-1:1)*(front?p.trackFront:p.trackRear)/2,
      y:-.15,z:front?p.wheelbase*(1-p.frontStaticLoad):-p.wheelbase*p.frontStaticLoad}};
  });
  return readVehicleDefinition({schema:VEHICLE_SCHEMA,id,revision:1,
    provenance:{kind:'legacy-runtime-snapshot',measurementStatus:'mixed-legacy-see-core-sources'},
    coordinates:{right:'+X',up:'+Y',forward:'+Z',origin:'rigid-body-center-of-mass'},
    units:{...VEHICLE_UNITS},physics:p,
    capabilities:{drive:'FWD',gearbox:'clutch-synchronizer',automaticControl:'assisted-shifting',
      wheelCount:4,forwardGears:6},
    appearance:{revision:3,kind:'procedural-legacy',
      body:layout.body,cabin:layout.cabin,collisionParts:layout.colliders,
      hull:{halfExtents:layout.colliders[0].halfExtents,center:layout.colliders[0].center,density:0},
      materialSlots:['body','glass','tire','front-lamp','rear-lamp'],wheels}});
}

// Returns a detached validated value. Callers can prepare everything before an
// atomic apply; invalid imports cannot partially overwrite live P or settings.
export function readVehicleDefinition(input){
  const v=dataCopy(typeof input==='string'?JSON.parse(input):input);
  if(v.schema!==VEHICLE_SCHEMA||v.revision!==1)throw new Error('Unsupported vehicle schema/revision');
  if(typeof v.id!=='string'||!v.id.trim())throw new Error('Vehicle id required');
  const p=v.physics;
  if(!p||positive.some(key=>!Number.isFinite(p[key])||!(p[key]>0)))throw new Error('Invalid positive vehicle parameter');
  if(!Number.isFinite(p.frontStaticLoad)||!(p.frontStaticLoad>0&&p.frontStaticLoad<1))throw new Error('Invalid axle load distribution');
  const c=v.capabilities;
  if(c?.drive!=='FWD'||c.gearbox!=='clutch-synchronizer'||c.wheelCount!==4||c.forwardGears!==6||
    c.automaticControl!=='assisted-shifting')throw new Error('Unsupported drivetrain capability');
  if(p.ratios?.['0']!==0||!(p.ratios?.['-1']<0)||
    Object.keys(p.ratios).length!==8||Object.values(p.ratios).some(r=>!Number.isFinite(r))||
    [1,2,3,4,5,6].some(g=>!(p.ratios[g]>0)))
    throw new Error('Six forward ratios, neutral and reverse required');
  if(!Array.isArray(p.torqueMap)||p.torqueMap.length<2||p.torqueMap.some((pair,i)=>
    !Array.isArray(pair)||pair.length!==2||pair.some(n=>!Number.isFinite(n))||pair[0]<0||pair[1]<0||
    (i>0&&pair[0]<=p.torqueMap[i-1][0])))throw new Error('Invalid torque curve');
  if(v.coordinates?.right!=='+X'||v.coordinates.up!=='+Y'||v.coordinates.forward!=='+Z'||
    v.coordinates.origin!=='rigid-body-center-of-mass')throw new Error('Unsupported coordinates');
  if(Object.entries(VEHICLE_UNITS).some(([key,unit])=>v.units?.[key]!==unit))throw new Error('Unit mismatch');
  const a=v.appearance;
  if(a?.kind!=='procedural-legacy'||![1,2,3].includes(a.revision))throw new Error('Unsupported appearance');
  if(!a.body||!Number.isFinite(a.body.centerY)||['width','height','length'].some(key=>!Number.isFinite(a.body[key])||!(a.body[key]>0))||
    !a.hull?.halfExtents||['x','y','z'].some(key=>!Number.isFinite(a.hull.halfExtents[key])||!(a.hull.halfExtents[key]>0))||a.hull.density!==0)
    throw new Error('Invalid body/hull geometry');
  if(!Array.isArray(a.wheels)||a.wheels.length!==4||WHEEL_IDS.some((id,i)=>a.wheels[i]?.id!==id))
    throw new Error('Invalid wheel topology');
  for(const wheel of a.wheels){
    if(!wheel.mount||['x','y','z'].some(axis=>!Number.isFinite(wheel.mount[axis])))
      throw new Error('Invalid wheel mount');
  }
  if(a.revision===2){
    const layout=vehicleLayoutV2(p);
    const sameVector=(u,v)=>u&&['x','y','z'].every(key=>u[key]===v[key]);
    if(Object.keys(layout.body).some(key=>a.body[key]!==layout.body[key])||
      !a.cabin||['width','height','length'].some(key=>a.cabin[key]!==layout.cabin[key])||
      !sameVector(a.cabin.center,layout.cabin.center)||!Array.isArray(a.collisionParts)||a.collisionParts.length!==2||
      layout.colliders.some((part,i)=>a.collisionParts[i]?.id!==part.id||
        !sameVector(a.collisionParts[i].halfExtents,part.halfExtents)||!sameVector(a.collisionParts[i].center,part.center)))
      throw Error('Reference model/collider layout mismatch');
  }
  if(a.revision===3){
    const layout=vehicleLayout(p);
    const equal=(u,v)=>u===v||u&&v&&typeof u==='object'&&typeof v==='object'&&
      Object.keys(u).length===Object.keys(v).length&&Object.keys(u).every(key=>equal(u[key],v[key]));
    if(!equal(a.body,layout.body)||!equal(a.cabin,layout.cabin)||!equal(a.collisionParts,layout.colliders)||
      !equal(a.hull,{halfExtents:layout.colliders[0].halfExtents,center:layout.colliders[0].center,density:0}))
      throw Error('Wheel-well model/collider layout mismatch');
  }
  return v;
}

export function serializeVehicleDefinition(value){
  return JSON.stringify(readVehicleDefinition(value),null,2)+'\n';
}
