import assert from 'node:assert/strict';
import {REFERENCE_MAP,DEFAULT_MAP,MAP_FIELDS,MAP_SCHEMA,MAP_SCHEMA_V1,
  normalizeMapConfig,readMapDocument,serializeMap,sameMap,makeMapSeed,describeRoute} from '../src/procedural-map.mjs';
const config=normalizeMapConfig({...REFERENCE_MAP,seed:'  TEST-ROAD  ',turnChance:123,maxGrade:-2});
assert.equal(config.seed,'TEST-ROAD');
assert.equal(config.generator,1);
assert.equal(config.turnChance,100);
assert.equal(config.maxGrade,3);
assert.equal(config.hairpinChance,REFERENCE_MAP.hairpinChance);
assert.equal(DEFAULT_MAP.generator,3);
assert.equal(MAP_SCHEMA,'shiftlab.road.v3');
assert.ok(sameMap(config,{...config}));
assert.equal(sameMap(config,{...config,seed:'other'}),false);
assert.equal(sameMap(config,{...config,generator:2}),false);
assert.deepEqual(readMapDocument(JSON.parse(serializeMap(config))),config);
// A historical v1 file without an explicit generator inside config must load
// as v1, not silently change its seed-to-road mapping.
const original={...config};delete original.generator;
assert.deepEqual(readMapDocument({schema:MAP_SCHEMA_V1,generator:1,config:original}),config);
const v3={...config,generator:3};
assert.deepEqual(readMapDocument(JSON.parse(serializeMap(v3))),v3);
const v2={...config,generator:2};
assert.deepEqual(readMapDocument(JSON.parse(serializeMap(v2))),v2);
assert.throws(()=>readMapDocument({schema:'other',generator:1,config}),/只接受/);
assert.throws(()=>readMapDocument({schema:'shiftlab.road.v1',generator:2,config}),/只接受/);
assert.throws(()=>readMapDocument({schema:'shiftlab.road.v1',generator:1,config:{...config,generator:2}}),/不一致/);
assert.throws(()=>readMapDocument({schema:'shiftlab.road.v1',generator:1,config:{...config,seed:''}}),/種子/);
assert.throws(()=>readMapDocument({schema:'shiftlab.road.v1',generator:1,config:{...config,turnChance:Infinity}}),/有限/);
assert.throws(()=>readMapDocument({schema:'shiftlab.road.v1',generator:1,config:{...config,upBias:'50'}}),/有限/);
assert.throws(()=>normalizeMapConfig({...v2,generator:'2'},true),/不支援/);
assert.equal(MAP_FIELDS.length,6);
assert.equal(makeMapSeed({getRandomValues(a){a[0]=0x12345678;}}),'ROAD-12345678');
assert.deepEqual(describeRoute({config,points:[{s:0},{s:1234}],segments:[
  {type:'straight',gradeTarget:0},{type:'hairpin-left',gradeTarget:4},{type:'right',gradeTarget:-3}
]}),{generator:1,seed:'TEST-ROAD',distanceKm:1.2,bends:2,hairpins:1,
  climbs:1,descents:1,quality:null});
console.log('PASS V3 schema/defaults with frozen v1/v2 import/export compatibility');
