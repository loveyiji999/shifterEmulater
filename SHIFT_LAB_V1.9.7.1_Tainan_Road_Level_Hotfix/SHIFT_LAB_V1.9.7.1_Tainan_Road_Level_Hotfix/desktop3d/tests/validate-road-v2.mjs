import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../public/road-generator-v2.js',import.meta.url),'utf8'),context);
const road=context.SHIFT_ROAD_V2;
assert.equal(road.version,2);
const base={generator:2,seed:'ROAD-V2-QA',turnChance:58,hairpinChance:20,
  slopeChance:52,leftBias:50,upBias:50,maxGrade:9};
const generated=(config,count=96)=>{const state=road.create(config);road.extend(state,count);return state;};
const fingerprint=state=>state.points.filter((_,i)=>i%13===0).map(p=>
  [p.s,p.x,p.y,p.z,p.heading].map(v=>v.toFixed(5)).join(':')).join('|');
const a=generated(base),b=generated(base);
assert.equal(fingerprint(a),fingerprint(b));
const chunked=road.create(base);
road.extend(chunked,12);road.extend(chunked,84);
assert.equal(fingerprint(a),fingerprint(chunked),'incremental road extension must match single-pass');
const longRoute=generated(base,168);
const extended=generated(base,96);road.extend(extended,36);road.extend(extended,36);
assert.equal(fingerprint(longRoute),fingerprint(extended),'36-section streaming extension must be reproducible');
assert.equal(road.audit(extended).ok,true,'streamed extension may not cross older roads');
assert.equal(a.segments.length,96);
assert.ok(a.segments.some(s=>s.type.includes('hairpin')),'reference route contains genuine hairpins');
assert.ok(a.segments.some(s=>s.type!=='straight'));
assert.ok(road.audit(a).ok);
assert.throws(()=>road.create({...base,generator:1}),/generator/);
assert.throws(()=>road.extend(a,1001),/count/);
const tampered=generated(base,10);
// Inject a non-neighbor overlap to prove the auditor does not simply trust
// the route planner's success flag.
Object.assign(tampered.points.at(-1),{x:tampered.points[1].x,z:tampered.points[1].z});
assert.equal(road.audit(tampered).ok,false);
const stress=process.argv.includes('--stress');
const seeds=stress?1000:80;
let maxGrade=0,peakCurvature=0,hairpinRoutes=0,maxTotal=0;
const begin=Date.now();
for(let n=0;n<seeds;n++){
  // Mix ordinary, narrow steering bias, long straight, all hairpins,
  // maximum slope, and low slope, so a 1000-seed run covers much more
  // than one set of hand-picked defaults.
  const pattern=n%6;
  const config={...base,seed:'BATCH-'+String(n).padStart(5,'0'),
    ...(pattern===1?{turnChance:100,hairpinChance:100,leftBias:100}:{}),
    ...(pattern===2?{turnChance:100,hairpinChance:100,leftBias:0}:{}),
    ...(pattern===3?{turnChance:0,hairpinChance:0}:{}),
    ...(pattern===4?{slopeChance:100,maxGrade:12,upBias:100}:{}),
    ...(pattern===5?{slopeChance:100,maxGrade:3,upBias:0}:{})};
  const state=generated(config);
  const report=road.audit(state);
  assert.equal(report.ok,true,config.seed+': '+report.errors.join('; '));
  assert.equal(report.segments,96);
  assert.ok(report.distanceMeters>10000);
  assert.equal(report.rejectedCandidates,0);
  assert.ok(report.maxCurvatureRadPerMeter<=road.limits.maxCurvatureRadPerMeter+1e-6);
  assert.ok(report.maxGradePercent<=config.maxGrade+1e-6);
  maxGrade=Math.max(maxGrade,report.maxGradePercent);
  peakCurvature=Math.max(peakCurvature,report.maxCurvatureRadPerMeter);
  maxTotal=Math.max(maxTotal,report.distanceMeters);
  if(state.segments.some(seg=>seg.type.includes('hairpin')))hairpinRoutes++;
}
assert.ok(hairpinRoutes>seeds*.5);
console.log('PASS v1.9.0 road v2: '+seeds+' seeds / 96 segments each / '+hairpinRoutes+
  ' routes with hairpins / deterministic extension / geometric audit / '+(Date.now()-begin)+' ms');
console.log('Quality: max grade '+maxGrade.toFixed(2)+'%, max curvature '+peakCurvature.toFixed(5)+
  ' rad/m, longest generated '+(maxTotal/1000).toFixed(1)+' km');
