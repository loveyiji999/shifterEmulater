import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {captureLegacyVehicle,readVehicleDefinition,serializeVehicleDefinition,VEHICLE_IDS} from '../src/vehicle-definition.mjs';

// Execute the real preset declarations and parameter resolver, not a duplicate
// set of fixture values. Test both existing reference-calibration modes.
const source=readFileSync(new URL('../public/physics.html',import.meta.url),'utf8');
const declarations=source.slice(source.indexOf('const P = {'),source.indexOf('const REAL_OBD_BENCHMARK='));
const fits=source.match(/const REFERENCE_FITS=([^\n]+);/)[0];
const resolver=source.slice(source.indexOf('function vehicleParams(id){'),source.indexOf('\nfunction ',source.indexOf('function vehicleParams(id){')+1));
const context=vm.createContext({});
vm.runInContext(declarations+'\n'+fits+'\nconst referenceCalibration={enabled:false};\n'+resolver+
  '\nglobalThis.resolve=(id,enabled)=>{referenceCalibration.enabled=enabled;return vehicleParams(id);};',context);
let cases=0;
for(const enabled of [false,true])for(const id of VEHICLE_IDS){
  const p=JSON.parse(JSON.stringify(context.resolve(id,enabled)));
  const before=JSON.stringify(p),v=captureLegacyVehicle(id,p);
  assert.equal(JSON.stringify(p),before,'capture must preserve source parameters');
  assert.deepEqual(v.physics,p,'all effective solver values preserved');
  assert.deepEqual(readVehicleDefinition(serializeVehicleDefinition(v)),v,'save/load exact roundtrip');
  assert.equal(v.appearance.wheels[0].mount.x,-p.trackFront/2);
  assert.equal(v.appearance.wheels[3].mount.z,-p.wheelbase*p.frontStaticLoad);
  const detached=readVehicleDefinition(v);detached.physics.ratios[1]=99;
  assert.notEqual(v.physics.ratios[1],99,'no shared nested data');
  const invalid=[x=>x.schema='shiftlab.vehicle.v2',x=>x.physics.mass=-1,
    x=>x.physics.mass='1200',x=>x.physics.wheelRadius=NaN,
    x=>x.physics.frontStaticLoad=1,x=>x.physics.ratios[0]=1,
    x=>x.physics.ratios[6]=null,x=>x.physics.torqueMap[1][0]=0,
    x=>x.physics.torqueMap[1][1]='100',x=>x.units.mass='lb',
    x=>x.capabilities.drive='AWD',x=>x.appearance.wheels.pop(),
    x=>x.appearance.wheels[0].mount.y=Infinity,x=>x.appearance.hull.density=1000];
  for(const mutate of invalid){const bad=structuredClone(v);mutate(bad);
    assert.throws(()=>readVehicleDefinition(bad));assert.equal(JSON.stringify(p),before);cases++;}
}
assert.throws(()=>readVehicleDefinition('{"__proto__":{"polluted":true}}'));
assert.equal({}.polluted,undefined);
assert.throws(()=>captureLegacyVehicle('unknown',{}));
console.log(`PASS vehicle contracts: 4 presets x 2 calibration modes, exact parameter preservation, roundtrip, ${cases} invalid imports rejected`);
