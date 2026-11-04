import {partitionColliderMesh} from './collider-partition.mjs';
import * as THREE from 'three';
import {snapshotCore} from './road-snapshot.mjs';
import {TerrainWorld} from './terrain-world.mjs';
import {buildRoadChunkV3} from './road-geometry-v3.mjs';
import {surfaceUV} from './surface-uv.mjs';

export class StreamingGeometry {
  constructor(){this.core=null;this.terrain=null;}
  reset(snapshot){this.terrain?.clear();this.terrain?.depthMaterial.dispose();
    this.core=snapshotCore(snapshot);this.terrain=new TerrainWorld({physics:this.core});this.terrain.prepare();}
  build(request){
    if(request.snapshot)this.reset(request.snapshot);
    if(!this.core)throw Error('Streaming snapshot missing');
    const start=performance.now(),roads=[],terrain=[],transfer=[];
    const own=array=>{transfer.push(array.buffer);return array;};
    const collision=(vertices,indices,size)=>partitionColliderMesh(vertices,indices,size).map(p=>({vertices:own(p.vertices),indices:own(p.indices),faces:own(p.faces)}));
    for(const index of request.roads){
      const data=buildRoadChunkV3(this.core,index,{surfaceAt:(x,z)=>this.terrain.surfaceAt(x,z),
        groundFootprint:(p,h,x,z)=>this.terrain.footprint(p,h,x,z)});
      if(!data)continue;
      for(const [kind,part] of Object.entries(data.meshes)){
        if(kind==='earth'){delete data.meshes[kind];continue;}
        const vertices=own(new Float32Array(part.vertices)),indices=own(new Uint32Array(part.indices));
        const sky=this.terrain.skyField.bake(vertices);
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));
        geometry.setIndex(new THREE.BufferAttribute(indices,1));geometry.computeVertexNormals();
        data.meshes[kind]={vertices,indices,sky:own(sky.sky),tunnelIds:own(sky.tunnelIds),collision:['mark','luminaire'].includes(kind)?[]:collision(vertices,indices,['asphalt','shoulder','cover'].includes(kind)?16:8),normals:own(geometry.attributes.normal.array),uv:own(surfaceUV(this.core,index,kind,vertices))};geometry.dispose();
      }
      roads.push({index,data});
    }
    for(const [tx,tz] of request.terrain){
      const source=this.terrain.dataFor(tx,tz),scenery=this.terrain.sceneryFor(tx,tz);
      for(const mesh of Object.values(scenery.meshes))for(const array of Object.values(mesh))own(array);
      for(const piece of scenery.collisions){own(piece.vertices);own(piece.indices);own(piece.renderFaces);}
      // Cached source arrays stay in the worker. Transfer only owned copies.
      terrain.push({tx,tz,scenery,colors:own(source.colors.slice()),weights:own(source.weights.slice()),sky:own(source.sky.slice()),tunnelIds:own(source.tunnelIds.slice()),collision:collision(source.vertices,source.indices,16),vertices:own(source.vertices.slice()),indices:own(source.indices.slice()),
        normals:own(source.normals.slice()),uv:own(source.uv.slice()),queryBuckets:source.queryBuckets});
    }
    while(this.terrain.data.size>32)this.terrain.data.delete(this.terrain.data.keys().next().value);
    if(request.bounds)this.terrain.field.retain(request.bounds);
    return {message:{id:request.id,epoch:request.epoch,revision:request.revision,roads,terrain,workerMs:performance.now()-start},transfer};
  }
}
