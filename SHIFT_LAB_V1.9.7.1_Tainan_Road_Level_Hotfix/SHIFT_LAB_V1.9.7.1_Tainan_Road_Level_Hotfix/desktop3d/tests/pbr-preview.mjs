// DEV-only inspection of the actual render pipeline. Nothing is persisted or
// imported into production; physics/geometry are never changed here.
export function configurePBRPreview(context,options={}){
  const {renderer,vehicle,road}=context,scene=vehicle.group.parent;
  const sun=scene.children.find(x=>x.isDirectionalLight);if(!sun)throw Error('Directional light missing');
  if(options.shadows!==undefined){renderer.shadowMap.enabled=!!options.shadows;sun.castShadow=!!options.shadows;
    scene.traverse(object=>{for(const material of (Array.isArray(object.material)?object.material:object.material?[object.material]:[]))material.needsUpdate=true;});}
  if(options.bias!==undefined){if(!Number.isFinite(options.bias)||Math.abs(options.bias)>.01)throw Error('Invalid shadow bias');sun.shadow.bias=options.bias;}
  if(options.normalBias!==undefined){if(!Number.isFinite(options.normalBias)||options.normalBias<0||options.normalBias>.5)throw Error('Invalid normal bias');sun.shadow.normalBias=options.normalBias;}
  if(options.shadowSize!==undefined){
    if(![512,1024,2048,4096].includes(options.shadowSize)||options.shadowSize>renderer.capabilities.maxTextureSize)throw Error('Invalid shadow size');
    sun.shadow.mapSize.set(options.shadowSize,options.shadowSize);sun.shadow.map?.dispose();sun.shadow.map=null;
  }
  if(options.normalMaps!==undefined)for(const material of road.materialLibrary.materials.values()){
    material.normalScale.setScalar(options.normalMaps?1:0);
  }
  return {shadow:renderer.shadowMap.enabled,bias:sun.shadow.bias,normalBias:sun.shadow.normalBias,shadowSize:sun.shadow.mapSize.x,
    toneMapping:renderer.toneMapping,exposure:renderer.toneMappingExposure,environment:!!scene.environment,
    materialStats:road.materialLibrary.stats(),rendered:renderer.info.render};
}
