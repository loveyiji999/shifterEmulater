import {createHash} from 'node:crypto';
import {planRiverbed,buildRiverbedProposal} from '../src/riverbed-proposal.mjs';
import {sampleDrainageGrid,analyzeDrainage} from '../src/terrain-drainage.mjs';
import {findRiverRoute} from '../src/river-routing.mjs';
import {TerrainWorld} from '../src/terrain-world.mjs';
import {buildRoadChunkV3} from '../src/road-geometry-v3.mjs';
import {fixture,base} from './road-v3-fixture.mjs';

// Node-only construction fixture and preview input, never a second map route.
export function riverbedFixture(seed){
  const core=fixture({...base,seed},48),state=core.route.v3State,
    feature=state.features.find(f=>['bridge','suspension'].includes(f.kind)),
    center=core.roadPointAt((feature.start+feature.end)/2),terrain=new TerrainWorld({physics:core});
  try{
    const grid=sampleDrainageGrid(terrain,{originX:Math.floor(center.x/8)*8-128,originZ:Math.floor(center.z/8)*8-128});
    // Foundation queries may populate more cache tiles. They do not enlarge the
    // construction domain beyond the actual sampled terrain window.
    const meshes=Array.from(terrain.data.values()),bounds={minX:Math.min(...meshes.map(m=>m.tx*128)),maxX:Math.max(...meshes.map(m=>(m.tx+1)*128)),
      minZ:Math.min(...meshes.map(m=>m.tz*128)),maxZ:Math.max(...meshes.map(m=>(m.tz+1)*128))};
    const analysis=analyzeDrainage(grid),distance=i=>Math.hypot(grid.originX+i%grid.width*8-center.x,grid.originZ+Math.floor(i/grid.width)*8-center.z);
    const deepest=Array.from(analysis.order).filter(i=>analysis.receiver[i]>=0).sort((a,b)=>analysis.fillDepth[b]-analysis.fillDepth[a]||distance(a)-distance(b)||a-b)[0],
      polygons=[],bridgeMeshes=[];
    const rectangle=(x,z,hx,hz,heading)=>{const c=Math.cos(heading),s=Math.sin(heading);
      return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>({x:x+a*hx*c+b*hz*s,z:z-a*hx*s+b*hz*c}));};
    let roadProtections=0,foundations=0,last=-1;
    for(const p of state.points){
      if(Math.floor(p.s/16)===last)continue;last=Math.floor(p.s/16);
      if(p.x<bounds.minX-16||p.x>bounds.maxX+16||p.z<bounds.minZ-16||p.z>bounds.maxZ+16)continue;
      if(['bridge','suspension'].includes(core.roadStructureAt(p.s)?.kind))continue;
      polygons.push(rectangle(p.x,p.z,8,12,p.heading));roadProtections++;
    }
    for(let index=Math.floor(feature.start/100);index<=Math.floor(feature.end/100);index++){
      const data=buildRoadChunkV3(core,index,{surfaceAt:(x,z)=>terrain.surfaceAt(x,z),groundFootprint:(p,h,x,z)=>terrain.footprint(p,h,x,z)});
      for(const f of data.components.filter(f=>f.kind==='foundation')){polygons.push(rectangle(f.x,f.z,f.footX,f.footZ,f.heading));foundations++;}
      for(const [kind,part] of Object.entries(data.meshes))if(!['earth','mark'].includes(kind)&&part.indices.length)
        bridgeMeshes.push({kind,vertices:part.vertices,indices:part.indices});
    }
    const fingerprint=()=>{const hash=createHash('sha256');for(const m of meshes)hash.update(m.vertices).update(m.indices);return hash.digest('hex');};
    const path=findRiverRoute(grid,deepest,{protectedPolygons:polygons}),plan=planRiverbed(path),
      sourceHash=fingerprint(),proposal=buildRiverbedProposal(meshes,plan,{protectedPolygons:polygons});
    if(fingerprint()!==sourceHash)throw Error('Construction proposal mutated original terrain');
    return {seed,center,feature,meshes,bridgeMeshes,plan,proposal,sourceHash,pathPoints:path.points.length,foundations,roadProtections,grid,analysis,polygons,source:deepest,routing:path};
  }finally{terrain.clear();terrain.depthMaterial.dispose();}
}
