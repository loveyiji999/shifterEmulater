const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
// Local sky-access approximation for the generated bore, not global exposure
// or a GI solution. Query actual XYZ so the roof and upper roads stay outside.
export class TunnelLightField {
  constructor(core){
    this.core=core;this.state=core.route.v3State;this.revision=this.state?.revision;this.buckets=new Map();this.height=core.roadDesign?.tunnelHeight??6.5;
    for(const [id,feature] of (core.route.v3State?.features||[]).entries())if(feature.kind==='tunnel'){
      const cuts=[feature.start];for(let s=Math.ceil(feature.start/4)*4;s<feature.end;s+=4)if(s>feature.start)cuts.push(s);cuts.push(feature.end);
      for(let i=1;i<cuts.length;i++){
        const a=core.roadPointAt(cuts[i-1]),b=core.roadPointAt(cuts[i]),segment={a,b,feature,id:id+1};
        for(let x=Math.floor((Math.min(a.x,b.x)-8)/32);x<=Math.floor((Math.max(a.x,b.x)+8)/32);x++)
          for(let z=Math.floor((Math.min(a.z,b.z)-8)/32);z<=Math.floor((Math.max(a.z,b.z)+8)/32);z++){
            const key=x+','+z;if(!this.buckets.has(key))this.buckets.set(key,[]);this.buckets.get(key).push(segment);
          }
      }
    }
  }
  at(p){
    let sky=1,id=0;
    for(const {a,b,feature,id:featureId} of this.buckets.get(Math.floor(p.x/32)+','+Math.floor(p.z/32))||[]){
      const dx=b.x-a.x,dz=b.z-a.z,L2=dx*dx+dz*dz;
      const t=((p.x-a.x)*dx+(p.z-a.z)*dz)/(L2||1);
      if(t< -1e-6||t>1+1e-6)continue;
      const u=clamp(t),x=a.x+u*dx,z=a.z+u*dz,L=Math.sqrt(L2)||1,l=((p.x-x)*dz-(p.z-z)*dx)/L;
      if(Math.abs(l)>6.201)continue;
      const y=(a.y+this.core.roadCrossElevation(a,l))*(1-u)+(b.y+this.core.roadCrossElevation(b,l))*u;
      if(p.y<y-.05||p.y>y+this.height+.002)continue;
      const s=a.s+(b.s-a.s)*u,depth=Math.max(0,Math.min(s-feature.start,feature.end-s));
      const access=1-.94*smooth(depth/24);if(access<=sky){sky=access;id=featureId;}
    }
    return {sky,id};
  }
  sample(p){return this.at(p).sky;}
  bake(vertices){const sky=new Float32Array(vertices.length/3),tunnelIds=new Float32Array(sky.length);
    for(let i=0;i<sky.length;i++){const p=this.at({x:vertices[i*3],y:vertices[i*3+1],z:vertices[i*3+2]});sky[i]=p.sky;tunnelIds[i]=p.id;}
    return {sky,tunnelIds};}
  values(vertices){return this.bake(vertices).sky;}
}
