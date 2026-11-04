import {buildConnectedWater} from './water-geometry.mjs';
// Construction proposal only. Authored dimensions are not hydraulic calibration.
// Unconnected window outlets cannot be published as a completed river network.
const key=p=>p.x+','+p.z;
const cross=(a,b,p)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function intersects(a,b){
  for(const polygon of [a,b])for(let i=0;i<polygon.length;i++){
    const p=polygon[i],q=polygon[(i+1)%polygon.length],nx=q.z-p.z,nz=p.x-q.x;
    const project=points=>points.map(v=>v.x*nx+v.z*nz),x=project(a),y=project(b);
    if(Math.max(...x)<Math.min(...y)-1e-7||Math.max(...y)<Math.min(...x)-1e-7)return false;
  }
  return true;
}
const point=(vertices,i)=>({x:vertices[i*3],y:vertices[i*3+1],z:vertices[i*3+2]});
const face=(mesh,offset)=>[0,1,2].map(k=>point(mesh.vertices,mesh.indices[offset+k]));

export function planRiverbed(path,{depth=3,halfWidth=12,bankWidth=16,minGrade=.003,waterDepth=.65,maxCut=32}={}){
  if(path.status!=='window-boundary'||!Array.isArray(path.points)||path.points.length<2||path.points.length>4096)
    throw Error('A resolved local drainage path is required');
  for(const [name,value,lo,hi] of [['depth',depth,.25,8],['halfWidth',halfWidth,2,40],['bankWidth',bankWidth,2,64],
    ['minGrade',minGrade,.0001,.08],['waterDepth',waterDepth,.05,2],['maxCut',maxCut,.5,64]])
    if(!Number.isFinite(value)||value<lo||value>hi)throw Error('Invalid riverbed '+name);
  if(waterDepth>=depth)throw Error('Water depth must be below incision depth');
  const points=path.points.map(p=>({x:p.x,z:p.z,groundY:p.groundY}));
  if(points.some(p=>Object.values(p).some(v=>!Number.isFinite(v)||Math.abs(v)>1e7)))throw Error('Invalid riverbed point');
  const segments=[];let length=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],distance=Math.hypot(b.x-a.x,b.z-a.z);
    if(distance<.01)throw Error('Duplicate riverbed point');
    if(i>1&&Math.abs(cross(points[i-2],a,b))<1e-8&&
      (a.x-points[i-2].x)*(b.x-a.x)+(a.z-points[i-2].z)*(b.z-a.z)<0)throw Error('Backtracking riverbed path');
    for(let j=0;j<i-2;j++){
      const p=points[j],q=points[j+1],u=cross(a,b,p),v=cross(a,b,q),w=cross(p,q,a),z=cross(p,q,b);
      const on=(p,a,b)=>Math.abs(cross(a,b,p))<1e-8&&p.x>=Math.min(a.x,b.x)-1e-8&&p.x<=Math.max(a.x,b.x)+1e-8&&p.z>=Math.min(a.z,b.z)-1e-8&&p.z<=Math.max(a.z,b.z)+1e-8;
      if(u*v<0&&w*z<0||on(p,a,b)||on(q,a,b)||on(a,p,q)||on(b,p,q))throw Error('Self-intersecting riverbed path');
    }
    segments.push({a,b,length:distance,start:length});length+=distance;
  }
  return {schema:'shiftlab.riverbed-plan.v1',segments,length,sourceBedY:points[0].groundY-depth,
    depth,halfWidth,bankWidth,minGrade,waterDepth,maxCut,outletStatus:'window-continuation-required'};
}

function at(plan,x,z){
  let best=null;
  for(let i=0;i<plan.segments.length;i++){
    const s=plan.segments[i],dx=s.b.x-s.a.x,dz=s.b.z-s.a.z;
    const raw=((x-s.a.x)*dx+(z-s.a.z)*dz)/(s.length*s.length);
    // Endpoint rays keep a proposal open across its analysis window. Their
    // connection to a larger network remains explicitly unresolved.
    const t=clamp(raw,i===0?-Infinity:0,i===plan.segments.length-1?Infinity:1);
    const distance=Math.hypot(x-s.a.x-dx*t,z-s.a.z-dz*t),station=s.start+t*s.length;
    if(!best||distance<best.distance){const bedY=plan.sourceBedY-plan.minGrade*station;
      best={distance,bedY,waterY:bedY+plan.waterDepth,flowX:dx/s.length,flowZ:dz/s.length,
        terminal:i===0&&raw<=1e-7||i===plan.segments.length-1&&raw>=1-1e-7};}
  }
  return best;
}

export function buildRiverbedProposal(input,plan,{protectedPolygons=[]}={}){
  if(plan.schema!=='shiftlab.riverbed-plan.v1'||!Array.isArray(input)||!input.length||input.length>16)throw Error('Invalid riverbed proposal');
  if(!Array.isArray(plan.segments)||!plan.segments.length||plan.segments.length>4095)throw Error('Invalid riverbed plan');
  const canonical=planRiverbed({status:'window-boundary',points:[plan.segments[0].a,...plan.segments.map(s=>s.b)]},plan);
  if(plan.sourceBedY!==canonical.sourceBedY||plan.length!==canonical.length||plan.outletStatus!==canonical.outletStatus||
    plan.segments.some((s,i)=>s.start!==canonical.segments[i].start||s.length!==canonical.segments[i].length||
      s.a.x!==canonical.segments[i].a.x||s.a.z!==canonical.segments[i].a.z))throw Error('Inconsistent riverbed plan');
  plan=canonical;
  if(!Array.isArray(protectedPolygons)||protectedPolygons.length>4096)throw Error('Invalid protected polygons');
  for(const p of protectedPolygons){
    if(!Array.isArray(p)||p.length<3||p.length>8||p.some(q=>!Number.isFinite(q.x)||!Number.isFinite(q.z)))throw Error('Invalid protected footprint');
    const signs=p.map((v,i)=>Math.sign(cross(v,p[(i+1)%p.length],p[(i+2)%p.length]))).filter(Boolean);
    if(!signs.length||signs.some(s=>s!==signs[0]))throw Error('Protected footprint must be convex');
  }
  const sources=input.slice().sort((a,b)=>a.tx-b.tx||a.tz-b.tz),ids=new Set(),sourceHeights=new Map();let count=0;
  for(const mesh of sources){
    const id=mesh.tx+','+mesh.tz;
    if(!Number.isInteger(mesh.tx)||!Number.isInteger(mesh.tz)||ids.has(id)||!(mesh.vertices instanceof Float32Array)||
      !(mesh.indices instanceof Uint32Array)||mesh.vertices.length%3||mesh.indices.length%3)throw Error('Invalid terrain proposal mesh');
    ids.add(id);count+=mesh.vertices.length/3;
    if(count>1000000||mesh.indices.length>3000000)throw Error('Riverbed mesh budget exceeded');
    if(!mesh.vertices.every(Number.isFinite)||!mesh.indices.every(i=>i<mesh.vertices.length/3))throw Error('Invalid terrain proposal buffers');
    if(mesh.normals&&(!(mesh.normals instanceof Float32Array)||mesh.normals.length!==mesh.vertices.length||!mesh.normals.every(Number.isFinite)))throw Error('Invalid terrain proposal normals');
    for(let i=0;i<mesh.vertices.length/3;i++){const p=point(mesh.vertices,i),previous=sourceHeights.get(key(p));
      if(previous!==undefined&&previous!==p.y)throw Error('Source terrain seam or multiple height layers');sourceHeights.set(key(p),p.y);}
  }
  const triangles=sources.reduce((n,m)=>n+m.indices.length/3,0);
  if(triangles>250000||triangles*plan.segments.length>8000000||count*plan.segments.length>8000000||triangles*protectedPolygons.length>8000000)throw Error('Riverbed work budget exceeded');
  const protectedVertices=new Set();
  for(const mesh of sources)for(let i=0;i<mesh.indices.length;i+=3){const tri=face(mesh,i);
    if(protectedPolygons.some(p=>intersects(tri,p)))for(const p of tri)protectedVertices.add(key(p));}
  let changedVertices=0,maxCut=0;const normalSums=new Map(),modified=new Set(),normalAffected=new Set(),issues=[];
  const ground=sources.map(source=>{
    const vertices=source.vertices.slice();
    for(let i=0;i<vertices.length;i+=3){const p={x:vertices[i],z:vertices[i+2]},q=at(plan,p.x,p.z);
      if(protectedVertices.has(key(p))||q.distance>=plan.halfWidth+plan.bankWidth)continue;
      const t=clamp((q.distance-plan.halfWidth)/plan.bankWidth,0,1),weight=1-t*t*(3-2*t);
      const y=vertices[i+1],next=Math.min(y,y+(q.bedY-y)*weight);vertices[i+1]=next;
      if(vertices[i+1]<y){modified.add(key(p));changedVertices++;maxCut=Math.max(maxCut,y-vertices[i+1]);}
    }
    const mesh={tx:source.tx,tz:source.tz,vertices,indices:source.indices.slice(),normals:new Float32Array(vertices.length),uv:source.uv?.slice()};
    for(let i=0;i<mesh.indices.length;i+=3){const [a,b,c]=face(mesh,i),ab={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},ac={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};
      const normal=[ab.y*ac.z-ab.z*ac.y,ab.z*ac.x-ab.x*ac.z,ab.x*ac.y-ab.y*ac.x];
      if([a,b,c].some(p=>modified.has(key(p))))for(const p of [a,b,c])normalAffected.add(key(p));
      for(const p of [a,b,c]){const k=key(p),sum=normalSums.get(k)||[0,0,0];normal.forEach((v,j)=>sum[j]+=v);normalSums.set(k,sum);}
    }
    return mesh;
  });
  for(let part=0;part<ground.length;part++){
    const mesh=ground[part];
    for(let i=0;i<mesh.vertices.length/3;i++){
      const p=point(mesh.vertices,i),k=key(p);
      if(sources[part].normals&&!normalAffected.has(k))mesh.normals.set(sources[part].normals.subarray(i*3,i*3+3),i*3);
      else{const normal=normalSums.get(k)||[0,1,0],length=Math.hypot(...normal)||1;mesh.normals.set(normal.map(v=>v/length),i*3);}
    }
  }
  const result=buildConnectedWater(ground,{sample:(x,z)=>at(plan,x,z),seedSegments:plan.segments,
    corridorWidth:plan.halfWidth+plan.bankWidth,allowBoundary:p=>{const q=at(plan,p.x,p.z);return q.terminal&&q.distance<=plan.halfWidth+plan.bankWidth+1e-6;}});
  const {water,coverage}=result,{openWaterEdges}=result.summary;
  if(maxCut>plan.maxCut)issues.push('excavation-limit');
  if(openWaterEdges)issues.push('open-water-boundary');
  if(coverage.some(value=>value<.99999))issues.push('incomplete-water-path');
  return {schema:'shiftlab.riverbed-proposal.v1',status:issues.length?'rejected':'geometry-candidate',issues,
    outletStatus:plan.outletStatus,requiresSurfaceRebake:true,ground,water,
    summary:{changedVertices,maxCut,protectedVertices:protectedVertices.size,...result.summary},coverage};
}
