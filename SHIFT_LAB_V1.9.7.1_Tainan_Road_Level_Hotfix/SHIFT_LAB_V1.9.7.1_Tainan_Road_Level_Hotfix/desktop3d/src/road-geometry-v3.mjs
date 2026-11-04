// Deterministic V3 mesh construction. These exact vertices/indices feed both
// THREE and Rapier; structure meshes are never registered as wheel ground.
import {addRoadEngineering} from './road-engineering.mjs';
const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export function emptyMesh(){return {vertices:[],indices:[]};}
function triangle(mesh,a,b,c){const n=mesh.vertices.length/3;for(const p of [a,b,c])mesh.vertices.push(p.x,p.y,p.z);mesh.indices.push(n,n+1,n+2);}
function quad(mesh,a,b,c,d){triangle(mesh,a,c,b);triangle(mesh,b,c,d);}
function polygon(mesh,points){for(let i=1;i+1<points.length;i++)triangle(mesh,points[0],points[i],points[i+1]);}
function side(p,a,b){return (b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);}
function split(points,a,b){
  const inside=[],outside=[];
  for(let i=0;i<points.length;i++){
    const p=points[i],q=points[(i+1)%points.length],dp=side(p,a,b),dq=side(q,a,b);
    (dp>=-1e-8?inside:outside).push(p);
    if((dp>1e-8&&dq< -1e-8)||(dp< -1e-8&&dq>1e-8)){
      const hit=mix(p,q,dp/(dp-dq));inside.push(hit);outside.push(hit);
    }
  }
  return {inside,outside};
}
// Difference against a convex platform. Each rejected half-plane is disjoint;
// no stacked junction surfaces and no gap hidden under an overlay.
function subtract(points,clip){
  const pieces=[];let remainder=points;
  for(let i=0;i<clip.length&&remainder.length;i++){
    const cut=split(remainder,clip[i],clip[(i+1)%clip.length]);
    if(cut.outside.length>=3)pieces.push(cut.outside);remainder=cut.inside;
  }
  return pieces;
}
function clipped(mesh,points,platforms){
  let pieces=[points];
  for(const platform of platforms)pieces=pieces.flatMap(p=>subtract(p,platform));
  for(const piece of pieces)polygon(mesh,piece);
}
function platformPoints(j){return Array.from({length:12},(_,i)=>{
  const a=i*Math.PI/6;return {x:j.x+Math.cos(a)*j.radius,y:j.y,z:j.z+Math.sin(a)*j.radius};});}
function box(mesh,center,hx,hy,hz,heading=0){
  const sin=Math.sin(heading),cos=Math.cos(heading);
  const p=(x,y,z)=>({x:center.x+x*cos+z*sin,y:center.y+y,z:center.z-x*sin+z*cos});
  const v=[p(-hx,-hy,-hz),p(hx,-hy,-hz),p(-hx,hy,-hz),p(hx,hy,-hz),p(-hx,-hy,hz),p(hx,-hy,hz),p(-hx,hy,hz),p(hx,hy,hz)];
  for(const [a,b,c,d] of [[0,1,2,3],[4,6,5,7],[0,4,1,5],[2,3,6,7],[0,2,4,6],[1,5,3,7]])quad(mesh,v[a],v[b],v[c],v[d]);
}
function rod(mesh,a,b,r){
  const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,L=Math.hypot(dx,dy,dz);if(L<1e-6)return;
  let ux=dz,uy=0,uz=-dx,n=Math.hypot(ux,uz);if(n<1e-8){ux=1;uz=0;n=1;}
  ux=ux/n*r;uz=uz/n*r;
  const vx=(dy*uz-dz*uy)/L,vy=(dz*ux-dx*uz)/L,vz=(dx*uy-dy*ux)/L;
  const ring=p=>[[-1,-1],[1,-1],[-1,1],[1,1]].map(([u,v])=>({x:p.x+u*ux+v*vx,y:p.y+v*vy,z:p.z+u*uz+v*vz}));
  const aa=ring(a),bb=ring(b);
  for(const [i,j] of [[0,1],[1,3],[3,2],[2,0]])quad(mesh,aa[i],aa[j],bb[i],bb[j]);
  quad(mesh,aa[0],aa[2],aa[1],aa[3]);quad(mesh,bb[0],bb[1],bb[2],bb[3]);
}
export function buildRoadChunkV3(core,index,options={}){
  const state=core.route.v3State,design=core.roadDesign||{deckThickness:.8,tunnelHeight:6.5,tunnelWall:.65};
  const start=index*100,end=Math.min(start+100,core.roadTotalDistance());if(end<=start)return null;
  const meshes={asphalt:emptyMesh(),shoulder:emptyMesh(),earth:emptyMesh(),structure:emptyMesh(),rail:emptyMesh(),mark:emptyMesh(),cable:emptyMesh()};
  const components=[];
  const pos=(s,l=0,lift=0)=>{const p=core.roadPointAt(s);return {x:p.x+Math.cos(p.heading)*l,y:p.y+core.roadCrossElevation(p,l)+lift,z:p.z-Math.sin(p.heading)*l};};
  const platforms=state.junctions.filter(j=>[j.a,j.b].some(s=>s>start-60&&s<end+60)).map(platformPoints);
  const cuts=new Set([start,end]);for(let s=Math.ceil(start/4)*4;s<end;s+=4)cuts.add(s);
  for(const f of state.features)for(const s of [f.start-24,f.start,f.end,f.end+24])if(s>start&&s<end)cuts.add(s);
  const stations=[...cuts].sort((a,b)=>a-b),width=[-14,-6,-5.2,-3.4,0,3.4,5.2,6,14];
  const extent=s=>{let e=14;for(const f of state.features){if(f.kind==='underpass')continue;
    const d=s<f.start?f.start-s:s>f.end?s-f.end:0;e=Math.min(e,6+8*smooth(d/24));}return e;};
  const station=s=>width.map(l=>pos(s,Math.abs(l)>6?Math.sign(l)*extent(s):l));
  for(let i=1;i<stations.length;i++){
    const sa=stations[i-1],sb=stations[i],a=station(sa),b=station(sb);
    for(let j=0;j<width.length-1;j++){
      if(j===0&&Math.abs(a[0].x-a[1].x)+Math.abs(a[0].z-a[1].z)+Math.abs(b[0].x-b[1].x)+Math.abs(b[0].z-b[1].z)<1e-7)continue;
      if(j===7&&extent(sa)<=6&&extent(sb)<=6)continue;
      const mesh=j===0||j===7?meshes.earth:j===1||j===6?meshes.shoulder:meshes.asphalt;
      clipped(mesh,[a[j],b[j],b[j+1],a[j+1]],platforms);
    }
    const mid=(sa+sb)/2,f=core.roadStructureAt(mid);
    if(f&&['bridge','suspension'].includes(f.kind)){
      const al=pos(sa,-6),ar=pos(sa,6),bl=pos(sb,-6),br=pos(sb,6),down=p=>({...p,y:p.y-design.deckThickness});
      quad(meshes.structure,down(al),down(ar),down(bl),down(br));
      quad(meshes.structure,al,down(al),bl,down(bl));quad(meshes.structure,ar,br,down(ar),down(br));
      if(Math.abs(sa-f.start)<1e-6)quad(meshes.structure,al,ar,down(al),down(ar));
      if(Math.abs(sb-f.end)<1e-6)quad(meshes.structure,bl,down(bl),br,down(br));
    }
    if(f&&['underpass','tunnel'].includes(f.kind)){
      for(const sign of [-1,1]){
        // A wide drainage/shoulder strip separates the lane from retaining walls.
        const h=f.kind==='tunnel'?design.tunnelHeight:3.2;
        const aa=pos(sa,sign*6.2),bb=pos(sb,sign*6.2);
        const outerA=pos(sa,sign*(6.2+design.tunnelWall)),outerB=pos(sb,sign*(6.2+design.tunnelWall));
        quad(meshes.structure,aa,bb,{...aa,y:aa.y+h},{...bb,y:bb.y+h});
        quad(meshes.structure,outerA,{...outerA,y:outerA.y+h},outerB,{...outerB,y:outerB.y+h});
        quad(meshes.structure,{...aa,y:aa.y+h},{...bb,y:bb.y+h},{...outerA,y:outerA.y+h},{...outerB,y:outerB.y+h});
      }
      if(f.kind==='tunnel'){
        const h=design.tunnelHeight,aa=pos(sa,-6.2,h),ab=pos(sa,6.2,h),ba=pos(sb,-6.2,h),bb=pos(sb,6.2,h);
        quad(meshes.structure,aa,ab,ba,bb);
        // Paved verge reaches the real inner wall. TerrainField consumes these
        // same ground triangles as its cut, so earth cannot rise inside bore.
        for(const [lo,hi] of [[-6.2,-6],[6,6.2]])quad(meshes.shoulder,pos(sa,lo),pos(sa,hi),pos(sb,lo),pos(sb,hi));
        const lightStation=Math.ceil((sa-8-1e-7)/16)*16+8;
        if(lightStation>=sa-1e-7&&lightStation<sb-1e-7){
          // Emissive ceiling finish lies exactly in an existing roof triangle.
          // No raised fixture or duplicate physical surface is introduced.
          if(!meshes.luminaire)meshes.luminaire=emptyMesh();
          const at=(u,v)=>({x:aa.x*u+ba.x*v+ab.x*(1-u-v),y:aa.y*u+ba.y*v+ab.y*(1-u-v),z:aa.z*u+ba.z*v+ab.z*(1-u-v)});
          const a=at(.25,.3),b=at(.25,.4),c=at(.35,.3),d=at(.35,.4);quad(meshes.luminaire,a,b,c,d);
          const center=at(.3,.35),tunnelId=state.features.findIndex(x=>x.kind==='tunnel'&&x.start===f.start&&x.end===f.end)+1;
          components.push({kind:'tunnel-luminaire',id:`tunnel-lamp:${lightStation}`,tunnelId,s:sa+(sb-sa)*.35,
            position:{...center,y:center.y-.12},ceilingPosition:center});
        }
        const top=p=>({...p,y:p.y+.8});quad(meshes.structure,top(aa),top(ba),top(ab),top(bb));
        // Ridge shoulders, with a true open portal and no terrain across bore.
        for(const sign of [-1,1])quad(meshes.earth,pos(sa,sign*6.85,h+.8),pos(sb,sign*6.85,h+.8),pos(sa,sign*22),pos(sb,sign*22));
      }
    }
    for(const sign of [-1,1])if(core.roadRailEnabled(core.roadPointAt(mid),sign)){
      rod(meshes.rail,pos(sa,sign*4.96,.57),pos(sb,sign*4.96,.57),.14);
      // Posts are physical too, with no yaw-only collider approximation.
      if(Math.floor(sa/8)!==Math.floor(sb/8))rod(meshes.rail,pos(sb,sign*4.96,.12),pos(sb,sign*4.96,.98),.08);
    }
  }
  for(const j of state.junctions)if(Math.floor(j.a/100)===index){
    const points=platformPoints(j);for(let i=0;i<points.length;i++)triangle(meshes.asphalt,{x:j.x,y:j.y,z:j.z},points[(i+1)%points.length],points[i]);
    components.push({kind:'junction',id:j.id});
    // Four passive stop lines keep the common platform readable without
    // importing a traffic simulation or acceptance UI into the game.
    for(const arc of [j.a,j.b])for(const sign of [-1,1]){
      const s=arc-sign*29;
      quad(meshes.mark,pos(s,sign*.2,.03),pos(s,sign*3.3,.03),pos(s+.35,sign*.2,.03),pos(s+.35,sign*3.3,.03));
    }
  }
  for(let s=Math.ceil((start+3)/17)*17;s<end-2;s+=17){
    if(state.junctions.some(j=>Math.min(Math.abs(s-j.a),Math.abs(s-j.b))<35))continue;
    const a=pos(s,-.055,.035),b=pos(s,.055,.035),c=pos(s+5,-.055,.035),d=pos(s+5,.055,.035);quad(meshes.mark,a,b,c,d);
  }
  const supportSafe=(s,l,low,high)=>{
    const p=pos(s,l);return !state.points.some(q=>Math.abs(q.s-s)>75&&Math.hypot(q.x-p.x,q.z-p.z)<18&&q.y+7>low&&q.y-1<high);
  };
  for(const f of state.features){
    if(f.end<start||f.start>end)continue;
    if(f.kind==='bridge'&&!options.surfaceAt){
      for(let s=f.start+24;s<f.end-14;s+=48)if(s>=start&&s<end){
        const center=pos(s),depth=9;
        for(const sign of [-1,1])if(supportSafe(s,sign*7.8,center.y-depth,center.y-1))
          box(meshes.structure,pos(s,sign*7.8,-depth/2-.8),.7,depth/2,.9,core.roadPointAt(s).heading);
      }
    }
    if(f.kind==='suspension'){
      const a=f.start+26,b=f.end-26,L=b-a;
      for(const s of [a,b])if(s>=start&&s<end){
        const heading=core.roadPointAt(s).heading;
        if(!options.surfaceAt){
          for(const sign of [-1,1]){box(meshes.structure,pos(s,sign*7.7,2),.8,20,1.2,heading);
            box(meshes.structure,pos(s,sign*7.7,-18),1.5,1,2,heading);}
          box(meshes.structure,pos(s,0,22),8.5,.7,1.2,heading);
        }components.push({kind:'tower',s});
      }
      for(let s=Math.max(f.start,start);s<Math.min(f.end,end)-1e-6;s+=4){
        const t=Math.min(s+4,f.end,end);
        const cableHeight=s=>s<a?2+20*(s-f.start)/(a-f.start):s>b?22-20*(s-b)/(f.end-b):5+17*(2*(s-a)/L-1)**2;
        for(const sign of [-1,1]){
          rod(meshes.cable,pos(s,sign*7.7,cableHeight(s)),pos(t,sign*7.7,cableHeight(t)),.13);
          if(s>=a&&s<=b&&Math.floor(s/12)!==Math.floor(t/12)){
            rod(meshes.cable,pos(t,sign*7.7,.3),pos(t,sign*7.7,cableHeight(t)),.055);components.push({kind:'hanger',s:t});
          }
        }
      }
      for(const s of [f.start,f.end])if(s>=start&&s<end){
        if(!options.surfaceAt)for(const sign of [-1,1])box(meshes.structure,pos(s,sign*9,0),2,2,3,core.roadPointAt(s).heading);
        components.push({kind:'anchorage',s});
      }
      // A cut gorge below the deck makes the span's purpose visible, while its
      // terrain stays far below the driving surface and cannot occlude a portal.
      for(let s=Math.max(start,f.start);s<Math.min(end,f.end);s+=4){
        const t=Math.min(s+4,end,f.end);
        quad(meshes.earth,pos(s,-10,-18),pos(s,10,-18),pos(t,-10,-18),pos(t,10,-18));
        for(const sign of [-1,1])quad(meshes.earth,pos(s,sign*10,-18),pos(t,sign*10,-18),pos(s,sign*30,-2),pos(t,sign*30,-2));
      }
    }
    if(Math.floor(f.start/100)===index)components.push({kind:f.kind,id:f.id});
  }
  if(options.surfaceAt)addRoadEngineering(core,index,{meshes,components,start,end},options.surfaceAt,options.groundFootprint);
  for(const mesh of Object.values(meshes)){
    // Drop zero-area faces at taper tips, and reject invalid coordinates early.
    if(!mesh.vertices.every(Number.isFinite))throw Error('Non-finite V3 mesh');
  }
  return {meshes,components,start,end};
}
