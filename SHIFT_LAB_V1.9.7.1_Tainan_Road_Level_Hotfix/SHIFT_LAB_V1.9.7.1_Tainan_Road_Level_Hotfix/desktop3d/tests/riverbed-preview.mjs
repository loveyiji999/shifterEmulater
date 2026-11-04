import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createSceneLighting} from '../src/scene-lighting.mjs';

const data=JSON.parse(document.getElementById('riverbed-data').textContent),renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#a2c0cb');
const lighting=createSceneLighting(renderer,scene),before=new THREE.Group(),after=new THREE.Group(),structure=new THREE.Group();
scene.add(before,after,structure);
const materials={ground:new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}),
  water:new THREE.MeshStandardMaterial({color:'#257b94',roughness:.27,transparent:true,opacity:.82,depthWrite:false,side:THREE.DoubleSide}),
  structure:new THREE.MeshStandardMaterial({color:'#9a9a90',roughness:.8}),asphalt:new THREE.MeshStandardMaterial({color:'#333b40',roughness:.9}),
  rail:new THREE.MeshStandardMaterial({color:'#7b857f',metalness:.5,roughness:.5})};
const decode=(encoded,Type)=>{const text=atob(encoded),bytes=new Uint8Array(text.length);for(let i=0;i<text.length;i++)bytes[i]=text.charCodeAt(i);return new Type(bytes.buffer);};
for(const name of ['before','ground','water','bridge'])for(const part of data[name]){
  part.vertices=decode(part.vertices,Float32Array);part.indices=decode(part.indices,Uint32Array);if(part.normals)part.normals=decode(part.normals,Float32Array);
}
function mesh(part,material,source=null){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(part.vertices,3));
  geometry.setIndex(new THREE.BufferAttribute(part.indices,1));if(part.normals)geometry.setAttribute('normal',new THREE.Float32BufferAttribute(part.normals,3));else geometry.computeVertexNormals();
  if(material===materials.ground){const colors=[];
    for(let i=0;i<part.vertices.length;i+=3)colors.push(...(source&&part.vertices[i+1]<source.vertices[i+1]-.01?[.37,.25,.14]:[.28,.36,.23]));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));}
  const object=new THREE.Mesh(geometry,material);object.castShadow=material!==materials.water;object.receiveShadow=true;return object;
}
data.before.forEach(part=>before.add(mesh(part,materials.ground)));
data.ground.forEach((part,i)=>after.add(mesh(part,materials.ground,data.before[i])));
data.water.filter(part=>part.indices.length).forEach(part=>after.add(mesh(part,materials.water)));
data.bridge.forEach(part=>structure.add(mesh(part,materials[part.kind]||materials.structure)));
const bounds=new THREE.Box3().setFromObject(before),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),distance=Math.max(size.x,size.z)*.75;
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.5,3000);
camera.position.copy(center).add(new THREE.Vector3(distance*.8,distance*.85,distance));
const controls=new OrbitControls(camera,renderer.domElement);controls.target.copy(center);controls.update();lighting.update(center);
const status=document.getElementById('status');
status.textContent=data.seed+' · '+(data.status==='geometry-candidate'?(data.kind==='lake'?'封閉靜態湖面候選；水體接觸與串流待整合':'局部幾何候選；出口尚待接續'):'未通過施工檢查：'+data.issues.join(' / '));
function showAfter(value){before.visible=!value;after.visible=value;renderer.render(scene,camera);}
document.getElementById('before').onclick=()=>showAfter(false);document.getElementById('after').onclick=()=>showAfter(true);
window.addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
window.__SHIFT_LAB_RIVERBED_PREVIEW__={ready:true,showAfter,snapshot:()=>({kind:data.kind||'riverbed',seed:data.seed,status:data.status,issues:data.issues,
  afterVisible:after.visible,groundParts:data.ground.length,waterTriangles:data.summary.waterTriangles,
  camera:camera.position.toArray(),target:controls.target.toArray(),device:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),geometries:renderer.info.memory.geometries})};
showAfter(true);
function render(){controls.update();renderer.render(scene,camera);requestAnimationFrame(render);}render();
