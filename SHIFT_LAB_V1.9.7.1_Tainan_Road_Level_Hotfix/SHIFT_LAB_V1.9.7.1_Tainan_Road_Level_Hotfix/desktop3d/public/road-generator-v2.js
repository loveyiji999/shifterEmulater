/* SHIFT LAB road generator v2: standalone, deterministic, geometry-checked.
 * Classic script shared by the original physics iframe and Node VM QA. No
 * dependencies on THREE, Rapier, document, performance, clock, or Math.random.
 * v1 generator remains in physics.html and is never routed through this code.
 */
(function(root){
  'use strict';
  const CELL=40, CLEARANCE=34, ARC_EXCLUSION=75, MAX_CURVATURE=.024;
  const TAU=Math.PI*2;
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
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const smooth=t=>{const q=clamp(t,0,1);return q*q*(3-2*q);};
  const headingAt=(t,a)=>a*(t-Math.sin(TAU*t)/TAU);
  const gradeAt=(t,g)=>g*smooth(t/.2)*smooth((1-t)/.2);
  const cell=(x,z)=>Math.floor(x/CELL)+','+Math.floor(z/CELL);
  const cellsNear=p=>{
    const x=Math.floor(p.x/CELL),z=Math.floor(p.z/CELL),keys=[];
    for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)keys.push((x+i)+','+(z+j));
    return keys;
  };
  function conflictWithGrid(points,grid,limit=CLEARANCE){
    const distance2=limit*limit;
    for(const p of points){
      for(const key of cellsNear(p)){
        const list=grid.get(key);
        if(!list)continue;
        for(const q of list){
          if(Math.abs(p.s-q.s)<ARC_EXCLUSION)continue;
          const dx=p.x-q.x,dz=p.z-q.z;
          if(dx*dx+dz*dz<distance2)return {s:p.s,otherS:q.s,meters:Math.hypot(dx,dz)};
        }
      }
    }
    return null;
  }
  function addToGrid(grid,points){
    for(const p of points){
      const key=cell(p.x,p.z);
      let list=grid.get(key);
      if(!list){list=[];grid.set(key,list);}
      list.push(p);
    }
  }
  function candidate(state,params){
    const {last,length,turn,grade,type}=params;
    const section=state.segments.length,steps=Math.ceil(length/4.5),ds=length/steps;
    const seg={index:section,start:last.s,end:last.s+length,length,
      type,turnDeg:turn*180/Math.PI,gradeTarget:grade,headingStart:last.heading};
    const points=[];
    let previous=last;
    for(let j=1;j<=steps;j++){
      const t0=(j-1)/steps,t1=j/steps,tm=(t0+t1)/2;
      const heading=seg.headingStart+headingAt(tm,turn);
      const g=gradeAt(tm,grade);
      previous={s:seg.start+ds*j,x:previous.x+Math.sin(heading)*ds,
        z:previous.z+Math.cos(heading)*ds,y:previous.y+g*ds/100,
        heading:seg.headingStart+headingAt(t1,turn),
        grade:gradeAt(t1,grade),section};
      points.push(previous);
    }
    return {seg,points};
  }
  // Feature plans reserve their own longitudinal corridor. Normal bends are
  // balanced pairs; a hairpin is a full offset switchback with two U-turns.
  // The 160 m return leg stays in a separate lane, while every complete
  // feature finishes ahead of the previous feature's northernmost extent.
  // This prevents the self-avoiding random-walk dead ends seen in prototype v2.
  function feature(state){
    const r=state.rng,c=state.config,sign=r()*100<c.leftBias?-1:1;
    const isTurn=r()*100<c.turnChance;
    const hairpin=isTurn&&r()*100<c.hairpinChance;
    const grade=()=>r()*100<c.slopeChance
      ?(r()*100<c.upBias?1:-1)*(2.4+(c.maxGrade-2.4)*r()):0;
    const item=(length,degrees,type)=>({length,turn:degrees*Math.PI/180,grade:grade(),type});
    if(!isTurn)return [item(235+115*r(),0,'straight')];
    if(!hairpin){
      const angle=sign*(22+50*r());
      return [item(205+90*r(),angle,sign<0?'left':'right'),
        item(205+90*r(),-angle,sign<0?'right':'left')];
    }
    // The topological pair keeps a genuine ~180-degree mechanical U-turn,
    // followed by a parallel return leg and an opposite U-turn. Curvature is
    // capped below .024 rad/m by the length of these two sections.
    const angle=sign*(157+21*r());
    return [item(325+30*r(),0,'straight'),
      item(330+75*r(),angle,sign<0?'hairpin-left':'hairpin-right'),
      item(160+32*r(),0,'straight'),
      item(330+75*r(),-angle,sign<0?'hairpin-right':'hairpin-left'),
      item(390+35*r(),0,'straight')];
  }
  function nextParameters(state){
    if(state.segments.length===0)return {last:state.points[0],length:340,
      turn:0,grade:0,type:'straight'};
    if(state.pending.length===0)state.pending.push(...feature(state));
    return {...state.pending.shift(),last:state.points[state.points.length-1]};
  }
  function create(config){
    if(!config||config.generator!==2)throw Error('Road v2 needs generator: 2');
    const seed=String(config.seed||'');
    if(!seed||seed.length>64)throw Error('Invalid road seed');
    const initial={s:0,x:0,z:0,y:0,heading:0,grade:0,section:0};
    const state={config:{...config},seedHash:hash(seed),rng:random(hash(seed)^0x9e3779b9),
      points:[initial],segments:[],grid:new Map(),pending:[],rejected:0,accepted:0};
    addToGrid(state.grid,[initial]);
    return state;
  }
  function extend(state,count){
    if(!Number.isInteger(count)||count<0||count>1000)throw Error('Invalid segment count');
    for(let n=0;n<count;n++){
      const plan=nextParameters(state);
      const cand=candidate(state,plan);
      const conflict=conflictWithGrid(cand.points,state.grid);
      const local=new Map();let selfConflict=null;
      if(!conflict){
        for(const pt of cand.points){
          selfConflict=conflictWithGrid([pt],local);
          if(selfConflict)break;
          addToGrid(local,[pt]);
        }
      }
      if(conflict||selfConflict){
        state.rejected++;
        const issue=conflict||selfConflict;
        throw Error('Road v2 planned corridor conflict: '+Math.round(issue.meters)+
          ' m near '+Math.round(issue.s)+' m');
      }
      state.segments.push(cand.seg);
      state.points.push(...cand.points);
      addToGrid(state.grid,cand.points);
      state.accepted++;
    }
    return state;
  }
  function audit(state){
    const points=state.points,segments=state.segments,grid=new Map();
    const errors=[];let maxGrade=0,maxCurvature=0,minGap=Infinity;
    if(!points.length||points.length<segments.length)errors.push('Missing road samples');
    for(let i=0;i<points.length;i++){
      const p=points[i];
      if(!['s','x','y','z','heading','grade'].every(k=>Number.isFinite(p[k]))){
        errors.push('Non-finite sample '+i);continue;
      }
      maxGrade=Math.max(maxGrade,Math.abs(p.grade));
      if(i>0){
        const prior=points[i-1],ds=p.s-prior.s;
        if(!(ds>0&&ds<5.01))errors.push('Arc-length gap '+i);
        if(ds>0){
          maxCurvature=Math.max(maxCurvature,Math.abs((p.heading-prior.heading)/ds));
          if(Math.abs(p.y-prior.y)>ds*(state.config.maxGrade/100+.002))errors.push('Grade discontinuity '+i);
        }
      }
      for(const key of cellsNear(p))for(const q of grid.get(key)||[]){
        if(p.s-q.s<ARC_EXCLUSION)continue;
        const gap=Math.hypot(p.x-q.x,p.z-q.z);
        minGap=Math.min(minGap,gap);
        if(gap<CLEARANCE)errors.push('Road overlap at '+Math.round(p.s)+' m / '+Math.round(q.s)+' m');
      }
      addToGrid(grid,[p]);
    }
    if(maxGrade>state.config.maxGrade+1e-6)errors.push('Maximum grade exceeded');
    if(maxCurvature>MAX_CURVATURE+1e-6)errors.push('Maximum curvature exceeded');
    if(segments.length!==state.accepted)errors.push('Segment count mismatch');
    return {ok:errors.length===0,errors:errors.slice(0,12),
      segments:segments.length,samples:points.length,
      distanceMeters:points.at(-1)?.s||0,
      maxGradePercent:maxGrade,maxCurvatureRadPerMeter:maxCurvature,
      minNonlocalDistanceMeters:Number.isFinite(minGap)?minGap:null,
      rejectedCandidates:state.rejected,clearanceMeters:CLEARANCE};
  }
  root.SHIFT_ROAD_V2=Object.freeze({version:2,create,extend,audit,hash,
    limits:Object.freeze({clearanceMeters:CLEARANCE,arcExclusionMeters:ARC_EXCLUSION,maxCurvatureRadPerMeter:MAX_CURVATURE})});
})(globalThis);
