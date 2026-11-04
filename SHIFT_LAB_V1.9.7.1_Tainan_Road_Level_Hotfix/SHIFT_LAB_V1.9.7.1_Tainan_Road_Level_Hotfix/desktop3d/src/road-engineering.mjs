// Visual/collision engineering for the existing V3 route. Dimensions are
// project assumptions, not a structural safety calculation or road standard.
function triangle(mesh,a,b,c){const n=mesh.vertices.length/3;
  for(const p of [a,b,c])mesh.vertices.push(p.x,p.y,p.z);mesh.indices.push(n,n+1,n+2);}
function quad(mesh,a,b,c,d){triangle(mesh,a,c,b);triangle(mesh,b,c,d);}
function box(mesh,p,hx,hy,hz,heading){
  const c=Math.cos(heading),s=Math.sin(heading),point=(x,y,z)=>({x:p.x+x*c+z*s,y:p.y+y,z:p.z-x*s+z*c});
  const v=[point(-hx,-hy,-hz),point(hx,-hy,-hz),point(-hx,hy,-hz),point(hx,hy,-hz),
    point(-hx,-hy,hz),point(hx,-hy,hz),point(-hx,hy,hz),point(hx,hy,hz)];
  for(const [a,b,c,d] of [[0,1,2,3],[4,6,5,7],[0,4,1,5],[2,3,6,7],[0,2,4,6],[1,5,3,7]])quad(mesh,v[a],v[b],v[c],v[d]);
}
export function addRoadEngineering(core,index,data,surfaceAt,groundFootprint){
  const {meshes,components,start,end}=data,state=core.route.v3State,design=core.roadDesign;
  const structure=meshes.structure;
  const pos=(s,l=0,lift=0)=>{const p=core.roadPointAt(s);return {x:p.x+Math.cos(p.heading)*l,
    y:p.y+core.roadCrossElevation(p,l)+lift,z:p.z-Math.sin(p.heading)*l};};
  const safe=(s,p,low,high,radius)=>!state.points.some(q=>Math.abs(q.s-s)>75&&
    Math.hypot(q.x-p.x,q.z-p.z)<radius&&q.y+7>low&&q.y-1<high);
  const support=(kind,s,l,topY,hx,hz,footX=hx+.7,footZ=hz+.7)=>{
    const p=pos(s,l),heading=core.roadPointAt(s).heading,footprint=groundFootprint(p,heading,footX,footZ);
    if(!footprint){components.push({kind:'support-omitted',supportKind:kind,s,l,reason:'incomplete terrain footprint'});return null;}
    const {samples,minY:min,maxY:max}=footprint;
    const footTop=Math.min(max+.25,topY-.15),bottom=Math.min(min-.8,footTop-.5);
    if(!safe(s,p,bottom,topY,Math.hypot(footX,footZ)+7)){
      components.push({kind:'support-omitted',supportKind:kind,s,l,reason:'other road clearance'});return null;
    }
    box(structure,{...p,y:(bottom+footTop)/2},footX,(footTop-bottom)/2,footZ,heading);
    box(structure,{...p,y:(footTop+topY)/2},hx,(topY-footTop)/2,hz,heading);
    const result={kind:'foundation',supportKind:kind,s,l,x:p.x,z:p.z,heading,hx,hz,footX,footZ,
      bottom,footTop,topY,groundSamples:samples,footprintArea:footprint.area,groundCoverage:footprint.coverage,
      embedDepth:.8};components.push(result);return result;
  };
  for(const f of state.features){
    if(f.end<start||f.start>end)continue;
    if(f.kind==='bridge'){
      const stations=[{s:f.start,kind:'abutment'},{s:f.end,kind:'abutment'}];
      for(let s=f.start+24;s<f.end-14;s+=48)stations.push({s,kind:'pier'});
      for(const {s,kind} of stations)if(s>=start&&s<end){
        const p=pos(s),heading=core.roadPointAt(s).heading;
        const capTop=Math.min(pos(s,-6).y,pos(s,6).y)-design.deckThickness,capBottom=capTop-.6;
        if(!safe(s,p,capBottom,capTop,19)){
          components.push({kind:'support-omitted',supportKind:kind,s,reason:'crosshead clearance'});continue;
        }
        const before=structure.vertices.length,beforeIndices=structure.indices.length,recordStart=components.length;
        const pair=[-1,1].map(sign=>support(kind,s,sign*7.8,capBottom,.7,kind==='abutment'?1.6:.9));
        if(pair.some(p=>!p)){
          structure.vertices.length=before;structure.indices.length=beforeIndices;components.length=recordStart;
          components.push({kind:'support-omitted',supportKind:kind,s,reason:'incomplete pair'});continue;
        }
        box(structure,{...p,y:(capTop+capBottom)/2},8.7,.3,1.1,heading);
        for(const sign of [-1,1]){
          const bearing=pos(s,sign*4.8),top=bearing.y-design.deckThickness+.025;
          box(structure,{...bearing,y:(top+capTop)/2},.5,Math.max(.025,(top-capTop)/2),.6,heading);
        }
        components.push({kind:'crosshead',s,bottom:capBottom,top:capTop});
      }
    }
    if(f.kind==='suspension'){
      for(const s of [f.start+26,f.end-26])if(s>=start&&s<end){
        const heading=core.roadPointAt(s).heading;
        const before=structure.vertices.length,beforeIndices=structure.indices.length,recordStart=components.length;
        const pair=[-1,1].map(sign=>support('tower',s,sign*7.7,pos(s,sign*7.7,22).y,.8,1.2,1.5,2));
        if(pair.some(p=>!p)){
          structure.vertices.length=before;structure.indices.length=beforeIndices;components.length=recordStart;
          components.push({kind:'support-omitted',supportKind:'tower',s,reason:'incomplete tower pair'});continue;
        }
        box(structure,pos(s,0,22),8.5,.7,1.2,heading);
      }
      for(const s of [f.start,f.end])if(s>=start&&s<end)
        for(const sign of [-1,1])support('anchorage',s,sign*9,pos(s,sign*9,2).y,2,3,2.3,3.3);
    }
    if(f.kind==='tunnel'){
      if(!meshes.cover)meshes.cover={vertices:[],indices:[]};
      if(!meshes.earthWall)meshes.earthWall={vertices:[],indices:[]};
      const h=design.tunnelHeight+.8;
      const section=s=>[-6.85,-3.4,0,3.4,6.85].map(l=>pos(s,l,h+3.5*Math.max(0,1-(l/6.85)**2)));
      for(let s=Math.max(start,f.start);s<Math.min(end,f.end)-1e-7;){
        const t=Math.min(Math.ceil((s+1e-6)/4)*4,end,f.end),a=section(s),b=section(t);
        for(let i=0;i<a.length-1;i++)quad(meshes.cover,a[i],a[i+1],b[i],b[i+1]);
        for(const sign of [-1,1]){
          const aa=pos(s,sign*6.85,design.tunnelHeight),ab=pos(t,sign*6.85,design.tunnelHeight);
          const ba=pos(s,sign*6.85,h),bb=pos(t,sign*6.85,h);
          quad(structure,aa,ab,ba,bb);
          quad(structure,pos(s,sign*6.2,h),pos(s,sign*6.85,h),pos(t,sign*6.2,h),pos(t,sign*6.85,h));
        }
        s=t;
      }
      for(const [s,direction] of [[f.start,-1],[f.end,1]])if(s>=start&&s<end){
        const rim=section(s);
        const offsets=[-6.85,-3.4,0,3.4,6.85];
        for(let i=0;i<rim.length-1;i++){
          const a=pos(s,offsets[i],h),b=pos(s,offsets[i+1],h);
          if(direction<0)quad(meshes.earthWall,a,b,rim[i],rim[i+1]);
          else quad(meshes.earthWall,b,a,rim[i+1],rim[i]);
          quad(structure,pos(s,offsets[i],design.tunnelHeight),pos(s,offsets[i+1],design.tunnelHeight),a,b);
        }
        // Close the shell ends beside the opening. No face crosses the bore.
        for(const sign of [-1,1]){
          const a=pos(s,sign*6.2),b=pos(s,sign*6.85);
          quad(structure,a,b,{...a,y:a.y+design.tunnelHeight},{...b,y:b.y+design.tunnelHeight});
          const outer=pos(s+direction*8,sign*10),ground=surfaceAt(outer.x,outer.z);
          if(ground){
            const bottom=Math.min(a.y,ground.y)-.6,topA=a.y+design.tunnelHeight,topB=ground.y+.5;
            const dx=outer.x-b.x,dz=outer.z-b.z,L=Math.hypot(dx,dz),nx=dz/L*.2,nz=-dx/L*.2;
            const aa={x:b.x+nx,y:bottom,z:b.z+nz},ab={x:b.x-nx,y:bottom,z:b.z-nz};
            const ba={x:outer.x+nx,y:bottom,z:outer.z+nz},bb={x:outer.x-nx,y:bottom,z:outer.z-nz};
            quad(structure,aa,ba,{...aa,y:topA},{...ba,y:topB});
            quad(structure,ab,{...ab,y:topA},bb,{...bb,y:topB});
            quad(structure,{...aa,y:topA},{...ba,y:topB},{...ab,y:topA},{...bb,y:topB});
            quad(structure,ba,bb,{...ba,y:topB},{...bb,y:topB});
            quad(structure,aa,{...aa,y:topA},ab,{...ab,y:topA});
            quad(structure,aa,ab,ba,bb);
          }
        }
        components.push({kind:'portal',s,direction,designBoreHeight:design.tunnelHeight,coverTop:rim[2].y});
      }
    }
  }
}
