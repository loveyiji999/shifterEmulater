import * as THREE from 'three';

export const MATERIAL_STYLES=Object.freeze({
  asphalt_dense:{color:'#344149',roughness:.93,metalness:0,meters:2,relief:.0008},
  asphalt_open:{color:'#394046',roughness:.97,metalness:0,meters:2,relief:.0015},
  concrete:{color:'#b0aea4',roughness:.85,metalness:0,meters:4,relief:.0005},
  concrete_paver:{color:'#a49b89',roughness:.9,metalness:0,meters:2,relief:.001},
  clay_paver:{color:'#a05a3c',roughness:.88,metalness:0,meters:2,relief:.001},
  natural_stone:{color:'#9a9890',roughness:.8,metalness:0,meters:2,relief:.0015},
  gravel:{color:'#8c8270',roughness:.98,metalness:0,meters:2,relief:.002},
  earth:{color:'#747455',roughness:1,metalness:0,meters:4,relief:.001},
  timber:{color:'#8c6843',roughness:.82,metalness:0,meters:2,relief:.001},
  steel:{color:'#a0aab0',roughness:.48,metalness:.85,meters:2,relief:.0007}
});
const fract=x=>x-Math.floor(x);
const hash=(x,y,salt=0)=>{let n=Math.imul(x,374761393)^Math.imul(y,668265263)^salt;
  n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
function periodicNoise(u,v,cells,salt){
  const x=fract(u)*cells,y=fract(v)*cells,a=Math.floor(x),b=Math.floor(y),s=t=>t*t*(3-2*t),p=s(x-a),q=s(y-b);
  const at=(x,y)=>hash((x+cells)%cells,(y+cells)%cells,salt);
  return (at(a,b)*(1-p)+at(a+1,b)*p)*(1-q)+(at(a,b+1)*(1-p)+at(a+1,b+1)*p)*q;
}
function sample(id,u,v,x,y){
  const grain=hash(x,y,91),fine=hash(x,y,173),macro=.75*periodicNoise(u,v,4,201)+.25*periodicNoise(u,v,8,251);
  let h=grain*.3,shade=.83+grain*.17,rough=.83+fine*.17;
  if(id.startsWith('asphalt')){
    const pit=grain<(id==='asphalt_open'?.21:.06);
    h=pit?-.7:grain*.35;shade=pit?.55:.74+grain*.26;
  }else if(id==='concrete'){
    const joint=Math.min(u,1-u,v,1-v)<.003,groove=Math.abs(fract(v*180)-.5)>.42;
    h=joint?-.6:grain*.1-(groove?.05:0);shade=joint?.5:.91+grain*.07;
  }else if(['concrete_paver','clay_paver','natural_stone'].includes(id)){
    const cols=id==='natural_stone'?5:10,rows=id==='natural_stone'?6:20,row=Math.floor(v*rows);
    const weave=(Math.floor(u*5)+Math.floor(v*5))%2;
    const px=id==='clay_paver'?fract(u*(weave?5:10)):fract(u*cols+(row%2)*.5);
    const pz=id==='clay_paver'?fract(v*(weave?10:5)):fract(v*rows),joint=Math.min(px,1-px,pz,1-pz)<.04;
    const tint=hash(Math.floor(u*cols+(row%2)*.5)%cols,row,19);
    h=joint?-.8:.3+grain*.05;shade=joint?.48:.75+tint*.25;
  }else if(id==='gravel'){
    const gx=u*24,gy=v*24;let nearest=10,tint=0;
    for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){
      const ix=Math.floor(gx)+a,iy=Math.floor(gy)+b,xx=hash((ix+24)%24,(iy+24)%24,11),yy=hash((ix+24)%24,(iy+24)%24,31);
      const d=Math.hypot(gx-ix-.2-xx*.6,gy-iy-.2-yy*.6);
      if(d<nearest){nearest=d;tint=hash((ix+24)%24,(iy+24)%24,61);}
    }
    h=Math.max(0,1-nearest*1.5);shade=.55+tint*.35+h*.1;
  }else if(id==='exposed_rock'){
    const strata=Math.sin(2*Math.PI*(v*7+Math.sin(u*2*Math.PI)*.3));
    h=macro*.3+grain*.12+strata*.1;shade=.62+macro*.2+grain*.1+strata*.05;rough=.85+fine*.15;
  }else if(id==='earth'){
    const streak=Math.sin(u*Math.PI*20+Math.sin(v*Math.PI*4)*.4);
    h=grain*.2+macro*.15+streak*.03;shade=.72+macro*.18+grain*.1;
  }else if(id==='timber'){
    const joint=Math.min(fract(u*8),1-fract(u*8))<.025;
    const fiber=Math.sin(u*Math.PI*230+Math.sin(v*Math.PI*6)*2);
    h=joint?-.7:grain*.08+fiber*.05;shade=joint?.4:.78+fiber*.08+grain*.14;
  }else if(id==='steel'){
    const a=Math.abs(fract((u+v)*18)-.5),b=Math.abs(fract((u-v)*18)-.5);
    h=(a<.055||b<.055)?.6:0;shade=.9+fine*.1;rough=.7+grain*.3;
  }
  return {h,shade,rough};
}
export function buildSurfaceMaps(id,size=256){
  const style=id==='exposed_rock'?{meters:4,relief:.0015}:MATERIAL_STYLES[id];
  if(!style||!Number.isInteger(size)||size<16||size>1024||(size&(size-1)))throw Error('Invalid surface texture request');
  const height=new Float32Array(size*size),color=new Uint8Array(size*size*4),roughness=new Uint8Array(size*size*4),normal=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=y*size+x,p=sample(id,x/size,y/size,x,y);height[i]=p.h;
    const channel=Math.round(p.shade*255),r=Math.round(p.rough*255);
    color.set([channel,channel,channel,255],i*4);roughness.set([r,r,r,255],i*4);
  }
  const h=(x,y)=>height[((y+size)%size)*size+(x+size)%size];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const dx=(h(x+1,y)-h(x-1,y))*style.relief/(2*style.meters/size);
    const dy=(h(x,y+1)-h(x,y-1))*style.relief/(2*style.meters/size),L=Math.hypot(dx,dy,1),i=(y*size+x)*4;
    normal.set([Math.round((-dx/L*.5+.5)*255),Math.round((-dy/L*.5+.5)*255),Math.round((1/L*.5+.5)*255),255],i);
  }
  return {color,normal,roughness,size,meters:style.meters,reliefMeters:style.relief};
}
export class SurfaceMaterialLibrary {
  constructor(size=256){this.size=size;this.maps=new Map();this.materials=new Map();this.disposed=false;this.anisotropy=1;}
  textures(id){
    if(this.disposed)throw Error('Surface material library disposed');
    if(!this.maps.has(id)){
      const source=buildSurfaceMaps(id,this.size),textures={};
      for(const key of ['color','normal','roughness']){
        const texture=new THREE.DataTexture(source[key],source.size,source.size,THREE.RGBAFormat);
        texture.name=id+'.'+key;texture.colorSpace=key==='color'?THREE.SRGBColorSpace:THREE.NoColorSpace;
        texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.minFilter=THREE.LinearMipmapLinearFilter;
        texture.repeat.set(1/source.meters,1/source.meters);texture.anisotropy=this.anisotropy;
        texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;textures[key]=texture;
      }
      this.maps.set(id,textures);
    }
    return this.maps.get(id);
  }
  material(id,key=id,overrides={}){
    if(this.disposed)throw Error('Surface material library disposed');
    if(!this.materials.has(key)){
      const style=MATERIAL_STYLES[id],maps=this.textures(id);
      const m=new THREE.MeshStandardMaterial({color:style.color,roughness:style.roughness,metalness:style.metalness,
        map:maps.color,normalMap:maps.normal,roughnessMap:maps.roughness,side:THREE.DoubleSide,...overrides});
      m.name=key;m.userData={surfaceMaterial:id,uvMeters:style.meters,authored:true,reliefMeters:style.relief};this.materials.set(key,m);
    }
    return this.materials.get(key);
  }
  configureAnisotropy(maximum){this.anisotropy=Math.max(1,Math.min(8,maximum));
    for(const maps of this.maps.values())for(const t of Object.values(maps))if(t.anisotropy!==this.anisotropy){t.anisotropy=this.anisotropy;t.needsUpdate=true;}}
  stats(){return {materials:this.materials.size,textures:this.maps.size*3,
    estimatedTextureBytes:this.maps.size*3*this.size*this.size*4*4/3};}
  dispose(){if(this.disposed)return;for(const m of this.materials.values())m.dispose();
    for(const maps of this.maps.values())for(const t of Object.values(maps))t.dispose();
    this.materials.clear();this.maps.clear();this.disposed=true;}
}
