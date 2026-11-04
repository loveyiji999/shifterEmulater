// Immutable V3 geometry adapter. No road generation or vehicle integration.
// Parity tests execute the original iframe profile and generator lookup.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
export function roadSnapshot(core){
  const state=core.route.v3State;
  return {config:{...core.route.config},seedHash:core.route.seedHash,roadDesign:{...core.roadDesign},
    segments:core.route.segments,state:{points:state.points,features:state.features,junctions:state.junctions,revision:state.revision},
    guardrails:core.roadAppearance?.guardrails||'both'};
}
export function snapshotCore(snapshot){
  const {state,config,seedHash,segments,guardrails}=snapshot;
  if(config.generator!==3||!state.points.length)throw Error('V3 geometry snapshot required');
  const roadPointAt=distance=>{
    const points=state.points;let lo=0,hi=points.length-1,s=clamp(distance,points[0].s,points[hi].s);
    while(lo+1<hi){const mid=(lo+hi)>>1;if(points[mid].s<s)lo=mid;else hi=mid;}
    const a=points[lo],b=points[hi],t=a===b?0:(s-a.s)/(b.s-a.s),p={s};
    for(const k of ['x','y','z','heading','grade','curvature'])p[k]=a[k]+(b[k]-a[k])*t;
    p.section=a.section;return p;
  };
  const roadStructureAt=s=>state.features.find(f=>s>=f.start&&s<=f.end&&f.kind!=='underpass')||state.features.find(f=>s>=f.start&&s<=f.end)||null;
  const roadJunctionFactor=p=>{let factor=1;for(const j of state.junctions){
    const d=Math.min(Math.abs(p.s-j.a),Math.abs(p.s-j.b));factor=Math.min(factor,smooth(clamp((d-26)/18,0,1)));}return factor;};
  const roadBankAt=p=>{
    if(Number.isFinite(p.curvature))return -clamp(p.curvature*2.9,-.048,.048)*roadJunctionFactor(p);
    const seg=segments[p.section];if(!seg||!seg.turnDeg)return 0;
    const phase=clamp((p.s-seg.start)/Math.max(1,seg.length),0,1),gate=smooth(phase/.18)*smooth((1-phase)/.18);
    return -clamp((seg.turnDeg*Math.PI/180)/seg.length*2.9,-.048,.048)*gate;
  };
  const roadCrossElevation=(p,lateral)=>{
    const a=Math.abs(lateral),factor=roadJunctionFactor(p),bank=roadBankAt(p)*lateral;
    const structure=roadStructureAt(p.s);
    if(a<=6)return (a<=3.4?.075*(1-a/3.4):-.025*(a-3.4))*factor+bank;
    if(structure)return bank-.065;
    const side=lateral<0?-1:1,seedPhase=(seedHash%8191)*.00041;
    const broad=Math.sin(p.s*.0058+seedPhase+side*1.1),detail=.55*Math.sin(p.s*.019+seedPhase*.53+side*1.3);
    const slope=clamp(3.1*broad+detail,-3.6,3.6);
    return bank+(-.065+(a-6)*slope*.045)*factor;
  };
  const roadRailEnabled=(p,side)=>{
    if(roadJunctionFactor(p)<.98||guardrails==='off')return false;if(guardrails==='both')return true;
    const seg=segments[p.section];if(!seg||Math.abs(seg.turnDeg)<8)return true;return seg.turnDeg<0?side===1:side===-1;
  };
  return {route:{config,seedHash,segments,points:state.points,v3State:state},roadDesign:snapshot.roadDesign,
    roadTotalDistance:()=>state.points.at(-1).s,roadPointAt,roadStructureAt,roadJunctionFactor,roadBankAt,roadCrossElevation,roadRailEnabled};
}
