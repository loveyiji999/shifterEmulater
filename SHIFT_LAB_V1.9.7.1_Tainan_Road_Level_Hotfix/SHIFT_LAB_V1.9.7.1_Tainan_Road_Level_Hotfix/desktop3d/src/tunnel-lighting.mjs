import * as THREE from 'three';
import {TunnelLightField} from './tunnel-light-field.mjs';
export const TUNNEL_LIGHT_LIMIT=6;
export class TunnelLighting {
  constructor(scene,road){
    this.scene=scene;this.road=road;this.vehicleSky={value:1};this.vehicleTunnel={value:0};this.lightIds={value:new Float32Array(TUNNEL_LIGHT_LIMIT)};this.registered=new WeakMap();this.materialRefs=[];
    this.lights=Array.from({length:TUNNEL_LIGHT_LIMIT},()=>{const light=new THREE.PointLight(0xffe4bb,0,38,2);
      light.name='tunnel-luminaire';scene.add(light);return light;});
    this.active=[];road.skyLighting=this;
  }
  registerMaterial(material,dynamic=false){
    if(!material.isMeshStandardMaterial||this.registered.has(material))return;
    const record={onBeforeCompile:material.onBeforeCompile,cacheKey:material.customProgramCacheKey};
    this.registered.set(material,record);this.materialRefs.push(new WeakRef(material));
    const previous=material.onBeforeCompile.bind(material),cache=material.customProgramCacheKey.bind(material);
    material.onBeforeCompile=shader=>{
      previous(shader);shader.uniforms.tunnelVehicleSky=this.vehicleSky;shader.uniforms.tunnelVehicleId=this.vehicleTunnel;shader.uniforms.tunnelLightIds=this.lightIds;
      shader.vertexShader=(dynamic?'uniform float tunnelVehicleSky,tunnelVehicleId;':'attribute float skyVisibility,tunnelId;')+'varying float vTunnelSky;varying float vTunnelId;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTunnelSky='+(dynamic?'tunnelVehicleSky':'skyVisibility')+';vTunnelId='+(dynamic?'tunnelVehicleId':'tunnelId')+';');
      shader.fragmentShader='varying float vTunnelSky;varying float vTunnelId;uniform float tunnelLightIds[6];\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',THREE.ShaderChunk.lights_fragment_begin.replace(
        'getPointLightInfo( pointLight, geometryPosition, directLight );',
        'if(tunnelLightIds[i]>.5&&abs(vTunnelId-tunnelLightIds[i])<.25&&vTunnelSky<.9999){getPointLightInfo( pointLight, geometryPosition, directLight );directLight.color*=clamp((1.0-vTunnelSky)/.94,0.0,1.0);}else{directLight.visible=false;directLight.color=vec3(0.0);directLight.direction=vec3(0.0,1.0,0.0);}'));
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',`#include <lights_fragment_maps>
#if defined(RE_IndirectDiffuse)
irradiance*=vTunnelSky;iblIrradiance*=vTunnelSky;
#endif
#if defined(RE_IndirectSpecular)
radiance*=vTunnelSky;clearcoatRadiance*=vTunnelSky;
#endif`);
    };
    material.customProgramCacheKey=()=>cache()+'|tunnel-sky-v1-'+(dynamic?'vehicle':'static');record.wrapper=material.onBeforeCompile;record.keyWrapper=material.customProgramCacheKey;material.needsUpdate=true;
  }
  registerStatic(mesh){
    if(!mesh.geometry.attributes.skyVisibility){const count=mesh.geometry.attributes.position.count;
      mesh.geometry.setAttribute('skyVisibility',new THREE.BufferAttribute(new Float32Array(count).fill(1),1));}
    if(!mesh.geometry.attributes.tunnelId)mesh.geometry.setAttribute('tunnelId',new THREE.BufferAttribute(new Float32Array(mesh.geometry.attributes.position.count),1));
    for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])this.registerMaterial(m);
  }
  registerVehicle(group){group.traverse(mesh=>{if(mesh.isMesh)for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])this.registerMaterial(m,true);});}
  update(position){
    const road=this.road,isV3=road.physics.route.config?.generator===3;
    const state=road.physics.route.v3State;
    if(isV3&&(this.field?.state!==state||this.field?.revision!==state.revision)){
      const prepared=road.terrain.skyField;
      this.field=prepared?.state===state&&prepared.revision===state.revision?prepared:new TunnelLightField(road.physics);
    }
    const access=isV3?this.field.at(position):null;this.vehicleSky.value=access?.sky??1;this.vehicleTunnel.value=access?.id??0;
    const candidates=[];
    if(isV3)for(const chunk of road.chunks.values())for(const c of chunk.components||[])if(c.kind==='tunnel-luminaire'){
      const distance=Math.hypot(position.x-c.position.x,position.y-c.position.y,position.z-c.position.z);
      if(distance<65)candidates.push({...c,distance});
    }
    candidates.sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id));this.active=candidates.slice(0,TUNNEL_LIGHT_LIMIT);
    this.lights.forEach((light,i)=>{const c=this.active[i];light.intensity=c?220:0;this.lightIds.value[i]=c?.tunnelId??0;if(c)light.position.copy(c.position);});
  }
  reset(){this.field=null;this.vehicleSky.value=1;this.vehicleTunnel.value=0;this.active=[];this.lightIds.value.fill(0);for(const light of this.lights)light.intensity=0;}
  dispose(){this.reset();
    for(const ref of this.materialRefs){const material=ref.deref(),record=material&&this.registered.get(material);if(!record)continue;
      if(material.onBeforeCompile===record.wrapper)material.onBeforeCompile=record.onBeforeCompile;
      if(material.customProgramCacheKey===record.keyWrapper)material.customProgramCacheKey=record.cacheKey;material.needsUpdate=true;}
    this.materialRefs=[];this.registered=new WeakMap();if(this.road.skyLighting===this)this.road.skyLighting=null;for(const light of this.lights)this.scene.remove(light);this.active=[];}
}
