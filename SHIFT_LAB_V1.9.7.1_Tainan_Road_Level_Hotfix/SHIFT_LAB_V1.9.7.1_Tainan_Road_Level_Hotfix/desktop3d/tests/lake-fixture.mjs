import {createHash} from 'node:crypto';
import {TerrainWorld} from '../src/terrain-world.mjs';
import {sampleDrainageGrid,analyzeDrainage} from '../src/terrain-drainage.mjs';
import {findClosedLake} from '../src/closed-lake.mjs';
import {buildRoadChunkV3} from '../src/road-geometry-v3.mjs';
import {fixture,base} from './road-v3-fixture.mjs';

export function lakeFixture(seed){
  const core=fixture({...base,seed},48),feature=core.route.v3State.features.find(f=>['bridge','suspension'].includes(f.kind)),
    center=core.roadPointAt((feature.start+feature.end)/2),terrain=new TerrainWorld({physics:core});
  try{
    const originX=Math.floor(center.x/128)*128-256,originZ=Math.floor(center.z/128)*128-256,
      grid=sampleDrainageGrid(terrain,{width:65,height:65,originX,originZ}),analysis=analyzeDrainage(grid),
      source=Math.round((center.z-originZ)/8)*65+Math.round((center.x-originX)/8),
      meshes=Array.from(terrain.data.values()).filter(m=>m.tx>=originX/128&&m.tx<originX/128+4&&m.tz>=originZ/128&&m.tz<originZ/128+4);
    const fingerprint=()=>{const h=createHash('sha256');for(const m of meshes)h.update(m.vertices).update(m.indices);return h.digest('hex');};
    const sourceHash=fingerprint(),proposal=findClosedLake(meshes,{sourceX:grid.originX+source%65*8,
      sourceZ:grid.originZ+Math.floor(source/65)*8,maxWaterY:analysis.spillElevation[source]-.25});
    if(fingerprint()!==sourceHash)throw Error('Lake proposal mutated source terrain');
    const bridgeMeshes=[];
    for(let index=Math.floor(feature.start/100);index<=Math.floor(feature.end/100);index++){
      const data=buildRoadChunkV3(core,index,{surfaceAt:(x,z)=>terrain.surfaceAt(x,z),groundFootprint:(p,h,x,z)=>terrain.footprint(p,h,x,z)});
      for(const [kind,part] of Object.entries(data.meshes))if(!['earth','mark'].includes(kind)&&part.indices.length)
        bridgeMeshes.push({kind,vertices:part.vertices,indices:part.indices});
    }
    return {seed,center,feature,meshes,bridgeMeshes,proposal,sourceHash,spillY:analysis.spillElevation[source]};
  }finally{terrain.clear();terrain.depthMaterial.dispose();}
}
