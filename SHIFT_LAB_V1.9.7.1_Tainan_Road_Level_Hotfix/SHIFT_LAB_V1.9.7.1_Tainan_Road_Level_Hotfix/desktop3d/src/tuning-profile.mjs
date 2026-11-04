import {readVehicleDefinition,captureLegacyVehicle} from './vehicle-definition.mjs';
import {readDesignData,requireKeys,requireText,inRange,designFingerprint} from './design-data.mjs';

export const TUNING_SCHEMA='shiftlab.tuning.v1';
// Gameplay validation envelopes, not manufacturer or measured safe limits.
// Applying a prepared result remains the host's responsibility.
const rule=(unit,min,max,apply)=>Object.freeze({unit,min,max,apply,basis:'gameplay-validation-envelope'});
export const TUNING_RULES=Object.freeze({
  mass:rule('kg',600,3500,'rebuild'),wheelRadius:rule('m',.2,.5,'rebuild'),
  wheelbase:rule('m',2,3.8,'rebuild'),trackFront:rule('m',1.2,2.1,'rebuild'),
  trackRear:rule('m',1.2,2.1,'rebuild'),cgHeight:rule('m',.3,.9,'rebuild'),
  frontStaticLoad:rule('ratio',.35,.75,'rebuild'),
  pitchInertia:rule('kg*m^2',400,9000,'rebuild'),yawInertia:rule('kg*m^2',500,10000,'rebuild'),
  rollInertia:rule('kg*m^2',150,2500,'rebuild'),
  springFront:rule('N/m',10000,120000,'reset'),springRear:rule('N/m',10000,120000,'reset'),
  damperFront:rule('N*s/m',500,12000,'reset'),damperRear:rule('N*s/m',500,12000,'reset'),
  bumpTravel:rule('m',.04,.25,'reset'),droopTravel:rule('m',.04,.3,'reset'),
  antiRollFront:rule('N/m',0,30000,'reset'),antiRollRear:rule('N/m',0,30000,'reset'),
  frontBrakeBias:rule('ratio',.5,.85,'live'),maxBrakeForce:rule('N',3000,22000,'reset'),
  frontGripScale:rule('ratio',.7,1.3,'reset'),rearGripScale:rule('ratio',.7,1.3,'reset'),
  diffLockNm:rule('N*m',0,1500,'reset'),finalDrive:rule('ratio',2,6,'reset')
});
export function makeTuningProfile(base,name='原廠設定'){
  const v=readVehicleDefinition(base);requireText(name,'tuning name');
  return {schema:TUNING_SCHEMA,revision:1,name,base:{id:v.id,revision:v.revision,
    fingerprint:designFingerprint(v.physics)},overrides:{}};
}
export function readTuningProfile(input){
  const p=readDesignData(input);
  requireKeys(p,['schema','revision','name','base','overrides'],'tuning');
  if(p.schema!==TUNING_SCHEMA||p.revision!==1)throw Error('Unsupported tuning version');
  requireText(p.name,'tuning name');requireKeys(p.base,['id','revision','fingerprint'],'base');
  requireText(p.base.id,'base id');
  if(p.base.revision!==1||typeof p.base.fingerprint!=='string'||!/^[0-9a-f]{8}$/.test(p.base.fingerprint))throw Error('Invalid tuning base');
  requireKeys(p.overrides,[...Object.keys(TUNING_RULES),'ratios'],'override');
  for(const [key,value] of Object.entries(p.overrides)){
    if(key==='ratios'){
      requireKeys(value,['-1','0','1','2','3','4','5','6'],'ratios');
      if(Object.keys(value).length!==8||value[0]!==0)throw Error('Six forward gears required');
      inRange(value[-1],-6,-1,'reverse ratio');
      for(let i=1;i<=6;i++){inRange(value[i],.35,6,'forward ratio');
        if(i>1&&value[i]>=value[i-1])throw Error('Ratios must decrease in higher gears');}
    }else{const r=TUNING_RULES[key];inRange(value,r.min,r.max,key);}
  }
  return p;
}
export function prepareTuning(base,input){
  const v=readVehicleDefinition(base),profile=readTuningProfile(input);
  if(profile.base.id!==v.id||profile.base.revision!==v.revision||profile.base.fingerprint!==designFingerprint(v.physics))
    throw Error('Tuning baseline changed; explicit migration required');
  const changes=Object.entries(profile.overrides).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(v.physics[key]));
  let apply='live';
  for(const [key] of changes){const mode=key==='ratios'?'reset':TUNING_RULES[key].apply;
    if(mode==='rebuild'||(mode==='reset'&&apply==='live'))apply=mode;}
  const params={...v.physics,...profile.overrides};
  // Recalculate mounts and legacy hull from the proposed geometry as one unit.
  const vehicle=captureLegacyVehicle(v.id,params);
  if(params.wheelRadius>=params.cgHeight+params.bumpTravel)throw Error('Wheel radius conflicts with ride height/travel');
  return {profile,vehicle,apply,changes:changes.map(([key,value])=>({key,before:v.physics[key],after:value})),
    requiresStopped:apply!=='live',requiresChassisRebuild:apply==='rebuild'};
}
