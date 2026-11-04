import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {RoadWorld} from '../src/road.mjs';
import {fixture,base} from './road-v3-fixture.mjs';
import {valleyDepth} from '../src/terrain-profile.mjs';
import {writeFileSync} from 'node:fs';
await RAPIER.init();const reports=[];
for(const seed of ['LEVEL-1','LEVEL-2']){
  const core=fixture({...base,seed},48),before=JSON.stringify(core.route.v3State),f=core.route.v3State.features.filter(f=>f.kind==='suspension').at(-1);
  assert.ok(f);assert.equal(valleyDepth(f,f.start),1.2000000000000002);assert.equal(valleyDepth(f,f.end),valleyDepth(f,f.start));
  assert.equal(valleyDepth(f,f.start+32),18);assert.equal(valleyDepth(f,f.end-32),18);
  const world=new RAPIER.World({x:0,y:-9.81,z:0}),road=new RoadWorld(RAPIER,world,new THREE.Scene(),core);
  road.ensure(f.end);world.step();
  const anchors=[...road.chunks.values()].flatMap(c=>c.components).filter(c=>c.kind==='foundation'&&c.supportKind==='anchorage'&&c.s===f.end);
  assert.equal(anchors.length,2);
  const ranges=anchors.map(a=>Math.max(...a.groundSamples.map(p=>p.y))-Math.min(...a.groundSamples.map(p=>p.y)));
  assert.ok(ranges.every(v=>v<3),'abutment transition must not retain the old 18m step inside an anchorage footprint');
  let previous=null,maximumStep=0;
  for(let offset=-40;offset<=20;offset+=.5){
    const p=road.position(f.end+offset,9),q=road.terrain.surfaceAt(p.x,p.z);assert.ok(q);
    if(previous)maximumStep=Math.max(maximumStep,Math.abs(q.y-previous.y));previous=q;
  }
  assert.ok(maximumStep<.75,'soil transition has an abrupt half-metre sampling jump: '+maximumStep);
  assert.equal(JSON.stringify(core.route.v3State),before);
  reports.push({seed,anchorGroundRangesM:ranges,maximumHalfMeterStepM:maximumStep});
  road.clear();road.assertClean();world.free();
}
writeFileSync(new URL('../../artifacts/tests/p2-grading-2026-10-29.json',import.meta.url),JSON.stringify({pass:true,reports},null,2)+'\n');
console.log('PASS actual bridge-end grading and anchorage terrain range: '+JSON.stringify(reports));
