import * as THREE from 'three';
import {TunnelLighting} from './tunnel-lighting.mjs';

export function createSceneLighting(renderer,scene){
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  const hemi=new THREE.HemisphereLight(0xdcecff,0x5c503a,.65),sun=new THREE.DirectionalLight(0xfff2dc,3);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-80;sun.shadow.camera.right=80;
  sun.shadow.camera.top=80;sun.shadow.camera.bottom=-80;sun.shadow.camera.near=1;sun.shadow.camera.far=330;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias=.08;sun.shadow.bias=-.0003;
  scene.add(hemi,sun,sun.target);
  const sky=new THREE.Scene(),geometry=new THREE.SphereGeometry(10,32,16);
  const material=new THREE.ShaderMaterial({side:THREE.BackSide,
    vertexShader:'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`varying vec3 direction;void main(){vec3 d=normalize(direction);
      vec3 sky=mix(vec3(.55,.67,.76),vec3(.10,.23,.42),pow(max(d.y,0.0),.55));
      sky=mix(vec3(.09,.075,.05),sky,smoothstep(-.15,.05,d.y));
      float disc=smoothstep(.9995,.99985,dot(d,normalize(vec3(-40.,125.,80.))));
      gl_FragColor=vec4(sky+vec3(12.,10.,8.)*disc,1.0);}`});
  sky.add(new THREE.Mesh(geometry,material));
  const generator=new THREE.PMREMGenerator(renderer),environment=generator.fromScene(sky,.04,.1,100);
  scene.environment=environment.texture;scene.environmentIntensity=.35;
  generator.dispose();geometry.dispose();material.dispose();
  let tunnel=null;
  const update=p=>{
    const texel=160/sun.shadow.mapSize.x,x=Math.round(p.x/texel)*texel,z=Math.round(p.z/texel)*texel;
    sun.target.position.set(x,p.y,z);sun.position.set(x-40,p.y+125,z+80);sun.target.updateMatrixWorld();tunnel?.update(p);
  };
  update({x:0,y:0,z:0});
  return {sun,hemi,update,get tunnel(){return tunnel;},attachRoad(road){tunnel?.dispose();tunnel=new TunnelLighting(scene,road);return tunnel;},dispose(){tunnel?.dispose();scene.remove(hemi,sun,sun.target);if(scene.environment===environment.texture)scene.environment=null;
    environment.dispose();sun.shadow.map?.dispose();}};
}
