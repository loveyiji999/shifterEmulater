// Test adapter executes the actual physics.html road-profile functions.
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../public/road-generator-v3.js',import.meta.url),'utf8'),context);
export const engine=context.SHIFT_ROAD_V3;
export const base={generator:3,seed:'LEVEL-1',turnChance:70,hairpinChance:35,slopeChance:30,leftBias:50,upBias:50,maxGrade:9};
const html=fs.readFileSync(new URL('../public/physics.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function roadJunctionFactor('),html.indexOf('function makeRoadCamera('));
const rails=html.slice(html.indexOf('function roadRailEnabled('),html.indexOf('function roadGuardPost('));
export function fixture(config=base,count=48){
  const state=engine.create(config);engine.extend(state,count);
  const route={config,seedHash:state.seedHash,points:state.points,segments:state.segments,v3State:state};
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const roadSmooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
  const functions=new Function('route','window','clamp','roadSmooth','roadAppearance',source+rails+
    ';return {roadCrossElevation,roadBankAt,roadRailEnabled,roadStructureAt,roadJunctionFactor};')
    (route,{SHIFT_ROAD_V3:engine},clamp,roadSmooth,{guardrails:'both',drainage:true});
  return {...functions,route,roadDesign:engine.design,roadTotalDistance:()=>state.points.at(-1).s,
    roadPointAt:s=>engine.at(state.points,s)};
}
