// V3 is the sole active generator. V1/V2 schemas stay frozen for exact
// legacy-document playback; new maps use V3 without rewriting saved seeds.
export const MAP_SCHEMA_V1='shiftlab.road.v1';
export const MAP_SCHEMA_V2='shiftlab.road.v2';
export const MAP_SCHEMA_V3='shiftlab.road.v3';
export const MAP_SCHEMA=MAP_SCHEMA_V3;
export const MAP_FIELDS=Object.freeze(['turnChance','hairpinChance','slopeChance','leftBias','upBias','maxGrade']);
export const REFERENCE_MAP=Object.freeze({
  generator:1,seed:'SHIFT-2026-MOUNTAIN-07',turnChance:58,hairpinChance:20,
  slopeChance:52,leftBias:50,upBias:50,maxGrade:9
});
export const DEFAULT_MAP=Object.freeze({...REFERENCE_MAP,generator:3});

export function normalizeMapConfig(raw,strict=false){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('道路設定必須是物件');
  // Saved pre-v1.9 configurations have no generator; DO NOT migrate them.
  const generator=raw.generator===undefined?1:raw.generator;
  if(generator!==1&&generator!==2&&generator!==3)throw Error('不支援的道路生成器版本');
  const seed=typeof raw.seed==='string'?raw.seed.trim():'';
  if(strict&&(!seed||seed.length>64))throw Error('地圖種子必須為 1–64 個字元');
  const config={...REFERENCE_MAP,generator,seed:seed.slice(0,64)||REFERENCE_MAP.seed};
  for(const key of MAP_FIELDS){
    const n=raw[key]===undefined?REFERENCE_MAP[key]:Number(raw[key]);
    if(!Number.isFinite(n)||(strict&&(typeof raw[key]!=='number'||raw[key]===undefined)))
      throw Error(key+' 必須是有限數值');
    config[key]=Math.max(key==='maxGrade'?3:0,Math.min(key==='maxGrade'?12:100,Math.round(n)));
  }
  return config;
}
export function readMapDocument(doc){
  if(!doc||typeof doc!=='object'||!((doc.schema===MAP_SCHEMA_V1&&doc.generator===1)||
    (doc.schema===MAP_SCHEMA_V2&&doc.generator===2)||
    (doc.schema===MAP_SCHEMA_V3&&doc.generator===3)))
    throw Error('只接受 shiftlab.road.v1/v2/v3 與相同 generator 版本的設定');
  if(doc.config?.generator!==undefined&&doc.config.generator!==doc.generator)
    throw Error('設定檔的生成器版本不一致');
  return normalizeMapConfig({...doc.config,generator:doc.generator},true);
}
export function serializeMap(config){
  const normalized=normalizeMapConfig(config,true);
  return JSON.stringify({schema:normalized.generator===3?MAP_SCHEMA_V3:normalized.generator===2?MAP_SCHEMA_V2:MAP_SCHEMA_V1,
    generator:normalized.generator,config:normalized},null,2);
}
export function sameMap(a,b){
  if(!a||!b)return false;
  return (a.generator??1)===(b.generator??1)&&a.seed===b.seed&&MAP_FIELDS.every(key=>a[key]===b[key]);
}
export function makeMapSeed(cryptoSource=globalThis.crypto){
  let n;
  if(cryptoSource?.getRandomValues){
    const buf=new Uint32Array(1);cryptoSource.getRandomValues(buf);n=buf[0];
  }else n=(Date.now()^Math.floor(Math.random()*0x100000000))>>>0;
  return 'ROAD-'+n.toString(16).toUpperCase().padStart(8,'0');
}
export function describeRoute(route){
  const segments=route?.segments||[];
  const length=route?.points?.at(-1)?.s||0;
  return {generator:route?.config?.generator||1,
    seed:route?.config?.seed||'',distanceKm:Math.round(length/100)/10,
    bends:segments.filter(x=>x.type!=='straight').length,
    hairpins:segments.filter(x=>x.type.includes('hairpin')).length,
    climbs:segments.filter(x=>x.gradeTarget>0).length,
    descents:segments.filter(x=>x.gradeTarget<0).length,
    quality:route?.quality||null};
}
