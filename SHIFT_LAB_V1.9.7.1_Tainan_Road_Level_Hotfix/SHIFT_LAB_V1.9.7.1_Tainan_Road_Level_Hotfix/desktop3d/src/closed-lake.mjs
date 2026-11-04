import {buildConnectedWater} from './water-geometry.mjs';

const cross=(a,b,p)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
function inputs(input,sourceX,sourceZ){
  if(!Array.isArray(input)||!input.length||input.length>16||![sourceX,sourceZ].every(v=>Number.isFinite(v)&&Math.abs(v)<=1e7))
    throw Error('Invalid closed lake inputs');
  const sources=input.slice().sort((a,b)=>a.tx-b.tx||a.tz-b.tz),ids=new Set(),heights=new Map();let triangles=0,vertices=0;
  for(const m of sources){
    const id=m.tx+','+m.tz;
    if(!Number.isInteger(m.tx)||!Number.isInteger(m.tz)||ids.has(id)||!(m.vertices instanceof Float32Array)||
      !(m.indices instanceof Uint32Array)||m.vertices.length%3||m.indices.length%3||
      !m.vertices.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e7)||!m.indices.every(i=>i<m.vertices.length/3))throw Error('Invalid lake terrain buffers');
    ids.add(id);triangles+=m.indices.length/3;vertices+=m.vertices.length/3;
    if(triangles>250000||vertices>1000000)throw Error('Lake terrain budget exceeded');
    for(let i=0;i<m.vertices.length;i+=3){const key=m.vertices[i]+','+m.vertices[i+2],y=m.vertices[i+1];
      if(heights.has(key)&&heights.get(key)!==y)throw Error('Lake terrain seam or multiple height layers');heights.set(key,y);}
  }
  const source={x:Math.fround(sourceX),z:Math.fround(sourceZ)};let groundY=null;
  for(const m of sources)for(let i=0;i<m.indices.length;i+=3){
    const t=[0,1,2].map(k=>{const j=m.indices[i+k]*3;return {x:m.vertices[j],y:m.vertices[j+1],z:m.vertices[j+2]};}),d=cross(t[0],t[1],t[2]);
    if(Math.abs(d)<1e-10)continue;
    const a=cross(t[1],t[2],source)/d,b=cross(t[2],t[0],source)/d,c=1-a-b;
    if(Math.min(a,b,c)<-1e-9)continue;
    const y=a*t[0].y+b*t[1].y+c*t[2].y;groundY=groundY===null?y:Math.max(groundY,y);
  }
  return {sources,source:{...source,groundY}};
}
function atLevel({sources,source},waterY){
  waterY=Math.fround(waterY);
  const result=buildConnectedWater(sources,{sample:()=>({waterY,flowX:0,flowZ:0}),seedPoints:[source]}),issues=[];
  if(source.groundY===null)issues.push('missing-lake-source');
  if(!result.summary.waterTriangles)issues.push('no-connected-water');
  if(result.summary.openWaterEdges)issues.push('open-water-boundary');
  let maxDepth=0;for(const mesh of result.water)for(const depth of mesh.depths)maxDepth=Math.max(maxDepth,depth);
  return {schema:'shiftlab.closed-lake.v1',status:issues.length?'rejected':'geometry-candidate',issues,source,waterY,
    water:result.water,groundChanged:false,requiresWaterContactModel:true,
    summary:{...result.summary,maxDepth,sourceDepth:source.groundY===null?null:waterY-source.groundY}};
}

export function buildClosedLake(input,{sourceX,sourceZ,waterY}){
  if(!Number.isFinite(waterY)||Math.abs(waterY)>1e7)throw Error('Invalid lake water level');
  return atLevel(inputs(input,sourceX,sourceZ),waterY);
}

// Select a closed body below an authored / sampled upper level. The selected
// level is a static scene choice, not a rainfall or equilibrium simulation.
export function findClosedLake(input,{sourceX,sourceZ,maxWaterY,minDepth=.2,iterations=8}){
  if(!Number.isFinite(maxWaterY)||Math.abs(maxWaterY)>1e7||!Number.isFinite(minDepth)||minDepth<.05||minDepth>4||
    !Number.isInteger(iterations)||iterations<1||iterations>12)throw Error('Invalid lake level search');
  const prepared=inputs(input,sourceX,sourceZ),ground=prepared.source.groundY;
  if(ground===null)return {...atLevel(prepared,maxWaterY),search:{status:'missing-source',attempts:1}};
  const low=Math.fround(ground+minDepth),high=Math.fround(maxWaterY);
  if(low<=ground||high<low)return {...atLevel(prepared,ground),search:{status:'insufficient-depth',attempts:1}};
  let best=atLevel(prepared,low),attempts=1;
  if(best.status!=='geometry-candidate')return {...best,search:{status:'no-closed-body',attempts}};
  const upper=atLevel(prepared,high);attempts++;
  if(upper.status==='geometry-candidate')return {...upper,search:{status:'upper-level-closed',attempts,maxWaterY:high}};
  let accepted=low,rejected=high;
  for(let i=0;i<iterations;i++){
    const mid=Math.fround((accepted+rejected)/2);if(mid===accepted||mid===rejected)break;
    const candidate=atLevel(prepared,mid);attempts++;
    if(candidate.status==='geometry-candidate'){best=candidate;accepted=mid;}else rejected=mid;
  }
  return {...best,search:{status:'boundary-limited',attempts,maxWaterY:high,firstRejectedWaterY:rejected}};
}
