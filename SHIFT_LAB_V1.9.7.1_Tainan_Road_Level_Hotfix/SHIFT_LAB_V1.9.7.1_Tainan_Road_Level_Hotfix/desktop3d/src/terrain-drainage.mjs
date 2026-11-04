// Local Priority-Flood analysis of the actual terrain surface, not a hydraulic
// simulation. Spill elevations are virtual: this module never changes terrain.
const directions=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
function validateLayout({width,height,cellSize,originX,originZ}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<3||height<3||width>129||height>129)
    throw Error('Drainage grid must be 3..129 cells per dimension');
  if(!Number.isFinite(cellSize)||cellSize<1||cellSize>128||!Number.isFinite(originX)||!Number.isFinite(originZ)||
    Math.abs(originX)>1e7||Math.abs(originZ)>1e7)throw Error('Invalid drainage grid coordinates');
}
function validateGrid(grid){
  validateLayout(grid);const {width,height,heights,valid}=grid;
  if(!(heights instanceof Float32Array||heights instanceof Float64Array)||!(valid instanceof Uint8Array)||
    heights.length!==width*height||valid.length!==heights.length)throw Error('Invalid drainage buffers');
  for(let i=0;i<heights.length;i++)if(valid[i]>1||valid[i]&&!Number.isFinite(heights[i]))throw Error('Invalid drainage elevation or mask');
}
const boundary=(i,w,h)=>i<w||i>=w*(h-1)||i%w===0||i%w===w-1;
function neighbours(i,grid){
  const {width:w,height:h,valid}=grid,x=i%w,z=Math.floor(i/w),result=[];
  for(const [dx,dz] of directions){
    const nx=x+dx,nz=z+dz;if(nx<0||nx>=w||nz<0||nz>=h)continue;
    const n=nz*w+nx;if(!valid[n])continue;
    // A diagonal must not cross a road cut / no-data corner.
    if(dx&&dz&&(!valid[z*w+nx]||!valid[nz*w+x]))continue;
    result.push(n);
  }
  return result;
}
class MinHeap{
  constructor(elevations){this.items=[];this.elevations=elevations;}
  less(a,b){return this.elevations[a]<this.elevations[b]||this.elevations[a]===this.elevations[b]&&a<b;}
  push(i){const q=this.items;q.push(i);let at=q.length-1;
    while(at){const parent=(at-1)>>1;if(!this.less(q[at],q[parent]))break;[q[at],q[parent]]=[q[parent],q[at]];at=parent;}}
  pop(){const q=this.items,first=q[0],last=q.pop();if(q.length){q[0]=last;let at=0;
    for(;;){let child=at*2+1;if(child>=q.length)break;if(child+1<q.length&&this.less(q[child+1],q[child]))child++;
      if(!this.less(q[child],q[at]))break;[q[at],q[child]]=[q[child],q[at]];at=child;}}
    return first;}
}

export function sampleDrainageGrid(terrain,{width=33,height=33,cellSize=8,originX,originZ}){
  validateLayout({width,height,cellSize,originX,originZ});
  const grid={schema:'shiftlab.drainage-grid.v1',width,height,cellSize,originX,originZ,
    heights:new Float64Array(width*height),valid:new Uint8Array(width*height)};
  validateGrid(grid);terrain.prepare();
  for(let z=0;z<height;z++)for(let x=0;x<width;x++){
    const i=z*width+x,hit=terrain.surfaceAt(Math.fround(originX+x*cellSize),Math.fround(originZ+z*cellSize));
    grid.heights[i]=hit?.y??NaN;grid.valid[i]=hit?1:0;
  }
  validateGrid(grid);return grid;
}

export function analyzeDrainage(grid){
  validateGrid(grid);
  const {width,height,cellSize,originX,originZ}=grid,n=grid.heights.length;
  const heights=new Float64Array(grid.heights),valid=grid.valid.slice(),spillElevation=new Float64Array(n).fill(NaN),
    receiver=new Int32Array(n).fill(-3),fillDepth=new Float64Array(n).fill(NaN),areaM2=new Float64Array(n),
    rank=new Int32Array(n).fill(-1),seen=new Uint8Array(n),order=[],heap=new MinHeap(spillElevation);
  const field={width,height,valid};let outlets=0,blockedCells=0;
  for(let i=0;i<n;i++){
    if(!valid[i]){blockedCells++;continue;}receiver[i]=-2;
    if(boundary(i,width,height)){seen[i]=1;receiver[i]=-1;spillElevation[i]=heights[i];heap.push(i);outlets++;}
  }
  while(heap.items.length){
    const i=heap.pop();rank[i]=order.length;order.push(i);
    for(const next of neighbours(i,field))if(!seen[next]){
      seen[next]=1;spillElevation[next]=Math.max(heights[next],spillElevation[i]);receiver[next]=i;heap.push(next);
    }
  }
  // On non-flat terrain prefer steepest descent. Strictly decreasing flood rank
  // resolves flats without epsilon height changes or cyclic flow directions.
  for(const i of order)if(receiver[i]>=0){
    let best=receiver[i],score=-Infinity;
    for(const next of neighbours(i,field))if(rank[next]>=0&&rank[next]<rank[i]&&spillElevation[next]<=spillElevation[i]){
      const distance=Math.hypot(i%width-next%width,Math.floor(i/width)-Math.floor(next/width))*cellSize;
      const slope=(spillElevation[i]-spillElevation[next])/distance;
      if(slope>score||slope===score&&next<best){best=next;score=slope;}
    }
    receiver[i]=best;
  }
  let fillCells=0,maxFillDepth=0;
  for(const i of order){areaM2[i]=cellSize*cellSize;fillDepth[i]=spillElevation[i]-heights[i];
    if(fillDepth[i]>0){fillCells++;maxFillDepth=Math.max(maxFillDepth,fillDepth[i]);}}
  for(let at=order.length-1;at>=0;at--){const i=order[at];if(receiver[i]>=0)areaM2[receiver[i]]+=areaM2[i];}
  return {schema:'shiftlab.drainage-analysis.v1',width,height,cellSize,originX,originZ,
    heights,valid,spillElevation,receiver,fillDepth,areaM2,order:Uint32Array.from(order),
    summary:{reachableCells:order.length,unresolvedCells:n-blockedCells-order.length,blockedCells,outlets,fillCells,maxFillDepth}};
}

export function traceDrainage(analysis,start){
  if(analysis.schema!=='shiftlab.drainage-analysis.v1'||!Number.isInteger(start)||start<0||start>=analysis.receiver.length)
    throw Error('Invalid drainage trace start');
  const points=[],seen=new Set();let i=start;
  for(;;){
    if(seen.has(i))throw Error('Cyclic drainage receiver');seen.add(i);
    if(analysis.receiver[i]===-3)return {status:'blocked',points};
    points.push({cell:i,x:Math.fround(analysis.originX+i%analysis.width*analysis.cellSize),
      z:Math.fround(analysis.originZ+Math.floor(i/analysis.width)*analysis.cellSize),
      groundY:analysis.heights[i],spillY:Number.isFinite(analysis.spillElevation[i])?analysis.spillElevation[i]:null,
      fillDepth:Number.isFinite(analysis.fillDepth[i])?analysis.fillDepth[i]:null,areaM2:analysis.areaM2[i]});
    const next=analysis.receiver[i];
    if(next===-1)return {status:'window-boundary',points};
    if(next===-2)return {status:'unresolved-outlet',points};
    if(!Number.isInteger(next)||next<0||next>=analysis.receiver.length)throw Error('Invalid drainage receiver');
    i=next;
  }
}
