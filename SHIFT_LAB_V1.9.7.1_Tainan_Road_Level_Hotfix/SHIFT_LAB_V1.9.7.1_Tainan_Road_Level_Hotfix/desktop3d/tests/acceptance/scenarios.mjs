// Deterministic desktop 3D acceptance scenarios. All distances in meters.
// Uses the first 200 m of the original seeded, flat SHIFT LAB road.
export const SCENARIOS=Object.freeze({
  free:{name:'自由試駕',description:'完整手排操作與四輪物理；無測試初速。',spawnS:70,side:0,angle:0,speed:0,duration:0},
  frontal:{name:'正面碰撞',description:'以約 72 km/h 正面撞擊橫向固定路障，觀察車速、反彈及穿透。',spawnS:60,side:0,angle:0,speed:20,duration:3.4,expect:'barrier'},
  glancing:{name:'斜角擦撞',description:'以約 83 km/h、小角度向右接近護欄，觀察偏航及速度損失。',spawnS:74,side:2.65,angle:.14,speed:23,duration:2.2,expect:'rail'},
  fast:{name:'高速 CCD',description:'以約 151 km/h 接近固定路障，檢查車體穿牆及物理穩定性。',spawnS:60,side:0,angle:0,speed:42,duration:2.1,expect:'barrier'},
  ramp:{name:'坡道及離地',description:'以約 61 km/h 通過低矮坡道，觀察輪胎接地、升沉及落地。',spawnS:118,side:0,angle:0,speed:17,duration:3.5,expect:'ramp'},
  settle:{name:'靜止穩定',description:'以靜止車身檢查懸吊、重力與數值發散。',spawnS:70,side:0,angle:0,speed:0,duration:3.0,expect:'settle'}
});
export const TEST_ORDER=Object.freeze(['settle','frontal','glancing','fast','ramp']);

export function gradeScenario(id,data){
  const tests=[];
  const check=(label,passed,value)=>tests.push({label,passed:!!passed,value});
  const s=SCENARIOS[id];
  if(!s||!s.duration)return {pass:false,checks:[{label:'無效測試',passed:false}]};
  check('車身與輪胎受力皆為有限值',data.finite&&data.nonFiniteSteps===0&&
    data.invalidWheelLoads===0,data.nonFiniteSteps+data.invalidWheelLoads);
  check('3D 剛體未超出受控邊界',data.maxPositionAbs<100000,data.maxPositionAbs);
  check('沒有明顯的數值速度爆衝',data.maxSpeed<=Math.max(16,s.speed+12),data.maxSpeed);
  // Rapier addForce/addForceAtPoint are persistent, so a missed force reset
  // can repeatedly add spring loads and launch even a parked car.
  check('逐微步重置外力與力矩、沒有受力累積',
    data.forceResetCount>=1 && Number.isFinite(data.maxExternalForceN) &&
    Number.isFinite(data.maxExternalTorqueNm) &&
    data.maxExternalForceN<=data.bodyMassKg*9.81*12 &&
    data.maxExternalTorqueNm<=data.bodyMassKg*9.81*30,
    data.maxExternalForceN);
  if(id==='settle'){
    check('靜止車輛無明顯橫向漂移',data.travel<3.0,data.travel);
    check('車身未翻覆',data.maxTiltDeg<38,data.maxTiltDeg);
    check('懸吊射線有命中路面',data.rayHits>0,data.rayHits);
    check('大部分時間至少兩輪接地',data.validWheelSteps>Math.round(s.duration*120*.50),data.validWheelSteps);
  }else if(s.expect==='barrier'){
    check('確實產生路障碰撞',data.barrierHits>0,data.barrierHits);
    check('路障有解算接觸衝量',data.maxImpactImpulse>0.1,data.maxImpactImpulse);
    check('沒有直接穿過路障後方',data.maxBeyondBarrier<1.2,data.maxBeyondBarrier);
    check('最深碰撞穿透不超過 0.45 m',data.maxBarrierPenetration<=.45,data.maxBarrierPenetration);
  }else if(s.expect==='rail'){
    check('確實碰到右側護欄',data.railHits>0,data.railHits);
    check('撞擊有解算接觸衝量',data.maxImpactImpulse>0.1,data.maxImpactImpulse);
    check('沒有極端穿透護欄',data.maxBarrierPenetration<=.45,data.maxBarrierPenetration);
  }else if(s.expect==='ramp'){
    check('車輛實際到達坡道最高點',data.maxRouteS>=156,data.maxRouteS);
    check('坡道前後的懸吊射線有效',data.rayHits>0&&data.maxWheelContacts>=2,data.rayHits);
    check('輪胎接地計數持續更新',data.validWheelSteps>Math.round(s.duration*120*.12),data.validWheelSteps);
    check('通過坡道期間產生垂直位移',data.verticalExcursion>.12,data.verticalExcursion);
    check('沒有不合理翻覆',data.maxTiltDeg<90,data.maxTiltDeg);
  }
  return {pass:tests.every(t=>t.passed),checks:tests};
}
