import {buildRoadChunkV3} from './road-geometry-v3.mjs';
import {valleyDepth} from './terrain-profile.mjs';

export const TERRAIN_TILE_SIZE=128;
const CELL=8,BUCKET=32;
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const cross=(a,b,p)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
const area=p=>p.reduce((n,a,i)=>{const b=p[(i+1)%p.length];return n+a.x*b.z-b.x*a.z;},0)/2;
const interpolate=(a,b,t)=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
function split(polygon,a,b){
  const inside=[],outside=[];
  for(let i=0;i<polygon.length;i++){
    const p=polygon[i],q=polygon[(i+1)%polygon.length],u=cross(a,b,p),v=cross(a,b,q);
    if(u>=-1e-9)inside.push(p);
    if(u<=1e-9)outside.push(p);
    if(u>1e-9&&v< -1e-9||u< -1e-9&&v>1e-9){
      const hit=interpolate(p,q,u/(u-v));inside.push(hit);outside.push(hit);
    }
  }
  return {inside,outside};
}
// Convex subtraction, retaining disjoint outside pieces. Terrain is cut at the
// actual road triangles, rather than hiding a second surface under pavement.
function subtract(polygon,triangle){
  const result=[];let remainder=polygon;
  for(let i=0;i<3&&remainder.length>=3;i++){
    const cut=split(remainder,triangle[i],triangle[(i+1)%3]);
    if(cut.outside.length>=3&&Math.abs(area(cut.outside))>1e-7)result.push(cut.outside);
    remainder=cut.inside;
  }
  return result;
}
function bounds(p){return {minX:Math.min(...p.map(v=>v.x)),maxX:Math.max(...p.map(v=>v.x)),
  minZ:Math.min(...p.map(v=>v.z)),maxZ:Math.max(...p.map(v=>v.z))};}
const overlap=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minZ<=b.maxZ&&a.maxZ>=b.minZ;
function closest(p,triangle){
  const [a,b,c]=triangle,den=cross(a,b,c);
  const u=cross(b,c,p)/den,v=cross(c,a,p)/den,w=1-u-v;
  if(u>=-1e-9&&v>=-1e-9&&w>=-1e-9)return {distance:0,y:u*a.y+v*b.y+w*c.y};
  let best={distance:Infinity,y:0};
  for(let i=0;i<3;i++){
    const a=triangle[i],b=triangle[(i+1)%3],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
    const distance=Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);
    if(distance<best.distance)best={distance,y:a.y+(b.y-a.y)*t};
  }
  return best;
}

// Clipping can introduce a vertex partway along a neighbouring triangle edge.
// Split that edge in both faces, including internal cell/polygon boundaries.
// Shared vertices follow the sampled height, so there is no skirt or hidden gap.
function conform(vertices,normals,uv){
  const points=new Map(),buckets=new Map();
  for(let i=0;i<vertices.length;i+=3){
    const x=vertices[i],z=vertices[i+2],key=x.toPrecision(14)+','+z.toPrecision(14);
    if(points.has(key))continue;
    const p={x,z,y:vertices[i+1],normal:normals.slice(i,i+3),uv:uv.slice(i/3*2,i/3*2+2)};
    points.set(key,p);const bucket=Math.floor(x/CELL)+','+Math.floor(z/CELL);
    if(!buckets.has(bucket))buckets.set(bucket,[]);buckets.get(bucket).push(p);
  }
  const output=[],outputNormals=[],outputUV=[];
  const write=p=>{output.push(p.x,p.y,p.z);outputNormals.push(...p.normal);outputUV.push(...p.uv);};
  for(let i=0;i<vertices.length;i+=9){
    const triangle=[0,1,2].map(k=>({x:vertices[i+k*3],y:vertices[i+k*3+1],z:vertices[i+k*3+2],
      normal:normals.slice(i+k*3,i+k*3+3),uv:uv.slice((i/3+k)*2,(i/3+k)*2+2)}));
    const ring=[];let changed=false;
    for(let n=0;n<3;n++){
      const a=triangle[n],b=triangle[(n+1)%3],dx=b.x-a.x,dz=b.z-a.z,L2=dx*dx+dz*dz,candidates=[];
      ring.push(a);if(L2<1e-14)continue;
      for(let x=Math.floor((Math.min(a.x,b.x)-1e-7)/CELL);x<=Math.floor((Math.max(a.x,b.x)+1e-7)/CELL);x++)
        for(let z=Math.floor((Math.min(a.z,b.z)-1e-7)/CELL);z<=Math.floor((Math.max(a.z,b.z)+1e-7)/CELL);z++)
          for(const p of buckets.get(x+','+z)||[]){
            const t=((p.x-a.x)*dx+(p.z-a.z)*dz)/L2;
            if(t>1e-7&&t<1-1e-7&&Math.abs(cross(a,b,p))/Math.sqrt(L2)<1e-7)candidates.push({p,t});
          }
      candidates.sort((a,b)=>a.t-b.t);for(const {p} of candidates)ring.push(p);
      changed ||= candidates.length>0;
    }
    if(!changed){triangle.forEach(write);continue;}
    const center={x:0,y:0,z:0,normal:[0,0,0],uv:[0,0]};
    for(const p of triangle){for(const key of ['x','y','z'])center[key]+=p[key]/3;
      for(let k=0;k<3;k++)center.normal[k]+=p.normal[k]/3;
      for(let k=0;k<2;k++)center.uv[k]+=p.uv[k]/3;}
    const length=Math.hypot(...center.normal);center.normal=center.normal.map(n=>n/length);
    for(let n=0;n<ring.length;n++)if(Math.abs(area([center,ring[n],ring[(n+1)%ring.length]]))>1e-9){
      write(center);write(ring[n]);write(ring[(n+1)%ring.length]);}
  }
  return {vertices:new Float32Array(output),indices:Uint32Array.from({length:output.length/3},(_,i)=>i),
    normals:new Float32Array(outputNormals),uv:new Float32Array(outputUV)};
}

export class TerrainField {
  constructor(core){
    this.core=core;this.state=core.route.v3State;this.revision=this.state.revision;
    this.buckets=new Map();this.chunkMasks=new Map();this.heightConstraints=new Map();
    // Index sampled route positions once. Geometry is built lazily, with a halo
    // beyond tile boundaries, so loading order cannot change a seam height.
    for(const p of this.state.points){
      const key=Math.floor(p.x/BUCKET)+','+Math.floor(p.z/BUCKET);
      if(!this.buckets.has(key))this.buckets.set(key,new Set());
      this.buckets.get(key).add(Math.floor(p.s/100));
    }
  }
  masks(index){
    if(this.chunkMasks.has(index))return this.chunkMasks.get(index);
    const data=buildRoadChunkV3(this.core,index),result=[];
    const points=this.state.points.filter(p=>p.s>=index*100-4&&p.s<=(index+1)*100+4);
    const stationAt=(x,z)=>{
      let station=points[0]?.s??index*100,best=Infinity;
      for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z;
        const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
        const distance=Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
        if(distance<best){best=distance;station=a.s+(b.s-a.s)*t;}
      }
      return station;
    };
    const featureAt=s=>this.state.features.find(f=>['bridge','suspension'].includes(f.kind)&&s>=f.start-1e-6&&s<=f.end+1e-6);
    if(data)for(const kind of ['asphalt','shoulder','earth']){
      const mesh=data.meshes[kind];
      for(let n=0;n<mesh.indices.length;n+=3){
        const triangle=[0,1,2].map(k=>{const j=mesh.indices[n+k]*3;
          return {x:mesh.vertices[j],y:mesh.vertices[j+1],z:mesh.vertices[j+2]};});
        if(Math.abs(area(triangle))<1e-7)continue;
        // Bridge decks do not replace the valley floor. Existing gorge/ridge
        // earth is retained as an exact boundary constraint.
        if(kind!=='earth'){
          const x=triangle.reduce((v,p)=>v+p.x/3,0),z=triangle.reduce((v,p)=>v+p.z/3,0);
          const feature=featureAt(stationAt(x,z));
          if(feature&&['bridge','suspension'].includes(feature.kind)){
            for(const p of triangle)p.y-=valleyDepth(feature,stationAt(p.x,p.z),this.core.roadDesign?.deckThickness);
            if(area(triangle)<0)triangle.reverse();
            result.push({triangle,bounds:bounds(triangle),heightOnly:true});continue;
          }
        }
        if(kind==='earth')for(const p of triangle){
          const s=stationAt(p.x,p.z),feature=featureAt(s);
          if(feature?.kind!=='suspension')continue;
          const q=this.core.roadPointAt(s),l=(p.x-q.x)*Math.cos(q.heading)-(p.z-q.z)*Math.sin(q.heading);
          const surface=q.y+this.core.roadCrossElevation(q,l),offset=p.y-surface;
          if(offset< -1.8)p.y=surface+offset*valleyDepth(feature,s,this.core.roadDesign?.deckThickness)/18;
        }
        if(area(triangle)<0)triangle.reverse();
        result.push({triangle,bounds:bounds(triangle),heightOnly:kind==='earth'});
      }
    }
    this.chunkMasks.set(index,result);return result;
  }
  constraints(box){
    const indices=new Set();
    for(let x=Math.floor((box.minX-100)/BUCKET);x<=Math.floor((box.maxX+100)/BUCKET);x++)
      for(let z=Math.floor((box.minZ-100)/BUCKET);z<=Math.floor((box.maxZ+100)/BUCKET);z++)
        for(const index of this.buckets.get(x+','+z)||[])indices.add(index);
    const halo={minX:box.minX-80,maxX:box.maxX+80,minZ:box.minZ-80,maxZ:box.maxZ+80};
    return [...indices].sort((a,b)=>a-b).flatMap(i=>this.masks(i)).filter(m=>overlap(m.bounds,halo));
  }
  height(x,z){
    const bx=Math.floor(x/BUCKET),bz=Math.floor(z/BUCKET),key=bx+','+bz;
    if(!this.heightConstraints.has(key))this.heightConstraints.set(key,this.constraints({
      minX:bx*BUCKET,maxX:(bx+1)*BUCKET,minZ:bz*BUCKET,maxZ:(bz+1)*BUCKET}));
    const constraints=this.heightConstraints.get(key);
    const point={x,z};let nearest={distance:Infinity,y:0};
    for(const m of constraints){
      const dx=Math.max(m.bounds.minX-x,0,x-m.bounds.maxX),dz=Math.max(m.bounds.minZ-z,0,z-m.bounds.maxZ);
      if(Math.hypot(dx,dz)>nearest.distance+1e-8)continue;
      const q=closest(point,m.triangle);
      // At a multi-layer boundary choose the lowest ground, never an upper
      // deck projected onto a lower road. Inside-road polygons are cut away.
      if(q.distance<nearest.distance-1e-7||Math.abs(q.distance-nearest.distance)<1e-7&&q.y<nearest.y)nearest=q;
    }
    const seed=this.core.route.seedHash|0;
    const noise=(x,z,scale,salt)=>{
      x/=scale;z/=scale;const ix=Math.floor(x),iz=Math.floor(z),u=smooth(x-ix),v=smooth(z-iz);
      const hash=(a,b)=>{let n=Math.imul(a,374761393)^Math.imul(b,668265263)^seed^salt;
        n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295*2-1;};
      const a=hash(ix,iz)*(1-u)+hash(ix+1,iz)*u,b=hash(ix,iz+1)*(1-u)+hash(ix+1,iz+1)*u;
      return a*(1-v)+b*v;
    };
    const warpX=noise(x,z,320,17)*45,warpZ=noise(x,z,290,53)*45;
    const mountain=26*noise(x+warpX,z+warpZ,210,71)+9*noise(x,z,73,101)+2*noise(x,z,27,127);
    const h=Number.isFinite(nearest.distance)?nearest.y*(1-smooth((nearest.distance-40)/40)):0;
    return h+mountain*smooth(nearest.distance/55);
  }
  retain(box){
    for(const key of this.heightConstraints.keys()){
      const [x,z]=key.split(',').map(Number);
      if(x*BUCKET<box.minX-BUCKET||x*BUCKET>box.maxX+BUCKET||z*BUCKET<box.minZ-BUCKET||z*BUCKET>box.maxZ+BUCKET)
        this.heightConstraints.delete(key);
    }
    const halo={minX:box.minX-180,maxX:box.maxX+180,minZ:box.minZ-180,maxZ:box.maxZ+180};
    for(const [index,masks] of this.chunkMasks)if(!masks.some(m=>overlap(m.bounds,halo)))this.chunkMasks.delete(index);
  }
  buildTile(tx,tz){
    if(!Number.isInteger(tx)||!Number.isInteger(tz))throw Error('Terrain tile coordinates must be integers');
    const x0=tx*TERRAIN_TILE_SIZE,z0=tz*TERRAIN_TILE_SIZE;
    const box={minX:x0,maxX:x0+TERRAIN_TILE_SIZE,minZ:z0,maxZ:z0+TERRAIN_TILE_SIZE};
    const constraints=this.constraints(box),masks=constraints.filter(m=>!m.heightOnly&&overlap(m.bounds,box));
    const vertices=[],indices=[],uv=[],normals=[],heightCache=new Map();
    // Convex subtraction can split one side of a tile edge at an extended
    // clipping line. Both neighbours must insert the same extra vertices;
    // merely matching the original 8m grid would leave T-junction cracks.
    const boundaries=[];
    for(const [axis,fixed,min,max] of [['x',box.minX,box.minZ,box.maxZ],['x',box.maxX,box.minZ,box.maxZ],
      ['z',box.minZ,box.minX,box.maxX],['z',box.maxZ,box.minX,box.maxX]]){
      const other=axis==='x'?'z':'x',cuts=new Set();
      const shared=this.constraints(axis==='x'?{minX:fixed,maxX:fixed,minZ:min,maxZ:max}:
        {minX:min,maxX:max,minZ:fixed,maxZ:fixed});
      for(let value=min;value<=max;value+=CELL)cuts.add(value);
      for(const mask of shared){
        if(mask.heightOnly)continue;
        const b=mask.bounds;
        if(axis==='x'&&(b.minX>fixed+CELL||b.maxX<fixed-CELL)||axis==='z'&&(b.minZ>fixed+CELL||b.maxZ<fixed-CELL))continue;
        for(let i=0;i<3;i++){
          const a=mask.triangle[i],b=mask.triangle[(i+1)%3],delta=b[axis]-a[axis];if(Math.abs(delta)<1e-10)continue;
          const value=a[other]+(b[other]-a[other])*(fixed-a[axis])/delta;
          const lo=other==='z'?mask.bounds.minZ:mask.bounds.minX,hi=other==='z'?mask.bounds.maxZ:mask.bounds.maxX;
          if(value>min&&value<max&&value>=lo-CELL&&value<=hi+CELL)cuts.add(value);
        }
      }
      boundaries.push({axis,other,fixed,cuts:[...cuts].sort((a,b)=>a-b)});
    }
    const emit=polygon=>{
      if(Math.abs(area(polygon))<1e-7)return;
      for(const p of polygon)for(const edge of boundaries)if(Math.abs(p[edge.axis]-edge.fixed)<1e-7)p[edge.axis]=edge.fixed;
      const stitched=[];
      for(let i=0;i<polygon.length;i++){
        const a=polygon[i],b=polygon[(i+1)%polygon.length];stitched.push(a);
        for(const edge of boundaries)if(a[edge.axis]===edge.fixed&&b[edge.axis]===edge.fixed){
          const lo=Math.min(a[edge.other],b[edge.other]),hi=Math.max(a[edge.other],b[edge.other]);
          const cuts=edge.cuts.filter(v=>v>lo+1e-7&&v<hi-1e-7);
          if(a[edge.other]>b[edge.other])cuts.reverse();
          for(const value of cuts)stitched.push({[edge.axis]:edge.fixed,[edge.other]:value});
        }
      }
      const center={x:stitched.reduce((v,p)=>v+p.x/stitched.length,0),z:stitched.reduce((v,p)=>v+p.z/stitched.length,0)};
      for(let i=0;i<stitched.length;i++){
        const tri=[center,stitched[i],stitched[(i+1)%stitched.length]];if(Math.abs(area(tri))<1e-7)continue;
        if(area(tri)>0)tri.reverse(); // +Y normal in XZ plane
        for(const p of tri){
          const x=Math.fround(p.x),z=Math.fround(p.z),key=p.x.toPrecision(15)+','+p.z.toPrecision(15);
          if(!heightCache.has(key)){
            const dx=(this.height(x+.25,z)-this.height(x-.25,z))/.5;
            const dz=(this.height(x,z+.25)-this.height(x,z-.25))/.5,L=Math.hypot(dx,1,dz);
            heightCache.set(key,{y:this.height(p.x,p.z),normal:[-dx/L,1/L,-dz/L]});
          }
          const sample=heightCache.get(key);
          indices.push(vertices.length/3);vertices.push(p.x,sample.y,p.z);uv.push(p.x,p.z);normals.push(...sample.normal);
        }
      }
    };
    for(let x=x0;x<box.maxX;x+=CELL)for(let z=z0;z<box.maxZ;z+=CELL){
      const cell={minX:x,maxX:x+CELL,minZ:z,maxZ:z+CELL};
      const nearby=masks.filter(m=>overlap(m.bounds,cell));
      for(const tri of [[{x,z},{x:x+CELL,z},{x,z:z+CELL}],
        [{x:x+CELL,z},{x:x+CELL,z:z+CELL},{x,z:z+CELL}]]){
        let polygons=[tri];
        for(const mask of nearby)polygons=polygons.flatMap(p=>subtract(p,mask.triangle));
        for(const polygon of polygons)emit(polygon);
      }
    }
    const data=conform(vertices,normals,uv),canonical=new Map();
    // Preserve the sampled surface. Only vertices collapsed to the same final
    // Float32 XZ share the lowest existing height; do not resample across layers.
    for(let i=0;i<data.vertices.length;i+=3){
      const key=data.vertices[i]+','+data.vertices[i+2],y=data.vertices[i+1];
      canonical.set(key,Math.min(canonical.get(key)??Infinity,y));
    }
    for(let i=0;i<data.vertices.length;i+=3)data.vertices[i+1]=canonical.get(data.vertices[i]+','+data.vertices[i+2]);
    return {...data,tx,tz};
  }
}
