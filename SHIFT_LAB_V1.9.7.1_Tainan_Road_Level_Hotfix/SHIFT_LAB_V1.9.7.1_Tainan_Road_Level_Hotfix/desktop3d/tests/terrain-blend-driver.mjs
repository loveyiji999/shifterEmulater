import * as THREE from 'three';
// DEV-only inspection of the live gameplay geometry/material, not a replica.
export function inspectTerrainBlend({road,renderer,camera},overview=false){
  road.scene.updateMatrixWorld(true);
  let queries=0,maxHeightError=0,maxWeightError=0;const ranges=[[1,0],[1,0],[1,0]],samples=[];
  for(const tile of road.terrain.tiles.values()){
    const mesh=tile.mesh,g=mesh.geometry,weights=g.attributes.terrainWeights;
    if(!weights||mesh.material.name!=='terrain-three-layer')throw Error('Live terrain blend missing');
    for(let i=0;i<weights.count;i++)for(let c=0;c<3;c++){
      const w=weights.array[i*3+c];ranges[c][0]=Math.min(ranges[c][0],w);ranges[c][1]=Math.max(ranges[c][1],w);
    }
    for(let f=0;f<g.index.count/3;f+=Math.max(1,Math.floor(g.index.count/3/12))){
      const ids=[0,1,2].map(k=>g.index.getX(f*3+k)),p=new THREE.Vector3();
      ids.forEach((id,k)=>p.addScaledVector(new THREE.Vector3().fromBufferAttribute(g.attributes.position,id),[.2,.3,.5][k]));
      const origin=p.clone().add(new THREE.Vector3(0,2,0)),down=new THREE.Vector3(0,-1,0);
      const visual=new THREE.Raycaster(origin,down,0,4).intersectObject(mesh)[0];
      const hit=road.world.castRayAndGetNormal(new road.rapier.Ray(origin,down),4,true,undefined,undefined,undefined,undefined,
        c=>tile.colliders.some(v=>v.handle===c.handle));
      if(!visual||!hit)throw Error('Terrain surface query missing');
      const contact=road.surfaceAtHit(hit,visual.point),face=visual.face,bc=visual.barycoord;
      const expected=[0,1,2].map(c=>weights.array[face.a*3+c]*bc.x+weights.array[face.b*3+c]*bc.y+weights.array[face.c*3+c]*bc.z);
      maxWeightError=Math.max(maxWeightError,...expected.map((v,i)=>Math.abs(v-contact.components[i].weight)));
      maxHeightError=Math.max(maxHeightError,Math.abs(hit.timeOfImpact-visual.distance));
      samples.push({x:p.x,z:p.z,face:contact.faceIndex,layerId:contact.layerId,components:contact.components,tireMu:contact.tireMu,
        rollingCoefficient:contact.rollingCoefficient,condition:contact.condition});queries++;
    }
  }
  if(overview){
    const p=road.physics.roadPointAt(70);camera.position.set(p.x+65,p.y+50,p.z+100);camera.lookAt(p.x+20,p.y,p.z+55);
    renderer.render(road.scene,camera);
  }
  const gl=renderer.getContext();
  for(const program of renderer.info.programs)if(!gl.getProgramParameter(program.program,gl.LINK_STATUS))throw Error('Shader program failed to link');
  return {queries,maxHeightError,maxWeightError,ranges,samples,condition:road.surfaceMap.condition,
    material:road.terrain.material.name,textures:road.materialLibrary.stats().textures,image:overview?renderer.domElement.toDataURL('image/png'):undefined};
}
