import * as THREE from 'three';
// External inspection only: no scene or vehicle integration is replaced.
export function inspectScenery({road}){
  road.scene.updateMatrixWorld(true);let rockQueries=0,trunkQueries=0,maxError=0;
  const signatures=[];
  for(const tile of road.terrain.tiles.values())if(tile.scenery){
    const s=tile.scenery;
    for(const model of s.models)signatures.push([model.id,model.x,model.y,model.z,model.height,model.radius]);
    for(const entry of s.colliders){
      const model=s.models.find(m=>m.id===entry.id),isRock=entry.kind==='rock';
      if(isRock?rockQueries>=32:trunkQueries>=32)continue;
      const n={x:Math.sin(model.angle+Math.PI/10),z:Math.cos(model.angle+Math.PI/10)};
      const origin=isRock?new THREE.Vector3(model.x+model.radius*.123,model.y+model.height+2,model.z+model.radius*.177):
        new THREE.Vector3(model.x+n.x*(model.trunkRadius+1),model.y+model.height*.3,model.z+n.z*(model.trunkRadius+1));
      const direction=isRock?new THREE.Vector3(0,-1,0):new THREE.Vector3(-n.x,0,-n.z);
      const mesh=s.objects.find(m=>m.userData.sceneryKind===entry.kind);
      const visual=new THREE.Raycaster(origin,direction,0,10).intersectObject(mesh)[0];
      const actual=road.world.castRayAndGetNormal(new road.rapier.Ray(origin,direction),10,true,undefined,undefined,undefined,undefined,c=>c.handle===entry.collider.handle);
      if(!visual||!actual)throw Error('Scenery visible/collision query missing: '+model.id);
      maxError=Math.max(maxError,Math.abs(visual.distance-actual.timeOfImpact));
      if(isRock){const contact=road.surfaceAtHit(actual);if(contact.material!=='natural_stone'||contact.condition!==road.surfaceMap.condition||contact.faceIndex!==visual.faceIndex)throw Error('Rock face/contact mismatch');rockQueries++;}
      else{if(road.groundHandles.has(entry.collider.handle))throw Error('Trunk incorrectly registered as wheel ground');trunkQueries++;}
    }
  }
  signatures.sort((a,b)=>a[0].localeCompare(b[0]));
  return {...road.terrain.sceneryStats(),rockQueries,trunkQueries,maxErrorM:maxError,signature:JSON.stringify(signatures),condition:road.surfaceMap.condition};
}

export function driveRockContact({getContext,stepOnce,setPause}){
  setPause(true);const selector=document.getElementById('drive-mode');selector.value='manual';selector.dispatchEvent(new Event('change'));
  const {core:d,road,bridge}=getContext();d.inputKeys.clear();d.releaseKeyboardOverride();d.requestGear(0);
  Object.assign(d.hostControls,{active:true,steer:0,throttle:0,brake:0,clutch:1,parkPawl:false});
  const entries=[...road.terrain.tiles.values()].flatMap(t=>t.scenery?.models||[]);
  const model=entries.find(m=>m.kind==='rock'&&m.radius>1.3&&m.height<1.4&&m.z>0)||entries.find(m=>m.kind==='rock');
  if(!model)throw Error('Boulder fixture missing');
  const x=model.x+model.radius*.123,z=model.z+model.radius*.177,corner=d.wheelCoords('FL');
  const point={...d.roadPointAt(70),x:x-corner.x,z:z-corner.z};road.ensure(70,point);road.world.step();
  const hit=road.world.castRayAndGetNormal(new road.rapier.Ray({x,y:model.y+model.height+2,z},{x:0,y:-1,z:0}),10,true,
    undefined,undefined,undefined,undefined,c=>road.surfaceMap.bindings.get(c.handle)?.sceneryId===model.id);
  if(!hit)throw Error('Actual boulder support missing');
  point.y=model.y+model.height+2-hit.timeOfImpact;bridge.teleport({roadPoint:point,speed:0});
  const start=bridge.rigidBody.translation(),samples=[];
  for(let i=0;i<60;i++){
    if(stepOnce()===false)throw Error('Rock test support not ready');
    samples.push({time:d.state.time,pose:bridge.rigidBody.translation(),contacts:d.WHEEL_IDS.map(id=>({id,surface:d.wheelModel[id].contactSurface,normal:d.wheelModel[id].normal,capacity:d.wheelModel[id].capacity}))});
  }
  return {modelId:model.id,samples,invalidWheelLoads:bridge.invalidWheelLoads,start,end:bridge.rigidBody.translation(),fixedHz:120,microstepHz:480};
}
