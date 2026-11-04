import {assertColliderTriangles} from './collider-geometry-check.mjs';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import {RoadWorld} from '../src/road.mjs';
import {fixture,base} from './road-v3-fixture.mjs';
import {writeFileSync} from 'node:fs';
await RAPIER.init();
const reports=[],types=new Set();let sampleCount=0,portalCount=0;
for(const seed of ['LEVEL-1','LEVEL-0','LEVEL-2']){
  console.log('Engineering route: '+seed);
  const core=fixture({...base,seed},48),before=JSON.stringify(core.route.v3State);
  const world=new RAPIER.World({x:0,y:-9.81,z:0}),scene=new THREE.Scene(),road=new RoadWorld(RAPIER,world,scene,core);
  const hit=(x,y,z,direction,max,filter)=>world.castRayAndGetNormal(new RAPIER.Ray({x,y,z},direction),max,true,
    undefined,undefined,undefined,undefined,filter);
  const seen=new Set();
  for(const feature of core.route.v3State.features){
    for(const s of [feature.start,(feature.start+feature.end)/2,feature.end]){
      road.ensure(s);world.step();
      const components=[...road.chunks.values()].flatMap(c=>c.components);
      for(const f of components.filter(f=>f.kind==='foundation')){
        const key=f.supportKind+':'+f.s+':'+f.l;if(seen.has(key))continue;
        if(f.groundSamples.some(p=>!road.terrain.tiles.has(p.tx+','+p.tz)))continue;
        seen.add(key);types.add(f.supportKind);
        assert.ok(f.topY>f.footTop&&f.footTop>f.bottom);
        let maximumError=0;
        for(const point of f.groundSamples){
          const floor=hit(point.x,point.y+1,point.z,{x:0,y:-1,z:0},3,c=>road.groundHandles.has(c.handle));
          assert.ok(floor,'foundation ground must be physically loaded');
          const y=point.y+1-floor.timeOfImpact,error=Math.abs(y-point.y);maximumError=Math.max(error,maximumError);
          assert.ok(error<.001,'foundation source must match actual terrain face '+JSON.stringify({seed,s:f.s,kind:f.supportKind,point,y,error,contact:road.surfaceAtHit(floor)}));
          assert.ok(f.bottom<=y-.49,'footing bottom must be embedded across its footprint');sampleCount++;
        }
        // Approach a column sideways at its midpoint, querying only structures.
        // Towers span the deck elevation; query their exposed upper column so
        // an intervening bridge slab is not mistaken for a wrong column face.
        const height=f.footTop+(f.topY-f.footTop)*(f.supportKind==='tower'?.7:.37),c=Math.cos(f.heading),sin=Math.sin(f.heading),along=f.hz*.23;
        const side=hit(f.x+c*(f.hx+2)+sin*along,height,f.z-sin*(f.hx+2)+c*along,{x:-c,y:0,z:sin},3,
          collider=>road.barrierHandles.has(collider.handle));
        assert.ok(side,'visible support must have actual collision '+JSON.stringify({seed,kind:f.supportKind,s:f.s,l:f.l,x:f.x,z:f.z,height,footTop:f.footTop,topY:f.topY}));
        assert.ok(Math.abs(side.timeOfImpact-2)<.02,'support collision differs from its visible extent '+JSON.stringify({seed,s:f.s,kind:f.supportKind,l:f.l,toi:side.timeOfImpact,height,footTop:f.footTop,top:f.topY}));
        reports.push({seed,kind:f.supportKind,s:f.s,l:f.l,maximumGroundErrorM:maximumError,
          bottom:f.bottom,footTop:f.footTop,top:f.topY});
      }
    }
    if(feature.kind==='tunnel'){
      const s=(feature.start+feature.end)/2;road.ensure(s);world.step();const p=road.position(s,0);
      for(const chunk of road.chunks.values())for(const mesh of chunk.objects)if(mesh.userData.surfaceLayerId?.endsWith(':cover')){
        const normals=mesh.geometry.attributes.normal.array;
        for(let i=1;i<normals.length;i+=3)assert.ok(normals[i]>0,'tunnel soil must render from above');
      }
      const cover=hit(p.x,p.y+30,p.z,{x:0,y:-1,z:0},35,c=>road.groundHandles.has(c.handle));
      assert.ok(cover);assert.equal(road.surfaceAtHit(cover).material,'earth','tunnel soil must be a distinct natural ground surface');
      assert.ok(p.y+30-cover.timeOfImpact>=p.y+core.roadDesign.tunnelHeight+.8);
      const ceiling=hit(p.x,p.y+1,p.z,{x:0,y:1,z:0},15,c=>road.barrierHandles.has(c.handle));
      assert.ok(ceiling&&ceiling.timeOfImpact+1>=core.roadDesign.clearance,'cover must preserve design lane clearance '+JSON.stringify({seed,feature,p,toi:ceiling?.timeOfImpact}));
      for(const [portal,direction] of [[feature.start,1],[feature.end,-1]]){
        road.ensure(portal);world.step();
        for(const lateral of [-3.4,0,3.4]){
          const q=road.position(portal-direction*1,lateral),target=road.position(portal+direction*1,lateral);
          const vector={x:target.x-q.x,y:target.y-q.y,z:target.z-q.z},L=Math.hypot(vector.x,vector.y,vector.z);
          const wall=hit(q.x,q.y+1.2,q.z,{x:vector.x/L,y:vector.y/L,z:vector.z/L},L,
            collider=>road.barrierHandles.has(collider.handle));
          assert.equal(wall,null,'portal face or wing wall obstructs a driving lane');
        }
        portalCount++;
      }
    }
  }
  assert.equal(JSON.stringify(core.route.v3State),before,'engineering must not alter seeded route');
  for(const chunk of road.chunks.values()){
    const physical=chunk.colliders.map(x=>x.collider),rendered=chunk.objects.filter(m=>!m.userData.nonPhysicalFinish);
    assertColliderTriangles(rendered,physical);
  }
  road.clear();road.assertClean();assert.equal(world.colliders.len(),0);assert.equal(scene.children.length,0);world.free();
}
for(const kind of ['pier','abutment','tower','anchorage'])assert.ok(types.has(kind),'unexercised support type '+kind);
assert.ok(portalCount>=6&&sampleCount>=100);
writeFileSync(new URL('../../artifacts/tests/p2-engineering-latest.json',import.meta.url),JSON.stringify({
  pass:true,scope:'three seeded V3 routes; actual terrain and structural collision, not civil engineering certification',
  foundations:reports.length,groundQueries:sampleCount,portalChecks:portalCount,reports},null,2)+'\n');
console.log(`PASS V3 engineering: ${reports.length} foundations, ${sampleCount} actual ground samples, ${portalCount} portals; shared mesh, unchanged route and zero residue`);
