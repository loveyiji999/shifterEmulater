import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {SurfaceMaterialLibrary,MATERIAL_STYLES} from '../../src/surface-materials.mjs';
import {createSceneLighting} from '../../src/scene-lighting.mjs';
const renderer=new THREE.WebGLRenderer({canvas:document.getElementById('view'),antialias:true});
renderer.debug.onShaderError=(gl,program)=>{throw Error('Material shader failed: '+gl.getProgramInfoLog(program));};
renderer.setPixelRatio(Math.min(2,devicePixelRatio));const scene=new THREE.Scene();scene.background=new THREE.Color(0xa2c0cb);
const lighting=createSceneLighting(renderer,scene),library=new SurfaceMaterialLibrary();
const camera=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.1,100);camera.position.set(8,11,15);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,0);controls.update();
const names=['密級配瀝青','開級配瀝青','混凝土','混凝土磚','黏土磚','天然石','碎石','土路','木板','鋼板'];
const labels=[];
for(const [index,id] of Object.keys(MATERIAL_STYLES).entries()){
  const x=(index%5-2)*3,z=(Math.floor(index/5)-.5)*3.6,geometry=new THREE.PlaneGeometry(2.5,2.5);
  const uv=geometry.attributes.uv;for(let n=0;n<uv.count;n++)uv.setXY(n,uv.getX(n)*2.5,uv.getY(n)*2.5);
  const slab=new THREE.Mesh(geometry,library.material(id));slab.rotation.x=-Math.PI/2;slab.position.set(x,.08,z);slab.receiveShadow=true;
  scene.add(slab);
  const frame=new THREE.Mesh(new THREE.BoxGeometry(2.58,.12,2.58),new THREE.MeshStandardMaterial({color:0x333c42,roughness:.8}));
  frame.position.set(x,0,z);frame.castShadow=true;scene.add(frame);
  const label=document.createElement('div');label.className='label';label.textContent=names[index];document.body.append(label);
  labels.push({label,position:new THREE.Vector3(x,.1,z+1.5)});
}
library.configureAnisotropy(renderer.capabilities.getMaxAnisotropy());
const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:0x747b77,roughness:1}));
floor.rotation.x=-Math.PI/2;floor.position.y=-.1;floor.receiveShadow=true;scene.add(floor);
const resize=()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();};
addEventListener('resize',resize);resize();
function frame(){controls.update();for(const {label,position}of labels){const p=position.clone().project(camera);
  label.style.left=(p.x*.5+.5)*innerWidth+'px';label.style.top=(-p.y*.5+.5)*innerHeight+'px';label.style.transform='translate(-50%,-50%)';}
  renderer.render(scene,camera);requestAnimationFrame(frame);}
document.getElementById('status').textContent='外觀預覽：10/10；所有紋理為專案程序生成，細節法線不改變碰撞。';
if(import.meta.env.DEV)window.__SHIFT_LAB_MATERIAL_GALLERY__={snapshot:()=>({materialIds:Object.keys(MATERIAL_STYLES),
  ...library.stats(),shadow:renderer.shadowMap.enabled,environment:!!scene.environment,toneMapping:renderer.toneMapping})};
addEventListener('pagehide',()=>{lighting.dispose();library.dispose();controls.dispose();renderer.dispose();});frame();
