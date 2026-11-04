import {TunnelLightField} from './tunnel-light-field.mjs';
import {terrainWeights} from './terrain-surface.mjs';
import {TerrainMaterial} from './terrain-material.mjs';
import {SceneryPlanner,buildScenery,terrainColors} from './scenery-geometry.mjs';
import {SceneryWorld} from './scenery-world.mjs';
import {partitionColliderMesh} from './collider-partition.mjs';
import * as THREE from 'three';
import {TerrainField,TERRAIN_TILE_SIZE} from './terrain-geometry.mjs';

// Chunk-owned, reachable terrain. Rendering and compact collision partitions
// preserve the same Float32 triangles; quality cannot replace near-field support.
export class TerrainWorld {
  constructor(road){this.road=road;this.tiles=new Map();this.field=null;this.data=new Map();this.planner=null;this.scenery=null;this.material=null;this.skyField=null;
    this.depthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,polygonOffset:true,
      polygonOffsetFactor:2,polygonOffsetUnits:4});}
  clear(){
    for(const tile of this.tiles.values())this.dispose(tile);
    this.tiles.clear();this.field=null;this.skyField=null;this.data.clear();this.planner=null;
  }
  prepare(){
    const state=this.road.physics.route.v3State;
    if(!this.field||this.field.state!==state||this.field.revision!==state.revision){
      this.clear();this.field=new TerrainField(this.road.physics);this.skyField=new TunnelLightField(this.road.physics);
    }
  }
  dataFor(tx,tz){
    const key=tx+','+tz;
    if(!this.data.has(key)){
      const data=this.field.buildTile(tx,tz);data.colors=terrainColors(data,this.road.physics.route.seedHash);data.weights=terrainWeights(data,this.road.physics.route.seedHash);Object.assign(data,this.skyField.bake(data.vertices));data.queryBuckets=new Map();
      for(let n=0;n<data.indices.length;n+=3){
        const a=data.indices[n]*3,b=data.indices[n+1]*3,c=data.indices[n+2]*3,v=data.vertices;
        for(let x=Math.floor(Math.min(v[a],v[b],v[c])/16);x<=Math.floor(Math.max(v[a],v[b],v[c])/16);x++)
          for(let z=Math.floor(Math.min(v[a+2],v[b+2],v[c+2])/16);z<=Math.floor(Math.max(v[a+2],v[b+2],v[c+2])/16);z++){
            const key=x+','+z;if(!data.queryBuckets.has(key))data.queryBuckets.set(key,[]);data.queryBuckets.get(key).push(n);
          }
      }
      this.data.set(key,data);
    }
    return this.data.get(key);
  }
  sceneryFor(tx,tz){
    this.prepare();if(!this.planner)this.planner=new SceneryPlanner(this.road.physics);
    const data=buildScenery(this.planner.plan(this,tx,tz),tx,tz);
    for(const part of Object.values(data.meshes))Object.assign(part,this.skyField.bake(part.vertices));return data;
  }
  sceneryStats(){
    const stats={trees:0,rocks:0,batches:0,colliders:0};
    for(const tile of this.tiles.values())if(tile.scenery){
      for(const model of tile.scenery.models)stats[model.kind==='tree'?'trees':'rocks']++;
      stats.batches+=tile.scenery.objects.length;stats.colliders+=tile.scenery.colliders.length;
    }
    return stats;
  }
  activate(tile){
    tile.mesh.visible=true;for(const collider of tile.colliders||[tile.collider])collider.setEnabled(true);
    this.scenery?.activate(tile.scenery);
  }
  surfaceAt(x,z){
    this.prepare();
    x=Math.fround(x);z=Math.fround(z);
    const tx=Math.floor(x/TERRAIN_TILE_SIZE),tz=Math.floor(z/TERRAIN_TILE_SIZE),data=this.dataFor(tx,tz);
    let result=null;
    for(const n of data.queryBuckets.get(Math.floor(x/16)+','+Math.floor(z/16))||[]){
      const j=data.indices[n]*3,k=data.indices[n+1]*3,l=data.indices[n+2]*3;
      const a={x:data.vertices[j],y:data.vertices[j+1],z:data.vertices[j+2]},
        b={x:data.vertices[k],y:data.vertices[k+1],z:data.vertices[k+2]},
        c={x:data.vertices[l],y:data.vertices[l+1],z:data.vertices[l+2]};
      if(x<Math.min(a.x,b.x,c.x)||x>Math.max(a.x,b.x,c.x)||z<Math.min(a.z,b.z,c.z)||z>Math.max(a.z,b.z,c.z))continue;
      const den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
      if(Math.abs(den)<1e-12)continue;
      const u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/den;
      const w=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/den,t=1-u-w;
      if(Math.min(u,w,t)<-1e-9)continue;
      const y=u*a.y+w*b.y+t*c.y;
      if(!result||y>result.y)result={x,y,z,tx,tz,faceIndex:n/3};
    }
    return result;
  }
  footprint(center,heading,hx,hz){
    this.prepare();const c=Math.cos(heading),s=Math.sin(heading),samples=[],unique=new Set();let coverage=0;
    const ex=Math.abs(c)*hx+Math.abs(s)*hz,ez=Math.abs(s)*hx+Math.abs(c)*hz;
    for(let tx=Math.floor((center.x-ex)/TERRAIN_TILE_SIZE);tx<=Math.floor((center.x+ex)/TERRAIN_TILE_SIZE);tx++)
      for(let tz=Math.floor((center.z-ez)/TERRAIN_TILE_SIZE);tz<=Math.floor((center.z+ez)/TERRAIN_TILE_SIZE);tz++){
        const data=this.dataFor(tx,tz),nearby=new Set();
        for(let x=Math.floor((center.x-ex)/16);x<=Math.floor((center.x+ex)/16);x++)
          for(let z=Math.floor((center.z-ez)/16);z<=Math.floor((center.z+ez)/16);z++)
            for(const n of data.queryBuckets.get(x+','+z)||[])nearby.add(n);
        for(const n of [...nearby].sort((a,b)=>a-b)){
          let polygon=[0,1,2].map(k=>{const j=data.indices[n+k]*3,x=data.vertices[j],z=data.vertices[j+2];
            return {x,y:data.vertices[j+1],z,u:(x-center.x)*c-(z-center.z)*s,v:(x-center.x)*s+(z-center.z)*c};});
          const original=polygon;
          if(polygon.every(p=>p.u< -hx)||polygon.every(p=>p.u>hx)||polygon.every(p=>p.v< -hz)||polygon.every(p=>p.v>hz))continue;
          for(const [axis,sign,limit] of [['u',1,hx],['u',-1,hx],['v',1,hz],['v',-1,hz]]){
            const output=[];
            for(let i=0;i<polygon.length;i++){
              const a=polygon[i],b=polygon[(i+1)%polygon.length],da=limit-sign*a[axis],db=limit-sign*b[axis];
              if(da>=0)output.push(a);
              if(da>0&&db<0||da<0&&db>0){const t=da/(da-db),p={};
                for(const key of ['x','y','z','u','v'])p[key]=a[key]+(b[key]-a[key])*t;output.push(p);}
            }
            polygon=output;if(polygon.length<3)break;
          }
          if(polygon.length<3)continue;
          const area=Math.abs(polygon.reduce((sum,a,i)=>{const b=polygon[(i+1)%polygon.length];return sum+a.u*b.v-a.v*b.u;},0))/2;
          if(area<1e-10)continue;coverage+=area;
          for(const p of polygon){const key=p.x.toFixed(6)+','+p.z.toFixed(6);
            if(!unique.has(key)){
              unique.add(key);const x=Math.fround(p.x),z=Math.fround(p.z),[a,b,c]=original;
              const den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
              const u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/den;
              const v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/den;
              samples.push({x,y:u*a.y+v*b.y+(1-u-v)*c.y,z,tx,tz,faceIndex:n/3});
            }}
        }
      }
    const area=4*hx*hz;if(Math.abs(coverage-area)>Math.max(.001,area*1e-4))return null;
    // A Float32 point on an edge may fall into its neighbouring triangle.
    // Resolve that actual face instead of extrapolating the original plane.
    for(const p of samples){const hit=this.surfaceAt(p.x,p.z);if(!hit)return null;Object.assign(p,hit);}
    return {samples,minY:Math.min(...samples.map(p=>p.y)),maxY:Math.max(...samples.map(p=>p.y)),coverage,area};
  }
  dispose(tile){
    const road=this.road;this.scenery?.dispose(tile.scenery);
    for(const collider of tile.colliders||[tile.collider])if(collider){road.groundHandles.delete(collider.handle);road.surfaceMap.unbind(collider);
      road.world.removeCollider(collider,true);}
    road.scene.remove(tile.mesh);tile.mesh.geometry.dispose();
  }
  make(tx,tz,preparedData=null,staged=false,deferCollider=null){
    const road=this.road,data=preparedData||this.dataFor(tx,tz);
    if(!data.indices.length)return null;
    const geometry=new THREE.BufferGeometry(),colliders=[];let mesh=null,scenery=null,tile=null;
    try{
      geometry.setAttribute('position',new THREE.BufferAttribute(data.vertices,3));
      geometry.setAttribute('uv',new THREE.BufferAttribute(data.uv,2));
      geometry.setAttribute('normal',new THREE.BufferAttribute(data.normals,3));
      geometry.setAttribute('color',new THREE.BufferAttribute(data.colors||terrainColors(data,road.physics.route.seedHash),3));
      geometry.setAttribute('terrainWeights',new THREE.BufferAttribute(data.weights||terrainWeights(data,road.physics.route.seedHash),3));
      const sky=data.sky?data:this.skyField.bake(data.vertices);
      geometry.setAttribute('skyVisibility',new THREE.BufferAttribute(sky.sky,1));geometry.setAttribute('tunnelId',new THREE.BufferAttribute(sky.tunnelIds,1));
      geometry.setIndex(new THREE.BufferAttribute(data.indices,1));
      if(!this.material)this.material=new TerrainMaterial(road.materialLibrary,road.surfaceMap);
      this.material.setCondition(road.surfaceMap);mesh=new THREE.Mesh(geometry,this.material);road.skyLighting?.registerStatic(mesh);mesh.receiveShadow=true;mesh.castShadow=true;
      mesh.visible=!staged;
      mesh.customDepthMaterial=this.depthMaterial;
      mesh.userData.terrainTile={tx,tz};
      for(const piece of data.collision||partitionColliderMesh(data.vertices,data.indices)){
        const descriptor=road.rapier.ColliderDesc.trimesh(piece.vertices,piece.indices).setFriction(.7);
        if(staged)descriptor.setEnabled(false);
        const create=()=>{
          const collider=road.world.createCollider(descriptor);colliders.push(collider);
          if(tile&&!tile.collider)tile.collider=collider;
          road.surfaceMap.bind(collider,{kind:'terrain',layerId:`terrain:${tx}:${tz}`,renderFaces:piece.faces,
            terrain:{vertices:data.vertices,indices:data.indices,weights:geometry.attributes.terrainWeights.array},
            faces:Array(piece.indices.length/3).fill('terrain-mix')});
          road.groundHandles.add(collider.handle);
        };
        if(staged&&deferCollider)deferCollider(create);else create();
      }
      if(!this.scenery)this.scenery=new SceneryWorld(road);
      this.scenery.setCondition(road.surfaceMap.condition);
      scenery=this.scenery.create(data.scenery||this.sceneryFor(tx,tz),staged,deferCollider);
      road.scene.add(mesh);tile={mesh,collider:colliders[0],colliders,scenery};return tile;
    }catch(error){
      this.scenery?.dispose(scenery);
      for(const collider of colliders){road.groundHandles.delete(collider.handle);road.surfaceMap.unbind(collider);road.world.removeCollider(collider,true);}
      if(mesh)road.scene.remove(mesh);geometry.dispose();throw error;
    }
  }
  ensure(position){
    this.prepare();
    const tx=Math.floor(position.x/TERRAIN_TILE_SIZE),tz=Math.floor(position.z/TERRAIN_TILE_SIZE),needed=new Set();
    const candidates=new Map();
    try{
      for(let x=tx-1;x<=tx+1;x++)for(let z=tz-1;z<=tz+1;z++){
        const key=x+','+z;needed.add(key);
        if(!this.tiles.has(key)){const tile=this.make(x,z);if(tile)candidates.set(key,tile);}
      }
    }catch(error){for(const tile of candidates.values())this.dispose(tile);throw error;}
    for(const [key,tile] of candidates)this.tiles.set(key,tile);
    for(const [key,tile] of this.tiles)if(!needed.has(key)){this.dispose(tile);this.tiles.delete(key);}
    if(candidates.size)this.field.retain({minX:(tx-1)*TERRAIN_TILE_SIZE,maxX:(tx+2)*TERRAIN_TILE_SIZE,
      minZ:(tz-1)*TERRAIN_TILE_SIZE,maxZ:(tz+2)*TERRAIN_TILE_SIZE});
    for(const key of this.data.keys())if(!needed.has(key))this.data.delete(key);
  }
}
