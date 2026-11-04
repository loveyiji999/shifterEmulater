// Construction routing on sampled terrain. A local window boundary is not a
// verified downstream outlet. Candidate geometry still requires full validation.
const steps=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
const cross=(a,b,p)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
function distanceToPolygon(p,polygon){
  const signs=polygon.map((a,i)=>Math.sign(cross(a,polygon[(i+1)%polygon.length],p))).filter(Boolean);
  if(signs.every(s=>s===signs[0]))return 0;
  let distance=Infinity;
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
    distance=Math.min(distance,Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz));
  }
  return distance;
}
class Heap{
  constructor(){this.items=[];}
  less(a,b){return a.cost<b.cost||a.cost===b.cost&&a.id<b.id;}
  push(item){const q=this.items;q.push(item);let i=q.length-1;
    while(i){const p=(i-1)>>1;if(!this.less(q[i],q[p]))break;[q[i],q[p]]=[q[p],q[i]];i=p;}}
  pop(){const q=this.items,first=q[0],last=q.pop();if(q.length){q[0]=last;let i=0;
    for(;;){let c=i*2+1;if(c>=q.length)break;if(c+1<q.length&&this.less(q[c+1],q[c]))c++;
      if(!this.less(q[c],q[i]))break;[q[c],q[i]]=[q[i],q[c]];i=c;}}
    return first;}
}

export function findRiverRoute(grid,start,{protectedPolygons=[],outletCells=null,clearance=28,depth=3,maxCut=32,cutWeight=4,turnWeight=.2}={}){
  const {width:w,height:h,cellSize,originX,originZ,heights,valid}=grid;
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<3||h<3||w>129||h>129||
    !(heights instanceof Float32Array||heights instanceof Float64Array)||!(valid instanceof Uint8Array)||
    heights.length!==w*h||valid.length!==w*h||!Number.isFinite(cellSize)||cellSize<1||cellSize>128||
    !Number.isFinite(originX)||!Number.isFinite(originZ)||Math.abs(originX)>1e7||Math.abs(originZ)>1e7||
    !Number.isInteger(start)||start<0||start>=w*h)throw Error('Invalid river routing grid');
  for(let i=0;i<valid.length;i++)if(valid[i]>1||valid[i]&&(!Number.isFinite(heights[i])||Math.abs(heights[i])>1e7))throw Error('Invalid river routing sample');
  for(const [name,value,lo,hi] of [['clearance',clearance,0,104],['depth',depth,.25,8],['maxCut',maxCut,.5,64],
    ['cutWeight',cutWeight,0,100],['turnWeight',turnWeight,0,.25]])
    if(!Number.isFinite(value)||value<lo||value>hi)throw Error('Invalid river routing '+name);
  if(!Array.isArray(protectedPolygons)||protectedPolygons.length>4096||w*h*protectedPolygons.length>8000000)
    throw Error('River routing footprint budget exceeded');
  const boundary=i=>i<w||i>=w*(h-1)||i%w===0||i%w===w-1;
  if(outletCells!==null&&(!Array.isArray(outletCells)||!outletCells.length||outletCells.length>2*(w+h)-4||
    outletCells.some(i=>!Number.isInteger(i)||i<0||i>=w*h||!boundary(i))))throw Error('Invalid river routing outlets');
  const outlets=outletCells===null?null:new Set(outletCells);
  for(const p of protectedPolygons){
    if(!Array.isArray(p)||p.length<3||p.length>8||p.some(v=>!Number.isFinite(v.x)||!Number.isFinite(v.z)||Math.abs(v.x)>1e7||Math.abs(v.z)>1e7))throw Error('Invalid river routing footprint');
    const signs=p.map((a,i)=>Math.sign(cross(a,p[(i+1)%p.length],p[(i+2)%p.length]))).filter(Boolean);
    if(!signs.length||signs.some(s=>s!==signs[0])||p.some((a,i)=>p.some(v=>cross(a,p[(i+1)%p.length],v)*signs[0]<-1e-8)))
      throw Error('River routing footprint must be convex');
  }
  const point=i=>({cell:i,x:Math.fround(originX+i%w*cellSize),z:Math.fround(originZ+Math.floor(i/w)*cellSize),groundY:heights[i]});
  const blocked=new Uint8Array(w*h),sourceBed=heights[start]-depth;
  // One grid diagonal also reserves the incident terrain triangles. This is
  // conservative protection, not an exact engineering setback calculation.
  const reserve=clearance+Math.SQRT2*cellSize;
  for(let i=0;i<blocked.length;i++)blocked[i]=!valid[i]||heights[i]-sourceBed>maxCut||
    protectedPolygons.some(p=>distanceToPolygon(point(i),p)<=reserve)?1:0;
  const result=(status,points=[],extra={})=>({status,points,outletStatus:'window-continuation-required',...extra});
  if(blocked[start])return result('blocked-source');
  if(boundary(start))return result('source-on-boundary');
  // Direction is part of each state so a turn cost does not invalidate the
  // shortest-path search. Heap ties and predecessor updates are deterministic.
  const n=w*h*8,distances=new Float64Array(n).fill(Infinity),previous=new Int32Array(n).fill(-2),heap=new Heap();
  for(let direction=0;direction<8;direction++){const id=start*8+direction;distances[id]=0;previous[id]=-1;heap.push({id,cost:0});}
  let terminal=-1,visited=0;
  while(heap.items.length){
    const state=heap.pop();if(state.cost!==distances[state.id])continue;
    const cell=Math.floor(state.id/8),direction=state.id%8,x=cell%w,z=Math.floor(cell/w);visited++;
    if(boundary(cell)&&(!outlets||outlets.has(cell))){terminal=state.id;break;}
    for(let nextDirection=0;nextDirection<8;nextDirection++){
      const [dx,dz]=steps[nextDirection],nx=x+dx,nz=z+dz;
      if(nx<0||nz<0||nx>=w||nz>=h)continue;
      const next=nz*w+nx;if(blocked[next]||dx&&dz&&(blocked[z*w+nx]||blocked[nz*w+x]))continue;
      const length=Math.hypot(dx,dz)*cellSize,cut=Math.max(0,heights[next]-sourceBed),fromCut=Math.max(0,heights[cell]-sourceBed);
      const [px,pz]=steps[direction],cosine=(px*dx+pz*dz)/(Math.hypot(px,pz)*Math.hypot(dx,dz));
      const cost=state.cost+length*(1+cutWeight*(cut*cut+fromCut*fromCut)/2)+cellSize*turnWeight*(1-cosine);
      const id=next*8+nextDirection;
      if(cost<distances[id]){distances[id]=cost;previous[id]=state.id;heap.push({id,cost});}
    }
  }
  if(terminal<0)return result('no-local-route',[],{visited});
  const points=[];let id=terminal;
  while(id>=0){points.push(point(Math.floor(id/8)));id=previous[id];}
  points.reverse();
  return result('window-boundary',points,{cost:distances[terminal],visited,clearance:reserve,
    length:points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.z-points[i].z),0)});
}
