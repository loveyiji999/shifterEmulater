import * as THREE from 'three';
export function inspectTunnelLighting({getContext,stepOnce,setPause,frameView},view='interior'){
  const {core,road,bridge,renderer,camera,sceneLighting}=getContext();
  const f=core.route.v3State.features.find(f=>f.kind==='tunnel');if(!f)throw Error('Tunnel fixture missing');
  const stations={entry:f.start-10,threshold:f.start+8,interior:(f.start+f.end)/2,exit:f.end+10},s=stations[view];
  if(s===undefined)throw Error('Unknown tunnel view');
  setPause(true);core.inputKeys.clear();core.releaseKeyboardOverride();core.requestGear(0);
  Object.assign(core.hostControls,{active:true,steer:0,throttle:0,brake:0,clutch:1,parkPawl:false});
  const p=core.roadPointAt(s);road.ensure(s);bridge.teleport({roadPoint:{...p,y:road.position(s,0).y}});
  for(let i=0;i<120;i++)if(stepOnce()===false)throw Error('Missing prepared ground');
  frameView();
  const forward=new THREE.Vector3(Math.sin(p.heading),0,Math.cos(p.heading)),at=bridge.rigidBody.translation();
  camera.position.set(at.x,at.y+1.4,at.z).addScaledVector(forward,-7);
  camera.lookAt(new THREE.Vector3(at.x,at.y+.5,at.z).addScaledVector(forward,20));
  const capture=()=>{
    renderer.render(road.scene,camera);const gl=renderer.getContext();
    for(const program of renderer.info.programs)if(!gl.getProgramParameter(program.program,gl.LINK_STATUS))throw Error('Tunnel shader failed to link');
    const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,data=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,data);
    let total=0,count=0;for(let y=Math.floor(h*.12);y<h*.5;y+=8)for(let x=Math.floor(w*.2);x<w*.8;x+=8){const i=(y*w+x)*4;total+=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];count++;}
    return {meanDisplayLuma:total/count,image:renderer.domElement.toDataURL('image/png')};
  };
  const withLights=capture(),pose={...bridge.rigidBody.translation()},lighting=sceneLighting.tunnel;
  const intensities=lighting.lights.map(l=>l.intensity);lighting.lights.forEach(l=>l.intensity=0);
  let withoutLights;try{withoutLights=capture();}finally{lighting.lights.forEach((l,i)=>l.intensity=intensities[i]);}
  if(JSON.stringify(pose)!==JSON.stringify(bridge.rigidBody.translation()))throw Error('Rendering changed body position');
  return {view,s,feature:{start:f.start,end:f.end},sky:lighting.vehicleSky.value,tunnelId:lighting.vehicleTunnel.value,
    activeLights:lighting.active.length,totalLights:lighting.lights.length,contacts:core.suspension.contacts,
    invalidWheelLoads:bridge.invalidWheelLoads,exposure:renderer.toneMappingExposure,pose,
    withLights,withoutLights,scope:'fixed-exposure live gameplay visual check; display-luma is not calibrated illuminance'};
}
