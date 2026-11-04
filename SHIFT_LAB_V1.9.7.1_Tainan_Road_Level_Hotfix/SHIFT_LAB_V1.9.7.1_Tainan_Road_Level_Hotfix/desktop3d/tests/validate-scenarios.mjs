import assert from 'node:assert/strict';
import {SCENARIOS,TEST_ORDER,gradeScenario} from './acceptance/scenarios.mjs';
assert.deepEqual(TEST_ORDER,['settle','frontal','glancing','fast','ramp']);
for(const id of TEST_ORDER){
  const c=SCENARIOS[id];assert.ok(c.duration>0&&Number.isFinite(c.speed));
  assert.ok(c.spawnS>0&&c.spawnS<300);
}
const perfect={finite:true,nonFiniteSteps:0,maxPositionAbs:150,maxSpeed:21,maxTiltDeg:5,
  maxWheelContacts:4,validWheelSteps:350,invalidWheelLoads:0,rayHits:1200,
  maxImpactImpulse:800,barrierHits:1,railHits:1,
  forceResetCount:1000,maxExternalForceN:12500,maxExternalTorqueNm:6000,bodyMassKg:1280,
  maxBeyondBarrier:-.8,maxBarrierPenetration:.03,travel:1.5,verticalExcursion:.20,maxRouteS:170};
for(const id of TEST_ORDER){
  const metrics={...perfect,maxSpeed:Math.max(10,SCENARIOS[id].speed)};
  if(id==='settle')metrics.maxSpeed=0;
  const result=gradeScenario(id,metrics);
  assert.ok(result.pass,`${id}: expected synthetic valid telemetry to pass: ${JSON.stringify(result)}`);
  assert.ok(result.checks.length>=4);
  assert.equal(gradeScenario(id,{...metrics,nonFiniteSteps:1}).pass,false);
}
assert.equal(gradeScenario('frontal',{...perfect,barrierHits:0}).pass,false);
assert.equal(gradeScenario('glancing',{...perfect,railHits:0}).pass,false);
assert.equal(gradeScenario('fast',{...perfect,maxBeyondBarrier:12}).pass,false);
assert.equal(gradeScenario('ramp',{...perfect,verticalExcursion:0}).pass,false);
assert.equal(gradeScenario('ramp',{...perfect,maxRouteS:145}).pass,false);
assert.equal(gradeScenario('settle',{...perfect,travel:8}).pass,false);
assert.equal(gradeScenario('settle',{...perfect,rayHits:0}).pass,false);
assert.equal(gradeScenario('settle',{...perfect,validWheelSteps:0}).pass,false);
assert.equal(gradeScenario('ramp',{...perfect,invalidWheelLoads:1}).pass,false);
assert.equal(gradeScenario('settle',{...perfect,forceResetCount:0}).pass,false);
assert.equal(gradeScenario('ramp',{...perfect,maxExternalForceN:999999}).pass,false);
console.log('PASS scenario definitions and fail-safe QA gates (14 assertions+)');
