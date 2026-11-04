import {readDesignData,requireKeys,requireText,inRange,designFingerprint} from './design-data.mjs';
export const SURFACE_SCHEMA='shiftlab.surface.v1';
export const MATERIAL_IDS=Object.freeze(['asphalt_dense','asphalt_open','concrete','concrete_paver',
  'clay_paver','natural_stone','gravel','earth','timber','steel']);
export const CONDITION_IDS=Object.freeze(['dry','wet','puddled','muddy','snow','ice']);

export function readSurfaceDefinition(input){
  const s=readDesignData(input);
  requireKeys(s,['schema','revision','id','material','condition','pbr','contact','evidence'],'surface');
  if(s.schema!==SURFACE_SCHEMA||s.revision!==1)throw Error('Unsupported surface version');
  requireText(s.id,'surface id');
  if(!MATERIAL_IDS.includes(s.material)||!CONDITION_IDS.includes(s.condition))throw Error('Unknown material/condition');
  requireKeys(s.pbr,['color','roughness','metalness','uvMeters'],'PBR');
  if(typeof s.pbr.color!=='string'||!/^#[0-9a-f]{6}$/i.test(s.pbr.color))throw Error('Invalid surface color');
  inRange(s.pbr.roughness,0,1,'roughness');inRange(s.pbr.metalness,0,1,'metalness');
  inRange(s.pbr.uvMeters,.05,100,'texture scale in meters');
  requireKeys(s.evidence,['basis','source','status'],'surface evidence');
  if(!['legacy-illustrative','project-illustrative','candidate','measured'].includes(s.evidence.basis))throw Error('Invalid evidence basis');
  requireText(s.evidence.source,'surface source',2048);
  if(!['preview-only','verified-gameplay'].includes(s.evidence.status))throw Error('Invalid surface status');
  if(s.evidence.basis==='candidate'&&s.evidence.status!=='preview-only')throw Error('Candidate material must remain preview only');
  if(s.contact===null){if(s.evidence.status!=='preview-only')throw Error('No contact profile; preview only');}
  else{
    requireKeys(s.contact,['tireMu','rollingCoefficient','colliderFriction'],'contact');
    inRange(s.contact.tireMu,.01,2,'tire mu');inRange(s.contact.rollingCoefficient,0,.2,'rolling coefficient');
    inRange(s.contact.colliderFriction,0,2,'rigid-body friction');
  }
  return s;
}
export function requireDrivableSurface(input,verifiedProfiles){
  const s=readSurfaceDefinition(input);
  if(!s.contact||s.evidence.status!=='verified-gameplay')throw Error('Surface is not verified for driving');
  // An imported status string is not verification evidence. The host supplies
  // its internally approved profile fingerprints, never the imported file.
  if(!(verifiedProfiles instanceof Map)||verifiedProfiles.get(s.id)!==designFingerprint(s))
    throw Error('Surface is absent from the trusted gameplay registry');
  return s;
}
// Contact keys are tied to actual collider handles and faces, not XY alone.
export function readSurfaceBinding(input){
  const b=readDesignData(input);
  requireKeys(b,['colliderHandle','faceIndex','layerId','surfaceId'],'surface binding');
  if(!Number.isFinite(b.colliderHandle)||b.colliderHandle<0||
    !(b.faceIndex===null||Number.isInteger(b.faceIndex)&&b.faceIndex>=0))throw Error('Invalid collider/face binding');
  requireText(b.layerId,'road layer');requireText(b.surfaceId,'surface id');return b;
}
