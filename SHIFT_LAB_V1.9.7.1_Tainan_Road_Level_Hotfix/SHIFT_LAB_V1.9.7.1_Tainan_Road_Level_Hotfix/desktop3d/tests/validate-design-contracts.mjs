import assert from 'node:assert/strict';
import {readDesignData,designFingerprint} from '../src/design-data.mjs';
import {captureLegacyVehicle,VEHICLE_IDS} from '../src/vehicle-definition.mjs';
import {makeTuningProfile,readTuningProfile,prepareTuning,TUNING_RULES} from '../src/tuning-profile.mjs';
import {makeAppearanceAssembly,readAppearanceAssembly,appearanceImpact} from '../src/appearance-assembly.mjs';
import {MATERIAL_IDS,CONDITION_IDS,readSurfaceDefinition,requireDrivableSurface,readSurfaceBinding} from '../src/surface-definition.mjs';
import {vehicleParams} from './vehicle-core-fixture.mjs';

let checks=0;
const rejects=(value,mutate,read)=>{const bad=structuredClone(value);mutate(bad);assert.throws(()=>read(bad));checks++;};
for(const enabled of [false,true])for(const id of VEHICLE_IDS){
  const base=captureLegacyVehicle(id,vehicleParams(id,enabled)),original=JSON.stringify(base);
  const tune=makeTuningProfile(base),appearance=makeAppearanceAssembly(base);
  assert.deepEqual(prepareTuning(base,tune).vehicle,base);
  assert.deepEqual(readTuningProfile(JSON.stringify(tune)),tune);
  assert.deepEqual(readAppearanceAssembly(JSON.stringify(appearance),base),appearance);
  assert.equal(appearanceImpact(appearance,base).requiresChassisRebuild,false);
  assert.equal(prepareTuning(base,{...tune,overrides:{frontBrakeBias:.7}}).apply,'live');
  for(const [key,r] of Object.entries(TUNING_RULES)){
    const value=(r.min+r.max)/2;
    // Individual candidates preserve every other original parameter.
    const t={...tune,overrides:{[key]:value}},prepared=prepareTuning(base,t);
    assert.equal(prepared.vehicle.physics[key],value);
    if(value!==base.physics[key])assert.equal(prepared.apply,r.apply);
    if(r.apply==='rebuild'&&value!==base.physics[key])assert.equal(prepared.requiresChassisRebuild,true);
    rejects(tune,x=>x.overrides[key]=r.max+1,readTuningProfile);
    rejects(tune,x=>x.overrides[key]='1',readTuningProfile);
  }
  const geometry=prepareTuning(base,{...tune,overrides:{trackFront:1.8,wheelbase:3,mass:1600}});
  assert.equal(geometry.vehicle.appearance.wheels[0].mount.x,-.9);
  const body=geometry.vehicle.appearance.body;
  assert.ok(body.centerZ-body.length/2<geometry.vehicle.appearance.wheels[3].mount.z-.3,
    'body must retain rear overhang beyond the wheel envelope');
  const changed=structuredClone(base);changed.physics.mass+=1;
  assert.throws(()=>prepareTuning(changed,tune));
  assert.throws(()=>readAppearanceAssembly(appearance,changed));
  for(const mutate of [x=>x.overrides.velocity=20,x=>x.overrides.gear=3,
    x=>x.overrides.ratios={'-1':-3,0:0,1:4,2:2,3:1.5,4:1.1,5:.8,6:.9},
    x=>x.overrides.ratios={'-1':-3,0:0,1:4}])rejects(tune,mutate,readTuningProfile);
  for(const mutate of [x=>x.paint.body.roughness=2,x=>x.shape.widthScale=2,
    x=>x.base.id='other',x=>x.parts.push({id:'bad',mount:'fifth-wheel'}),
    x=>x.decals.push({id:'text',slot:'body',text:'x',color:'#ffffff',u:2,v:.5,scale:.1,rotation:0})])
    rejects(appearance,mutate,x=>readAppearanceAssembly(x,base));
  const shaped=structuredClone(appearance);shaped.shape.widthScale=1.1;
  assert.equal(appearanceImpact(shaped,base).requiresChassisRebuild,true);
  const part={id:'front-part',mount:'front-bumper',massDeltaKg:2,collision:'rebuild-hull',asset:{
    id:'bumper',revision:1,file:'bumper.glb',bytes:1024,vertices:120,triangles:60,textures:[],
    metersPerUnit:1,upAxis:'+Y',forwardAxis:'+Z',
    source:'local authored test fixture',license:'user-authored',author:'SHIFT LAB'}};
  const assembled={...appearance,parts:[part]};
  assert.equal(appearanceImpact(assembled,base).massDeltaKg,2);
  for(const mutate of [x=>x.parts[0].asset.file='https://example.com/x.glb',
    x=>x.parts[0].asset.file='../x.glb',x=>x.parts[0].asset.vertices=900000,
    x=>x.parts[0].asset.license=null,x=>x.parts.push(structuredClone(x.parts[0]))])
    rejects(assembled,mutate,x=>readAppearanceAssembly(x,base));
  assert.equal(JSON.stringify(base),original,'preparation and failures never mutate live baseline');
}
for(const material of MATERIAL_IDS)for(const condition of CONDITION_IDS){
  const s={schema:'shiftlab.surface.v1',revision:1,id:material+'-'+condition,material,condition,
    pbr:{color:'#445566',roughness:.8,metalness:0,uvMeters:2},contact:null,
    evidence:{basis:'candidate',source:'unmeasured material preview',status:'preview-only'}};
  assert.deepEqual(readSurfaceDefinition(JSON.stringify(s)),s);
  assert.throws(()=>requireDrivableSurface(s));
  rejects(s,x=>x.pbr.roughness=3,readSurfaceDefinition);
  rejects(s,x=>x.contact={tireMu:NaN,rollingCoefficient:.014,colliderFriction:.65},readSurfaceDefinition);
  rejects(s,x=>x.evidence.status='verified-gameplay',readSurfaceDefinition);
}
const binding={colliderHandle:.0001,faceIndex:2,layerId:'overpass-1',surfaceId:'asphalt-dry'};
const baseline={schema:'shiftlab.surface.v1',revision:1,id:'legacy-asphalt-dry',material:'asphalt_dense',condition:'dry',
  pbr:{color:'#344149',roughness:.93,metalness:0,uvMeters:2},
  contact:{tireMu:vehicleParams('standard').surfaces.dry.mu,rollingCoefficient:.014,colliderFriction:.65},
  evidence:{basis:'legacy-illustrative',source:'existing core baseline; not measured tire data',status:'verified-gameplay'}};
const trusted=new Map([[baseline.id,designFingerprint(baseline)]]);
assert.deepEqual(requireDrivableSurface(baseline,trusted),baseline);
assert.throws(()=>requireDrivableSurface(baseline));
assert.throws(()=>requireDrivableSurface({...baseline,contact:{...baseline.contact,tireMu:.1}},trusted));
assert.deepEqual(readSurfaceBinding(binding),binding);
assert.throws(()=>readSurfaceBinding({...binding,layerId:null}));
assert.equal(designFingerprint({a:1,b:2}),designFingerprint({b:2,a:1}));
assert.throws(()=>readDesignData('{"__proto__":{"bad":1}}'));
assert.throws(()=>readDesignData({x:Infinity}));
let nested={};for(let i=0;i<30;i++)nested={nested};assert.throws(()=>readDesignData(nested));
const accessor={};Object.defineProperty(accessor,'x',{get(){throw Error('Accessor executed');}});
assert.throws(()=>readDesignData(accessor),/Unsafe design property/);
const arrayAccessor=[];Object.defineProperty(arrayAccessor,0,{get(){throw Error('Accessor executed');}});
assert.throws(()=>readDesignData(arrayAccessor),/Unsafe design array/);
console.log(`PASS design contracts: 8 real preset baselines; ${checks} invalid documents rejected; 60 preview surfaces; stale baselines, apply modes, geometry mounts, asset budgets and atomic preparation`);
