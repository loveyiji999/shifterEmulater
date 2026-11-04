import {readVehicleDefinition} from './vehicle-definition.mjs';
import {readDesignData,requireKeys,requireText,inRange,designFingerprint} from './design-data.mjs';
export const APPEARANCE_SCHEMA='shiftlab.appearance.v1';
export const ASSET_LIMITS=Object.freeze({vertices:250000,triangles:150000,textureSize:2048,
  textureCount:16,fileBytes:32*1024*1024,parts:24,basis:'initial-validation-budget-not-performance-certified'});
const slots=['body','glass','tire','front-lamp','rear-lamp'];
const mounts=['body','front-bumper','rear-bumper','FL','FR','RL','RR'];
export function makeAppearanceAssembly(base,name='原廠外觀'){
  const v=readVehicleDefinition(base);requireText(name,'appearance name');
  return {schema:APPEARANCE_SCHEMA,revision:1,name,base:{id:v.id,revision:v.revision,
    fingerprint:designFingerprint(v.physics)},paint:{body:{color:'#1cb5a0',roughness:.34,metalness:.45}},
    shape:{widthScale:1,lengthScale:1,heightScale:1},parts:[],decals:[]};
}
function readAsset(asset){
  requireKeys(asset,['id','revision','file','bytes','vertices','triangles','textures','source','license','author',
    'metersPerUnit','upAxis','forwardAxis'],'asset');
  requireText(asset.id,'asset id');requireText(asset.author,'asset author');requireText(asset.source,'asset source',2048);
  if(!['user-authored','CC0','CC-BY-4.0','other-documented'].includes(asset.license))throw Error('Asset rights declaration required');
  inRange(asset.metersPerUnit,.001,100,'asset meters per unit');
  const axes=['+X','-X','+Y','-Y','+Z','-Z'];
  if(!axes.includes(asset.upAxis)||!axes.includes(asset.forwardAxis)||
    asset.upAxis.slice(1)===asset.forwardAxis.slice(1))throw Error('Invalid asset axes');
  if(!Number.isInteger(asset.revision)||asset.revision<1||
    typeof asset.file!=='string'||! /^[a-z0-9_-]+\.glb$/i.test(asset.file))throw Error('Local GLB identifier required');
  for(const [key,max] of [['bytes',ASSET_LIMITS.fileBytes],['vertices',ASSET_LIMITS.vertices],['triangles',ASSET_LIMITS.triangles]]){
    if(!Number.isInteger(asset[key]))throw Error('Integer asset count required');inRange(asset[key],1,max,key);}
  if(!Array.isArray(asset.textures)||asset.textures.length>ASSET_LIMITS.textureCount)throw Error('Texture count limit');
  for(const t of asset.textures){requireKeys(t,['width','height'],'texture');
    for(const key of ['width','height']){if(!Number.isInteger(t[key]))throw Error('Invalid texture size');inRange(t[key],1,ASSET_LIMITS.textureSize,key);}}
}
export function readAppearanceAssembly(input,base){
  const a=readDesignData(input),v=readVehicleDefinition(base);
  requireKeys(a,['schema','revision','name','base','paint','shape','parts','decals'],'appearance');
  if(a.schema!==APPEARANCE_SCHEMA||a.revision!==1)throw Error('Unsupported appearance version');
  requireText(a.name,'appearance name');requireKeys(a.base,['id','revision','fingerprint'],'appearance base');
  if(a.base.id!==v.id||a.base.revision!==v.revision||a.base.fingerprint!==designFingerprint(v.physics))
    throw Error('Appearance baseline changed; explicit migration required');
  requireKeys(a.paint,slots,'paint slot');
  for(const material of Object.values(a.paint)){
    requireKeys(material,['color','roughness','metalness'],'paint');
    if(typeof material.color!=='string'||!/^#[0-9a-f]{6}$/i.test(material.color))throw Error('Invalid paint color');
    inRange(material.roughness,0,1,'paint roughness');inRange(material.metalness,0,1,'paint metalness');
  }
  requireKeys(a.shape,['widthScale','lengthScale','heightScale'],'shape');
  for(const key of ['widthScale','lengthScale','heightScale'])inRange(a.shape[key],.8,1.2,key);
  if(!Array.isArray(a.parts)||a.parts.length>ASSET_LIMITS.parts)throw Error('Part count limit');
  const partIds=new Set(),occupied=new Set();
  const totals={bytes:0,vertices:0,triangles:0,textures:0};
  for(const part of a.parts){
    requireKeys(part,['id','mount','asset','massDeltaKg','collision'],'part');requireText(part.id,'part id');
    if(partIds.has(part.id)||occupied.has(part.mount)||!mounts.includes(part.mount))throw Error('Invalid/duplicate part mount');
    partIds.add(part.id);occupied.add(part.mount);readAsset(part.asset);
    for(const key of ['bytes','vertices','triangles'])totals[key]+=part.asset[key];
    totals.textures+=part.asset.textures.length;
    inRange(part.massDeltaKg,0,150,'part mass delta');
    if(!['cosmetic-within-hull','rebuild-hull'].includes(part.collision))throw Error('Part collision policy required');
  }
  if(totals.bytes>ASSET_LIMITS.fileBytes||totals.vertices>ASSET_LIMITS.vertices||
    totals.triangles>ASSET_LIMITS.triangles||totals.textures>ASSET_LIMITS.textureCount)
    throw Error('Combined appearance asset budget exceeded');
  if(!Array.isArray(a.decals)||a.decals.length>32)throw Error('Decal count limit');
  const decalIds=new Set();
  for(const decal of a.decals){
    requireKeys(decal,['id','slot','text','color','u','v','scale','rotation'],'decal');
    requireText(decal.id,'decal id');requireText(decal.text,'decal text',32);
    if(decalIds.has(decal.id))throw Error('Duplicate decal id');decalIds.add(decal.id);
    if(decal.slot!=='body'||typeof decal.color!=='string'||!/^#[0-9a-f]{6}$/i.test(decal.color))throw Error('Invalid decal material');
    inRange(decal.u,0,1,'decal u');inRange(decal.v,0,1,'decal v');
    inRange(decal.scale,.01,1,'decal scale');inRange(decal.rotation,-Math.PI,Math.PI,'decal rotation');
  }
  return a;
}
export function appearanceImpact(input,base){
  const a=readAppearanceAssembly(input,base);
  return {assembly:a,massDeltaKg:a.parts.reduce((sum,p)=>sum+p.massDeltaKg,0),
    requiresChassisRebuild:Object.values(a.shape).some(x=>x!==1)||
      a.parts.some(p=>p.massDeltaKg!==0||p.collision==='rebuild-hull'),
    assetVerificationRequired:a.parts.length>0};
}
