// Shared Float32 water clipping and positive-depth connectivity. This module
// does not edit terrain, create colliders or simulate hydraulic flow.
const cross=(a,b,p)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
function interval(a,b,tri){
  const sign=Math.sign(cross(tri[0],tri[1],tri[2]));if(!sign)return null;
  let low=0,high=1;
  for(let i=0;i<3;i++){
    const p=tri[i],q=tri[(i+1)%3],u=cross(p,q,a)*sign,v=cross(p,q,b)*sign;
    if(u<0&&v<0)return null;
    if(u<0)low=Math.max(low,u/(u-v));if(v<0)high=Math.min(high,u/(u-v));
  }
  return high>=low?[low,high]:null;
}
// A dry shoreline touching a path is not a flowing connection. The tolerance
// suppresses Float32 zero-depth contacts; it is not hydraulic calibration.
const WET_DEPTH=1e-5;
function wetSpan(a,b,tri,depths){
  const span=interval(a,b,tri);if(!span)return null;
  const [lo,hi]=span,den=cross(tri[0],tri[1],tri[2]);
  const depth=t=>{const p={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
    return cross(tri[1],tri[2],p)/den*depths[0]+cross(tri[2],tri[0],p)/den*depths[1]+cross(tri[0],tri[1],p)/den*depths[2]-WET_DEPTH;};
  const u=depth(lo),v=depth(hi);if(u<=0&&v<=0)return null;
  return [u<0?lo+(hi-lo)*u/(u-v):lo,v<0?lo+(hi-lo)*u/(u-v):hi];
}
function clip(polygon,field){
  const out=[];
  for(let i=0;i<polygon.length;i++){
    const p=polygon[i],q=polygon[(i+1)%polygon.length],u=p[field],v=q[field];
    if(u>=0)out.push(p);
    if(u<0&&v>0||u>0&&v<0){const [a,b]=p.x<q.x||p.x===q.x&&p.z<=q.z?[p,q]:[q,p],t=a[field]/(a[field]-b[field]),hit={};
      for(const name of Object.keys(p))hit[name]=a[name]+(b[name]-a[name])*t;
      hit[field]=0;out.push(hit);
    }
  }
  return out;
}
const point=(vertices,i)=>({x:vertices[i*3],y:vertices[i*3+1],z:vertices[i*3+2]});
const face=(mesh,offset)=>[0,1,2].map(k=>point(mesh.vertices,mesh.indices[offset+k]));

export function buildConnectedWater(ground,{sample,seedSegments=[],seedPoints=[],corridorWidth=null,allowBoundary=()=>false}){
  let wetMaskEdges=0;
  let candidateCount=0;
  const candidates=ground.map(mesh=>{
    const vertices=[],indices=[],uv=[],depths=[],flows=[],normals=[],sourceFaces=[];
    for(let i=0;i<mesh.indices.length;i+=3){
      let polygon=face(mesh,i).map(p=>{const q=sample(p.x,p.z);return {x:p.x,z:p.z,ground:p.y,water:q.waterY,
        depth:q.waterY-p.y,margin:corridorWidth===null?1:corridorWidth-q.distance,fx:q.flowX,fz:q.flowZ};});
      if(corridorWidth!==null){const oldMask=clip(clip(polygon,'margin'),'depth');
        if(oldMask.some(p=>Math.abs(p.margin)<1e-6&&p.depth>.001))wetMaskEdges++;}
      polygon=clip(polygon,'depth');
      for(let k=1;k+1<polygon.length;k++){
        const tri=[polygon[0],polygon[k],polygon[k+1]].map(p=>({...p,x:Math.fround(p.x),z:Math.fround(p.z),water:Math.fround(p.water)}));
        if(Math.abs(cross(...tri))<1e-8||tri.every(p=>p.depth<=WET_DEPTH))continue;
        if(++candidateCount>200000)throw Error('Riverbed water topology budget exceeded');
        const [a,b,c]=tri,ab=[b.x-a.x,b.water-a.water,b.z-a.z],ac=[c.x-a.x,c.water-a.water,c.z-a.z];
        const normal=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],L=Math.hypot(...normal)||1;
        for(const p of tri){indices.push(vertices.length/3);vertices.push(p.x,p.water,p.z);uv.push(p.x/8,p.z/8);depths.push(Math.max(0,p.depth));
          const flowLength=Math.hypot(p.fx,p.fz)||1;flows.push(p.fx/flowLength,p.fz/flowLength);normals.push(...normal.map(v=>v/L));}
        sourceFaces.push(i/3);
      }
    }
    return {tx:mesh.tx,tz:mesh.tz,vertices:new Float32Array(vertices),indices:Uint32Array.from(indices),
      normals:new Float32Array(normals),uv:new Float32Array(uv),depths:new Float32Array(depths),flows:new Float32Array(flows),sourceFaces:Uint32Array.from(sourceFaces)};
  });
  // Water follows actual wet ground triangles beyond the excavation corridor.
  // Keep only components connected through a positive-depth edge to the path;
  // a separate low basin must not become water merely because the plane is high.
  const edgeKey=(a,b)=>{const x=a.x+','+a.y+','+a.z,y=b.x+','+b.y+','+b.z;return x<y?x+'|'+y:y+'|'+x;};
  const entries=candidates.flatMap((mesh,part)=>Array.from({length:mesh.indices.length/3},(_,index)=>({part,index})));
  const parent=Int32Array.from(entries,(_,i)=>i),edges=new Map(),seeds=[];
  const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  for(let id=0;id<entries.length;id++){
    const {part,index}=entries[id],mesh=candidates[part],tri=face(mesh,index*3),depths=mesh.depths.subarray(index*3,index*3+3);
    if(seedSegments.some(s=>{const span=wetSpan(s.a,s.b,tri,depths);return span&&span[1]-span[0]>1e-9;})||seedPoints.some(p=>wetSpan(p,p,tri,depths)))seeds.push(id);
    for(let e=0;e<3;e++){
      const n=(e+1)%3;if(Math.max(mesh.depths[index*3+e],mesh.depths[index*3+n])<=WET_DEPTH)continue;
      const k=edgeKey(tri[e],tri[n]),previous=edges.get(k);
      if(previous===undefined)edges.set(k,id);
      else{const a=root(id),b=root(previous);parent[Math.max(a,b)]=Math.min(a,b);}
    }
  }
  const connected=new Set(seeds.map(root)),kept=new Set(),keptFaces=new Set(),keptByPart=candidates.map(()=>new Set());
  for(let id=0;id<entries.length;id++)if(connected.has(root(id))){
    kept.add(id);const {part,index}=entries[id];keptByPart[part].add(index);keptFaces.add(part+':'+candidates[part].sourceFaces[index]);
  }
  const discardedWaterTriangles=entries.length-kept.size;let outsideCorridorTriangles=0;
  const water=candidates.map((mesh,part)=>{
    const vertices=[],indices=[],normals=[],uv=[],depths=[],flows=[],sourceFaces=[];
    for(let index=0;index<mesh.sourceFaces.length;index++){
      if(!keptByPart[part].has(index))continue;
      const tri=face(mesh,index*3);
      if(corridorWidth!==null&&tri.some(p=>sample(p.x,p.z).distance>corridorWidth+1e-6))outsideCorridorTriangles++;
      const base=vertices.length/3;indices.push(base,base+1,base+2);
      vertices.push(...mesh.vertices.subarray(index*9,index*9+9));normals.push(...mesh.normals.subarray(index*9,index*9+9));
      uv.push(...mesh.uv.subarray(index*6,index*6+6));flows.push(...mesh.flows.subarray(index*6,index*6+6));
      depths.push(...mesh.depths.subarray(index*3,index*3+3));sourceFaces.push(mesh.sourceFaces[index]);
    }
    return {tx:mesh.tx,tz:mesh.tz,vertices:Float32Array.from(vertices),indices:Uint32Array.from(indices),
      normals:Float32Array.from(normals),uv:Float32Array.from(uv),depths:Float32Array.from(depths),flows:Float32Array.from(flows),sourceFaces:Uint32Array.from(sourceFaces)};
  });
  // A source edge used by one ground face is a real domain boundary or hole.
  // Wet edges are allowed only at the explicitly unresolved terminal corridor.
  const groundEdges=new Map();
  for(let part=0;part<ground.length;part++)for(let i=0;i<ground[part].indices.length;i+=3){
    const tri=face(ground[part],i);
    if(Math.abs(cross(...tri))<1e-8)continue;
    for(let e=0;e<3;e++){
      const a=tri[e],b=tri[(e+1)%3];if(a.x===b.x&&a.z===b.z)continue;
      const k=edgeKey(a,b),entry=groundEdges.get(k);
      if(entry)entry.count++;else groundEdges.set(k,{a,b,part,face:i/3,count:1});
    }
  }
  const bounds={minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};
  for(const mesh of ground)for(let i=0;i<mesh.vertices.length;i+=3){
    bounds.minX=Math.min(bounds.minX,mesh.vertices[i]);bounds.maxX=Math.max(bounds.maxX,mesh.vertices[i]);
    bounds.minZ=Math.min(bounds.minZ,mesh.vertices[i+2]);bounds.maxZ=Math.max(bounds.maxZ,mesh.vertices[i+2]);
  }
  let openWaterEdges=0,terminalWaterEdges=0,openOuterEdges=0,openInteriorEdges=0;
  for(const {a,b,part,face:sourceFace,count} of groundEdges.values()){
    if(count!==1||!keptFaces.has(part+':'+sourceFace))continue;
    const u=sample(a.x,a.z).waterY-a.y,v=sample(b.x,b.z).waterY-b.y;
    if(Math.max(u,v)<=WET_DEPTH)continue;
    const t=u>0&&v>0?.5:((u>0?0:u/(u-v))+(v>0?1:u/(u-v)))/2;
    if(allowBoundary({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t}))terminalWaterEdges++;
    else{
      openWaterEdges++;
      if([bounds.minX,bounds.maxX].some(x=>a.x===x&&b.x===x)||[bounds.minZ,bounds.maxZ].some(z=>a.z===z&&b.z===z))openOuterEdges++;
      else openInteriorEdges++;
    }
  }
  const waterTriangles=water.flatMap(mesh=>Array.from({length:mesh.indices.length/3},(_,i)=>({tri:face(mesh,i*3),depths:mesh.depths.subarray(i*3,i*3+3)})));
  const coverage=seedSegments.map(s=>{
    const spans=waterTriangles.map(({tri,depths})=>wetSpan(s.a,s.b,tri,depths)).filter(Boolean).sort((a,b)=>a[0]-b[0]);
    let covered=0,end=0;for(const [a,b] of spans)if(b>end){covered+=b-Math.max(a,end);end=b;}
    return covered;
  });
  return {water,coverage,summary:{wetMaskEdges,openWaterEdges,openOuterEdges,openInteriorEdges,terminalWaterEdges,
    discardedWaterTriangles,outsideCorridorTriangles,minPathCoverage:coverage.length?Math.min(...coverage):null,waterTriangles:waterTriangles.length}};
}
