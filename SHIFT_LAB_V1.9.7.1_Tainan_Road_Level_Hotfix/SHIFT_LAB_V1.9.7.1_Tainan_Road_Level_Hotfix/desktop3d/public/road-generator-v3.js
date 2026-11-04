/* SHIFT LAB V3: the sole active procedural-road development line.
 * Continuous curvature/grade, independent bends, bounded geometric search.
 * Classic script shared by the physics iframe and Node VM tests; no clocks,
 * DOM, rendering, dependencies, or unseeded randomness enter generation.
 */
(function(root){
  'use strict';
  const CELL=64,CLEARANCE=34,ARC_EXCLUSION=80,STEP=4,MAX_CURVATURE=.018;
  const MAX_ATTEMPTS=64,DEG=Math.PI/180;
  // Simulator assumptions, traced in docs/knowledge/road-design/DESIGN.md.
  const DESIGN=Object.freeze({carriagewayHalfWidth:3.4,deckHalfWidth:6,
    clearance:5.5,deckThickness:.8,verticalMargin:1.2,gradeChangePerMeter:.08,
    junctionRadius:22,junctionBlend:42,tunnelHeight:6.5,tunnelWall:.65});
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const smooth=u=>u*u*u*(10+u*(-15+6*u));
  const integralSmooth=u=>u**4*(2.5+u*(-3+u));
  const bell=u=>16*u*u*(1-u)*(1-u);
  const integralBell=u=>16*(u**3/3-u**4/2+u**5/5);
  function hash(value){
    let h=2166136261;
    for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}
    return h>>>0;
  }
  function random(seed){
    let a=seed>>>0;
    return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;
      t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
      return ((t^(t>>>14))>>>0)/4294967296;};
  }
  function keys(a,b,padding=0){
    const out=[];
    for(let x=Math.floor((Math.min(a.x,b.x)-padding)/CELL);x<=Math.floor((Math.max(a.x,b.x)+padding)/CELL);x++)
      for(let z=Math.floor((Math.min(a.z,b.z)-padding)/CELL);z<=Math.floor((Math.max(a.z,b.z)+padding)/CELL);z++)
        out.push(x+','+z);
    return out;
  }
  function pointDistance(p,a,b){
    const x=b.x-a.x,z=b.z-a.z,n=x*x+z*z;
    const t=n?clamp(((p.x-a.x)*x+(p.z-a.z)*z)/n,0,1):0;
    return Math.hypot(p.x-a.x-t*x,p.z-a.z-t*z);
  }
  function edgeDistance(a,b,c,d){
    const x=b.x-a.x,z=b.z-a.z,v=d.x-c.x,w=d.z-c.z,det=x*w-z*v;
    if(Math.abs(det)>1e-12){
      const dx=c.x-a.x,dz=c.z-a.z,t=(dx*w-dz*v)/det,u=(dx*z-dz*x)/det;
      if(t>=0&&t<=1&&u>=0&&u<=1)return 0;
    }
    return Math.min(pointDistance(a,c,d),pointDistance(b,c,d),pointDistance(c,a,b),pointDistance(d,a,b));
  }
  function intersection(a,b,c,d){
    const x=b.x-a.x,z=b.z-a.z,v=d.x-c.x,w=d.z-c.z,det=x*w-z*v;
    if(Math.abs(det)<1e-8)return null;
    const dx=c.x-a.x,dz=c.z-a.z,t=(dx*w-dz*v)/det,u=(dx*z-dz*x)/det;
    return t>=0&&t<=1&&u>=0&&u<=1?{t,u,x:a.x+t*x,z:a.z+t*z}:null;
  }
  function contacts(candidate,grids){
    const out=[],seen=new Set();
    for(const edge of candidate.edges)for(const grid of grids)for(const key of keys(edge.a,edge.b,CLEARANCE))
      for(const other of grid.get(key)||[]){
        const id=edge.s+':'+other.s;if(seen.has(id)||Math.abs(edge.s-other.s)<ARC_EXCLUSION)continue;
        seen.add(id);const gap=edgeDistance(edge.a,edge.b,other.a,other.b);
        if(gap<CLEARANCE-1e-7)out.push({edge,other,gap,hit:intersection(edge.a,edge.b,other.a,other.b)});
      }
    return out;
  }
  function verticalGap(a,b){
    // A conservative swept-width bound: endpoint extremes, bank/crown allowance,
    // slab thickness and a margin. This covers the entire 12 m deck, not one ray.
    return Math.max(Math.min(a.a.y,a.b.y)-Math.max(b.a.y,b.b.y),
      Math.min(b.a.y,b.b.y)-Math.max(a.a.y,a.b.y));
  }
  function at(points,s){
    let lo=0,hi=points.length-1;s=clamp(s,points[0].s,points[hi].s);
    while(lo+1<hi){const mid=(lo+hi)>>1;if(points[mid].s<s)lo=mid;else hi=mid;}
    const a=points[lo],b=points[hi],t=a===b?0:(s-a.s)/(b.s-a.s),p={s};
    for(const k of ['x','y','z','heading','grade','curvature'])p[k]=a[k]+(b[k]-a[k])*t;
    p.section=a.section;return p;
  }
  function junctionFor(a,b,junctions){
    return junctions.find(j=>(Math.abs(a.s-j.a)<50&&Math.abs(b.s-j.b)<50)||
      (Math.abs(a.s-j.b)<50&&Math.abs(b.s-j.a)<50));
  }
  function validPair(edge,other,junctions=[]){
    if(verticalGap(edge,other)>=DESIGN.clearance+DESIGN.deckThickness+DESIGN.verticalMargin)return true;
    const j=junctionFor(edge,other,junctions);
    return !!j&&[edge.a,edge.b,other.a,other.b].every(p=>Math.abs(p.y-j.y)<1e-5&&Math.abs(p.grade)<1e-5);
  }
  function profile(candidate,start,target,finish){
    const length=finish-start.s;if(length<90)return false;
    // Quintic Hermite profile: endpoint elevations/grades and zero endpoint
    // vertical acceleration. Flat crossing platform begins before conflict zone.
    const delta=target-start.y,m=start.grade/100*length;
    let previous=start,lastGrade=start.grade;
    for(const p of candidate.points){
      const u=clamp((p.s-start.s)/length,0,1);
      const h10=u-6*u**3+8*u**4-3*u**5;
      const dh10=1-18*u*u+32*u**3-15*u**4;
      p.y=start.y+delta*smooth(u)+m*h10;
      p.grade=p.s>=finish?0:(delta*30*u*u*(1-u)*(1-u)+m*dh10)/length*100;
      if(Math.abs(p.grade)>candidate.maxGrade+1e-6||Math.abs(p.grade-lastGrade)/(p.s-previous.s)>DESIGN.gradeChangePerMeter+1e-6)return false;
      previous=p;lastGrade=p.grade;
    }
    candidate.seg.gradeEnd=0;candidate.seg.gradeTarget=candidate.points.reduce((grade,p)=>Math.abs(p.grade)>Math.abs(grade)?p.grade:grade,start.grade);
    return true;
  }
  function reservedConflict(edge,grids,features){
    if(!features.length)return false;
    for(const grid of grids)for(const key of keys(edge.a,edge.b,65))for(const other of grid.get(key)||[])
      if(Math.abs(edge.s-other.s)>ARC_EXCLUSION&&features.some(f=>other.s>=f.start-30&&other.s<=f.end+30)&&
        edgeDistance(edge.a,edge.b,other.a,other.b)<65)return true;
    return false;
  }
  function solve(state,candidate){
    candidate.junctions=[];
    if(candidate.edges.some(edge=>reservedConflict(edge,[state.grid],state.features)))return null;
    const near=contacts(candidate,[state.grid]);
    if(!near.length||near.every(c=>validPair(c.edge,c.other)))return candidate;
    if(near.some(c=>state.junctions.some(j=>Math.min(Math.abs(c.other.s-j.a),Math.abs(c.other.s-j.b))<95)))return null;
    const crossings=near.filter(c=>c.hit),first=near.reduce((a,b)=>a.edge.s<b.edge.s?a:b);
    // Only near-orthogonal, already flat approaches can become a connected node.
    // Existing centerlines remain immutable; no raising a committed road.
    const crossing=crossings[0],start=candidate.edges[0].a;
    if(crossing){
      const {edge,other,hit}=crossing,sa=edge.a.s+(edge.b.s-edge.a.s)*hit.t,
        sb=other.a.s+(other.b.s-other.a.s)*hit.u;
      const pa=at([start,...candidate.points],sa),pb=at(state.points,sb);
      const angle=Math.abs(Math.sin(pa.heading-pb.heading));
      const old=state.points.filter(p=>Math.abs(p.s-sb)<55);
      const isolated=!state.junctions.some(j=>Math.hypot(j.x-hit.x,j.z-hit.z)<120)&&
        !state.features.some(f=>sb>f.start-70&&sb<f.end+70)&&!contacts({edges:[other]},[state.grid]).length;
      if(angle>.9&&Math.abs(pa.curvature)<.003&&isolated&&old.length&&
        old.every(p=>Math.abs(p.grade)<1e-8&&Math.abs(p.y-pb.y)<1e-7)){
        const j={id:'j'+candidate.seg.index,a:sa,b:sb,x:hit.x,z:hit.z,y:pb.y,
          headingA:pa.heading,headingB:pb.heading,radius:DESIGN.junctionRadius};
        const copy={...candidate,points:candidate.points.map(p=>({...p})),seg:{...candidate.seg},maxGrade:state.config.maxGrade};
        if(profile(copy,start,pb.y,sa-55)){
          copy.edges=copy.points.map((p,i)=>({a:i?copy.points[i-1]:start,b:p,s:(p.s+(i?copy.points[i-1]:start).s)/2}));
          copy.junctions=[j];
          if(contacts(copy,[state.grid]).every(c=>validPair(c.edge,c.other,[j])))return copy;
        }
      }
    }
    if(near.every(c=>validPair(c.edge,c.other)))return candidate;
    // Choose the feasible side of the existing road. Grades, not a decorative
    // bridge placement, decide whether this candidate can cross it.
    const finish=first.edge.a.s-12,offset=DESIGN.clearance+DESIGN.deckThickness+DESIGN.verticalMargin+.5;
    const choices=[Math.max(...near.map(c=>Math.max(c.other.a.y,c.other.b.y)))+offset,
      Math.min(...near.map(c=>Math.min(c.other.a.y,c.other.b.y)))-offset];
    if(hash(state.config.seed+'|level|'+candidate.seg.index)%2)choices.reverse();
    for(const target of choices){
      const copy={...candidate,points:candidate.points.map(p=>({...p})),seg:{...candidate.seg},maxGrade:state.config.maxGrade};
      if(!profile(copy,start,target,finish))continue;
      copy.edges=copy.points.map((p,i)=>({a:i?copy.points[i-1]:start,b:p,s:(p.s+(i?copy.points[i-1]:start).s)/2}));
      if(contacts(copy,[state.grid]).every(c=>validPair(c.edge,c.other)))return copy;
    }
    return null;
  }
  function add(grid,edge){
    for(const key of keys(edge.a,edge.b)){
      let bucket=grid.get(key);if(!bucket){bucket=[];grid.set(key,bucket);}bucket.push(edge);
    }
  }
  function conflict(edge,grids,junctions=[]){
    const seen=new Set();
    for(const grid of grids)for(const key of keys(edge.a,edge.b,CLEARANCE)){
      for(const other of grid.get(key)||[]){
        if(seen.has(other))continue;seen.add(other);
        if(Math.abs(edge.s-other.s)<ARC_EXCLUSION)continue;
        const gap=edgeDistance(edge.a,edge.b,other.a,other.b);
        if(gap<CLEARANCE-1e-7&&!validPair(edge,other,junctions))return {meters:gap,s:edge.s,otherS:other.s};
      }
    }
    return null;
  }
  function check(candidate,grids,junctions=[],features=[]){
    const local=new Map();
    for(const edge of candidate.edges){
      const hit=reservedConflict(edge,[...grids,local],features)?{reserved:true}:conflict(edge,[...grids,local],junctions);if(hit)return {hit};add(local,edge);
    }
    return {grid:local};
  }
  function curve(start,plan,index){
    let length=Math.max(plan.length,(1.875*Math.abs(plan.g1-start.grade)+3.1*Math.abs(plan.bump))/DESIGN.gradeChangePerMeter),amplitude=0;
    const k0=start.curvature,k1=plan.k1;
    // Solve the requested total turn while carrying curvature across joins.
    // Lengthening a bend, rather than clipping its samples, preserves smoothness.
    for(let attempt=0;attempt<8;attempt++){
      amplitude=plan.turn===null?0:(plan.turn/length-(k0+k1)/2)/(8/15);
      const delta=k1-k0,a=-30*delta,b=30*delta-64*amplitude,c=32*amplitude;
      const roots=[0,1];
      if(Math.abs(a)<1e-12){if(Math.abs(b)>1e-12)roots.push(-c/b);}
      else{const discriminant=b*b-4*a*c;if(discriminant>=0){
        roots.push((-b+Math.sqrt(discriminant))/(2*a),(-b-Math.sqrt(discriminant))/(2*a));}}
      const peak=Math.max(...roots.filter(u=>u>=0&&u<=1).map(u=>Math.abs(k0+delta*smooth(u)+amplitude*bell(u))));
      if(peak<=MAX_CURVATURE-1e-6)break;
      length*=1.24;
      if(attempt===7)return null;
    }
    const heading=u=>start.heading+length*(k0*u+(k1-k0)*integralSmooth(u)+amplitude*integralBell(u));
    const grade=u=>start.grade+(plan.g1-start.grade)*smooth(u)+plan.bump*bell(u);
    const elevation=u=>start.y+length/100*(start.grade*u+(plan.g1-start.grade)*integralSmooth(u)+plan.bump*integralBell(u));
    const count=Math.ceil(length/STEP),ds=length/count,points=[],edges=[];
    let previous=start;
    for(let i=1;i<=count;i++){
      const u=i/count,mid=(i-.5)/count,offset=1/(2*Math.sqrt(3)*count);
      const ha=heading(mid-offset),hb=heading(mid+offset);
      const p={s:start.s+ds*i,x:previous.x+ds/2*(Math.sin(ha)+Math.sin(hb)),
        z:previous.z+ds/2*(Math.cos(ha)+Math.cos(hb)),y:elevation(u),heading:heading(u),
        grade:grade(u),curvature:k0+(k1-k0)*smooth(u)+amplitude*bell(u),section:index};
      edges.push({a:previous,b:p,s:(previous.s+p.s)/2});points.push(p);previous=p;
    }
    const turn=heading(1)-start.heading,turnDeg=turn/DEG;
    const type=Math.abs(turnDeg)<8?'straight':(Math.abs(turnDeg)>=135?'hairpin-':'')+(turn<0?'left':'right');
    return {points,edges,plan:{...plan,length},seg:{index,start:start.s,end:start.s+length,length,type,turnDeg,
      gradeTarget:Math.abs(start.grade)>Math.abs(plan.g1)?start.grade:plan.g1,headingStart:start.heading,
      curvatureStart:k0,curvatureEnd:k1,gradeStart:start.grade,gradeEnd:plan.g1}};
  }
  function parameters(state,rng,attempt){
    const c=state.config,last=state.points.at(-1),prior=state.segments.at(-1)?.turnDeg||0;
    const bias=attempt<16?c.leftBias/100:.5;
    const persistent=bias===0||bias===1?bias:.7*bias+.3*(prior<0?1:prior>0?0:.5);
    const sign=rng()<persistent?-1:1;
    const turn=rng()*100<c.turnChance,hairpin=turn&&rng()*100<c.hairpinChance;
    const length=hairpin?320+180*rng():turn?95+230*rng():110+310*rng();
    const angle=turn?sign*(hairpin?140+46*rng():12+88*rng())*DEG:null;
    const k1=turn?sign*(hairpin?.0002+.001*rng():.0005+.003*rng()):0;
    const g1=rng()*100<c.slopeChance?(rng()*100<c.upBias?1:-1)*(1.5+(c.maxGrade-1.5)*rng()):0;
    // Grade never resets merely because a segment ended. Optional broad crests
    // stay within the configured envelope and have zero slope derivative at joins.
    const margin=c.maxGrade-Math.max(Math.abs(last.grade),Math.abs(g1));
    const bump=c.slopeChance>0?(rng()*2-1)*Math.min(1.2,margin)*.65:0;
    return {length,turn:angle,k1,g1,bump};
  }
  function bounds(points,prior=null){
    const out=prior?{...prior}:{minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};
    for(const p of points){out.minX=Math.min(out.minX,p.x);out.maxX=Math.max(out.maxX,p.x);
      out.minZ=Math.min(out.minZ,p.z);out.maxZ=Math.max(out.maxZ,p.z);}
    return out;
  }
  function clearExit(start,box,grids,features=[]){
    const x=Math.sin(start.heading),z=Math.cos(start.heading),padding=CLEARANCE+STEP;
    const tx=Math.abs(x)<1e-9?Infinity:((x>0?box.maxX+padding:box.minX-padding)-start.x)/x;
    const tz=Math.abs(z)<1e-9?Infinity:((z>0?box.maxZ+padding:box.minZ-padding)-start.z)/z;
    const distance=Math.max(0,Math.min(tx,tz));
    let a=start;
    // Check an exact polyline ray all the way outside the occupied bounds, not
    // just a short clear patch that can conceal a later dead end.
    for(let d=0;d<distance;){
      d=Math.min(distance,d+CELL);
      const b={x:start.x+x*d,z:start.z+z*d,s:start.s+d,y:start.y};
      if(reservedConflict({a,b,s:(a.s+b.s)/2},grids,features)||conflict({a,b,s:(a.s+b.s)/2},grids))return false;a=b;
    }
    return true;
  }
  function escape(state,candidate,local){
    const end=candidate.points.at(-1),box=bounds(candidate.points,state.bounds),features=[...state.features,...candidate.terrain];
    // Escape probes reserve no road and force no bend pairs. Every accepted
    // frontier has a verified path out of the already occupied road envelope.
    for(const degrees of [0,40,-40,85,-85,150,-150]){
      const plan={length:degrees===0?190:Math.abs(degrees)>100?390:240,
        turn:degrees===0?null:degrees*DEG,k1:0,g1:0,bump:0};
      const probe=curve(end,plan,state.segments.length+1);
      if(!probe)continue;
      const checked=check(probe,[state.grid,local],[],features);
      if(!checked.hit&&clearExit(probe.points.at(-1),bounds(probe.points,box),[state.grid,local,checked.grid],features))return probe.plan;
    }
    return null;
  }
  function remove(grid,edge){
    for(const key of keys(edge.a,edge.b)){
      const bucket=grid.get(key);
      if(bucket.at(-1)!==edge)throw Error('Road V3 planner grid order');
      bucket.pop();if(!bucket.length)grid.delete(key);
    }
  }
  function planAhead(state){
    // Plan a fixed look-ahead independent of the caller's extension size. Only
    // uncommitted candidates may be backtracked, so streaming never moves roads.
    const work={...state,points:state.points.slice(),segments:state.segments.slice(),
      grid:new Map([...state.grid].map(([key,bucket])=>[key,bucket.slice()])),bounds:bounds(state.points),junctions:state.junctions.slice(),features:state.terrainFeatures.slice()};
    const path=[];let nodes=0,rejected=0;
    function search(depth){
      if(depth===12)return true;
      const index=work.segments.length,start=work.points.at(-1),priorEscape=work.escape;
      const rng=random(hash(state.config.seed+'|v3|'+index));
      for(let attempt=0;attempt<=MAX_ATTEMPTS;attempt++){
        if(++nodes>6000)return false;
        if(index===0&&attempt>0)break;
        const plan=index===0?{length:340,turn:null,k1:0,g1:0,bump:0}:
          attempt===MAX_ATTEMPTS?priorEscape:parameters(work,rng,attempt);
        if(!plan)continue;
        let candidate=curve(start,plan,index);
        if(candidate)candidate=solve(work,candidate);
        if(!candidate){rejected++;continue;}
        const checked=check(candidate,[work.grid],[...work.junctions,...candidate.junctions]);
        if(checked.hit){rejected++;continue;}
        candidate.terrain=terrainOpportunity(work,candidate);
        const future=escape(work,candidate,checked.grid);
        if(!future){rejected++;continue;}
        const priorFeatures=work.features.length;work.features.push(...candidate.terrain);
        const count=work.points.length,priorBounds=work.bounds;
        const priorJunctions=work.junctions.length;work.junctions.push(...candidate.junctions);
        work.points.push(...candidate.points);work.segments.push(candidate.seg);work.escape=future;work.bounds=bounds(candidate.points,priorBounds);
        for(const edge of candidate.edges)add(work.grid,edge);
        path.push(candidate);
        if(search(depth+1))return true;
        path.pop();work.features.length=priorFeatures;work.junctions.length=priorJunctions;work.points.length=count;work.segments.pop();work.escape=priorEscape;work.bounds=priorBounds;
        for(let i=candidate.edges.length-1;i>=0;i--)remove(work.grid,candidate.edges[i]);
        rejected++;
      }
      return false;
    }
    if(!search(0))throw Error('Road V3 could not plan a clear continuation at segment '+state.segments.length);
    state.rejected+=rejected;state.pending=path;state.escape=work.escape;
  }
  function create(config){
    if(!config||config.generator!==3)throw Error('Road V3 needs generator: 3');
    const seed=config.seed;
    if(typeof seed!=='string'||!seed||seed.length>64)throw Error('Invalid road seed');
    for(const key of ['turnChance','hairpinChance','slopeChance','leftBias','upBias','maxGrade']){
      const low=key==='maxGrade'?3:0,high=key==='maxGrade'?12:100;
      if(!Number.isFinite(config[key])||config[key]<low||config[key]>high)throw Error('Invalid road parameter '+key);
    }
    return {config:{...config},seedHash:hash(seed),points:[{s:0,x:0,y:0,z:0,heading:0,grade:0,curvature:0,section:0}],
      segments:[],grid:new Map(),escape:null,pending:[],rejected:0,accepted:0,
      junctions:[],features:[],terrainFeatures:[],crossings:[],revision:0};
  }
  function extend(state,count){
    if(!Number.isInteger(count)||count<0||count>1000)throw Error('Invalid segment count');
    const saved={points:state.points.length,segments:state.segments.length,escape:state.escape,pending:state.pending.slice(),rejected:state.rejected,junctions:state.junctions.length,terrain:state.terrainFeatures.length};
    try{
      for(let i=0;i<count;i++){
        if(!state.pending.length)planAhead(state);
        const candidate=state.pending.shift();state.segments.push(candidate.seg);state.points.push(...candidate.points);
        state.junctions.push(...candidate.junctions);state.terrainFeatures.push(...candidate.terrain);
        for(const edge of candidate.edges)add(state.grid,edge);state.accepted++;
      }
    }catch(error){
      // Failed streaming extensions must not leave a partially changed route.
      state.points.length=saved.points;state.segments.length=saved.segments;
      state.escape=saved.escape;state.pending=saved.pending;state.rejected=saved.rejected;state.accepted=saved.segments;state.junctions.length=saved.junctions;state.terrainFeatures.length=saved.terrain;
      state.grid=new Map();
      for(let i=1;i<state.points.length;i++)add(state.grid,{a:state.points[i-1],b:state.points[i],s:(state.points[i-1].s+state.points[i].s)/2});
      throw error;
    }
    rebuildFeatures(state);state.revision++;
    return state;
  }
  function audit(state){
    const errors=[],grid=new Map();let maxGrade=0,maxCurvature=0,minGap=Infinity,nonzeroJoins=0;
    const fail=text=>{if(errors.length<12)errors.push(text);};
    for(let i=0;i<state.points.length;i++){
      const p=state.points[i];
      if(!['s','x','y','z','heading','grade','curvature'].every(k=>Number.isFinite(p[k]))){fail('Non-finite sample '+i);continue;}
      maxGrade=Math.max(maxGrade,Math.abs(p.grade));maxCurvature=Math.max(maxCurvature,Math.abs(p.curvature));
      if(!i)continue;
      const a=state.points[i-1],ds=p.s-a.s;
      if(!(ds>0&&ds<=STEP+1e-7))fail('Arc-length discontinuity '+i);
      if(ds>0){
        if(Math.abs(Math.hypot(p.x-a.x,p.z-a.z)-ds)>.01)fail('Plan discontinuity '+i);
        if(Math.abs(p.grade-a.grade)/ds>DESIGN.gradeChangePerMeter+1e-5)fail('Vertical transition '+i);
        if(Math.abs(p.y-a.y)>ds*(state.config.maxGrade/100+1e-6))fail('Grade discontinuity '+i);
        if(Math.abs(p.heading-a.heading)/ds>MAX_CURVATURE+1e-6)fail('Curvature exceeded '+i);
      }
      const edge={a,b:p,s:(a.s+p.s)/2},seen=new Set();
      for(const key of keys(a,p,CLEARANCE))for(const other of grid.get(key)||[]){
        if(seen.has(other)||Math.abs(edge.s-other.s)<ARC_EXCLUSION)continue;seen.add(other);
        const gap=edgeDistance(a,p,other.a,other.b);minGap=Math.min(minGap,gap);
        if(gap<CLEARANCE-1e-7&&!validPair(edge,other,state.junctions))fail('Road clearance at '+Math.round(p.s));
      }
      add(grid,edge);
    }
    for(let i=1;i<state.segments.length;i++){
      const a=state.segments[i-1],b=state.segments[i];
      if(Math.abs(a.end-b.start)>1e-7||Math.abs(a.curvatureEnd-b.curvatureStart)>1e-9||Math.abs(a.gradeEnd-b.gradeStart)>1e-9)fail('Segment join '+i);
      if(Math.abs(b.curvatureStart)>1e-6)nonzeroJoins++;
    }
    if(maxGrade>state.config.maxGrade+1e-6)fail('Maximum grade exceeded');
    if(maxCurvature>MAX_CURVATURE+1e-6)fail('Maximum curvature exceeded');
    if(state.accepted!==state.segments.length)fail('Segment count mismatch');
    return {ok:errors.length===0,errors,segments:state.segments.length,samples:state.points.length,
      distanceMeters:state.points.at(-1)?.s||0,maxGradePercent:maxGrade,maxCurvatureRadPerMeter:maxCurvature,
      minNonlocalDistanceMeters:Number.isFinite(minGap)?minGap:null,rejectedCandidates:state.rejected,
      clearanceMeters:CLEARANCE,nonzeroCurvatureJoins:nonzeroJoins,
      crossings:state.crossings.length,junctions:state.junctions.length,structures:state.features.map(f=>f.kind),
      requiredVerticalClearance:DESIGN.clearance};
  }
  function terrainOpportunity(state,candidate){
    const seg=candidate.seg,key=hash(state.config.seed+'|terrain|'+seg.index);
    if(seg.length<300||key%100>34)return [];
    const start=seg.start+40,end=seg.end-40;
    if(state.features.some(f=>start<f.end+80&&end>f.start-80)||
      [...state.junctions,...candidate.junctions].some(j=>[j.a,j.b].some(s=>s>start-80&&s<end+80)))return [];
    const samples=candidate.points.filter(p=>p.s>=start&&p.s<=end);
    for(let i=0;i<samples.length;i+=4)for(const k of keys(samples[i],samples[i],65))
      for(const other of state.grid.get(k)||[])if(Math.abs(other.s-samples[i].s)>100&&pointDistance(samples[i],other.a,other.b)<65)return [];
    const kind=samples.every(p=>Math.abs(p.grade)<=4&&Math.abs(p.curvature)<=.00008)?'suspension':
      samples.every(p=>Math.abs(p.grade)<=4)?'tunnel':null;
    return kind?[{id:kind+'-'+seg.index,kind,start,end,terrain:kind==='suspension'?'gorge':'ridge'}]:[];
  }
  function rebuildFeatures(state){
    const features=[],crossings=[],grid=new Map();
    const feature=(kind,start,end,extra={})=>{
      start=Math.max(0,start);end=Math.min(state.points.at(-1).s,end);
      const overlapping=features.find(f=>f.kind===kind&&start<f.end+12&&end>f.start-12);
      if(overlapping){overlapping.start=Math.min(overlapping.start,start);overlapping.end=Math.max(overlapping.end,end);return;}
      features.push({id:kind+'-'+Math.round(start),kind,start,end,...extra});
    };
    for(let i=1;i<state.points.length;i++){
      const edge={a:state.points[i-1],b:state.points[i],s:(state.points[i-1].s+state.points[i].s)/2};
      for(const c of contacts({edges:[edge]},[grid])){
        if(junctionFor(edge,c.other,state.junctions))continue;
        const upper=(edge.a.y+edge.b.y>c.other.a.y+c.other.b.y)?edge:c.other;
        const lower=upper===edge?c.other:edge;
        feature('bridge',upper.s-65,upper.s+65);
        feature('underpass',lower.s-22,lower.s+22);
        if(c.hit&&!crossings.some(x=>Math.abs(x.a-edge.s)<45&&Math.abs(x.b-c.other.s)<45))
          crossings.push({id:'c'+crossings.length,a:edge.s,b:c.other.s,x:c.hit.x,z:c.hit.z,
            upper:upper.s,lower:lower.s,clearance:verticalGap(edge,c.other)-DESIGN.deckThickness-DESIGN.verticalMargin});
      }
      add(grid,edge);
    }
    const merged=[];
    for(const kind of ['bridge','underpass']){
      const ranges=features.filter(f=>f.kind===kind).sort((a,b)=>a.start-b.start);
      for(const range of ranges){const prior=merged.at(-1);
        if(prior&&prior.kind===kind&&range.start<=prior.end+12)prior.end=Math.max(prior.end,range.end);
        else merged.push({...range});}
    }
    features.length=0;features.push(...merged,...state.terrainFeatures.map(f=>({...f})));
    state.features=features.sort((a,b)=>a.start-b.start);state.crossings=crossings;
  }
  function featureAt(state,s){
    return state.features.find(f=>s>=f.start&&s<=f.end&&f.kind!=='underpass')||
      state.features.find(f=>s>=f.start&&s<=f.end)||null;
  }
  function nearest(state,x,y,z,expectedS,heading=0){
    // Connections only expand search at a declared at-grade node. An unrelated
    // deck at the same XY never enters the candidate chainage windows.
    const ranges=[[expectedS-90,expectedS+90]];
    for(const j of state.junctions)if(Math.min(Math.abs(expectedS-j.a),Math.abs(expectedS-j.b))<65&&Math.hypot(x-j.x,z-j.z)<65)
      ranges.push([j.a-90,j.a+90],[j.b-90,j.b+90]);
    let best=null;const seen=new Set();
    for(const [left,right] of ranges){
      let lo=0,hi=state.points.length-1;
      while(lo<hi){const mid=(lo+hi)>>1;if(state.points[mid].s<left)lo=mid+1;else hi=mid;}
      for(let i=Math.max(0,lo-1);i<state.points.length-1&&state.points[i].s<right;i++){
        if(seen.has(i))continue;seen.add(i);
        const a=state.points[i],b=state.points[i+1],dx=b.x-a.x,dz=b.z-a.z,den=dx*dx+dz*dz;
        const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/den,0,1),s=a.s+(b.s-a.s)*t,p=at([a,b],s);
        const ex=x-p.x,ez=z-p.z,vertical=y-p.y;
        const alignment=1-Math.abs(Math.cos(heading-p.heading));
        const local=Math.abs(s-expectedS)<100;
        const score=ex*ex+ez*ez+vertical*vertical*12+alignment*12+(local?.0002*(s-expectedS)**2:.4);
        if(!best||score<best.score)best={s,road:p,offset:ex*Math.cos(p.heading)-ez*Math.sin(p.heading),distance:Math.hypot(ex,ez),score};
      }
    }
    return best;
  }
  root.SHIFT_ROAD_V3=Object.freeze({version:3,create,extend,audit,hash,at,featureAt,nearest,design:DESIGN,
    limits:Object.freeze({clearanceMeters:CLEARANCE,arcExclusionMeters:ARC_EXCLUSION,maxCurvatureRadPerMeter:MAX_CURVATURE,
      maxAttempts:MAX_ATTEMPTS,sampleStepMeters:STEP})});
})(globalThis);
