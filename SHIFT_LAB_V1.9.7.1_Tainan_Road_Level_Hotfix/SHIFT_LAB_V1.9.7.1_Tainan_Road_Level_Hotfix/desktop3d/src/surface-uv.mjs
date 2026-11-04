// Metre-scaled road UVs follow chainage/lateral coordinates. Other meshes use
// face-aligned planar projections; this changes no visible/collision vertices.
export function surfaceUV(core,index,kind,vertices){
  const uv=new Float32Array(vertices.length/3*2);
  const road=kind==='asphalt'||kind==='shoulder';
  const points=road?core.route.v3State.points.filter(p=>p.s>=index*100-32&&p.s<=(index+1)*100+32):[];
  for(let n=0;n<vertices.length;n+=9){
    const ax=vertices[n+3]-vertices[n],ay=vertices[n+4]-vertices[n+1],az=vertices[n+5]-vertices[n+2];
    const bx=vertices[n+6]-vertices[n],by=vertices[n+7]-vertices[n+1],bz=vertices[n+8]-vertices[n+2];
    const normal={x:ay*bz-az*by,y:az*bx-ax*bz,z:ax*by-ay*bx};
    for(let k=0;k<3;k++){
      const i=n+k*3,x=vertices[i],y=vertices[i+1],z=vertices[i+2];let u,v;
      if(road){
        let best=Infinity,s=0,l=0;
        for(let j=1;j<points.length;j++){
          const a=points[j-1],b=points[j],dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(L*L||1)));
          const ex=x-a.x-t*dx,ez=z-a.z-t*dz,d=ex*ex+ez*ez;
          if(d<best){best=d;s=a.s+(b.s-a.s)*t;l=(ex*dz-ez*dx)/(L||1);}
        }
        u=l;v=s;
      }else if(kind==='cover'||Math.abs(normal.y)>=Math.max(Math.abs(normal.x),Math.abs(normal.z))){u=x;v=z;}
      else if(Math.abs(normal.x)>Math.abs(normal.z)){u=z;v=y;}
      else{u=x;v=y;}
      uv[i/3*2]=u;uv[i/3*2+1]=v;
    }
  }
  return uv;
}
