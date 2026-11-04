import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../public/road-generator-v3.js',import.meta.url),'utf8'),context);
const road=context.SHIFT_ROAD_V3;
const base={generator:3,seed:'V3-NATURAL-ROAD',turnChance:58,hairpinChance:20,
  slopeChance:52,leftBias:50,upBias:50,maxGrade:9};
const make=(config,count=96)=>{const state=road.create(config);road.extend(state,count);return state;};
const geometry=state=>JSON.stringify({points:state.points,segments:state.segments});
const fingerprint=state=>JSON.stringify({points:state.points,segments:state.segments,junctions:state.junctions,features:state.features,crossings:state.crossings,terrain:state.terrainFeatures});
const a=make(base),b=make(base);
assert.equal(road.version,3);assert.equal(fingerprint(a),fingerprint(b));
const chunked=road.create(base);
for(const n of [1,7,4,36,48])road.extend(chunked,n);
assert.equal(fingerprint(a),fingerprint(chunked),'request sizes must not change committed geometry');
const prefix=geometry(a),terrainPrefix=JSON.stringify(a.terrainFeatures),long=make(base,168);
road.extend(a,36);road.extend(a,36);
assert.equal(fingerprint(a),fingerprint(long),'streaming extends exactly the same route');
assert.equal(JSON.stringify({points:a.points.slice(0,b.points.length),segments:a.segments.slice(0,96)}),prefix);
assert.equal(JSON.stringify(a.terrainFeatures.slice(0,b.terrainFeatures.length)),terrainPrefix,'committed gorge/bore geometry must remain reserved');
assert.ok(road.audit(a).ok);
const bends=b.segments.slice(1).filter(s=>s.type!=='straight');
let cancellations=0,sameDirection=0;
for(let i=1;i<bends.length;i++){
  if(Math.abs(bends[i].turnDeg+bends[i-1].turnDeg)<1e-6)cancellations++;
  if(Math.sign(bends[i].turnDeg)===Math.sign(bends[i-1].turnDeg))sameDirection++;
}
assert.ok(cancellations<bends.length*.1,'no recurring opposite-angle pairs');
assert.ok(sameDirection>2,'route must allow consecutive independent bends in one direction');
assert.ok(b.segments.slice(1).filter(s=>Math.abs(s.headingStart)>.1).length>60,'no feature-by-feature north reset');
assert.ok(road.audit(b).nonzeroCurvatureJoins>25,'curvature must carry through segment joins');
assert.ok(new Set(b.segments.map(s=>Math.round(s.length/10))).size>15,'varied section lengths');
assert.throws(()=>road.create({...base,generator:2}),/generator/);
assert.throws(()=>road.create({...base,maxGrade:NaN}),/parameter/);
const saved=fingerprint(b);assert.throws(()=>road.extend(b,1001),/count/);assert.equal(fingerprint(b),saved);
const damaged=make(base,12);
Object.assign(damaged.points.at(-1),{x:damaged.points[2].x,z:damaged.points[2].z});
assert.equal(road.audit(damaged).ok,false,'auditor must detect an injected nonlocal crossing');
const sharp=make(base,12);sharp.points[8].curvature=.5;
assert.equal(road.audit(sharp).ok,false,'auditor must independently reject excessive curvature');
const joins=make(base,12);joins.segments[4].curvatureStart+=.1;
assert.equal(road.audit(joins).ok,false,'auditor must reject a damaged join');
if(process.argv.includes('--determinism')){console.log('PASS V3 deterministic centerline, topology, structures, reserved terrain and transactional/tamper checks');process.exit(0);}
const seeds=process.argv.includes('--stress')?200:48;
const begin=Date.now();let rejected=0,minGap=Infinity,maxGrade=0,maxCurvature=0;
for(let n=0;n<seeds;n++){
  const variants=[{},
    {turnChance:100,hairpinChance:100,leftBias:100},
    {turnChance:100,hairpinChance:100,leftBias:0},
    {turnChance:0,hairpinChance:0,slopeChance:0},
    {slopeChance:100,maxGrade:12,upBias:100},
    {slopeChance:100,maxGrade:3,upBias:0}];
  const config={...base,...variants[n%variants.length],seed:'V3-BATCH-'+n};
  const state=make(config),report=road.audit(state);
  assert.ok(report.ok,config.seed+': '+report.errors.join('; '));
  assert.equal(report.segments,96);
  for(const kind of ['bridge','underpass']){
    const ranges=state.features.filter(f=>f.kind===kind);
    for(let i=1;i<ranges.length;i++)assert.ok(ranges[i].start>ranges[i-1].end,'structure ranges must merge transitively');
  }
  assert.ok(report.distanceMeters>10000);
  assert.ok(report.maxGradePercent<=config.maxGrade+1e-6);
  assert.ok(report.maxCurvatureRadPerMeter<=road.limits.maxCurvatureRadPerMeter+1e-6);
  if(config.turnChance===0)assert.ok(state.points.every(p=>p.curvature===0));
  // Zero random slope still allows engineered grade-separated approaches.
  if(config.slopeChance===0&&config.turnChance===0)assert.ok(state.points.every(p=>p.grade===0&&p.y===0));
  rejected+=report.rejectedCandidates;minGap=Math.min(minGap,report.minNonlocalDistanceMeters??Infinity);
  maxGrade=Math.max(maxGrade,report.maxGradePercent);maxCurvature=Math.max(maxCurvature,report.maxCurvatureRadPerMeter);
  if(n%12===11)console.log('V3 geometry: '+(n+1)+'/'+seeds+' seeds passed');
}
assert.ok(rejected>0,'geometric rejection/retry must actually be exercised');
console.log('PASS V3: '+seeds+' seeds × 96 sections, naturalness regressions, exact streaming, tamper checks');
console.log(JSON.stringify({minGap,maxGrade,maxCurvature,rejectedCandidates:rejected,elapsedMs:Date.now()-begin}));
