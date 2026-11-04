import {PAVEMENT_MATERIAL_IDS,pavementHasMarkings} from './pavement-definition.mjs';
import {partitionColliderMesh} from './collider-partition.mjs';
import * as THREE from 'three';
import {buildRoadChunkV3} from './road-geometry-v3.mjs';
import {SurfaceMap} from './surface-map.mjs';
import {TerrainWorld} from './terrain-world.mjs';
import {SurfaceMaterialLibrary,MATERIAL_STYLES} from './surface-materials.mjs';
import {surfaceUV} from './surface-uv.mjs';
import {GeometryStreamer} from './geometry-streamer.mjs';

// Same seeded route centerline and crossfall geometry as SHIFT LAB's physics.html.
// Collider windows are bound to arc-length, not camera position: hairpins cannot
// reuse a nearby but unrelated road segment.
export class RoadWorld {
  constructor(rapier, world, scene, physics) {
    this.rapier = rapier;
    this.world = world;
    this.scene = scene;
    this.physics = physics;
    this.chunks = new Map();
    this.spatialChunks = new Map();this.spatialRevision=-1;this.spatialState=null;
    this.groundHandles = new Set();
    this.railHandles = new Set();
    this.obstacleHandles = new Set();
    this.barrierHandles = new Set();
    this.surfaceMap=new SurfaceMap(physics);this.localSurfaceMaterials=new Map();this.lastSurfaceCondition=null;
    this.materialLibrary=new SurfaceMaterialLibrary();
    this.surfaceMaterial = this.materialLibrary.material('asphalt_dense');
    this.soilMaterial = this.materialLibrary.material('earth');
    this.concreteMaterial = this.materialLibrary.material('concrete');
    this.railMaterial = this.materialLibrary.material('steel');
    this.luminaireMaterial=new THREE.MeshStandardMaterial({color:0xffedcf,emissive:0xffe4bb,emissiveIntensity:3,roughness:.6,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    this.markMaterial = new THREE.MeshStandardMaterial({color:0xe6d9aa,roughness:.89});
    this.leafMaterial = new THREE.MeshStandardMaterial({color:0x326452,roughness:1});
    this.trunkMaterial = new THREE.MeshStandardMaterial({color:0x6b5642,roughness:1});
    this.shoulderMaterial = this.materialLibrary.material('asphalt_dense','shoulder',{color:0x48545a,roughness:.97});
    this.terrain=new TerrainWorld(this);
  }
  position(s, side) {
    const p = this.physics.roadPointAt(Math.max(0,Math.min(this.physics.roadTotalDistance(),s)));
    return {x:p.x+Math.cos(p.heading)*side,
      y:p.y+this.physics.roadCrossElevation(p,side),
      z:p.z-Math.sin(p.heading)*side};
  }
  surfaceAtHit(hit,point=null){return this.surfaceMap.contact(hit,point);}
  surfaceMaterialFor(key){
    if(key==='global')return this.surfaceMaterial;
    if(!this.localSurfaceMaterials.has(key)){
      const p=this.surfaceMap.profile(key).pbr;
      this.localSurfaceMaterials.set(key,this.materialLibrary.material(this.surfaceMap.profile(key).material,key,
        {color:p.color,roughness:p.roughness,metalness:p.metalness}));
    }
    return this.localSurfaceMaterials.get(key);
  }
  setPavementMaterial(id){
    if(!PAVEMENT_MATERIAL_IDS.includes(id))throw Error('Unsupported drivable pavement');
    if(this.physics.route.config?.generator!==3&&id!=='asphalt_dense')throw Error('Pavement materials require V3');
    this.surfaceMap.pavementProfile(id);
    if(id===this.surfaceMap.pavementMaterial)return id;
    // Prepare textures before changing the active material or contact profile.
    const maps=this.materialLibrary.textures(id);
    this.surfaceMap.pavementMaterial=id;
    Object.assign(this.surfaceMaterial,{map:maps.color,normalMap:maps.normal,roughnessMap:maps.roughness});
    this.surfaceMaterial.userData.surfaceMaterial=id;this.surfaceMaterial.userData.reliefMeters=MATERIAL_STYLES[id].relief;this.surfaceMaterial.userData.uvMeters=this.surfaceMap.pavementProfile(id).pbr.uvMeters;this.surfaceMaterial.needsUpdate=true;
    this.lastSurfaceCondition=null;this.syncSurfaceCondition();
    for(const chunk of this.chunks.values())for(const mesh of chunk.objects||[])if(mesh.material===this.markMaterial){
      mesh.userData.hiddenForPavement=!pavementHasMarkings(id);mesh.visible=pavementHasMarkings(id);
    }
    for(const [,chunk] of this.streamer?.stagedRoads||[])for(const mesh of chunk.objects)if(mesh.material===this.markMaterial)mesh.userData.hiddenForPavement=!pavementHasMarkings(id);
    return id;
  }
  syncSurfaceCondition(){
    const condition=this.surfaceMap.condition;if(condition===this.lastSurfaceCondition)return;
    const p=this.surfaceMap.pavementProfile().pbr;
    this.surfaceMaterial.color?.set(p.color);this.surfaceMaterial.roughness=p.roughness;this.surfaceMaterial.metalness=p.metalness;
    const shoulder=this.surfaceMap.profile('asphalt_dense.'+condition).pbr;
    this.shoulderMaterial.color.set(shoulder.color).multiplyScalar(.9);this.shoulderMaterial.roughness=shoulder.roughness;
    const soil=this.surfaceMap.profile('earth.'+condition).pbr;
    this.soilMaterial.color.set(soil.color);this.soilMaterial.roughness=soil.roughness;
    const colors=!['snow','ice'].includes(condition);
    if(this.soilMaterial.vertexColors!==colors){this.soilMaterial.vertexColors=colors;this.soilMaterial.needsUpdate=true;}
    this.terrain.scenery?.setCondition(condition);this.terrain.material?.setCondition(this.surfaceMap);
    this.lastSurfaceCondition=condition;
  }
  setSurfaceZones(input){
    if(this.physics.route.config?.generator!==3)throw Error('Surface zones require V3');
    const next=this.surfaceMap.normalizeZones(input),previous=this.surfaceMap.zones,candidates=new Map();
    this.streamer?.invalidate();
    this.surfaceMap.zones=next;
    try{
      for(const index of this.chunks.keys()){const chunk=this.makeChunkV3(index);if(chunk)candidates.set(index,chunk);}
    }catch(error){
      for(const [index,chunk] of candidates)this.disposeChunk(index,chunk,false);
      this.surfaceMap.zones=previous;throw error;
    }
    for(const [index,chunk] of this.chunks)this.disposeChunk(index,chunk,false);
    this.chunks=candidates;
    if(this.streamer&&!this.streamer.disabled)this.streamer.warmed();
    return this.surfaceMap.normalizeZones(this.surfaceMap.zones);
  }
  makeChunkV3(index,preparedData=null,staged=false,deferCollider=null){
    if(!preparedData)this.terrain.prepare();
    const data=preparedData||buildRoadChunkV3(this.physics,index,{surfaceAt:(x,z)=>this.terrain.surfaceAt(x,z),
      groundFootprint:(p,heading,hx,hz)=>this.terrain.footprint(p,heading,hx,hz)});if(!data)return null;
    const objects=[],colliders=[];
    const materials={asphalt:this.surfaceMaterial,shoulder:this.shoulderMaterial,earth:this.soilMaterial,
      structure:this.concreteMaterial,rail:this.railMaterial,cable:this.railMaterial,mark:this.markMaterial,
      cover:this.soilMaterial,earthWall:this.soilMaterial,luminaire:this.luminaireMaterial};
    try{
      for(const [kind,part] of Object.entries(data.meshes)){
        // TerrainField consumes old earth as boundary constraints and provides
        // one continuous surface; drawing the old strips too would overlap.
        if(kind==='earth')continue;
        if(!part.indices.length)continue;
        const vertices=part.vertices instanceof Float32Array?part.vertices:new Float32Array(part.vertices),
          sourceIndices=part.indices instanceof Uint32Array?part.indices:new Uint32Array(part.indices);
        const ground=['asphalt','shoulder','earth','cover'].includes(kind);
        const prepared=ground?this.surfaceMap.prepare(index,kind,vertices,sourceIndices):null;
        if(kind==='cover')prepared.binding.kind='terrain';
        const indices=prepared?.indices||sourceIndices;
        const geometry=new THREE.BufferGeometry();
        geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));
        geometry.setAttribute('uv',new THREE.BufferAttribute(part.uv||surfaceUV(this.physics,index,kind,vertices),2));
        const sky=part.sky?part:this.terrain.skyField.bake(vertices);
        geometry.setAttribute('skyVisibility',new THREE.BufferAttribute(sky.sky,1));geometry.setAttribute('tunnelId',new THREE.BufferAttribute(sky.tunnelIds,1));
        if(kind==='cover'||kind==='earthWall')geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(vertices.length).fill(1),3));
        geometry.setIndex(new THREE.BufferAttribute(indices,1));
        if(part.normals)geometry.setAttribute('normal',new THREE.BufferAttribute(part.normals,3));else geometry.computeVertexNormals();
        let material=materials[kind];
        if(kind==='asphalt'&&prepared.keys.some(key=>key!=='global')){
          material=prepared.keys.map(key=>this.surfaceMaterialFor(key));
          for(const group of prepared.groups)geometry.addGroup(group.start,group.count,group.material);
        }
        const mesh=new THREE.Mesh(geometry,material);this.skyLighting?.registerStatic(mesh);mesh.receiveShadow=true;
        mesh.userData.hiddenForPavement=kind==='mark'&&!pavementHasMarkings(this.surfaceMap.pavementMaterial);
        mesh.visible=!staged&&!mesh.userData.hiddenForPavement;
        if(kind==='cover'||kind==='earthWall')mesh.customDepthMaterial=this.terrain.depthMaterial;
        if(prepared){mesh.userData.surfaceLayerId=prepared.binding.layerId;mesh.userData.surfaceProfiles=prepared.keys;}
        mesh.castShadow=kind!=='mark';mesh.userData.nonPhysicalFinish=kind==='mark'||kind==='luminaire';this.scene.add(mesh);objects.push(mesh);
        if(kind==='mark'||kind==='luminaire')continue;
        const parts=indices===sourceIndices&&part.collision?part.collision:partitionColliderMesh(vertices,indices,ground?16:8);
        for(const piece of parts){
          const descriptor=this.rapier.ColliderDesc.trimesh(piece.vertices,piece.indices).setFriction(kind==='cover'?.7:.65);
          if(staged)descriptor.setEnabled(false);
          const create=()=>{
            const collider=this.world.createCollider(descriptor);
            const handles=ground?this.groundHandles:kind==='rail'?this.railHandles:this.barrierHandles;
            handles.add(collider.handle);colliders.push({collider,handles});
            if(prepared)this.surfaceMap.bind(collider,{...prepared.binding,
              faces:Array.from(piece.faces,face=>prepared.binding.faces[face]),renderFaces:piece.faces});
          };
          if(staged&&deferCollider)deferCollider(create);else create();
        }
      }
    }catch(error){
      for(const {collider,handles} of colliders){handles.delete(collider.handle);this.surfaceMap.unbind(collider);this.world.removeCollider(collider,true);}
      for(const mesh of objects){this.scene.remove(mesh);mesh.geometry.dispose();}
      throw error;
    }
    return {v3:true,objects,colliders,components:data.components};
  }
  makeChunk(index) {
    if(this.physics.route.config?.generator===3)return this.makeChunkV3(index);
    const width = [-14,-6,-5.2,-3.4,0,3.4,5.2,6,14];
    const s0 = index*100, end = Math.min((index+1)*100,this.physics.roadTotalDistance());
    if(end <= s0+2)return null;
    const count = Math.ceil((end-s0)/4);
    const vertices=[];
    for(let n=0;n<=count;n++){
      const s=s0+(end-s0)*n/count;
      for(const lateral of width){const p=this.position(s,lateral);vertices.push(p.x,p.y,p.z);}
    }
    const indices=[];
    for(let n=0;n<count;n++)for(let j=0;j<width.length-1;j++){
      const a=n*width.length+j,b=a+1,c=a+width.length,d=c+1;
      // Winding gives upward triangle normals for a forward +Z road.
      indices.push(a,c,b,b,c,d);
    }
    const v=new Float32Array(vertices),tri=new Uint32Array(indices);
    const collider=this.world.createCollider(this.rapier.ColliderDesc.trimesh(v,tri).setFriction(.65));
    this.groundHandles.add(collider.handle);
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    const uv=[];for(let n=0;n<=count;n++)for(const lateral of width)uv.push(lateral,s0+(end-s0)*n/count);
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    // The Rapier triangles above stay byte-identical. Rendering only is grouped
    // into THREE materials (3 draw groups per chunk, not 200+ per chunk).
    const renderGroups=[[],[],[]];
    for(let n=0;n<count;n++)for(let j=0;j<width.length-1;j++){
      const group=j===0||j===7?1:j===1||j===6?2:0;
      const offset=(n*(width.length-1)+j)*6;
      for(let k=0;k<6;k++)renderGroups[group].push(indices[offset+k]);
    }
    geo.setIndex(renderGroups.flat());geo.computeVertexNormals();
    let start=0;
    for(let material=0;material<renderGroups.length;material++){
      geo.addGroup(start,renderGroups[material].length,material);
      start+=renderGroups[material].length;
    }
    const mesh=new THREE.Mesh(geo,[this.surfaceMaterial,this.soilMaterial,this.shoulderMaterial]);
    mesh.receiveShadow=true;
    this.scene.add(mesh);
    const rails=[];
    const decorations=[];
    // The center line and verge foliage are chunk-owned. They are removed
    // together with the same road collider on map regeneration or streaming.
    for(let s=s0+9;s<end-4;s+=17){
      const p=this.position(s,0),heading=this.physics.roadPointAt(s).heading;
      const strip=new THREE.Mesh(new THREE.BoxGeometry(.11,.025,5),this.markMaterial);
      strip.position.set(p.x,p.y+.055,p.z);strip.rotation.y=heading;
      this.scene.add(strip);decorations.push(strip);
    }
    const hash=(Math.imul(index+17,1664525)^(this.physics.route.seedHash>>>0))>>>0;
    for(let side of [-1,1])for(let k=0;k<2;k++){
      const s=Math.min(end-5,s0+16+k*36+(hash%13));
      const shift=side*(10+(hash%4));
      const point=this.position(s,shift);
      const tree=new THREE.Group();tree.position.set(point.x,point.y,point.z);
      const height=2.3+((hash>>>(k*3))%8)*.2;
      const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.11,.16,height*.42,5),this.trunkMaterial);
      trunk.position.y=height*.21;
      const crown=new THREE.Mesh(new THREE.ConeGeometry(height*.38,height*.84,7),this.leafMaterial);
      crown.position.y=height*.77;tree.add(trunk,crown);
      this.scene.add(tree);decorations.push(tree);
    }
    // Guardrails are true 3D colliders with CCD chassis contact. Segment length
    // stays small enough for hairpin bends not to cut across the carriageway.
    const steps=Math.ceil((end-s0)/5);
    for(let i=0;i<steps;i++){
      const sa=s0+(end-s0)*i/steps,sb=s0+(end-s0)*(i+1)/steps;
      const midS=(sa+sb)/2,mid=this.physics.roadPointAt(midS);
      for(const sign of [-1,1]){
        if(!this.physics.roadRailEnabled(mid,sign))continue;
        const a=this.position(sa,sign*4.96),b=this.position(sb,sign*4.96);
        const length=Math.hypot(b.x-a.x,b.z-a.z)+.07;
        const center={x:(a.x+b.x)/2,y:(a.y+b.y)/2+.57,z:(a.z+b.z)/2};
        const angle=Math.atan2(b.x-a.x,b.z-a.z);
        const quat={x:0,y:Math.sin(angle/2),z:0,w:Math.cos(angle/2)};
        const descriptor=this.rapier.ColliderDesc.cuboid(.14,.41,length/2)
          .setTranslation(center.x,center.y,center.z).setRotation(quat)
          .setFriction(.45).setRestitution(.10);
        const rail=this.world.createCollider(descriptor);
        this.railHandles.add(rail.handle);rails.push(rail);
        const railMesh=new THREE.Mesh(new THREE.BoxGeometry(.28,.82,length),this.railMaterial);
        railMesh.position.set(center.x,center.y,center.z);
        railMesh.quaternion.set(quat.x,quat.y,quat.z,quat.w);
        railMesh.castShadow=true;this.scene.add(railMesh);
        rails.push(railMesh);
      }
    }
    for(const item of [mesh,...rails.filter(x=>x instanceof THREE.Object3D),...decorations])item.traverse(object=>{if(object.isMesh)this.skyLighting?.registerStatic(object);});
    return {collider,mesh,rails,decorations};
  }
  disposeChunk(index,chunk,forget=true){
    if(chunk.v3){
      for(const {collider,handles} of chunk.colliders){handles.delete(collider.handle);this.surfaceMap.unbind(collider);this.world.removeCollider(collider,true);}
      for(const mesh of chunk.objects){this.scene.remove(mesh);mesh.geometry.dispose();}
      if(forget)this.chunks.delete(index);return;
    }
    this.groundHandles.delete(chunk.collider.handle);
    this.world.removeCollider(chunk.collider,true);
    this.scene.remove(chunk.mesh);chunk.mesh.geometry.dispose();
    for(const rail of chunk.rails){
      if(rail instanceof THREE.Object3D){
        this.scene.remove(rail);rail.geometry.dispose();
      }else{
        this.railHandles.delete(rail.handle);this.world.removeCollider(rail,true);
      }
    }
    for(const item of chunk.decorations||[]){
      this.scene.remove(item);
      item.traverse(mesh=>{if(mesh.geometry)mesh.geometry.dispose();});
    }
    if(forget)this.chunks.delete(index);
  }
  clear(){
    this.streamer?.invalidate();
    this.terrain.clear();
    for(const [index,chunk] of [...this.chunks])this.disposeChunk(index,chunk);
    this.spatialChunks.clear();this.spatialRevision=-1;this.spatialState=null;this.skyLighting?.reset();
    // AcceptanceObstacles.dispose() must run before clear(); foreign ground
    // handles (e.g. ramp) are never silently deleted by this RoadWorld.
  }
  resourceStats(){
    return {chunks:this.chunks.size,ground:this.groundHandles.size,
      rails:this.railHandles.size,barriers:this.barrierHandles.size,
      obstacles:this.obstacleHandles.size};
  }
  assertClean(){
    const stats=this.resourceStats();
    if(this.surfaceMap.bindings.size||Object.values(stats).some(count=>count!==0))
      throw new Error('道路重建後仍殘留碰撞資源：'+JSON.stringify(stats));
    return true;
  }
  neededV3(s,position){
    const state=this.physics.route.v3State;
    if(this.surfaceMap.stateToken&&this.surfaceMap.stateToken!==state)this.surfaceMap.zones=[];
    this.surfaceMap.stateToken=state;
    if(this.spatialState!==state||this.spatialRevision!==state.revision){
      // Structures can be classified when a later road crosses an existing
      // chainage. Refresh their owned meshes without changing any centerline.
      this.spatialChunks.clear();
      for(const point of state.points){
        const key=Math.floor(point.x/100)+','+Math.floor(point.z/100);
        let bucket=this.spatialChunks.get(key);if(!bucket){bucket=new Set();this.spatialChunks.set(key,bucket);}
        bucket.add(Math.floor(point.s/100));
      }
      this.spatialRevision=state.revision;this.spatialState=state;
    }
    const p=position||this.physics.roadPointAt(s),needed=new Set();
    const here=Math.floor(s/100);
    for(let i=Math.max(0,here-2);i<=here+4;i++)needed.add(i);
    // Load every nearby chainage in XY, including upper/lower roads. Road
    // selection is independently height/topology aware in the physics core.
    const cx=Math.floor(p.x/100),cz=Math.floor(p.z/100);
    for(let x=cx-2;x<=cx+2;x++)for(let z=cz-2;z<=cz+2;z++)
      for(const index of this.spatialChunks.get(x+','+z)||[])needed.add(index);
    for(const j of state.junctions)if(Math.hypot(p.x-j.x,p.z-j.z)<230){
      for(const arc of [j.a,j.b])for(let i=Math.max(0,Math.floor(arc/100)-1);i<=Math.floor(arc/100)+1;i++)needed.add(i);
    }
    return needed;
  }
  ensureV3(s,position){
    const state=this.physics.route.v3State;
    if(this.spatialState!==state||this.spatialRevision!==state.revision)
      for(const [index,chunk] of [...this.chunks])this.disposeChunk(index,chunk);
    const needed=this.neededV3(s,position);
    for(const index of needed)if(!this.chunks.has(index)){const chunk=this.makeChunk(index);if(chunk)this.chunks.set(index,chunk);}
    for(const [index,chunk] of this.chunks)if(!needed.has(index))this.disposeChunk(index,chunk);
  }
  enableAsyncStreaming(options={}){
    if(typeof Worker==='undefined'&&!options.workerFactory)return false;
    if(!this.streamer){try{this.streamer=new GeometryStreamer(this,options);}
      catch(error){console.warn('Geometry worker unavailable; using synchronous loading:',error.message);return false;}}
    if(this.physics.route.config?.generator===3)this.streamer.warmed();return true;
  }
  pumpStreaming(){this.streamer?.pump();}
  streamingStats(){return this.streamer?.stats()||{mode:'synchronous'};}
  ensure(s,position,options={}){
    if(this.physics.route.config?.generator!==3&&this.surfaceMap.pavementMaterial!=='asphalt_dense')this.setPavementMaterial('asphalt_dense');
    this.syncSurfaceCondition();
    if(this.physics.route.config?.generator===3){
      if(this.streamer&&!this.streamer.disabled&&options.stream&&!this.streamer.bootstrap)
        return this.streamer.update(s,position||this.physics.roadPointAt(s));
      if(this.streamer&&!this.streamer.disabled){
        this.streamer.invalidate();
        if([...this.chunks.values()].some(c=>c.streamRevision!==this.physics.route.v3State.revision))this.spatialState=null;
      }
      this.ensureV3(s,position);this.terrain.ensure(position||this.physics.roadPointAt(s));
      if(this.streamer&&!this.streamer.disabled)this.streamer.warmed();return true;
    }
    if(this.terrain.field)this.terrain.clear();
    const here=Math.floor(Math.max(0,s)/100);
    const begin=Math.max(0,here-2),end=here+4;
    for(let i=begin;i<=end;i++){
      if(!this.chunks.has(i)){
        const chunk=this.makeChunk(i);
        if(chunk)this.chunks.set(i,chunk);
      }
    }
    for(const [index,chunk] of this.chunks){
      if(index>=here-3&&index<=here+5)continue;
      this.disposeChunk(index,chunk);
    }
  }
}
