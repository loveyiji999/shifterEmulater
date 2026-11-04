import * as THREE from 'three';
const CELL=16,BUCKET=64;
const clamp=x=>Math.max(0,Math.min(1,x));
function hash(x,z,seed,salt){let n=Math.imul(x,374761393)^Math.imul(z,668265263)^seed^salt;
  n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
function noise(x,z,seed,scale,salt){x/=scale;z/=scale;const ix=Math.floor(x),iz=Math.floor(z);
  let u=x-ix,v=z-iz;u=u*u*(3-2*u);v=v*v*(3-2*v);
  const a=hash(ix,iz,seed,salt)*(1-u)+hash(ix+1,iz,seed,salt)*u;
  const b=hash(ix,iz+1,seed,salt)*(1-u)+hash(ix+1,iz+1,seed,salt)*u;return a*(1-v)+b*v;}
export function terrainColors(data,seed){
  const colors=new Float32Array(data.vertices.length);
  for(let i=0;i<colors.length;i+=3){const x=data.vertices[i],z=data.vertices[i+2],slope=1-clamp(data.normals[i+1]);
    const broad=noise(x,z,seed,105,701),detail=noise(x,z,seed,31,703),tone=.75+.23*broad+.08*detail;
    colors[i]=tone*(.98+.05*slope);colors[i+1]=tone*(1.02-.07*slope);colors[i+2]=tone*(.91+.06*slope);
  }
  return colors;
}
export class SceneryPlanner {
  constructor(core){this.core=core;this.seed=core.route.seedHash|0;this.buckets=new Map();
    const state=core.route.v3State;
    for(let i=1;i<state.points.length;i++){
      const a=state.points[i-1],b=state.points[i];
      const structural=state.features.some(f=>a.s<=f.end+45&&b.s>=f.start-45);
      const segment={a,b,clearance:structural?38:15};
      for(let x=Math.floor((Math.min(a.x,b.x)-44)/BUCKET);x<=Math.floor((Math.max(a.x,b.x)+44)/BUCKET);x++)
        for(let z=Math.floor((Math.min(a.z,b.z)-44)/BUCKET);z<=Math.floor((Math.max(a.z,b.z)+44)/BUCKET);z++){
          const key=x+','+z;if(!this.buckets.has(key))this.buckets.set(key,[]);this.buckets.get(key).push(segment);
        }
    }
  }
  clearOfRoad(x,z,radius){
    for(const j of this.core.route.v3State.junctions)if(Math.hypot(x-j.x,z-j.z)<45+radius)return false;
    for(const {a,b,clearance} of this.buckets.get(Math.floor(x/BUCKET)+','+Math.floor(z/BUCKET))||[]){
      const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1));
      if(Math.hypot(x-a.x-t*dx,z-a.z-t*dz)<clearance+radius)return false;
    }
    return true;
  }
  plan(terrain,tx,tz){
    const result=[],seed=this.seed;
    for(let ix=Math.floor(tx*128/CELL)-1;ix<=Math.floor((tx+1)*128/CELL)+1;ix++)
      for(let iz=Math.floor(tz*128/CELL)-1;iz<=Math.floor((tz+1)*128/CELL)+1;iz++){
        const x=Math.fround((ix+.5+(hash(ix,iz,seed,11)-.5)*.7)*CELL);
        const z=Math.fround((iz+.5+(hash(ix,iz,seed,13)-.5)*.7)*CELL);
        if(Math.floor(x/128)!==tx||Math.floor(z/128)!==tz)continue;
        const choice=hash(ix,iz,seed,17),density=.24+.42*noise(x,z,seed,170,19);
        const kind=choice<density?'tree':choice>.86?'rock':null;if(!kind)continue;
        const height=kind==='tree'?6+hash(ix,iz,seed,23)*4:.65+hash(ix,iz,seed,23)*1.7;
        const radius=kind==='tree'?1.7+hash(ix,iz,seed,29)*1.1:.7+hash(ix,iz,seed,29)*1.2;
        const trunkRadius=.18+hash(ix,iz,seed,31)*.16;
        if(!this.clearOfRoad(x,z,radius))continue;
        const footprint=terrain.footprint({x,z},0,kind==='tree'?trunkRadius:radius,kind==='tree'?trunkRadius:radius);
        if(!footprint||footprint.maxY-footprint.minY>(kind==='tree'?.4:height*.45))continue;
        result.push({id:kind+':'+ix+':'+iz,kind,x,z,height,radius,trunkRadius,
          y:Math.fround(footprint.minY-(kind==='tree'?.22:.12)),minGround:footprint.minY,maxGround:footprint.maxY,
          angle:hash(ix,iz,seed,37)*Math.PI*2,tint:.83+hash(ix,iz,seed,41)*.25});
      }
    return result;
  }
}
const trunk=new THREE.CylinderGeometry(1,1,1,10,1,false);
const rock=new THREE.DodecahedronGeometry(1,0);
for(let i=1;i<rock.attributes.position.array.length;i+=3)rock.attributes.position.array[i]=(Math.max(-.3,rock.attributes.position.array[i])+.3)/1.3;
function foliage(model){
  const vertices=[],indices=[],colors=[],sides=14;
  const seed=Array.from(model.id).reduce((n,c)=>Math.imul(n^c.charCodeAt(0),16777619),2166136261)|0;
  for(let level=0;level<8;level++){
    const base=.25+level*.09,radius=Math.pow(1-level/8, .72),first=vertices.length/3;
    for(let ring=0;ring<2;ring++)for(let n=0;n<sides;n++){
      const theta=(n/sides+level*.071)*Math.PI*2;
      const branch=.68+hash(n,level,seed,131)*.45;
      const r=radius*(ring?.19:branch);
      vertices.push(Math.sin(theta)*r,base+(ring?.13:-hash(n,level,seed,137)*.024),Math.cos(theta)*r);
      const light=ring?.72:.83+hash(n,level,seed,139)*.25;colors.push(light,light,light);
    }
    const bottom=vertices.length/3;vertices.push(0,base+.025,0,0,base+.13,0);colors.push(.7,.7,.7,.78,.78,.78);
    for(let n=0;n<sides;n++){
      const a=first+n,b=first+(n+1)%sides,c=first+sides+n,d=first+sides+(n+1)%sides;
      indices.push(a,b,c,b,d,c,bottom,b,a,bottom+1,c,d);
    }
  }
  return {attributes:{position:{array:new Float32Array(vertices)},color:{array:new Float32Array(colors)}},index:{array:new Uint32Array(indices)}};
}
function append(batch,template,model,sx,sy,sz,centerY){
  const source=template.attributes.position.array,index=template.index?.array||Uint32Array.from({length:source.length/3},(_,i)=>i);
  const vertices=new Float32Array(source.length),c=Math.cos(model.angle),s=Math.sin(model.angle),offset=batch.vertices.length/3;
  for(let i=0;i<source.length;i+=3){const x=source[i]*sx,z=source[i+2]*sz;
    vertices[i]=model.x+x*c+z*s;vertices[i+1]=centerY+source[i+1]*sy;vertices[i+2]=model.z-x*s+z*c;
    batch.vertices.push(vertices[i],vertices[i+1],vertices[i+2]);batch.uv.push(vertices[i],vertices[i+1]+vertices[i+2]*.3);
    const shade=template.attributes.color?.array[i]??1;batch.colors.push(model.tint*shade,model.tint*shade,model.tint*shade);
  }
  for(const i of index)batch.indices.push(offset+i);
  return {vertices,indices:new Uint32Array(index),renderFaces:Uint32Array.from({length:index.length/3},(_,i)=>(batch.indices.length-index.length)/3+i)};
}
export function buildScenery(models,tx=0,tz=0){
  const batches=Object.fromEntries(['trunk','foliage','rock'].map(k=>[k,{vertices:[],indices:[],uv:[],colors:[]}])),collisions=[];
  for(const model of models){
    if(model.kind==='tree'){
      collisions.push({...append(batches.trunk,trunk,model,model.trunkRadius,model.height*.65,model.trunkRadius,model.y+model.height*.325),kind:'trunk',id:model.id});
      append(batches.foliage,foliage(model),model,model.radius,model.height,model.radius,model.y);
    }else collisions.push({...append(batches.rock,rock,model,model.radius,model.height,model.radius*.85,model.y),kind:'rock',id:model.id});
  }
  const meshes={};
  for(const [kind,b] of Object.entries(batches))if(b.indices.length){
    const vertices=new Float32Array(b.vertices),indices=new Uint32Array(b.indices),geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));geometry.setIndex(new THREE.BufferAttribute(indices,1));geometry.computeVertexNormals();
    meshes[kind]={vertices,indices,normals:geometry.attributes.normal.array,uv:new Float32Array(b.uv),colors:new Float32Array(b.colors)};geometry.dispose();
  }
  return {models,meshes,collisions,layerId:`scenery-rock:${tx}:${tz}`};
}
