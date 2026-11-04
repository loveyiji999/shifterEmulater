// Authored terrain distribution, independent of the V3 road RNG. These are
// surface fractions, not extra geometry or an erosion simulation.
export const TERRAIN_MATERIALS=Object.freeze(['earth','gravel','natural_stone']);
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
function noise(x,z,seed){
  x/=53;z/=53;const ix=Math.floor(x),iz=Math.floor(z),u=smooth(0,1,x-ix),v=smooth(0,1,z-iz);
  const h=(a,b)=>{let n=Math.imul(a,374761393)^Math.imul(b,668265263)^seed^1921;
    n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
  return (h(ix,iz)*(1-u)+h(ix+1,iz)*u)*(1-v)+(h(ix,iz+1)*(1-u)+h(ix+1,iz+1)*u)*v;
}
export function terrainWeights(data,seed){
  const out=new Float32Array(data.vertices.length);
  for(let i=0;i<out.length;i+=3){
    const rock=smooth(.92,.65,data.normals[i+1]);
    const gravel=smooth(.48,.78,noise(data.vertices[i],data.vertices[i+2],seed))*(1-rock);
    out[i]=1-rock-gravel;out[i+1]=gravel;out[i+2]=rock;
  }
  return out;
}
// Interpolate the SAME Float32 vertex mask used by the GPU, on the actual
// collider's original render face. No world-height/material projection.
export function terrainWeightsAt(data,face,point=null){
  const ids=[0,1,2].map(k=>data.indices[face*3+k]*3);
  let bary=[1/3,1/3,1/3];
  if(point){
    const [i,j,k]=ids,v=data.vertices,ax=v[i],az=v[i+2],bx=v[j],bz=v[j+2],cx=v[k],cz=v[k+2];
    const den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
    if(Math.abs(den)>1e-12){
      const a=((bz-cz)*(point.x-cx)+(cx-bx)*(point.z-cz))/den;
      const b=((cz-az)*(point.x-cx)+(ax-cx)*(point.z-cz))/den;
      bary=[clamp(a),clamp(b),clamp(1-a-b)];
      const sum=bary.reduce((a,b)=>a+b,0);bary=bary.map(x=>x/sum);
    }
  }
  const weights=[0,0,0];
  for(let k=0;k<3;k++)for(let m=0;m<3;m++)weights[m]+=data.weights[ids[k]+m]*bary[k];
  const sum=weights.reduce((a,b)=>a+b,0);return weights.map(x=>x/sum);
}
