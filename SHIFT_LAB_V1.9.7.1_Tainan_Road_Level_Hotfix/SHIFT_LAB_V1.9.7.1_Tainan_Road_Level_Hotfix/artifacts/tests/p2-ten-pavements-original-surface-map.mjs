import {TERRAIN_MATERIALS,terrainWeightsAt} from '../../desktop3d/src/terrain-surface.mjs';
import {readDesignData,requireKeys,requireText,inRange,designFingerprint} from '../../desktop3d/src/design-data.mjs';
import {readSurfaceDefinition,requireDrivableSurface} from '../../desktop3d/src/surface-definition.mjs';

export const LEGACY_SURFACE_CONDITIONS=Object.freeze(['dry','wet','snow','ice']);
const looks={dry:{color:'#344149',roughness:.93},wet:{color:'#202c36',roughness:.24},
  snow:{color:'#e4ebeb',roughness:.98},ice:{color:'#93b5c1',roughness:.18}};
const coefficients={dry:1.02,wet:.68,snow:.32,ice:.13};
export class SurfaceMap {
  constructor(core){
    this.core=core;this.pavementMaterial='asphalt_dense';this.zones=[];this.bindings=new Map();this.profiles=new Map();
    const trusted=new Map();
    for(const condition of LEGACY_SURFACE_CONDITIONS){
      const profile=readSurfaceDefinition({schema:'shiftlab.surface.v1',revision:1,
        id:'asphalt_dense.'+condition,material:'asphalt_dense',condition,
        pbr:{...looks[condition],metalness:0,uvMeters:2},
        contact:{tireMu:coefficients[condition],rollingCoefficient:.014,colliderFriction:.65},
        evidence:{basis:'legacy-illustrative',source:'existing physics P.surfaces; visual values are authored assumptions',status:'verified-gameplay'}});
      trusted.set(profile.id,designFingerprint(profile));
      this.profiles.set(profile.id,requireDrivableSurface(profile,trusted));
    }
    // Authored gameplay assumptions, not measurements or asphalt fallback.
    // Only this internal registry can approve them; imported status is ignored.
    const soil={dry:[.62,.035],wet:[.38,.045],snow:[.28,.03],ice:[.12,.02]};
    const soilLooks={dry:['#747455',1],wet:['#4c4b36',.72],snow:['#d9e0df',.98],ice:['#8badaf',.23]};
    for(const condition of LEGACY_SURFACE_CONDITIONS){
      const profile=readSurfaceDefinition({schema:'shiftlab.surface.v1',revision:1,id:'earth.'+condition,
        material:'earth',condition,pbr:{color:soilLooks[condition][0],roughness:soilLooks[condition][1],metalness:0,uvMeters:4},
        contact:{tireMu:soil[condition][0],rollingCoefficient:soil[condition][1],colliderFriction:.7},
        evidence:{basis:'project-illustrative',source:'P2 authored compact soil gameplay assumptions; tests/validate-terrain.mjs; not field calibration',status:'verified-gameplay'}});
      trusted.set(profile.id,designFingerprint(profile));this.profiles.set(profile.id,requireDrivableSurface(profile,trusted));
    }
    // Authored gameplay profiles; these are not measured friction data.
    const pavement={concrete:{mu:[.98,.65,.31,.13],rolling:[.013,.013,.02,.02],color:['#b0aea4','#777b79','#e4ebeb','#93b5c1'],rough:[.85,.32,.98,.18],meters:4},
      gravel:{mu:[.72,.52,.30,.12],rolling:[.025,.03,.028,.02],color:['#8c8270','#665d4e','#d9e0df','#8badaf'],rough:[.98,.85,.98,.23],meters:2}};
    for(const [material,values] of Object.entries(pavement))for(const [index,condition] of LEGACY_SURFACE_CONDITIONS.entries()){
      const profile=readSurfaceDefinition({schema:'shiftlab.surface.v1',revision:1,id:material+'.'+condition,material,condition,
        pbr:{color:values.color[index],roughness:values.rough[index],metalness:0,uvMeters:values.meters},
        contact:{tireMu:values.mu[index],rollingCoefficient:values.rolling[index],colliderFriction:.65},
        evidence:{basis:'project-illustrative',source:'P2 authored pavement gameplay assumptions; tests/validate-pavement.mjs and actual stopping experiment; not field calibration',status:'verified-gameplay'}});
      trusted.set(profile.id,designFingerprint(profile));this.profiles.set(profile.id,requireDrivableSurface(profile,trusted));
    }
    for(const condition of LEGACY_SURFACE_CONDITIONS){
      const original=this.profiles.get('gravel.'+condition);
      const profile=readSurfaceDefinition({...original,id:'terrain_gravel.'+condition,
        contact:{...original.contact,colliderFriction:.7},
        evidence:{basis:'project-illustrative',source:'P2 fixed terrain gravel blend; same tire/rolling assumptions as gravel pavement, ground body friction .7; not field calibration',status:'verified-gameplay'}});
      trusted.set(profile.id,designFingerprint(profile));this.profiles.set(profile.id,requireDrivableSurface(profile,trusted));
    }
    for(const [i,condition] of LEGACY_SURFACE_CONDITIONS.entries()){
      const colors=['#85877d','#5b625e','#d9e0df','#93b5c1'];
      const profile=readSurfaceDefinition({schema:'shiftlab.surface.v1',revision:1,id:'natural_stone.'+condition,material:'natural_stone',condition,
        pbr:{color:colors[i],roughness:[.95,.45,.98,.18][i],metalness:0,uvMeters:4},
        contact:{tireMu:[.9,.60,.32,.13][i],rollingCoefficient:[.015,.018,.025,.02][i],colliderFriction:.7},
        evidence:{basis:'project-illustrative',source:'P2 authored fixed boulder gameplay assumptions; tests/validate-scenery.mjs; not field calibration',status:'verified-gameplay'}});
      trusted.set(profile.id,designFingerprint(profile));this.profiles.set(profile.id,requireDrivableSurface(profile,trusted));
    }
  }
  get condition(){return this.core.state?.surface||'dry';}
  profile(id){const p=this.profiles.get(id);if(!p)throw Error('Unverified surface profile: '+id);return p;}
  normalizeZones(input){
    const zones=readDesignData(input);
    if(!Array.isArray(zones)||zones.length>64)throw Error('Invalid surface zone count');
    const ids=new Set();
    for(const z of zones){
      requireKeys(z,['id','profileId','layerIds','bounds'],'surface zone');
      requireText(z.id,'zone id');if(ids.has(z.id))throw Error('Duplicate surface zone id');ids.add(z.id);
      this.profile(z.profileId);
      if(!Array.isArray(z.layerIds)||!z.layerIds.length||z.layerIds.length>64||new Set(z.layerIds).size!==z.layerIds.length||
        z.layerIds.some(id=>typeof id!=='string'||!/^v3:\d+:asphalt$/.test(id)))throw Error('Explicit pavement layers required');
      requireKeys(z.bounds,['minX','maxX','minZ','maxZ'],'zone bounds');
      for(const key of ['minX','maxX','minZ','maxZ'])inRange(z.bounds[key],-1e7,1e7,key);
      if(!(z.bounds.minX<z.bounds.maxX&&z.bounds.minZ<z.bounds.maxZ))throw Error('Empty surface zone');
    }
    for(let i=0;i<zones.length;i++)for(let j=i+1;j<zones.length;j++){
      const a=zones[i],b=zones[j];if(!a.layerIds.some(id=>b.layerIds.includes(id)))continue;
      if(Math.min(a.bounds.maxX,b.bounds.maxX)>Math.max(a.bounds.minX,b.bounds.minX)&&
        Math.min(a.bounds.maxZ,b.bounds.maxZ)>Math.max(a.bounds.minZ,b.bounds.minZ))throw Error('Overlapping zones on the same layer');
    }
    return zones;
  }
  prepare(index,kind,vertices,sourceIndices){
    const layerId=`v3:${index}:${kind}`,buckets=new Map();
    const zones=kind==='asphalt'?this.zones.filter(z=>z.layerIds.includes(layerId)):[];
    if(!zones.length)return {indices:sourceIndices,keys:['global'],
      groups:[{start:0,count:sourceIndices.length,material:0}],
      binding:{layerId,kind,faces:Array(sourceIndices.length/3).fill('global')}};
    for(let face=0;face<sourceIndices.length/3;face++){
      let x=0,z=0;
      for(let i=0;i<3;i++){const v=sourceIndices[face*3+i]*3;x+=vertices[v]/3;z+=vertices[v+2]/3;}
      const zone=zones.find(zone=>x>=zone.bounds.minX&&x<zone.bounds.maxX&&z>=zone.bounds.minZ&&z<zone.bounds.maxZ);
      const key=zone?.profileId||'global';
      if(!buckets.has(key))buckets.set(key,[]);
      buckets.get(key).push(sourceIndices[face*3],sourceIndices[face*3+1],sourceIndices[face*3+2]);
    }
    const keys=[...buckets.keys()].sort(),indices=[],faces=[],groups=[];
    for(const [material,key] of keys.entries()){
      const values=buckets.get(key);groups.push({start:indices.length,count:values.length,material});
      indices.push(...values);for(let i=0;i<values.length/3;i++)faces.push(key);
    }
    return {indices:new Uint32Array(indices),keys,groups,binding:{layerId,kind,faces}};
  }
  bind(collider,binding){this.bindings.set(collider.handle,binding);}
  unbind(collider){this.bindings.delete(collider.handle);}
  contact(hit,point=null){
    const binding=this.bindings.get(hit.collider.handle);if(!binding)return null; // frozen legacy/foreign fixtures
    const face=hit.featureId,count=binding.faces.length;
    if(!Number.isInteger(face)||face<0||face>=count*2)throw Error('Registered ground hit lacks a valid triangle feature');
    const localFace=face%count,faceIndex=binding.renderFaces?.[localFace]??localFace,key=binding.faces[localFace];
    if(binding.terrain){
      const weights=terrainWeightsAt(binding.terrain,faceIndex,point),condition=this.condition;
      const profiles=['earth','terrain_gravel','natural_stone'].map(id=>this.profile(id+'.'+condition));
      const weighted=key=>profiles.reduce((value,p,i)=>value+p.contact[key]*weights[i],0);
      return {profileId:'terrain-mix.'+condition,sourceProfileIds:profiles.map(p=>p.id),material:'terrain_mix',
        components:TERRAIN_MATERIALS.map((material,i)=>({material,profileId:profiles[i].id,weight:weights[i]})),
        condition,tireMu:weighted('tireMu'),rollingCoefficient:weighted('rollingCoefficient'),colliderFriction:.7,
        layerId:binding.layerId,faceIndex,colliderHandle:hit.collider.handle,renderKind:'terrain',scope:'project-illustrative-terrain-blend'};
    }
    const profile=this.profile(binding.kind==='rock'?'natural_stone.'+this.condition:binding.kind==='terrain'?'earth.'+this.condition:key==='global'?(binding.kind==='asphalt'?this.pavementMaterial:'asphalt_dense')+'.'+this.condition:key);
    const legacy=profile.material==='asphalt_dense',registered=binding.kind==='asphalt'||binding.kind==='rock';
    const rolling=legacy?(this.core.params?.rollingCoeff??profile.contact.rollingCoefficient):profile.contact.rollingCoefficient;
    const tireMu=legacy?(this.core.params?.surfaces?.[profile.condition]?.mu??profile.contact.tireMu):profile.contact.tireMu;
    if(binding.kind==='terrain')return {profileId:profile.id,sourceProfileId:profile.id,material:'earth',
      condition:profile.condition,tireMu,rollingCoefficient:rolling,colliderFriction:profile.contact.colliderFriction,
      layerId:binding.layerId,faceIndex,colliderHandle:hit.collider.handle,renderKind:'terrain',scope:'project-illustrative-ground'};
    return {profileId:registered?profile.id:'legacy-unclassified.'+profile.condition,
      sourceProfileId:profile.id,material:registered?profile.material:null,
      condition:profile.condition,tireMu,rollingCoefficient:rolling,colliderFriction:profile.contact.colliderFriction,
      layerId:binding.layerId,faceIndex,colliderHandle:hit.collider.handle,
      renderKind:binding.kind,scope:binding.kind==='rock'?'project-illustrative-rock':binding.kind==='asphalt'?'registered-pavement':'legacy-unclassified-ground'};
  }
}
