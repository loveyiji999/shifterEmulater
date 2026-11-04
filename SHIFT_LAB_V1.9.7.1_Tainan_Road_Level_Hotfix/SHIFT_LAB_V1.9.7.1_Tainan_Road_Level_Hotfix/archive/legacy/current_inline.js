(() => {
'use strict';
// Units: SI internally (m, s, kg, N, Nm, rad/s). UI: rpm, km/h, deg C.
const P = {
  mass:1280, wheelRadius:.31, finalDrive:3.9, driveEfficiency:.91,
  ratios:{'-1':-3.30,'0':0,'1':3.55,'2':2.06,'3':1.40,'4':1.03,'5':.84,'6':.72},
  inertiaEngine:.30, inertiaInput:.055, wheelRotationalInertia:4.8,
  inertiaOutputShaft:2.6,inertiaDriveWheels:2.35,inertiaCoastWheels:2.45,
  // Output-side inertia includes gearbox output, differential, and coupled driveline.
  absPressureRise:2.8,absPressureRelease:9.5,
  shaftStiffness:7200,shaftDamping:74,shaftBacklash:.020,shaftMaxTorque:5200,
  frontStaticLoad:.59,wheelbase:2.70,cgHeight:.51,frontBrakeBias:.68,
  // V1.4: adjustable demonstration handling balance; default unity retains V1.3.
  frontGripScale:1,rearGripScale:1,
  escBrakeMaxNm:760,escCorrectionGain:3.7,escMinSpeed:10.0,
  yawInertia:2400,cornerStiffFront:66000,cornerStiffRear:71000,
  maxRoadWheelAngle:.56,steerResponse:3.15,rollNaturalHz:1.55,pitchNaturalHz:1.85,
  // V1.1 inherits illustrative suspension profiles from V0.9.2;
  // double-track forces now use four independent tire contact patches.
  trackFront:1.56,trackRear:1.55,rollCenterHeight:.16,sprungMassFraction:.85,
  rollInertia:510,pitchInertia:1350,rollStiffness:54000,pitchStiffness:185000,
  rollDampingRatio:.78,pitchDampingRatio:.79,frontRollShare:.57,
  tireLoadExponent:.78,lateralRelaxationFront:.78,lateralRelaxationRear:.90,
  tireSlipVelocity:1.05, tireReferenceSlip:.092,
  // V1.3: reference-slip, adhesion peak and kinetic-slide retention.
  // Dimensionless coefficients are illustrative, NOT tire-rig / MF-Tyre fits.
  tirePeakLongSlip:.195,tireLongSlideRetention:.79,tireLatSlideRetention:.83,
  tireLongSlideWidth:.92,tireLatSlideWidth:.85,
  // V1.5: illustrative tire thermal and steering-system constants (SI).
  tireTreadHeatCapacity:14500,tireCarcassHeatCapacity:32000,
  tireTreadCarcassConductance:240,tireCoolingBase:8,tireCoolingSpeed:.34,
  tireWearEnergy:17000000,tirePneumaticTrail:.070,
  tireSteerComplianceNmPerRad:1100,
  // V1.6 steering-axis-equivalent actuator / alignment geometry (illustrative SI).
  steerCasterDeg:6,steerMechanicalTrail:.030,steerCasterTrailFactor:.35,
  steerJackingLever:.018,steerGearRatio:15.5,
  steerRackInertia:.55,steerRackDamping:55,steerRackK:900,
  steerRackDriverLimit:245,steerRackMaxRate:1.80,steerRackMaxAccel:16,
  steerRoadFeedbackGain:.28,
  // V1.1 adds four independent vertical spring/damper/unsprung tire contact states.
  // Demonstration values: not manufacturer suspension or measured tire data.
  springFront:26000,springRear:20000,damperFront:2500,damperRear:2050,
  unsprungFront:44,unsprungRear:40,tireVerticalK:205000,tireVerticalC:800,
  bumpTravel:.110,droopTravel:.145,bumpStopK:205000,
  // V1.2 / stage 1: axle anti-roll coupling and distinct compression/rebound damping.
  antiRollFront:3000,antiRollRear:1900,
  compressionDampingFactor:.82,reboundDampingFactor:1.20,
  // V1.2 / stage 2: illustrative kinematic geometry (not measured linkage curves).
  // Camber: negative is top inward relative to the car. Gain is extra negative
  // camber in degrees per meter of compression. Toe: positive means toe-in.
  staticCamberFrontDeg:-.75,staticCamberRearDeg:-.95,
  camberGainFrontDegPerM:7.0,camberGainRearDegPerM:5.0,
  toeInFrontDeg:.06,toeInRearDeg:.12,
  bumpSteerFrontDegPerM:1.2,bumpSteerRearDegPerM:.75,
  camberThrustFront:4300,camberThrustRear:3600,
  // V1.1: four-corner / double-track prototype. Calibrations are illustrative.
  diffLockNm:0,cornerBrakeFade:1,frontToe:0,rearToe:0,

  surfaces:{dry:{mu:1.02,label:'乾燥柏油'},wet:{mu:.68,label:'濕滑柏油'},snow:{mu:.32,label:'積雪'},ice:{mu:.13,label:'結冰'}},
  clutchMaxTorque:310,clutchStiffness:18,clutchLockRPM:55,clutchOpenAt:.82,clutchBiteAt:.43,clutchFullAt:.12,clutchBiteTorque:.22,
  synchroMaxTorque:28,synchroToleranceRPM:30,synchroMinTime:.16,
  idleRPM:850,stallRPM:420,redlineRPM:6800,damageRPM:8300,
  aeroFactor:.39,rollingCoeff:.014,maxBrakeForce:8700,
  clutchHeatCapacity:3500,clutchCooling:.015,temperatureAir:35,
  torqueMap:[[0,70],[800,110],[1500,155],[2500,186],[3500,202],[4500,210],[5500,198],[6500,170],[7200,140]]
};
const TAU=2*Math.PI, rpmToRad=x=>x*TAU/60, radToRPM=x=>x*60/TAU;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const gearLabel=g=>g===0?'N':g===-1?'R':String(g);
// V0.6 car presets intentionally change the physical P object used by the original solver.
// All values are illustrative, not measured or manufacturer-validated.
const BASE_PHYSICS={...P,ratios:{...P.ratios},torqueMap:P.torqueMap.map(pair=>pair.slice())};
const VEHICLES={
  standard:{name:'2.0L 自然進氣 · 標準六速',short:'2.0 NA',engine:'汽油自然進氣',params:{}},
  city:{name:'1.6L 自然進氣 · 輕型轎車',short:'1.6 NA',engine:'汽油自然進氣',params:{
    mass:1130,wheelRadius:.295,finalDrive:4.12,inertiaEngine:.24,inertiaInput:.047,
    wheelbase:2.58,frontStaticLoad:.62,cgHeight:.49,yawInertia:1900,
    cornerStiffFront:56000,cornerStiffRear:59000,trackFront:1.49,trackRear:1.48,
    steerCasterDeg:4,steerMechanicalTrail:.020,steerRackInertia:.48,steerRackDamping:48,
    springFront:19000,springRear:13500,damperFront:1820,damperRear:1450,
    unsprungFront:36,unsprungRear:34,tireVerticalK:175000,tireVerticalC:650,
    bumpTravel:.105,droopTravel:.14,
    antiRollFront:1900,antiRollRear:900,
    compressionDampingFactor:.78,reboundDampingFactor:1.16,
    staticCamberFrontDeg:-.55,staticCamberRearDeg:-.70,
    camberGainFrontDegPerM:5.0,camberGainRearDegPerM:3.5,
    toeInFrontDeg:.08,toeInRearDeg:.14,
    bumpSteerFrontDegPerM:1.50,bumpSteerRearDegPerM:1.05,
    camberThrustFront:3400,camberThrustRear:3000,
    tirePeakLongSlip:.205,tireLongSlideRetention:.77,tireLatSlideRetention:.80,
    tireLongSlideWidth:.95,tireLatSlideWidth:.90,
    rollCenterHeight:.12,sprungMassFraction:.85,rollInertia:470,pitchInertia:1220,
    rollStiffness:35000,pitchStiffness:145000,rollDampingRatio:.68,pitchDampingRatio:.71,
    frontRollShare:.61,lateralRelaxationFront:.90,lateralRelaxationRear:1.0,
    inertiaOutputShaft:2.3,inertiaDriveWheels:2.10,inertiaCoastWheels:2.25,
    clutchMaxTorque:260,clutchBiteAt:.47,clutchBiteTorque:.20,
    idleRPM:800,stallRPM:410,redlineRPM:6400,damageRPM:7800,
    ratios:{'-1':-3.48,'0':0,'1':3.71,'2':2.10,'3':1.40,'4':1.06,'5':.85,'6':.72},
    torqueMap:[[0,55],[800,80],[1500,105],[2500,131],[3500,151],[4600,161],[5500,145],[6400,120],[6900,90]]
  }},
  turbo:{name:'2.0L 渦輪增壓 · 性能車',short:'2.0 TURBO',engine:'汽油渦輪',params:{
    mass:1440,wheelRadius:.325,finalDrive:3.58,inertiaEngine:.25,inertiaInput:.062,
    wheelbase:2.72,frontStaticLoad:.56,cgHeight:.47,yawInertia:2750,
    cornerStiffFront:86000,cornerStiffRear:93000,trackFront:1.62,trackRear:1.61,
    steerCasterDeg:8,steerMechanicalTrail:.045,steerRackInertia:.60,steerRackDamping:62,
    springFront:35000,springRear:23000,damperFront:3850,damperRear:2800,
    unsprungFront:47,unsprungRear:45,tireVerticalK:225000,tireVerticalC:950,
    bumpTravel:.083,droopTravel:.105,
    antiRollFront:6400,antiRollRear:4100,
    compressionDampingFactor:.88,reboundDampingFactor:1.26,
    staticCamberFrontDeg:-1.25,staticCamberRearDeg:-1.15,
    camberGainFrontDegPerM:9.0,camberGainRearDegPerM:6.5,
    toeInFrontDeg:.025,toeInRearDeg:.10,
    bumpSteerFrontDegPerM:.70,bumpSteerRearDegPerM:.50,
    camberThrustFront:5700,camberThrustRear:4800,
    tirePeakLongSlip:.165,tireLongSlideRetention:.83,tireLatSlideRetention:.87,
    tireLongSlideWidth:.82,tireLatSlideWidth:.90,
    rollCenterHeight:.16,sprungMassFraction:.85,rollInertia:620,pitchInertia:1750,
    rollStiffness:76000,pitchStiffness:225000,rollDampingRatio:.90,pitchDampingRatio:.87,
    frontRollShare:.56,lateralRelaxationFront:.62,lateralRelaxationRear:.70,
    inertiaOutputShaft:3.0,inertiaDriveWheels:2.65,inertiaCoastWheels:2.8,
    clutchMaxTorque:475,clutchBiteAt:.39,clutchBiteTorque:.25,
    idleRPM:820,stallRPM:440,redlineRPM:7100,damageRPM:8500,
    ratios:{'-1':-3.30,'0':0,'1':3.36,'2':2.08,'3':1.45,'4':1.12,'5':.91,'6':.74},
    torqueMap:[[0,70],[800,112],[1400,206],[2100,335],[3300,355],[4500,352],[5600,316],[6700,270],[7500,190]]
  }},
  diesel:{name:'2.2L 柴油 · 高扭力車',short:'2.2 DIESEL',engine:'柴油渦輪',params:{
    mass:1880,wheelRadius:.355,finalDrive:3.71,inertiaEngine:.57,inertiaInput:.072,
    wheelbase:2.91,frontStaticLoad:.55,cgHeight:.68,yawInertia:3400,
    cornerStiffFront:89500,cornerStiffRear:95500,trackFront:1.66,trackRear:1.65,
    steerCasterDeg:6,steerMechanicalTrail:.045,steerRackInertia:.74,steerRackDamping:66,
    springFront:24500,springRear:19000,damperFront:2450,damperRear:2050,
    unsprungFront:60,unsprungRear:55,tireVerticalK:240000,tireVerticalC:1050,
    bumpTravel:.145,droopTravel:.175,
    antiRollFront:3900,antiRollRear:2600,
    compressionDampingFactor:.80,reboundDampingFactor:1.22,
    staticCamberFrontDeg:-.45,staticCamberRearDeg:-.55,
    camberGainFrontDegPerM:4.5,camberGainRearDegPerM:3.2,
    toeInFrontDeg:.08,toeInRearDeg:.17,
    bumpSteerFrontDegPerM:1.40,bumpSteerRearDegPerM:1.05,
    camberThrustFront:4700,camberThrustRear:4300,
    tirePeakLongSlip:.215,tireLongSlideRetention:.75,tireLatSlideRetention:.79,
    tireLongSlideWidth:.95,tireLatSlideWidth:.82,
    rollCenterHeight:.20,sprungMassFraction:.86,rollInertia:1260,pitchInertia:2700,
    rollStiffness:60000,pitchStiffness:230000,rollDampingRatio:.68,pitchDampingRatio:.73,
    frontRollShare:.55,lateralRelaxationFront:1.00,lateralRelaxationRear:1.15,
    inertiaOutputShaft:3.9,inertiaDriveWheels:3.4,inertiaCoastWheels:3.7,
    clutchMaxTorque:610,clutchBiteAt:.49,clutchBiteTorque:.26,
    idleRPM:750,stallRPM:365,redlineRPM:4450,damageRPM:5350,
    aeroFactor:.48,rollingCoeff:.019,maxBrakeForce:10500,
    ratios:{'-1':-3.50,'0':0,'1':4.03,'2':2.25,'3':1.50,'4':1.08,'5':.83,'6':.64},
    torqueMap:[[0,100],[720,175],[1100,292],[1600,410],[2300,435],[3000,375],[3800,285],[4500,170],[5000,90]]
  }}
};

const REAL_OBD_BENCHMARK=Object.freeze({"source":"https://github.com/MB-Team-THI/UAHL-RevStED/blob/main/OBD_Sample.csv","source_blob_sha":"84189261768649e0c8eb0d62d474631ff401f3ea","input_rows":200,"record_duration_s":19.9,"sample_hz":10.0,"fitted_surrogate":{"equation":"tau dr/dt = c*v*(steering_wheel_angle - steering_zero) - r","effective_yaw_gain_per_m":0.025675154963018698,"effective_time_constant_s":0.11317488964212404,"effective_steering_center_deg":11.025295726260032,"conditional_equivalent_ratio_if_wheelbase_2_75_and_unity_yaw_gain":14.16296665629199,"identifiability_warning":"Cannot infer physical steering gear ratio or real yaw inertia from this one record; equivalent ratio is illustrative only."},"training_rmse_deg_s":0.404712566221088,"holdout_turn_exit_rmse_deg_s":1.4633146230630618,"holdout_turn_exit_static_rmse_deg_s":0.9312844593167432,"applied_to_full_vehicle_physics":false});
// V1.8.3 independently verified evidence, not additional coefficients for chassis.
// A candidate can never be transferred merely because it fits the training window.
const MEASURED_DATA_QUALITY=Object.freeze({
  adma:{samples:999,sampleHz:100,trainRmseDegS:.09577515354454354,
    holdoutRmseDegS:.07844328994131365,
    sensorConsistencyOnly:true},
  civic:{segments:63,interiorObservations:5969,
    accelVsSpeedDiffRmseMps2:.10475251798881992,
    pedalScaleConsistent:false,independentSensorValidation:false},
  bucknellP1:{massKg:1724,yawInertiaKgM2:1300,
    wheelbaseM:2.45,frontAxleCorneringStiffnessNPerRad:75000,
    rearAxleCorneringStiffnessNPerRad:135000,
    hypotheticalReferenceOnly:true},
  rawRedistributionRightsVerified:false,
  physicalParametersAutomaticallyUpdated:false
});
function evaluateMeasuredTransferGate(candidate){
  const problems=[];
  if(!candidate||!candidate.knownVehicleGeometry)problems.push('known vehicle geometry required');
  if(!candidate||!candidate.verifiedUnitMapping)problems.push('verified units and sign convention required');
  if(!candidate||!(Number.isFinite(candidate.holdoutRmse)&&Number.isFinite(candidate.baselineHoldoutRmse))||
      candidate.holdoutRmse>=candidate.baselineHoldoutRmse)
    problems.push('must improve independent held-out baseline');
  if(!candidate||!candidate.identifiedPhysicalCoefficient)problems.push('surrogate not a physical coefficient');
  return {approved:problems.length===0,reasons:problems};
}

// V1.8.4 measured P1 500Hz test data: independent 2-DOF vehicle-model benchmark ONLY.
const V185_GASOLINE_VALIDATION=Object.freeze({"bmw_gasoline":{"vehicle":"BMW M235i gasoline, transmission variant unknown","n":4708,"duration_s":341.985119,"training_best_holdout_rmse":0.40488,"static_holdout_rmse":0.40154,"zero_holdout_rmse":0.6934,"is_shiftlab_integrator_validation":false,"automaticallyAppliedToFourWheelSimulator":false,"sourceGitBlobSHA1":"9fb7b829265b9e94a09bbc188740dd7d350b0245"},"ford_manual_dataset":{"vehicle":"Ford Fiesta Titanium; gasoline vs diesel and exact gearbox variant unverified","source":"https://github.com/onyekpeu/IO-VNBD","paper":"https://doi.org/10.1016/j.dib.2021.106885","measurements_confirmed":"steering,yaw,4 wheel speeds,engine RPM,gear,clutch,pedal","lfs_original_obtained":false,"automaticallyAppliedToFourWheelSimulator":false},"p1_force_channel_audit":{"numberOfRuns":6,"approvedSessions":0,"channels":"P1 MAT column offsets 127/135 force group; source labels checked","reason":"front-right reported normal force around zero and negative during driving; channel calibration unclear","raw_forceFitApproved":false,"automaticallyAppliedToFourWheelSimulator":false}});
const P1_REAL_DYNAMICS=Object.freeze({"source":"https://www.projects.bucknell.edu/Beal_Automotive/","vehicle":"Bucknell electric research P1","realMatFilesAnalyzed":6,"originalHz":500,"replayHz":50,"trainSource":"left hand ramp","trainStart_s":40,"trainEnd_s":93,"fit":{"sharedLateralStiffnessMultiplier":0.8226312,"tanhEffectiveMu":0.8778691},"holdout":{"left_release":{"yawNominalRmseDegS":4.0617,"yawCalibratedRmseDegS":1.086},"right_ramp":{"yawNominalRmseDegS":3.796,"yawCalibratedRmseDegS":2.3702},"step_steer":{"yawNominalRmseDegS":1.197,"yawCalibratedRmseDegS":0.859},"increasing_speed_circle":{"yawNominalRmseDegS":2.0846,"yawCalibratedRmseDegS":0.8792},"test_track_loop":{"yawNominalRmseDegS":0.6541,"yawCalibratedRmseDegS":0.7131},"low_speed_straight":{"yawNominalRmseDegS":0.4541,"yawCalibratedRmseDegS":0.4497}},"modelScope":"2DOF surrogate only; separate from SHIFT LAB full four wheel physics","automaticallyAppliedToFourWheelSimulator":false,"rightsForRepublishingRawMats":false});
// V1.8 empirical-reference priors: fleet registration-derived archetypes, NOT
// measured per-vehicle inertias. Toggle off by default. See calibration/PROVENANCE.md.
const REFERENCE_FITS={"city":{"reference_id":"T1-06","reference_inputs":{"mass":1123.0,"wheelbase":2.567,"trackFront":1.483,"frontStaticLoad":0.61,"cgHeight":0.539,"rollInertia":377.0,"pitchInertia":1729.0,"yawInertia":1812.0,"wheelRadius":0.298125},"params":{"mass":1123.5,"wheelbase":2.56767,"trackFront":1.4837,"frontStaticLoad":0.61253,"cgHeight":0.51807,"rollInertia":414.2,"pitchInertia":1563.7,"yawInertia":1839.7,"wheelRadius":0.29753,"trackRear":1.4737},"source_line":156},"standard":{"reference_id":"T1-09","reference_inputs":{"mass":1257.0,"wheelbase":2.75,"trackFront":1.548,"frontStaticLoad":0.6,"cgHeight":0.548,"rollInertia":443.0,"pitchInertia":2142.0,"yawInertia":2239.0,"wheelRadius":0.312912},"params":{"mass":1258.8,"wheelbase":2.74742,"trackFront":1.5492,"frontStaticLoad":0.59747,"cgHeight":0.53177,"rollInertia":469.8,"pitchInertia":1884.8,"yawInertia":2289.6,"wheelRadius":0.31235,"trackRear":1.5392},"source_line":159},"turbo":{"reference_id":"T1-03","reference_inputs":{"mass":1391.0,"wheelbase":2.75,"trackFront":1.612,"frontStaticLoad":0.6,"cgHeight":0.557,"rollInertia":510.0,"pitchInertia":2555.0,"yawInertia":2665.0,"wheelRadius":0.312912},"params":{"mass":1394.8,"wheelbase":2.74845,"trackFront":1.6128,"frontStaticLoad":0.58988,"rollInertia":554.0,"pitchInertia":2293.5,"yawInertia":2691.7,"wheelRadius":0.31523,"trackRear":1.6028},"source_line":153},"diesel":{"reference_id":"T1-28","reference_inputs":{"mass":1929.0,"wheelbase":2.933,"trackFront":1.676,"frontStaticLoad":0.57,"cgHeight":0.693,"rollInertia":777.0,"pitchInertia":4209.0,"yawInertia":4371.0,"wheelRadius":0.357273},"params":{"mass":1925.2,"wheelbase":2.93181,"trackFront":1.6744,"frontStaticLoad":0.56494,"cgHeight":0.68745,"rollInertia":970.0,"pitchInertia":3718.9,"yawInertia":4065.9,"wheelRadius":0.35684,"trackRear":1.6644},"source_line":178}};
const REFERENCE_TIRE_FIT={"reference_load_N":3015.0,"exponent":1.32731772618602,"decay":0.8445544454406637,"provisional":true,"data_provenance":"UTAC 2019 as indexed, no commercial data license confirmed"};
const referenceCalibration={enabled:false,source:'Schramm & Prokop 2025 Table 1; UTAC 2019 tire, provisional'};
function referenceCornerLoadMultiplier(normal,nominal){
  if(!referenceCalibration.enabled)return Math.pow(Math.max(.1,normal/Math.max(1,nominal)),.84);
  if(normal<1)return .01;
  // Experimental shape only; actual axle cornering stiffness magnitude is
  // intentionally preserved because model vehicles do not have this exact tire.
  const actual=clamp(normal,1200,8500),base=clamp(nominal,1200,8500);
  const ratio=actual/base;
  return clamp(Math.pow(ratio,REFERENCE_TIRE_FIT.exponent)*
    Math.exp(-REFERENCE_TIRE_FIT.decay*(actual-base)/REFERENCE_TIRE_FIT.reference_load_N),.08,3);
}
function updateReferenceFitUI(){
  const pane=$('reference-fit-table'),status=$('reference-fit-status');
  if(!pane||!status)return;
  $('reference-fit-enabled').checked=referenceCalibration.enabled;
  const sample=REFERENCE_FITS[vehicleId],before=BASE_PHYSICS,base=VEHICLES[vehicleId].params;
  const source=sample.reference_inputs;
  status.textContent=(referenceCalibration.enabled?'● 參照模式已套用':'○ V1.7 原版模式')+
    ' · 研究表列 '+sample.reference_id+' · 非同款車實測';
  const current={...before,...base};
  const rows=[['質量 kg','mass',0],['軸距 m','wheelbase',3],['前軸比例 %','frontStaticLoad',1],
    ['重心高度 m¹','cgHeight',3],['偏航慣量 kg·m²¹','yawInertia',0],
    ['側傾慣量 kg·m²¹','rollInertia',0],['俯仰慣量 kg·m²¹','pitchInertia',0]];
  const safe=(n,d,percent=false)=>(percent?n*100:n).toFixed(d);
  const table=document.createElement('table'),header=document.createElement('tr');
  for(const name of ['物理參數','V1.7','研究參照','擬合值']){
    const th=document.createElement('th');th.textContent=name;header.appendChild(th);
  }table.appendChild(header);
  for(const [label,key,dp] of rows){
    const tr=document.createElement('tr');
    for(const text of [label,safe(current[key],dp,key==='frontStaticLoad'),
      safe(source[key],dp,key==='frontStaticLoad'),
      safe(sample.params[key]??current[key],dp,key==='frontStaticLoad')]){
      const td=document.createElement('td');td.textContent=text;tr.appendChild(td);
    }table.appendChild(tr);
  }
  pane.replaceChildren(table);
}
function toggleReferenceCalibration(flag){
  if(state.engineOn||Math.abs(state.velocity)>.08||state.gear!==0||state.pendingGear!==null){
    $('reference-fit-enabled').checked=referenceCalibration.enabled;
    log('公開參照校正只能在停車、空檔、引擎關閉時切換。','warn');return false;
  }
  referenceCalibration.enabled=Boolean(flag);
  Object.assign(P,vehicleParams(vehicleId));
  initialReset();syncSteeringRackSettingsUI();renderVehicleSpecs();
  log(referenceCalibration.enabled?'已套用 V1.8 車隊參照估計與實驗輪胎形狀。':'已恢復 V1.7 原版參數。');
  return true;
}
let vehicleId='standard';
function vehicleParams(id){
  const chosen=VEHICLES[id]?.params||{},overlay=referenceCalibration.enabled?
    (REFERENCE_FITS[id]?.params||{}):{};
  const mass=overlay.mass||chosen.mass||BASE_PHYSICS.mass;
  const baseRatio=mass/BASE_PHYSICS.mass;
  return {...BASE_PHYSICS,...chosen,...overlay,
    // The vehicle variants also alter yaw inertia and axle cornering stiffness.
    yawInertia:overlay.yawInertia||chosen.yawInertia||BASE_PHYSICS.yawInertia*baseRatio,
    cornerStiffFront:chosen.cornerStiffFront||BASE_PHYSICS.cornerStiffFront*baseRatio,
    cornerStiffRear:chosen.cornerStiffRear||BASE_PHYSICS.cornerStiffRear*baseRatio,
    ratios:{...(chosen.ratios||BASE_PHYSICS.ratios)},
    torqueMap:(chosen.torqueMap||BASE_PHYSICS.torqueMap).map(pair=>pair.slice())};
}
function estimatedRollGradient(){
  return (P.mass*P.sprungMassFraction*(P.cgHeight-P.rollCenterHeight)*9.81/
    P.rollStiffness)*(180/Math.PI);
}
function estimatedCornerRollGradient(){
  const rollK=P.springFront*P.trackFront**2/2+
    P.springRear*P.trackRear**2/2+
    P.antiRollFront*P.trackFront**2+
    P.antiRollRear*P.trackRear**2;
  const sprung=Math.max(P.mass*.55,P.mass-2*P.unsprungFront-2*P.unsprungRear);
  return sprung*(P.cgHeight-P.rollCenterHeight)*9.81/Math.max(1,rollK)*(180/Math.PI);
}
function estimatedPitchGradient(){
  return (P.mass*P.sprungMassFraction*P.cgHeight*9.81/
    P.pitchStiffness)*(180/Math.PI);
}
function renderVehicleSpecs(){
  const car=VEHICLES[vehicleId],max=Math.max(...P.torqueMap.map(pair=>pair[1]));
  $('header-vehicle').textContent=car.short+' / 6MT';
  $('vehicle-group-value').textContent=car.short+' · 6MT';
  $('vehicle-specs').replaceChildren(...[
    ['動力型式',car.engine],['最高示範扭力',max+' Nm'],['飛輪 / 引擎慣量',P.inertiaEngine.toFixed(2)+' kg·m²'],
    ['車重',P.mass+' kg'],['終傳比',P.finalDrive.toFixed(2)],['斷油轉速',P.redlineRPM+' RPM'],
    ['軸距 / 前軸荷重',P.wheelbase.toFixed(2)+'m / '+Math.round(P.frontStaticLoad*100)+'%'],
    ['偏航慣量',P.yawInertia.toFixed(0)+' kg·m²'],
    ['公開參照校正',referenceCalibration.enabled?'啟用（估計／示範）':'未啟用（V1.7 原版）'],
    ['Caster / Mechanical trail',P.steerCasterDeg.toFixed(1)+'° / '+Math.round(P.steerMechanicalTrail*1000)+' mm'],
    ['側傾梯度（四角）',estimatedCornerRollGradient().toFixed(1)+'°/g'],
    ['側傾阻尼比',P.rollDampingRatio.toFixed(2)],
    ['俯仰梯度',estimatedPitchGradient().toFixed(1)+'°/g'],
    ['俯仰阻尼比',P.pitchDampingRatio.toFixed(2)],
    ['前後輪距',P.trackFront.toFixed(2)+' / '+P.trackRear.toFixed(2)+' m'],
    ['Anti-roll F/R',Math.round(P.antiRollFront)+' / '+Math.round(P.antiRollRear)+' N/m'],
    ['Compression/Rebound',P.compressionDampingFactor.toFixed(2)+' / '+P.reboundDampingFactor.toFixed(2)],
    ['Static camber F/R',P.staticCamberFrontDeg.toFixed(2)+' / '+P.staticCamberRearDeg.toFixed(2)+' deg'],
    ['Camber gain F/R',P.camberGainFrontDegPerM.toFixed(1)+' / '+P.camberGainRearDegPerM.toFixed(1)+' deg/m'],
    ['Toe-in F/R',P.toeInFrontDeg.toFixed(2)+' / '+P.toeInRearDeg.toFixed(2)+' deg'],
    ['前輪懸吊',Math.round(P.springFront/1000)+' kN/m · '+Math.round(P.damperFront)+' Ns/m'],
    ['後輪懸吊',Math.round(P.springRear/1000)+' kN/m · '+Math.round(P.damperRear)+' Ns/m'],
    ['輪胎垂直剛性',Math.round(P.tireVerticalK/1000)+' kN/m'],
    ['縱向抓地峰值滑移',(P.tirePeakLongSlip*100).toFixed(1)+'%'],
    ['峰值後縱／側向保留',(P.tireLongSlideRetention*100).toFixed(0)+' / '+(P.tireLatSlideRetention*100).toFixed(0)+'%'],
    ['非簧載質量（前／後）',P.unsprungFront+' / '+P.unsprungRear+' kg／輪'],
    ['預設驅動配置','前輪驅動 FWD，四輪獨立輪速與懸吊']
  ].map(([label,value])=>{const item=document.createElement('div'),small=document.createElement('small'),b=document.createElement('b');
    small.textContent=label;b.textContent=value;item.append(small,b);return item;}));
  $('clutch-bite-adjust').value=Math.round(P.clutchBiteAt*100);
  $('clutch-bite-label').textContent=Math.round(P.clutchBiteAt*100)+'%';
  updateReferenceFitUI();
}
function applyVehicle(id){
  if(!VEHICLES[id])return false;
  if(state.engineOn || Math.abs(state.velocity)>.08 || state.gear!==0 || state.pendingGear!==null){
    $('vehicle-select').value=vehicleId;
    log('切換車型前請停車、回空檔並關閉引擎；避免運轉中改變傳動參數。','warn');return false;
  }
  Object.assign(P,vehicleParams(id));vehicleId=id;
  handling.balance='neutral';$('handling-balance').value='neutral';
  $('handling-brake-bias').value=String(P.frontBrakeBias);
  initialReset();
  syncSteeringRackSettingsUI();
  $('vehicle-select').value=id;renderVehicleSpecs();
  log('車型已載入：'+VEHICLES[id].name+'。原有操作與紀錄已重置。');
  return true;
}
const state={engineOn:false,ignitionOn:false,engineOmega:0,inputOmega:0,velocity:0,
  shaftOmega:0,shaftTwist:0,drivenWheelOmega:0,coastWheelOmega:0,
  driveSlip:0,coastSlip:0, tireForceDrive:0,tireForceCoast:0,shaftTorque:0,
  tractionLimit:0,tireTemp:35,tcsCut:0,absMod:1,absPressureDrive:1,absPressureCoast:1,wheelSpinTime:0,wheelLockTime:0,
  surface:'dry',tcsEnabled:false,absEnabled:false,
  gear:0,pendingGear:null,syncRemaining:0,syncStartedAt:0,syncDeltaRPM:0,syncTorque:0,syncWear:0,
  shiftState:'NEUTRAL',clutchLocked:false,clutch:0,throttle:0,brake:0,grade:0,
  heat:P.temperatureAir,wear:0,damage:0,clutchTorque:0,driveForce:0,accel:0,jerk:0,
  stalled:false,lastEvent:'',lastEventKind:'ok',time:0,shiftAttempts:0};
let keys=new Set(),lastFrame=0,acc=0,roadPhase=0,lastAudioUpdate=0;
const $=id=>document.getElementById(id);
// V0.9 body-fixed vehicle motion. Coordinate convention: +X right, +Z forward,
// heading positive clockwise, +lateralVelocity to the vehicle's right.
const vehicleMotion={x:0,z:0,y:0,heading:0,routeS:0,offset:0,headingError:0,
  lateralVelocity:0,yawRate:0,steerInput:0,steerAngle:0,frontForce:0,rearForce:0,
  lateralAccel:0,roll:0,rollRate:0,pitch:0,pitchRate:0,heave:0,heaveRate:0,heaveAccel:0,cameraYaw:0,
  frontSlipAngle:0,rearSlipAngle:0,frontAxleTransfer:0,rearAxleTransfer:0,
  frontGripCapacity:0,rearGripCapacity:0,frontYawMoment:0,rearYawMoment:0,
  rollAngularAccel:0,pitchAngularAccel:0,
  gripUsageFront:0,gripUsageRear:0,guardrailHits:0,contactCooldown:0,
  offroad:false,contact:false,synced:true};
const steeringSettings={assist:false,cameraMode:'dynamic'};
// Host inputs are used only by the explicit desktop 3D bridge; standalone UI remains unchanged.
const hostControls={active:false,steer:null,throttle:null,brake:null,clutch:null};
// V1.6: steering-axis-equivalent dynamic rack, separated from driver commands.
// This is not an actual multi-link steering linkage or a USB force-feedback driver.
const steeringRack={mode:'comfort',feel:1,angle:0,rate:0,commandAngle:0,
  driverTorqueNm:0,assistTorqueNm:0,pneumaticNm:0,mechanicalNm:0,
  jackingNm:0,roadTorqueNm:0,wheelFeelNm:0,netTorqueNm:0};
const STEER_RACK_MODES=Object.freeze({
  direct:{gain:1,assist:0,damping:1},
  comfort:{gain:1,assist:1.50,damping:1.05},
  sport:{gain:1.28,assist:.60,damping:1.22},
  manual:{gain:.85,assist:0,damping:1.00}
});
function effectiveMechanicalTrail(){
  const caster=clamp(P.steerCasterDeg,2,12)*Math.PI/180;
  return P.steerMechanicalTrail+P.wheelRadius*Math.tan(caster)*P.steerCasterTrailFactor;
}
function syncSteeringRackSettingsUI(){
  $('rack-mode').value=steeringRack.mode;
  $('rack-caster').value=String(P.steerCasterDeg);
  $('rack-trail').value=String(Math.round(P.steerMechanicalTrail*1000));
  $('rack-feel').value=String(steeringRack.feel);
}
function setSteeringRackSetting(field,value){
  if(field==='mode'){
    if(!Object.hasOwn(STEER_RACK_MODES,value))return false;
    steeringRack.mode=value;steeringRack.angle=vehicleMotion.steerAngle;
    steeringRack.rate=0;
  }else if(field==='caster'){
    if(![4,6,8].includes(Number(value)))return false;
    P.steerCasterDeg=Number(value);
  }else if(field==='trail'){
    if(![20,30,45].includes(Number(value)))return false;
    P.steerMechanicalTrail=Number(value)/1000;
  }else if(field==='feel'){
    if(![.5,1,1.5].includes(Number(value)))return false;
    steeringRack.feel=Number(value);
  }else return false;
  syncSteeringRackSettingsUI();return true;
}
function resetSteeringRack(){
  Object.assign(steeringRack,{angle:0,rate:0,commandAngle:0,driverTorqueNm:0,
    assistTorqueNm:0,pneumaticNm:0,mechanicalNm:0,jackingNm:0,
    roadTorqueNm:0,wheelFeelNm:0,netTorqueNm:0});
}
function steeringRackRoadMoment(){
  const moment=steeringRack.pneumaticNm+steeringRack.mechanicalNm+steeringRack.jackingNm;
  return clamp(moment,-850,850)*steeringRack.feel;
}
function steeringRackStep(dt,requestedAngle,limit){
  const m=vehicleMotion,rack=steeringRack;
  rack.commandAngle=clamp(requestedAngle,-limit,limit);
  if(rack.mode==='direct'){
    // Preserve the exact V1.5 implementation for deterministic comparison.
    const deflection=tireSystem.steerCompliance?
      clamp(tireSystem.feedbackNm/Math.max(100,P.tireSteerComplianceNmPerRad),-.030,.030):0;
    const target=clamp(rack.commandAngle+deflection,-limit,limit);
    const previous=m.steerAngle;
    m.steerAngle=moveToward(previous,target,dt*1.8);
    rack.angle=m.steerAngle;rack.rate=(m.steerAngle-previous)/Math.max(dt,1e-8);
    rack.driverTorqueNm=0;rack.assistTorqueNm=0;rack.netTorqueNm=0;
  }else{
    const mode=STEER_RACK_MODES[rack.mode];
    const compliance=tireSystem.steerCompliance?.82:1;
    const error=rack.commandAngle-rack.angle;
    const drive=clamp(error*P.steerRackK*mode.gain*compliance,
      -P.steerRackDriverLimit,P.steerRackDriverLimit);
    rack.driverTorqueNm=drive;
    rack.assistTorqueNm=drive*mode.assist;
    rack.netTorqueNm=drive+rack.assistTorqueNm+
      rack.roadTorqueNm*P.steerRoadFeedbackGain*(.20+.80*clamp(Math.abs(rack.commandAngle)/.18,0,1))-P.steerRackDamping*mode.damping*rack.rate;
    const acceleration=clamp(rack.netTorqueNm/Math.max(.12,P.steerRackInertia),
      -P.steerRackMaxAccel,P.steerRackMaxAccel);
    rack.rate=clamp(rack.rate+acceleration*dt,-P.steerRackMaxRate,P.steerRackMaxRate);
    const next=clamp(rack.angle+rack.rate*dt,-limit,limit);
    if(next!==rack.angle+rack.rate*dt)rack.rate=0;
    rack.angle=next;m.steerAngle=next;
  }
  rack.wheelFeelNm=clamp(-rack.roadTorqueNm/Math.max(8,P.steerGearRatio),-55,55);
  return m.steerAngle;
}
// V0.9.1: buffered keyboard steering; independent from the analog slider.
// Values are driver input ([-1,+1]), not physical road-wheel angles.
const keyboardSteering={value:0,active:false,turnSeconds:1.8,returnSeconds:.9};
const KEYBOARD_STEER_SETTINGS_KEY='shiftlab.keyboardSteering.v091';
function setKeyboardTuning(field,value,save=true){
  const name=field==='turnSeconds'?'keyboard-turn-time':'keyboard-return-time';
  const low=field==='turnSeconds'?.6:.3,high=field==='turnSeconds'?3.2:2.4;
  keyboardSteering[field]=clamp(Number.isFinite(+value)?+value:keyboardSteering[field],low,high);
  $(name).value=keyboardSteering[field].toFixed(1);
  $(field==='turnSeconds'?'keyboard-turn-label':'keyboard-return-label').textContent=keyboardSteering[field].toFixed(1)+' 秒';
  if(save){try{localStorage.setItem(KEYBOARD_STEER_SETTINGS_KEY,JSON.stringify({turnSeconds:keyboardSteering.turnSeconds,returnSeconds:keyboardSteering.returnSeconds}));}catch{}}
}
function setupKeyboardSteering(){
  try{const cfg=JSON.parse(localStorage.getItem(KEYBOARD_STEER_SETTINGS_KEY)||'null');
    if(cfg&&typeof cfg==='object'){
      if(Number.isFinite(cfg.turnSeconds))setKeyboardTuning('turnSeconds',cfg.turnSeconds,false);
      if(Number.isFinite(cfg.returnSeconds))setKeyboardTuning('returnSeconds',cfg.returnSeconds,false);
    }
  }catch{}
  for(const [id,field] of [['keyboard-turn-time','turnSeconds'],['keyboard-return-time','returnSeconds']]){
    $(id).addEventListener('input',ev=>setKeyboardTuning(field,ev.target.value));
  }
}
function releaseKeyboardOverride(){
  keyboardSteering.value=0;keyboardSteering.active=false;
  keys.delete('a');keys.delete('d');
}
function keyboardSteeringStep(dt){
  const direction=Number(keys.has('d'))-Number(keys.has('a'));
  if(direction!==0){
    keyboardSteering.active=true;
    const speedPenalty=1+advancedSpeedFactor()*advancedSteering.keyboardSpeed*.70;
    // Reversing steering while countersteering must not take as long as
    // steering from center to full lock: the rack still enforces physical rate.
    const reverse=keyboardSteering.value*direction<0?1.32:1;
    keyboardSteering.value=moveToward(keyboardSteering.value,direction,
      dt*reverse/(keyboardSteering.turnSeconds*speedPenalty));
  }else if(keyboardSteering.active){
    const speedReturn=1+advancedSpeedFactor()*advancedSteering.keyboardSpeed*.35;
    // Rate-limited centering avoids the frame-rate-dependent input snap.
    keyboardSteering.value=moveToward(keyboardSteering.value,0,
      dt*speedReturn/keyboardSteering.returnSeconds);
    if(Math.abs(keyboardSteering.value)<1e-7){keyboardSteering.value=0;keyboardSteering.active=false;}
  }
}
function bufferedKeyboardInput(){
  const x=keyboardSteering.value;
  // Gentle low-displacement response for short keyboard taps; full lock remains reachable.
  return Math.sign(x)*Math.pow(Math.abs(x),1.18);
}
// V1.7: driver input conditioning is separate from the V1.6 physical steering rack.
// Opt-in gamepad steering shares no mappings with the V0.5 pedals / H-pattern.
const ADV_STEER_STORE='shiftlab.v17.advancedSteering';
const ADV_STEER_DEFAULTS=Object.freeze({keyboardSpeed:.45,keyboardFine:.45,
  padDevice:'',padAxis:'a0',padInvert:false,padDeadzone:.09,padExpo:.40,
  padFilter:.10,padSpeed:.45,padLeft:-1,padCenter:0,padRight:1});
const ADV_STEER_PRESETS=Object.freeze({
  balanced:{keyboardSpeed:.45,keyboardFine:.45,padDeadzone:.09,padExpo:.40,padFilter:.10,padSpeed:.45},
  precision:{keyboardSpeed:.85,keyboardFine:.80,padDeadzone:.06,padExpo:.72,padFilter:.16,padSpeed:.85},
  quick:{keyboardSpeed:.15,keyboardFine:.15,padDeadzone:.08,padExpo:.20,padFilter:.05,padSpeed:.15}
});
const advancedSteering={...ADV_STEER_DEFAULTS,source:'slider',raw:null,
  normalized:0,filtered:0,output:0,connected:false,armed:false,active:false,
  previousConnected:false,status:'未選擇搖桿轉向裝置'};
function validatedAdvancedSteering(config){
  if(!config||typeof config!=='object'||Array.isArray(config))return null;
  const out={...ADV_STEER_DEFAULTS};
  for(const key of ['keyboardSpeed','keyboardFine','padDeadzone','padExpo','padFilter','padSpeed']){
    const max=key==='padDeadzone'?.25:key==='padFilter'?.30:1;
    if(typeof config[key]==='number'&&Number.isFinite(config[key]))out[key]=clamp(config[key],0,max);
  }
  if(typeof config.padDevice==='string')out.padDevice=config.padDevice.slice(0,240);
  if(typeof config.padAxis==='string'&&/^a(?:0|[1-9][0-9]?)$/.test(config.padAxis))out.padAxis=config.padAxis;
  if(typeof config.padInvert==='boolean')out.padInvert=config.padInvert;
  for(const key of ['padLeft','padCenter','padRight'])if(typeof config[key]==='number'&&Number.isFinite(config[key]))out[key]=clamp(config[key],-1,1);
  if(!(out.padLeft+.10<out.padCenter&&out.padCenter+.10<out.padRight))return null;
  return out;
}
function saveAdvancedSteering(){
  const obj=Object.fromEntries(Object.keys(ADV_STEER_DEFAULTS).map(key=>[key,advancedSteering[key]]));
  try{localStorage.setItem(ADV_STEER_STORE,JSON.stringify(obj));}catch{}
  return obj;
}
function restoreAdvancedSteering(config,save=true){
  const checked=validatedAdvancedSteering(config);
  if(!checked)return false;
  Object.assign(advancedSteering,checked);
  resetAdvancedGamepad(false);
  renderAdvancedSettings();
  refreshAdvancedGamepadUI();
  if(save)saveAdvancedSteering();
  return true;
}
function resetAdvancedGamepad(clearConnection=true){
  Object.assign(advancedSteering,{raw:null,normalized:0,filtered:0,output:0,armed:false,active:false});
  if(clearConnection){advancedSteering.connected=false;advancedSteering.previousConnected=false;}
}
function advancedSpeedFactor(){return clamp(Math.abs(state.velocity)/38,0,1);}
function advancedKeyboardInput(){
  const x=keyboardSteering.value,proportion=advancedSpeedFactor();
  const extra=advancedSteering.keyboardFine*proportion*.70;
  const reduction=1-.43*advancedSteering.keyboardSpeed*proportion;
  return clamp(Math.sign(x)*Math.pow(Math.abs(x),1.18+extra)*reduction,-1,1);
}
function normalizedAdvancedAxis(raw,settings=advancedSteering){
  if(!Number.isFinite(raw))return 0;
  const delta=raw-settings.padCenter;
  const extent=delta<0?settings.padCenter-settings.padLeft:settings.padRight-settings.padCenter;
  const ratio=clamp(delta/Math.max(.1,extent),-1,1);
  const threshold=settings.padDeadzone;
  const mag=Math.abs(ratio)<=threshold?0:(Math.abs(ratio)-threshold)/(1-threshold);
  const curve=(1-settings.padExpo)*mag+settings.padExpo*mag*mag*mag;
  return clamp(Math.sign(ratio)*curve*(settings.padInvert?-1:1),-1,1);
}
function refreshAdvancedGamepadUI(pads=availablePads()){
  const fmt=p=>`${p.index}: ${p.id.slice(0,58)} (${p.axes.length} 軸)`;
  selectOptions($('adv-pad-device'),[['','不使用搖桿轉向'],...pads.map(p=>[padKey(p),fmt(p)])],advancedSteering.padDevice);
  const pad=deviceFor(advancedSteering.padDevice,pads);
  const axes=pad?pad.axes.map((_,i)=>[`a${i}`,`類比軸 A${i}`]):[['a0','類比軸 A0']];
  selectOptions($('adv-pad-axis'),axes,advancedSteering.padAxis);
}
function renderAdvancedSettings(){
  for(const [id,key,max,unit] of [['adv-key-speed','keyboardSpeed',100,'%'],['adv-key-fine','keyboardFine',100,'%'],
    ['adv-pad-deadzone','padDeadzone',100,'%'],['adv-pad-expo','padExpo',100,'%'],
    ['adv-pad-filter','padFilter',1000,' ms'],['adv-pad-speed','padSpeed',100,'%']]){
    const val=Math.round(advancedSteering[key]*max);
    $(id).value=String(val);$(id+'-label').textContent=val+unit;
  }
  $('adv-pad-invert').checked=advancedSteering.padInvert;
  $('adv-pad-axis').value=advancedSteering.padAxis;
  $('adv-pad-device').value=advancedSteering.padDevice;
  const preset=Object.keys(ADV_STEER_PRESETS).find(name=>Object.keys(ADV_STEER_PRESETS[name]).every(k=>Math.abs(ADV_STEER_PRESETS[name][k]-advancedSteering[k])<.001));
  $('adv-preset').value=preset||'custom';
}
function advancedAxisReading(){
  const pad=deviceFor(advancedSteering.padDevice,availablePads());
  return pad?rawInput(pad,advancedSteering.padAxis):null;
}
function calibrateAdvancedAxis(side){
  const raw=advancedAxisReading();
  if(raw===null){advancedSteering.status='校準失敗：請先選擇已連接的搖桿與有效軸。';return false;}
  const key=side==='left'?'padLeft':side==='right'?'padRight':'padCenter';
  if(key==='padLeft' && !(raw+.10<advancedSteering.padCenter) ||
     key==='padRight' && !(raw>advancedSteering.padCenter+.10) ||
     key==='padCenter' && !(advancedSteering.padLeft+.10<raw&&raw+.10<advancedSteering.padRight)){
    advancedSteering.status='校準失敗：軸中心必須介於兩端，且至少相差 0.1。';return false;
  }
  advancedSteering[key]=raw;resetAdvancedGamepad(false);saveAdvancedSteering();
  advancedSteering.status='已記錄 '+(side==='left'?'左端':side==='right'?'右端':'中心')+' '+raw.toFixed(3)+'；請將搖桿置中以重新啟用。';
  return true;
}
function pollAdvancedGamepadSteering(dt){
  const s=advancedSteering;
  if(!s.padDevice){resetAdvancedGamepad();s.status='未選擇搖桿；使用鍵盤／畫面滑桿。';return false;}
  const pad=deviceFor(s.padDevice,availablePads());
  const raw=pad?rawInput(pad,s.padAxis):null;
  if(raw===null){resetAdvancedGamepad();s.status='搖桿已中斷或轉向軸無效；方向指令歸中，鍵盤仍可操作。';return false;}
  if(!s.connected){resetAdvancedGamepad(false);s.connected=true;}
  s.raw=raw;
  const center=Math.abs((raw-s.padCenter)/(raw<s.padCenter?s.padCenter-s.padLeft:s.padRight-s.padCenter));
  if(!s.armed){
    s.normalized=0;s.filtered=0;s.output=0;s.active=false;
    if(center<=Math.max(.12,s.padDeadzone+.02))s.armed=true;
    else{s.status='等待搖桿先回到中心，以防熱插拔突然轉向。';return false;}
  }
  s.normalized=normalizedAdvancedAxis(raw,s);
  const alpha=s.padFilter<=0?1:1-Math.exp(-Math.max(0,dt)/s.padFilter);
  s.filtered=clamp(s.filtered+(s.normalized-s.filtered)*alpha,-1,1);
  // A calibrated center hysteresis eliminates analog-stick idle chatter
  // without creating an abrupt notch around the edge of the deadzone.
  if(Math.abs(s.normalized)<.012 && Math.abs(s.filtered)<.012)s.filtered=0;
  const speed=advancedSpeedFactor();
  const scaled=s.filtered*(1-.43*s.padSpeed*speed);
  const maximumRate=4.5-2.0*s.padSpeed*speed;
  s.output=moveToward(s.output,scaled,Math.max(0,dt)*maximumRate);
  s.active=true;s.status='搖桿轉向已啟用；鍵盤 A / D 可暫時接管。';
  return true;
}
function advancedSteeringTarget(dt){
  if(hostControls.active){
    if(keyboardSteering.active){advancedSteering.source='keyboard';return advancedKeyboardInput();}
    advancedSteering.source='gamepad';
    return clamp(Number.isFinite(hostControls.steer)?hostControls.steer:0,-1,1);
  }
  pollAdvancedGamepadSteering(dt);
  if(keyboardSteering.active){advancedSteering.source='keyboard';return advancedKeyboardInput();}
  if(advancedSteering.padDevice){
    advancedSteering.source=advancedSteering.active?'gamepad':'gamepad-neutral';
    return advancedSteering.active?advancedSteering.output:0;
  }
  advancedSteering.source=steeringSettings.assist?'lane-assist':'slider';
  return steeringTarget();
}
function setupAdvancedSteering(){
  try{const saved=localStorage.getItem(ADV_STEER_STORE);
    if(saved)restoreAdvancedSteering(JSON.parse(saved),false);}catch{}
  for(const [id,key,scale] of [['adv-key-speed','keyboardSpeed',100],['adv-key-fine','keyboardFine',100],
    ['adv-pad-deadzone','padDeadzone',100],['adv-pad-expo','padExpo',100],
    ['adv-pad-filter','padFilter',1000],['adv-pad-speed','padSpeed',100]]){
    $(id).addEventListener('input',ev=>{
      advancedSteering[key]=clamp(Number(ev.target.value)/scale,0,key==='padDeadzone'?.25:key==='padFilter'?.30:1);
      renderAdvancedSettings();saveAdvancedSteering();
    });
  }
  $('adv-preset').addEventListener('change',ev=>{
    const values=ADV_STEER_PRESETS[ev.target.value];if(!values)return;
    Object.assign(advancedSteering,values);renderAdvancedSettings();saveAdvancedSteering();
  });
  $('adv-pad-device').addEventListener('change',ev=>{
    advancedSteering.padDevice=ev.target.value.slice(0,240);advancedSteering.padAxis='a0';
    resetAdvancedGamepad();refreshAdvancedGamepadUI();saveAdvancedSteering();
  });
  $('adv-pad-axis').addEventListener('change',ev=>{
    if(!/^a(?:0|[1-9][0-9]?)$/.test(ev.target.value))return;
    advancedSteering.padAxis=ev.target.value;resetAdvancedGamepad();saveAdvancedSteering();
  });
  $('adv-pad-invert').addEventListener('change',ev=>{advancedSteering.padInvert=ev.target.checked;saveAdvancedSteering();});
  for(const side of ['left','center','right'])$('adv-cal-'+side).addEventListener('click',()=>calibrateAdvancedAxis(side));
  $('adv-reset').addEventListener('click',()=>restoreAdvancedSteering(ADV_STEER_DEFAULTS));
  $('adv-export').addEventListener('click',()=>downloadFile('SHIFT_LAB_V17_Steering_Profile.json',JSON.stringify({version:17,advancedSteering:saveAdvancedSteering()},null,2),'application/json;charset=utf-8'));
  $('adv-import').addEventListener('click',()=>$('adv-import-file').click());
  $('adv-import-file').addEventListener('change',async ev=>{
    const file=ev.target.files?.[0];if(!file)return;
    if(file.size>100000){advancedSteering.status='匯入失敗：設定檔不得超過 100 KB。';ev.target.value='';return;}
    try{
      const json=JSON.parse(await file.text());
      if(json?.version!==17||!restoreAdvancedSteering(json.advancedSteering))throw Error('版本或校準範圍無效');
      advancedSteering.status='V1.7 轉向設定已匯入。';
    }catch(e){advancedSteering.status='匯入失敗：'+(e.message||'JSON 格式錯誤');}
    ev.target.value='';
  });
  renderAdvancedSettings();refreshAdvancedGamepadUI();
}
const angleDifference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function resetVehiclePose(s=route.distance){
  const p=roadPointAt(s);
  Object.assign(vehicleMotion,{x:p.x,z:p.z,y:p.y,heading:p.heading,routeS:p.s,
    offset:0,headingError:0,lateralVelocity:0,yawRate:0,steerInput:0,
    steerAngle:0,frontForce:0,rearForce:0,lateralAccel:0,roll:0,rollRate:0,
    pitch:0,pitchRate:0,heave:0,heaveRate:0,heaveAccel:0,cameraYaw:p.heading,gripUsageFront:0,gripUsageRear:0,
    frontSlipAngle:0,rearSlipAngle:0,frontAxleTransfer:0,rearAxleTransfer:0,
    frontGripCapacity:0,rearGripCapacity:0,frontYawMoment:0,rearYawMoment:0,
    rollAngularAccel:0,pitchAngularAccel:0,
    guardrailHits:0,contactCooldown:0,contact:false,offroad:false,synced:true});
  route.distance=p.s;
  if(typeof resetSuspension==='function')resetSuspension();
  if(chassisBridge)chassisBridge.reset(p,P);
  resetSteeringRack();
}
function maximumSteerAngle(speed){
  // Road wheel angle decreases at high speed; steering-wheel input remains [-1, 1].
  return P.maxRoadWheelAngle/(1+Math.pow(Math.abs(speed)/24,1.4)*.82);
}
function steeringTarget(){
  if(keyboardSteering.active)return advancedKeyboardInput();
  if(steeringSettings.assist){
    const look=Math.max(8,Math.min(29,8+Math.abs(state.velocity)*.85));
    const a=roadPointAt(route.distance),b=roadPointAt(route.distance+look);
    const curvature=angleDifference(b.heading,a.heading)/look;
    const desired=roadPointAt(route.distance+look*.48).heading;
    const headingError=angleDifference(desired,vehicleMotion.heading);
    const roadCorrection=clamp(-vehicleMotion.offset*.027,-.22,.22);
    const feedForward=Math.atan(P.wheelbase*curvature);
    const angle=clamp(feedForward+headingError*.28+roadCorrection,-.40,.40);
    return clamp(angle/Math.max(.08,maximumSteerAngle(state.velocity)),-1,1);
  }
  return clamp(Number($('steer-slider').value)/100,-1,1);
}
function steeringControlStep(dt){
  keyboardSteeringStep(dt);
  vehicleMotion.steerInput=moveToward(vehicleMotion.steerInput,advancedSteeringTarget(dt),dt*P.steerResponse);
  const limit=maximumSteerAngle(state.velocity);
  const rawTarget=vehicleMotion.steerInput*limit;
  steeringRackStep(dt,rawTarget,limit);
}
// Project arbitrary world coordinates to the NEARBY part of the seeded route.
// Restrict search to route arc length to avoid jumping across adjacent hairpin legs.
function nearestRoadPosition(x,z,expectedS){
  const points=route.points;
  const left=Math.max(0,expectedS-85),right=Math.min(roadTotalDistance(),expectedS+85);
  const at=s=>{let lo=0,hi=points.length-1;
    while(lo<hi){const mid=(lo+hi)>>1;if(points[mid].s<s)lo=mid+1;else hi=mid;}
    return lo;};
  let best=null;
  for(let i=Math.max(0,at(left)-1);i<Math.min(points.length-1,at(right)+1);i++){
    const a=points[i],b=points[i+1],dx=b.x-a.x,dz=b.z-a.z;
    const denom=dx*dx+dz*dz;
    const t=clamp(denom>1e-9?((x-a.x)*dx+(z-a.z)*dz)/denom:0,0,1);
    const s=a.s+(b.s-a.s)*t;if(s<left-1||s>right+1)continue;
    const px=a.x+t*dx,pz=a.z+t*dz,ex=x-px,ez=z-pz;
    const error=ex*ex+ez*ez+.016*(s-expectedS)**2;
    if(!best||error<best.score){
      const road=roadPointAt(s);
      best={s,offset:ex*Math.cos(road.heading)-ez*Math.sin(road.heading),
        road,score:error,distance:Math.hypot(ex,ez)};
    }
  }
  return best||{s:expectedS,offset:0,road:roadPointAt(expectedS),distance:0};
}
// Load sensitivity: redistributing the same axle load between inner and outer
// tires reduces total peak force. At 0 load transfer the multiplier is exactly 1.
function axleLoadEfficiency(axleLoad,lateralTransfer){
  if(!(axleLoad>0))return 1;
  const outer=clamp(axleLoad/2+Math.abs(lateralTransfer),0,axleLoad);
  const inner=axleLoad-outer,exp=P.tireLoadExponent;
  return clamp((Math.pow(outer,exp)+Math.pow(inner,exp)) /
    (2*Math.pow(axleLoad/2,exp)),.64,1);
}
function axleForceBudget(axleLoad,mu,transfer,roadFactor){
  return Math.max(0,mu*axleLoad*roadFactor*axleLoadEfficiency(axleLoad,transfer));
}
function suspensionStep(axis,velocityKey,acceleration,dt){
  const roll=axis==='roll',m=vehicleMotion;
  const inertia=roll?P.rollInertia:P.pitchInertia;
  const stiffness=roll?P.rollStiffness:P.pitchStiffness;
  const dampingRatio=roll?P.rollDampingRatio:P.pitchDampingRatio;
  const lever=roll?P.cgHeight-P.rollCenterHeight:P.cgHeight;
  const torque=-P.mass*P.sprungMassFraction*lever*acceleration;
  const damping=2*dampingRatio*Math.sqrt(stiffness*inertia);
  const angularAccel=(torque-stiffness*m[axis]-damping*m[velocityKey])/inertia;
  m[roll?'rollAngularAccel':'pitchAngularAccel']=angularAccel;
  m[velocityKey]=clamp(m[velocityKey]+angularAccel*dt,-2.8,2.8);
  m[axis]=clamp(m[axis]+m[velocityKey]*dt,-.30,.30);
}
function lateralDynamicsStep(h,fDrive,fCoast,nFront,nRear,mu){
  const m=vehicleMotion,u=state.velocity,v=m.lateralVelocity,r=m.yawRate;
  const a=P.wheelbase*(1-P.frontStaticLoad),b=P.wheelbase*P.frontStaticLoad;
  const roadFactor=1-.52*roadSmooth((Math.abs(m.offset)-3.35)/4.5);
  // Use prior-step lateral acceleration for quasi-static left/right wheel load transfer.
  // Transfer is a per-axle wheel-load difference in newtons, not an extra tire force.
  const totalRollMoment=P.mass*m.lateralAccel*P.cgHeight;
  const frontTransfer=totalRollMoment*P.frontRollShare/Math.max(.9,P.trackFront);
  const rearTransfer=totalRollMoment*(1-P.frontRollShare)/Math.max(.9,P.trackRear);
  m.frontAxleTransfer=frontTransfer;m.rearAxleTransfer=rearTransfer;
  const frontCapacity=axleForceBudget(nFront,mu,frontTransfer,roadFactor);
  const rearCapacity=axleForceBudget(nRear,mu,rearTransfer,roadFactor);
  m.frontGripCapacity=frontCapacity;m.rearGripCapacity=rearCapacity;
  const frontMax=Math.sqrt(Math.max(0,frontCapacity*frontCapacity-fDrive*fDrive));
  const rearMax=Math.sqrt(Math.max(0,rearCapacity*rearCapacity-fCoast*fCoast));
  let front=0,rear=0;
  if(u>2.0){
    const denom=Math.max(2.0,u);
    const alphaF=m.steerAngle-Math.atan2(v+a*r,denom);
    const alphaR=-Math.atan2(v-b*r,denom);
    m.frontSlipAngle=alphaF;m.rearSlipAngle=alphaR;
    // Smooth nonlinear saturation instead of a discontinuous hard clamp.
    // Cornering stiffness is scaled by dynamic axle load; higher speed shortens
    // the time for a fixed relaxation length to build lateral tire force.
    const nominalFront=P.mass*9.81*P.frontStaticLoad;
    const nominalRear=P.mass*9.81*(1-P.frontStaticLoad);
    const cf=P.cornerStiffFront*Math.pow(Math.max(.1,nFront/nominalFront),.84);
    const cr=P.cornerStiffRear*Math.pow(Math.max(.1,nRear/nominalRear),.84);
    const targetFront=frontMax*Math.tanh(cf*alphaF/Math.max(1,frontMax));
    const targetRear=rearMax*Math.tanh(cr*alphaR/Math.max(1,rearMax));
    const rf=1-Math.exp(-Math.max(Math.abs(u),2)*h/P.lateralRelaxationFront);
    const rr=1-Math.exp(-Math.max(Math.abs(u),2)*h/P.lateralRelaxationRear);
    front=clamp(m.frontForce+(targetFront-m.frontForce)*rf,-frontMax,frontMax);
    rear=clamp(m.rearForce+(targetRear-m.rearForce)*rr,-rearMax,rearMax);
    // Steered front tire forces are defined in the wheel frame. Project them
    // into body Y before updating lateral momentum and yaw acceleration.
    const frontBody=front*Math.cos(m.steerAngle)+fDrive*Math.sin(m.steerAngle);
    const ay=(frontBody+rear)/P.mass;
    const yawAcceleration=(a*frontBody-b*rear)/P.yawInertia;
    m.lateralVelocity=clamp(v+(ay-u*r)*h,-90,90);
    m.yawRate=clamp(r+yawAcceleration*h,-8,8);
  }else{
    // Reverse / walking speed regularization: no 1/u singularity.
    const targetYaw=u*Math.tan(m.steerAngle)/P.wheelbase;
    m.yawRate=moveToward(r,targetYaw,h*(.8+Math.abs(u)*.9));
    m.lateralVelocity=moveToward(v,0,h*(1.3+Math.abs(u)*2.3));
    front=clamp(P.mass*u*m.yawRate*.40,-frontMax,frontMax);
    rear=clamp(P.mass*u*m.yawRate*.60,-rearMax,rearMax);
    m.frontSlipAngle=0;m.rearSlipAngle=0;
  }
  m.frontForce=front;m.rearForce=rear;
  const frontBody=front*Math.cos(m.steerAngle)+fDrive*Math.sin(m.steerAngle);
  m.frontYawMoment=a*frontBody;m.rearYawMoment=-b*rear;
  m.lateralAccel=(frontBody+rear)/P.mass;
  m.gripUsageFront=Math.hypot(fDrive,front)/Math.max(1,frontCapacity);
  m.gripUsageRear=Math.hypot(fCoast,rear)/Math.max(1,rearCapacity);
  m.heading+=m.yawRate*h;
  m.x+=(u*Math.sin(m.heading)+m.lateralVelocity*Math.cos(m.heading))*h;
  m.z+=(u*Math.cos(m.heading)-m.lateralVelocity*Math.sin(m.heading))*h;
  // Suspension responds with profile-specific spring stiffness, damping and inertia.
  suspensionStep('roll','rollRate',m.lateralAccel,h);
  suspensionStep('pitch','pitchRate',state.accel,h);
  m.contactCooldown=Math.max(0,m.contactCooldown-h);
}
// An impulse in the road-normal direction changes BOTH chassis linear and
// angular momentum. The contact point lies on the vehicle body footprint.
// This is the non-Rapier/offline fallback, not a full mesh collision solver.
function resolvePlanarGuardrail(snap){
  const m=vehicleMotion;
  const side=Math.sign(snap.offset)||1;
  if(!roadRailEnabled(snap.road,side))return false;
  const relative=angleDifference(m.heading,snap.road.heading);
  const halfWidth=.88,halfLength=Math.max(1.65,P.wheelbase*.72);
  const widthOnNormal=Math.abs(Math.cos(relative))*halfWidth+
    Math.abs(Math.sin(relative))*halfLength;
  const innerFace=4.96-.14;
  const permitted=Math.max(0,innerFace-widthOnNormal);
  const depth=side*snap.offset-permitted;
  if(depth<=0)return false;
  const outX=side*Math.cos(snap.road.heading),outZ=-side*Math.sin(snap.road.heading);
  // Surface contact: the leading body corner can induce yaw on impact.
  const localX=side*Math.sign(Math.cos(relative)||1)*halfWidth;
  const localZ=side*Math.sign(Math.sin(relative)||1)*halfLength;
  const cosH=Math.cos(m.heading),sinH=Math.sin(m.heading);
  const rx=localX*cosH+localZ*sinH,rz=-localX*sinH+localZ*cosH;
  let vx=state.velocity*sinH+m.lateralVelocity*cosH;
  let vz=state.velocity*cosH-m.lateralVelocity*sinH;
  const nx=outX,nz=outZ,lever=rz*nx-rx*nz;
  const outward=(vx+m.yawRate*rz)*nx+(vz-m.yawRate*rx)*nz;
  if(outward>.02){
    const impulse=(1+.14)*outward/(1/P.mass+lever*lever/P.yawInertia);
    const jx=-impulse*nx,jz=-impulse*nz;
    vx+=jx/P.mass;vz+=jz/P.mass;
    m.yawRate+=lever*(-impulse)/P.yawInertia;
    // Tangential contact friction cannot add kinetic energy.
    const tangentX=-nz,tangentZ=nx;
    const tangentV=(vx+m.yawRate*rz)*tangentX+(vz-m.yawRate*rx)*tangentZ;
    const tangentialLever=rz*tangentX-rx*tangentZ;
    const desired=-tangentV/(1/P.mass+tangentialLever*tangentialLever/P.yawInertia);
    const jt=clamp(desired,-.35*impulse,.35*impulse);
    vx+=jt*tangentX/P.mass;vz+=jt*tangentZ/P.mass;
    m.yawRate+=tangentialLever*jt/P.yawInertia;
    state.velocity=vx*sinH+vz*cosH;
    m.lateralVelocity=vx*cosH-vz*sinH;
    if(m.contactCooldown<=0){
      m.guardrailHits++;m.contactCooldown=.8;
      recordEvent('guardrail','車輛碰觸護欄（動量碰撞）');
      log('護欄碰撞：線速度與偏航角速度依接觸衝量更新。','warn');
    }
  }
  // Geometric depenetration prevents tunneling at low velocities, but never
  // changes wheel speeds or yaw directly as the previous wall clamp did.
  const correction=depth+.005;
  m.x-=outX*correction;m.z-=outZ*correction;
  m.contact=true;m.offset=side*permitted;
  return true;
}
let chassisBridge=null,externalClock=false;
function setChassisBridge(bridge){
  if(bridge!==null && !(bridge&&typeof bridge.beforeForces==='function'&&
    typeof bridge.stepForces==='function'&&typeof bridge.reset==='function'))return false;
  chassisBridge=bridge;
  // Internal suspension continues to be used by standalone mode only.
  suspension.enabled=!bridge;
  if(bridge){bridge.reset(roadPointAt(route.distance),P);}
  else resetSuspension();
  return true;
}
function setExternalClock(enabled){externalClock=!!enabled;}
function updateVehicleRoadPosition(dt){
  const m=vehicleMotion;
  const prediction=clamp(route.distance+state.velocity*dt*Math.cos(m.headingError),0,roadTotalDistance());
  const snap=nearestRoadPosition(m.x,m.z,prediction);
  route.distance=snap.s;m.routeS=snap.s;m.offset=snap.offset;
  m.headingError=angleDifference(m.heading,snap.road.heading);
  if(!chassisBridge){
    m.y=snap.road.y+roadCrossElevation(snap.road,clamp(m.offset,-6.2,6.2));
    m.contact=false;
    resolvePlanarGuardrail(snap);
  }
  m.offroad=Math.abs(m.offset)>3.65;
  if(roadTotalDistance()-route.distance<1550){extendRoad(36);updateRoadStats();}
  const yawTarget=m.heading+clamp(m.yawRate*.16,-.13,.13);
  m.cameraYaw+=angleDifference(yawTarget,m.cameraYaw)*(1-Math.exp(-dt*5.2));
}
function synchronizeRoadPose(){
  if(Math.abs(route.distance-vehicleMotion.routeS)>7)resetVehiclePose(route.distance);
}
// SHIFT//LAB V0.7 seeded procedural route. Units: meters, radians, percent grades.
// Deterministic algorithm version 1; output depends solely on seed and control values.
const ROAD_DEFAULTS={seed:'SHIFT-2026-MOUNTAIN-07',turnChance:58,hairpinChance:20,
  slopeChance:52,leftBias:50,upBias:50,maxGrade:9};
const route={config:{...ROAD_DEFAULTS},distance:0,segments:[],points:[],rng:null,
  gradeMode:'route',sliderSeen:0,mapRange:950,seedHash:0,generated:0};
function roadHash(value){
  // FNV-1a over UTF-16 code units (stable for the same entered seed).
  let hash=2166136261;
  for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return hash>>>0;
}
function roadRandom(seed){
  let a=seed>>>0;
  return function(){a=(a+0x6D2B79F5)>>>0;let t=a;
    t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;};
}
const roadSmooth=t=>{const v=clamp(t,0,1);return v*v*(3-2*v);};
function roadGradeProfile(t,grade){
  const easeIn=roadSmooth(t/.18),easeOut=roadSmooth((1-t)/.18);
  return grade*easeIn*easeOut;
}
function roadHeadingOffset(t,angle){return angle*(t-Math.sin(2*Math.PI*t)/(2*Math.PI));}
function extendRoad(count){
  const rng=route.rng,c=route.config;
  for(let i=0;i<count;i++){
    const first=route.generated===0;
    const bend=!first&&rng()*100<c.turnChance;
    const hairpin=bend && rng()*100<c.hairpinChance;
    const direction=rng()*100<c.leftBias?-1:1;
    const turnDeg=bend?(hairpin?135+50*rng():22+64*rng()):0;
    const length=first?340:hairpin?155+55*rng():bend?170+100*rng():185+115*rng();
    const grad=(!first && rng()*100<c.slopeChance)
      ?(rng()*100<c.upBias?1:-1)*(2.4+(c.maxGrade-2.4)*rng()):0;
    const type=!bend?'straight':(hairpin?'hairpin-':'')+(direction<0?'left':'right');
    const start=route.points[route.points.length-1];
    const angle=direction*turnDeg*Math.PI/180;
    const seg={index:route.generated,start:start.s,end:start.s+length,length,
      type,turnDeg:direction*turnDeg,gradeTarget:grad,headingStart:start.heading};
    const steps=Math.ceil(length/5);let previous=route.points[route.points.length-1];
    for(let j=1;j<=steps;j++){
      const t0=(j-1)/steps,t1=j/steps,tm=(t0+t1)/2,ds=length/steps;
      const theta=seg.headingStart+roadHeadingOffset(tm,angle);
      const gmid=roadGradeProfile(tm,grad);
      previous={s:seg.start+ds*j,x:previous.x+Math.sin(theta)*ds,
        z:previous.z+Math.cos(theta)*ds,y:previous.y+gmid*ds/100,
        heading:seg.headingStart+roadHeadingOffset(t1,angle),
        grade:roadGradeProfile(t1,grad),section:seg.index};
      route.points.push(previous);
    }
    route.segments.push(seg);route.generated++;
  }
}
function generateRoad(settings){
  const c={...ROAD_DEFAULTS,...settings};
  c.seed=String(c.seed||ROAD_DEFAULTS.seed).trim().slice(0,64)||ROAD_DEFAULTS.seed;
  for(const key of ['turnChance','hairpinChance','slopeChance','leftBias','upBias']){
    c[key]=clamp(Math.round(Number(c[key])||0),0,100);
  }
  c.maxGrade=clamp(Math.round(Number(c.maxGrade)||8),3,12);
  route.config=c;route.seedHash=roadHash(c.seed);route.rng=roadRandom(route.seedHash);
  route.segments=[];route.points=[{s:0,x:0,z:0,y:0,heading:0,grade:0,section:0}];
  route.distance=0;route.generated=0;
  extendRoad(96);
  resetVehiclePose(0);
  updateRoadStats();
  return route;
}
function roadTotalDistance(){return route.points.length?route.points[route.points.length-1].s:0;}
function roadPointAt(distance){
  const points=route.points;
  if(!points.length)return {s:0,x:0,z:0,y:0,heading:0,grade:0};
  const s=clamp(distance,0,roadTotalDistance());
  let lo=0,hi=points.length-1;
  while(lo+1<hi){const m=(lo+hi)>>1;if(points[m].s<s)lo=m;else hi=m;}
  const a=points[lo],b=points[hi],t=a===b?0:clamp((s-a.s)/(b.s-a.s),0,1);
  return {s,x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,
    y:a.y+(b.y-a.y)*t,heading:a.heading+(b.heading-a.heading)*t,
    grade:a.grade+(b.grade-a.grade)*t,section:a.section};
}
function roadFeatures(distance,limit=2){
  const entries=[];
  for(const seg of route.segments){
    if(seg.end<distance-5)continue;
    if(seg.type!=='straight' || Math.abs(seg.gradeTarget)>.3){
      entries.push({seg,meters:Math.max(0,seg.start-distance),active:seg.start<=distance&&distance<=seg.end});
      if(entries.length>=limit)break;
    }
  }
  return entries;
}
function roadFeatureText(feature){
  if(!feature)return '前方直線路段';
  const s=feature.seg;
  const bend=s.type==='straight'?'':s.type.includes('hairpin')?(s.turnDeg<0?'左迴頭彎':'右迴頭彎'):(s.turnDeg<0?'左彎':'右彎');
  const slope=s.gradeTarget>0?'上坡 '+s.gradeTarget.toFixed(1)+'%':s.gradeTarget<0?'下坡 '+Math.abs(s.gradeTarget).toFixed(1)+'%':'';
  return [bend,slope].filter(Boolean).join(' · ');
}
function roadTelemetryStep(dt,beforeV,afterV){
  if(!route.points.length)return;
  route.distance=clamp(route.distance+(beforeV+afterV)*.5*dt,0,roadTotalDistance());
  if(roadTotalDistance()-route.distance<1550){extendRoad(36);updateRoadStats();}
}
function roadSelectedSettings(){
  const opts={seed:$('map-seed').value};
  for(const key of ['turnChance','hairpinChance','slopeChance','leftBias','upBias','maxGrade']){
    opts[key]=Number($('map-'+key).value);
  }
  return opts;
}
function updateRoadSettingsDisplay(){
  for(const key of ['turnChance','hairpinChance','slopeChance','leftBias','upBias','maxGrade']){
    const el=$('map-'+key),out=$('map-'+key+'-val');if(el&&out)out.textContent=el.value+(key==='maxGrade'?'%':'%');
  }
}
function updateRoadStats(){
  if(!$('map-stats'))return;
  const count={straight:0,left:0,right:0,hairpin:0,up:0,down:0};
  for(const s of route.segments){
    if(s.type==='straight')count.straight++;
    if(s.type.includes('left'))count.left++;
    if(s.type.includes('right'))count.right++;
    if(s.type.includes('hairpin'))count.hairpin++;
    if(s.gradeTarget>0)count.up++;else if(s.gradeTarget<0)count.down++;
  }
  const entries=[['預覽路長',(roadTotalDistance()/1000).toFixed(1)+' km'],
    ['左 / 右彎',count.left+' / '+count.right],['迴頭彎',count.hairpin+' 處'],
    ['上 / 下坡',count.up+' / '+count.down]];
  $('map-stats').replaceChildren(...entries.map(([name,value])=>{
    const el=document.createElement('div'),label=document.createElement('small'),num=document.createElement('b');
    label.textContent=name;num.textContent=value;el.append(label,num);return el;
  }));
  $('map-seed-active').textContent=route.config.seed;
}
function refreshRoadUI(){
  const features=roadFeatures(route.distance,2);
  const f=features[0];
  $('road-next').textContent=f?`${f.active?'正在經過':'前方 '+Math.round(f.meters)+' m'}：${roadFeatureText(f)}`:'前方直線路段';
  $('road-distance').textContent=(route.distance/1000).toFixed(2)+' km';
  $('map-position').textContent=`里程 ${(route.distance/1000).toFixed(2)} km · 海拔 ${roadPointAt(route.distance).y.toFixed(0)} m`;
  $('map-mode-status').textContent=route.gradeMode==='route'?'自動坡度 · 跟隨地圖':'手動坡度 · 覆寫地圖';
  $('grade-mode').value=route.gradeMode;
}
function setupRoadControls(){
  const c=route.config;
  $('map-seed').value=c.seed;
  for(const key of ['turnChance','hairpinChance','slopeChance','leftBias','upBias','maxGrade']){
    $('map-'+key).value=c[key];$('map-'+key).addEventListener('input',()=>{
      updateRoadSettingsDisplay();$('map-message').textContent='機率設定尚未套用；按「套用並生成道路」更新路線。';
    });
  }
  updateRoadSettingsDisplay();
  $('map-preview-next').addEventListener('click',()=>{
    if(Math.abs(state.velocity)>.4){$('map-message').textContent='請先停車再使用路段預覽，避免行進中瞬間跳轉。';return;}
    const next=route.segments.find(seg=>seg.type!=='straight' && seg.start>route.distance+15);
    if(!next){$('map-message').textContent='目前生成的路段中找不到下一個彎道。';return;}
    route.distance=Math.max(0,next.start-65);resetVehiclePose(route.distance);
    if(route.gradeMode==='route')state.grade=roadPointAt(route.distance).grade;
    $('map-message').textContent='已跳至下一個彎道前 65 m（僅供預覽，不計入行駛里程紀錄）。';
    ui();
  });
  $('map-seed').addEventListener('input',()=>{$('map-message').textContent='種子已變更，請按「套用並生成道路」。';});
  $('map-generate').addEventListener('click',()=>{
    generateRoad(roadSelectedSettings());$('map-message').textContent='已套用種子與機率，並生成新路線。';route.gradeMode='route';
    $('grade-mode').value='route';$('grade-slider').value='0';route.sliderSeen=0;
    log('已生成新道路：種子 '+route.config.seed+'，進度回到起點；車輛與檔位狀態不變。');
    refreshRoadUI();drawRoad();drawRouteMap();
  });
  $('map-random').addEventListener('click',()=>{
    const buf=new Uint32Array(1);
    if(window.crypto?.getRandomValues)crypto.getRandomValues(buf);
    else buf[0]=(Date.now()^Math.floor(Math.random()*0xffffffff))>>>0;
    $('map-seed').value='ROAD-'+buf[0].toString(16).toUpperCase().padStart(8,'0');
    $('map-generate').click();
  });
  $('map-export').addEventListener('click',()=>{
    const config=route.config;
    downloadFile('SHIFT_LAB_Road_'+Date.now()+'.json',
      JSON.stringify({schema:'shiftlab.road.v1',generator:1,config},null,2),'application/json;charset=utf-8');
  });
  $('map-import').addEventListener('click',()=>$('map-import-file').click());
  $('map-import-file').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{
      if(file.size>10000)throw Error('地圖設定檔超過 10 KB。');
      const json=JSON.parse(await file.text());
      const candidate=json?.config;
      const fields=['seed','turnChance','hairpinChance','slopeChance','leftBias','upBias','maxGrade'];
      if(json?.schema!=='shiftlab.road.v1'||json?.generator!==1||!candidate||typeof candidate.seed!=='string'||
         !fields.slice(1).every(k=>typeof candidate[k]==='number'&&Number.isFinite(candidate[k])))
        throw Error('格式不符或不支援的產生器版本。');
      $('map-seed').value=candidate.seed;
      for(const key of fields.slice(1))$('map-'+key).value=String(candidate[key]);
      updateRoadSettingsDisplay();$('map-generate').click();
      $('map-message').textContent='成功匯入道路設定，已按相同種子重新生成地圖。';
    }catch(error){$('map-message').textContent='地圖匯入失敗：'+error.message+' 目前路線不變。';}
    event.target.value='';
  });
  $('map-zoom').addEventListener('change',e=>{route.mapRange=Number(e.target.value)||950;drawRouteMap();});
  $('grade-mode').addEventListener('change',e=>{route.gradeMode=e.target.value==='manual'?'manual':'route';route.sliderSeen=Number($('grade-slider').value);});
  $('grade-slider').addEventListener('input',()=>{route.gradeMode='manual';$('grade-mode').value='manual';route.sliderSeen=Number($('grade-slider').value);});
  generateRoad(c);
}
function canvasSetup(canvas){
  const box=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
  const w=Math.max(2,box.width),h=Math.max(2,box.height),dw=Math.round(w*dpr),dh=Math.round(h*dpr);
  if(canvas.width!==dw||canvas.height!==dh){canvas.width=dw;canvas.height=dh;}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
  return {ctx,w,h};
}
// SHIFT//LAB V0.8: deterministic, near-plane-clipped 2.5D road geometry.
// These settings are visual only: no PRNG draws and no changes to the physical road.
const ROAD_APPEARANCE_DEFAULTS=Object.freeze({guardrails:'both',centerline:'adaptive',quality:'high',drainage:true});
const roadAppearance={...ROAD_APPEARANCE_DEFAULTS};
const ROAD_CAM_NEAR=2.3;
const roadRenderDiagnostics={sampleCount:0,polygonCount:0,clippedCount:0,postCount:0,beamCount:0,markingCount:0,cameraPitch:0,cameraRoll:0,cameraHeadingError:0,lastSafe:true};
const roadPalette={
  earthFar:['#59675f','#4f5c56','#43534f'],
  earthMid:['#62695c','#575f55','#4c5a51'],
  earthNear:['#676d5d','#5b6457','#515d50'],
  cutFar:['#65675c','#5a5e55','#505951'],
  cutMid:['#716e5d','#656758','#5c6255'],
  cutNear:['#7d7560','#6c6b58','#626656'],
  ditch:['#4a514c','#434c49','#394441'],
  aggregate:['#88816e','#797767','#696f62'],
  curb:['#a6a296','#8d8e84','#737d77'],
  shoulder:['#565b57','#4d5653','#414c4b'],
  asphalt:['#343b42','#303840','#2c353e'],
  asphaltLeft:['#303840','#2c353d','#29323a'],
  asphaltRight:['#333b42','#303840','#2d363d'],
  gutter:['#202c32','#1c282d','#1a242b'],
  edge:['#f5f0dc','#d9dcca','#bec8bb'],
  center:['#f6cc65','#eec26b','#d3b77a'],
  beam:['#acb5b9','#a2adb2','#8d9da4'],
  railShadow:['#52636b','#53616b','#475a66']
};
function roadAppearanceColor(type,depth,variant=0){
  const palette=roadPalette[type]||roadPalette.asphalt;
  const dist=depth>175?2:depth>85?1:0;
  return palette[clamp(dist+variant,0,palette.length-1)];
}
function roadBankAt(p){
  const seg=route.segments[p.section];if(!seg||!seg.turnDeg)return 0;
  const phase=clamp((p.s-seg.start)/Math.max(1,seg.length),0,1);
  const gate=roadSmooth(phase/.18)*roadSmooth((1-phase)/.18);
  // Up to 4.8% visual crossfall, smoothly tapered at section boundaries.
  return -clamp((seg.turnDeg*Math.PI/180)/seg.length*2.9,-.048,.048)*gate;
}
function roadBankProfile(s,side){
  const seedPhase=(route.seedHash%8191)*.00041;
  const broad=Math.sin(s*.0058+seedPhase+side*1.1);
  const detail=.55*Math.sin(s*.019+seedPhase*.53+side*1.3);
  // A continuous deterministic earthwork transition between cut and fill.
  return clamp(3.1*broad+detail,-3.6,3.6);
}
function roadCrossElevation(p,lateral){
  const a=Math.abs(lateral),s=p.s,side=lateral<0?-1:1;
  const bank=roadBankAt(p)*lateral;
  if(a<=3.67)return .075*(1-a/3.67)+bank;
  if(a<=4.30)return bank-.045-(a-3.67)*.10;
  if(a<=5.10)return bank-.108-(a-4.30)*.14;
  if(a<=6.15){
    const depth=roadAppearance.drainage?-.34:-.20;
    return bank-.220+(a-5.1)*(depth+.220)/1.05;
  }
  const slope=roadBankProfile(s,side);
  if(a<=10.0)return bank-.34+(a-6.15)*(slope*.64+.30)/3.85;
  if(a<=17.0)return bank+slope*.64-.04+(a-10.0)*(slope*.35+.18)/7;
  return bank+slope+.14+(a-17.0)*(slope*.35+.12)/13;
}
function makeRoadCamera(origin,w,h){
  const motion=vehicleMotion,synced=Math.abs(motion.routeS-route.distance)<7;
  const dynamic=steeringSettings.cameraMode==='dynamic'&&synced;
  const heading=synced?motion.cameraYaw:origin.heading;
  const pitch=Math.atan(clamp(origin.grade/100,-.12,.12))*.94+(dynamic?-motion.pitch*.43:0);
  const roll=dynamic?-motion.roll*.35:0;
  roadRenderDiagnostics.cameraPitch=pitch;
  roadRenderDiagnostics.cameraRoll=roll;
  roadRenderDiagnostics.cameraHeadingError=synced?angleDifference(motion.heading,origin.heading):0;
  const cameraOrigin=synced?{...origin,x:motion.x,z:motion.z,y:motion.y,heading}:origin;
  return {origin:cameraOrigin,ct:Math.cos(heading),st:Math.sin(heading),
    cosPitch:Math.cos(pitch),sinPitch:Math.sin(pitch),roll,
    focal:Math.min(w*1.08,h*2.05),horizon:h*.397,
    cx:w*.50,w,h,eyeHeight:1.68+(dynamic?motion.heave*.7:0)};
}
function roadVertex(p,lateral,lift,camera){
  const tread=Math.abs(lateral)<=3.7?suspensionRoadTexture(p.s,lateral)*
    clamp((3.7-Math.abs(lateral))/.35,0,1):0;
  const wy=p.y+roadCrossElevation(p,lateral)+tread+lift;
  const wx=p.x+lateral*Math.cos(p.heading),wz=p.z-lateral*Math.sin(p.heading);
  const dx=wx-camera.origin.x,dz=wz-camera.origin.z;
  const side=dx*camera.ct-dz*camera.st;
  const front=dx*camera.st+dz*camera.ct;
  const up=wy-camera.origin.y-camera.eyeHeight;
  return {x:side,y:up*camera.cosPitch-front*camera.sinPitch,
    z:front*camera.cosPitch+up*camera.sinPitch};
}
function roadClipNear(poly){
  const out=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    const inA=a.z>=ROAD_CAM_NEAR,inB=b.z>=ROAD_CAM_NEAR;
    if(inA)out.push(a);
    if(inA!==inB){
      const t=clamp((ROAD_CAM_NEAR-a.z)/(b.z-a.z),0,1);
      out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:ROAD_CAM_NEAR});
    }
  }
  if(out.length!==poly.length)roadRenderDiagnostics.clippedCount++;
  return out;
}
function roadProject(v,camera){
  const x=camera.cx+v.x*camera.focal/v.z,
    y=camera.horizon-v.y*camera.focal/v.z;
  const dx=x-camera.cx,dy=y-camera.horizon,c=Math.cos(camera.roll),s=Math.sin(camera.roll);
  return {x:camera.cx+dx*c-dy*s,y:camera.horizon+dx*s+dy*c};
}
function drawRoadPolygon(ctx,poly,color,camera){
  if(!poly.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z))){
    roadRenderDiagnostics.lastSafe=false;return false;
  }
  const clipped=roadClipNear(poly);
  if(clipped.length<3)return false;
  const projected=clipped.map(v=>roadProject(v,camera));
  if(projected.every(p=>p.y < -camera.h*.8)||projected.every(p=>p.y>camera.h*2)||
     projected.every(p=>p.x< -camera.w*.8)||projected.every(p=>p.x>camera.w*1.8))return false;
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(projected[0].x,projected[0].y);
  for(let i=1;i<projected.length;i++)ctx.lineTo(projected[i].x,projected[i].y);
  ctx.closePath();ctx.fill();roadRenderDiagnostics.polygonCount++;
  return true;
}
function roadRibbon(ctx,a,b,x0,x1,color,camera,lift=.014){
  return drawRoadPolygon(ctx,[roadVertex(a,x0,lift,camera),roadVertex(a,x1,lift,camera),
    roadVertex(b,x1,lift,camera),roadVertex(b,x0,lift,camera)],color,camera);
}
function roadVerticalRibbon(ctx,a,b,xOffset,lo,hi,color,camera){
  return drawRoadPolygon(ctx,[roadVertex(a,xOffset,lo,camera),roadVertex(a,xOffset,hi,camera),
    roadVertex(b,xOffset,hi,camera),roadVertex(b,xOffset,lo,camera)],color,camera);
}
function roadSurfaceSegment(ctx,near,far,camera){
  const d=(far.s+near.s)/2-route.distance;
  const paint=(x0,x1,t,lift)=>roadRibbon(ctx,near,far,x0,x1,roadAppearanceColor(t,d),camera,lift??.005);
  // Graded earth shoulders and continuous embankment/cut geometry; no outside scenery objects.
  const ground=[[-30,-17,'earthFar'],[-17,-10,'earthMid'],[-10,-6.15,'cutFar'],
    [-6.15,-5.10,'ditch'],[-5.10,-4.30,'aggregate'],[-4.30,-3.67,'shoulder'],
    [3.67,4.30,'shoulder'],[4.30,5.10,'aggregate'],[5.10,6.15,'ditch'],
    [6.15,10,'cutMid'],[10,17,'earthNear'],[17,30,'earthFar']];
  for(const [x0,x1,type] of ground)paint(x0,x1,type);
  // Closed paving edges + crowned asphalt, with a center seam of low contrast.
  paint(-3.69,-3.59,'gutter');paint(3.59,3.69,'gutter');
  paint(-3.59,-.18,'asphaltLeft');paint(-.18,.18,'asphalt');paint(.18,3.59,'asphaltRight');
  if(d<110&&Math.floor(near.s/24)%5===0)paint(-3.34,3.34,'asphalt',.006);
  for(const side of [-1,1]){
    paint(side<0?-3.45:3.34,side<0?-3.34:3.45,'edge',.023);
    paint(side<0?-4.40:4.23,side<0?-4.23:4.40,'curb',.004);
  }
  const seg=route.segments[near.section]||route.segments[0];
  const lineMode=roadAppearance.centerline==='adaptive'?
    (seg?.type.includes('hairpin')||Math.abs(seg?.turnDeg||0)>=43?'double':'broken'):
    (roadAppearance.centerline==='solid'?'double':'broken');
  const yellow=roadAppearanceColor('center',d);
  if(lineMode==='double'){
    roadRibbon(ctx,near,far,-.23,-.125,yellow,camera,.027);
    roadRibbon(ctx,near,far,.125,.23,yellow,camera,.027);
    roadRenderDiagnostics.markingCount+=2;
  }else{
    // Exact dash boundary at absolute route meters: no crawling or jumping when camera moves.
    const period=17,on=10;let s=near.s;
    while(s<far.s-1e-7){
      const at=((s%period)+period)%period,remain=(at<on?on-at:period-at);
      const last=Math.min(far.s,s+Math.max(.0001,remain));
      if(at<on-1e-7){
        const ap=Math.abs(s-near.s)<.00001?near:roadPointAt(s);
        const bp=Math.abs(last-far.s)<.00001?far:roadPointAt(last);
        roadRibbon(ctx,ap,bp,-.075,.075,yellow,camera,.03);
        roadRenderDiagnostics.markingCount++;
      }
      s=last+1e-6;
    }
  }
  // Lane-surface contraction joints: subtle, short and locked to world distances.
  if(d<95){
    const first=Math.ceil(near.s/34)*34;
    for(let s=first;s<far.s;s+=34){
      if(s<near.s-1e-8)continue;
      const p=roadPointAt(s),q=roadPointAt(Math.min(s+.11,far.s));
      roadRibbon(ctx,p,q,-3.28,3.28,'#28333a',camera,.023);
    }
  }
}
function roadRailEnabled(p,side){
  if(roadAppearance.guardrails==='off')return false;
  if(roadAppearance.guardrails==='both')return true;
  const seg=route.segments[p.section];
  if(!seg||Math.abs(seg.turnDeg)<8)return true;
  // A left-hand bend has its outside on the right-hand shoulder, and vice versa.
  return seg.turnDeg<0?side===1:side===-1;
}
function roadGuardPost(ctx,p,side,camera,depth){
  const x=side*4.90,postWidth=side*.13;
  // Posts have a metallic forward face, dark base and a narrow reflected highlight.
  drawRoadPolygon(ctx,[roadVertex(p,x,-.12,camera),roadVertex(p,x,.98,camera),
    roadVertex(p,x+postWidth,.98,camera),roadVertex(p,x+postWidth,-.12,camera)],
    depth>120?'#687780':'#809098',camera);
  roadVerticalRibbon(ctx,p,roadPointAt(p.s+.13),x,.38,.48,'#455764',camera);
  roadRenderDiagnostics.postCount++;
  if(Math.round(p.s/6)%4===0){
    const inner=x-side*.045;
    drawRoadPolygon(ctx,[roadVertex(p,inner,.71,camera),roadVertex(p,inner,.85,camera),
      roadVertex(p,inner-side*.12,.85,camera),roadVertex(p,inner-side*.12,.71,camera)],
      side<0?'#ffd68a':'#dff4f7',camera);
  }
}
function roadGuardRailSegment(ctx,near,far,side,camera){
  const depth=(near.s+far.s)/2-route.distance,x=side*4.96;
  // Correct painter order: background post, back flange, continuous W-beam face and top highlight.
  for(const [lo,hi,col] of [[.42,.54,'#435663'],[.61,.96,'#4f626e'],
    [.67,.88,roadAppearanceColor('beam',depth)],[.855,.925,'#d1d8d8'],[.61,.65,'#334752']]){
    roadVerticalRibbon(ctx,near,far,x,lo,hi,col,camera);
  }
  roadRenderDiagnostics.beamCount++;
}
function roadRenderRails(ctx,near,far,camera){
  for(const side of [-1,1]){
    const midpoint=roadPointAt((near.s+far.s)*.5);
    if(!roadRailEnabled(midpoint,side))continue;
    const first=Math.ceil((near.s-.00001)/6)*6;
    for(let s=first;s<far.s+.00001;s+=6){
      if(s>=near.s-.00001&&s<=far.s+.00001){
        roadGuardPost(ctx,roadPointAt(s),side,camera,far.s-route.distance);
      }
    }
    roadGuardRailSegment(ctx,near,far,side,camera);
  }
}
function roadSampleMeters(){
  const high=roadAppearance.quality==='high';
  const max=Math.min(410,roadTotalDistance()-route.distance);
  const lengths=[0];let s=0;
  while(s<max){
    const normal=s<45?(high?2.5:3.7):s<150?(high?4.5:7.2):(high?8.0:13.0);
    const step=suspension.road==='bumps'&&suspension.intensity>.01?Math.min(normal,s<170?1.5:4):normal;
    s=Math.min(max,s+step);lengths.push(s);
  }
  return lengths;
}
function drawRoad(){
  const {ctx,w,h}=canvasSetup($('road'));
  // Clear the rounded DPR fringe before compositing subpixel geometry.
  ctx.clearRect(0,0,w+3,h+3);
  const horizon=h*.397;
  // Only sky and earthwork. Trees, mountains, buildings and other outside scenery are deferred.
  const sky=ctx.createLinearGradient(0,0,0,horizon+55);
  sky.addColorStop(0,'#11283a');sky.addColorStop(.53,'#466474');
  sky.addColorStop(.86,'#94a29e');sky.addColorStop(1,'#8d9d90');
  ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
  const below=ctx.createLinearGradient(0,horizon,0,h);
  below.addColorStop(0,'#69786b');below.addColorStop(.62,'#414f46');below.addColorStop(1,'#283b36');
  ctx.fillStyle=below;ctx.fillRect(0,horizon,w,h-horizon);
  const origin=roadPointAt(route.distance),camera=makeRoadCamera(origin,w,h);
  const lengths=roadSampleMeters(),points=lengths.map(d=>roadPointAt(route.distance+d));
  roadRenderDiagnostics.sampleCount=points.length;
  roadRenderDiagnostics.polygonCount=0;roadRenderDiagnostics.clippedCount=0;
  roadRenderDiagnostics.postCount=0;roadRenderDiagnostics.beamCount=0;
  roadRenderDiagnostics.markingCount=0;roadRenderDiagnostics.lastSafe=true;
  // Far-to-near segment ordering preserves occlusion across tight switchbacks.
  ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();
  for(let i=points.length-1;i>0;i--){
    const near=points[i-1],far=points[i];
    roadSurfaceSegment(ctx,near,far,camera);
    roadRenderRails(ctx,near,far,camera);
  }
  // Asphalt micro-detail and reflective edge studs stay fixed in route coordinates.
  for(let s=Math.ceil((route.distance+4)/14)*14;s<route.distance+68;s+=14){
    const p=roadPointAt(s),seg=route.segments[p.section],d=s-route.distance;
    if(seg&&d>=3&&d<68){
      for(const side of [-1,1]){
        const x=side*3.44;
        const patch=roadPointAt(s+.33);
        roadRibbon(ctx,p,patch,x-.12,x+.12,'#dae4d7',camera,.03);
      }
    }
  }
  // Subtle road surface aggregate points (no frame-to-frame randomness).
  if(roadAppearance.quality==='high'){
    for(let s=Math.ceil((route.distance+3)/2.5)*2.5;s<route.distance+36;s+=2.5){
      const p=roadPointAt(s);
      const h32=roadHash(route.config.seed+'|'+Math.floor(s));
      const lateral=((h32>>>4)%1000/1000-.5)*6.1;
      const v=roadVertex(p,lateral,.027,camera);
      if(v.z>ROAD_CAM_NEAR){
        const {x:px,y:py}=roadProject(v,camera);
        const size=clamp(2.4/v.z,.28,1.3);
        ctx.fillStyle=h32%3===0?'#5d6365':'#1c2a31';ctx.fillRect(px,py,size,size);
      }
    }
  }
  ctx.restore();
  const canopy=ctx.createLinearGradient(0,h*.82,0,h);
  canopy.addColorStop(0,'#14263300');canopy.addColorStop(1,'#07151ac4');
  ctx.fillStyle=canopy;ctx.fillRect(0,h*.82,w,h*.18);
  // Car hood is body-fixed, independently of road rendering; lean and pitch from load transfer.
  ctx.save();ctx.translate(w*.5,h*.98);
  const hoodRoll=Math.abs(vehicleMotion.routeS-route.distance)<7?vehicleMotion.roll*.8:0;
  const hoodPitch=Math.abs(vehicleMotion.routeS-route.distance)<7?vehicleMotion.pitch:0;
  ctx.rotate(hoodRoll);ctx.translate(-w*.5,-h*.98+hoodPitch*h*.30);
  ctx.fillStyle='#08141edc';ctx.beginPath();ctx.moveTo(w*.26,h);
  ctx.quadraticCurveTo(w*.48,h-20,w*.5,h-18);
  ctx.quadraticCurveTo(w*.52,h-20,w*.74,h);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#6fe0c3';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(w*.435,h-6);ctx.lineTo(w*.565,h-6);ctx.stroke();
  ctx.restore();
}
function drawRouteMap(canvasId='route-map',range=route.mapRange){
  const {ctx,w,h}=canvasSetup($(canvasId));
  ctx.fillStyle='#0c1c2a';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#16364a';ctx.lineWidth=1;
  for(let x=0;x<w;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
  for(let y=0;y<h;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  const synced=Math.abs(vehicleMotion.routeS-route.distance)<7;
  const roadBase=roadPointAt(route.distance);
  const base=synced?{...roadBase,x:vehicleMotion.x,z:vehicleMotion.z,heading:vehicleMotion.heading}:roadBase;
  const scale=h/range,ox=w*.5,oy=h*.78;
  const project=p=>{const dx=p.x-base.x,dz=p.z-base.z;
    return {x:ox+(dx*Math.cos(base.heading)-dz*Math.sin(base.heading))*scale,
      y:oy-(dx*Math.sin(base.heading)+dz*Math.cos(base.heading))*scale};};
  const back=Math.max(0,route.distance-range*.25),front=Math.min(roadTotalDistance(),route.distance+range*1.5);
  let prev=null;
  for(let s=back;s<=front;s+=Math.max(5,range/125)){
    const pos=roadPointAt(s),p=project(pos);
    if(prev){ctx.strokeStyle=pos.grade>1.0?'#ffc077':pos.grade< -1.0?'#7bb8ff':'#73dac0';
      ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(prev.x,prev.y);ctx.lineTo(p.x,p.y);ctx.stroke();}
    prev=p;
  }
  // Annotate hairpins in the next few hundred meters, even if the road reverses direction.
  const marked=[];
  for(const seg of route.segments){
    if(!seg.type.includes('hairpin')||seg.end<back||seg.start>front)continue;
    const p=project(roadPointAt((seg.start+seg.end)/2));
    if(p.x<10||p.x>w-10||p.y<10||p.y>h-10)continue;
    if(marked.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<18))continue;
    marked.push(p);
    ctx.fillStyle='#ffd17c';ctx.beginPath();ctx.arc(p.x,p.y,8,0,TAU);ctx.fill();
    ctx.fillStyle='#152130';ctx.font='bold 10px sans-serif';ctx.textAlign='center';
    ctx.fillText('U',p.x,p.y+3);
  }
  ctx.save();ctx.translate(ox,oy);
  ctx.fillStyle='#ffffff';ctx.shadowBlur=12;ctx.shadowColor='#77f0c4';
  ctx.beginPath();ctx.moveTo(0,-13);ctx.lineTo(-8,9);ctx.lineTo(8,9);ctx.closePath();ctx.fill();ctx.restore();
  if(w>200){
    ctx.textAlign='left';ctx.fillStyle='#d8e4ef';ctx.font='bold 11px sans-serif';ctx.fillText('前方 ↑  車身航向 / 道路參考',12,19);
    ctx.fillStyle='#9cb7c6';ctx.font='10px sans-serif';ctx.fillText('相對行進方向 · 非真實地理北方',12,h-12);
  }
}

const history=[];
function log(message,kind='ok'){
  if(state.lastEvent===message && (state.time-(history[0]?.time??-99))<.9)return;
  state.lastEvent=message;state.lastEventKind=kind;
  history.unshift({message,kind,time:state.time});if(history.length>3)history.pop();
  $('event').className='event'+(kind==='warn'?' warn':kind==='error'?' error':'');
  $('event-text').textContent=message;
  $('history').replaceChildren(...history.slice(1).map(h=>{let li=document.createElement('li');li.textContent='— '+h.message;return li;}));
}

// V0.5 controller profiles are intentionally hardware-agnostic. No device-specific USB driver.
const INPUT_GEAR_KEYS=['1','2','3','4','5','6','r'];
const PEDAL_NAMES=['clutch','brake','throttle'];
const PROFILE_KEY='shiftlab.v05.controller.profile';
function freshProfile(){return {version:1,pedalDevice:'',shifterDevice:'',pedals:{
  clutch:{source:'',rest:-1,full:1,deadzone:.035},brake:{source:'',rest:-1,full:1,deadzone:.035},throttle:{source:'',rest:-1,full:1,deadzone:.035}
 },gears:{'1':'','2':'','3':'','4':'','5':'','6':'',r:''}};}
function cleanProfile(value){
  const obj=freshProfile();
  if(!value||typeof value!=='object'||Array.isArray(value))return obj;
  for(const k of ['pedalDevice','shifterDevice'])if(typeof value[k]==='string')obj[k]=value[k].slice(0,240);
  for(const name of PEDAL_NAMES){
    const item=value.pedals?.[name];if(!item||typeof item!=='object')continue;
    if(typeof item.source==='string'&&/^[ab](?:0|[1-9][0-9]?)$/.test(item.source))obj.pedals[name].source=item.source;
    for(const k of ['rest','full'])if(typeof item[k]==='number'&&Number.isFinite(item[k]))obj.pedals[name][k]=clamp(item[k],-1,1);
    if(typeof item.deadzone==='number'&&Number.isFinite(item.deadzone))obj.pedals[name].deadzone=clamp(item.deadzone,0,.2);
  }
  for(const g of INPUT_GEAR_KEYS){const v=value.gears?.[g];if(typeof v==='string'&&(/^b(?:0|[1-9][0-9]?)$/.test(v)||v===''))obj.gears[g]=v;}
  return obj;
}
const controller={profile:freshProfile(),available:[],activePedal:false,activeShift:false,unsafe:false,lastHardwareGear:0,
  shiftArmed:false,gearCandidate:0,gearCandidateAt:0,lastDeviceFingerprint:'',learn:null,lastMessage:'',lastHardware:{},
  lostPedalDevice:false,seenPedalDevice:false,disconnectHandled:false};
function gpMessage(message){controller.lastMessage=message;$('gp-message').textContent=message;}
function availablePads(){
  if(typeof navigator.getGamepads!=='function')return [];
  try{return Array.from(navigator.getGamepads()||[]).filter(p=>p&&p.connected!==false&&typeof p.id==='string');}
  catch{return [];} // A permissions policy may block Gamepad API.
}
function padKey(p){return `${p.index}|${p.id}`;}
function deviceFor(key,pads){
  if(!key)return null;
  const exact=pads.find(p=>padKey(p)===key);
  if(exact)return exact;
  // Index can change after reconnect. Match previously known device ID if unique.
  const id=key.slice(key.indexOf('|')+1),matches=pads.filter(p=>p.id===id);
  return matches.length===1?matches[0]:null;
}
function selectOptions(select,items,value){
  select.replaceChildren();
  for(const [v,label] of items){let op=document.createElement('option');op.value=v;op.textContent=label;select.appendChild(op);}
  if(items.some(([v])=>v===value))select.value=value;
  else if(value){let op=document.createElement('option');op.value=value;op.textContent='未偵測到 / '+value.slice(0,35);select.appendChild(op);select.value=value;}
}
function refreshControllerUI(pads=availablePads()){
  controller.available=pads;
  const fmt=p=>`${p.index}: ${p.id.slice(0,62)} (${p.axes.length} 軸 / ${p.buttons.length} 鍵)`;
  for(const [which,id] of [['pedalDevice','gp-pedals-device'],['shifterDevice','gp-shifter-device']]){
    selectOptions($(id),[['',which==='pedalDevice'?'使用鍵盤／畫面滑桿':'使用鍵盤／畫面 H 槽'],...pads.map(p=>[padKey(p),fmt(p)])],controller.profile[which]);
  }
  const pedalPad=deviceFor(controller.profile.pedalDevice,pads);
  const shiftPad=deviceFor(controller.profile.shifterDevice,pads);
  for(const name of PEDAL_NAMES){
    const selected=controller.profile.pedals[name].source;
    const choices=[['','未映射 / 畫面滑桿']];
    if(pedalPad){
      pedalPad.axes.forEach((_,i)=>choices.push([`a${i}`,`軸 A${i}`]));
      pedalPad.buttons.forEach((_,i)=>choices.push([`b${i}`,`按鈕 B${i}`]));
    }
    selectOptions($(`gp-${name}-source`),choices,selected);
  }
  const btnChoices=[['','未映射']];
  if(shiftPad)shiftPad.buttons.forEach((_,i)=>btnChoices.push([`b${i}`,`按鈕 B${i}`]));
  for(const g of INPUT_GEAR_KEYS)selectOptions($(`gp-gear-${g}`),btnChoices,controller.profile.gears[g]);
  $('gp-status').textContent=pads.length?`已偵測 ${pads.length} 個控制器`:'未偵測到 USB 控制器';
  $('gp-status').classList.toggle('online',pads.length>0);
  $('controller-group-value').textContent=pads.length?pads.length+' 個 USB 裝置 · 可映射':'鍵盤預設 · USB 可選';
  refreshAdvancedGamepadUI(pads);
}
function rawInput(pad,source){
  if(!pad||!source)return null;
  const index=Number(source.slice(1));
  if(source[0]==='a'){
    const v=pad.axes[index];return typeof v==='number'&&Number.isFinite(v)?clamp(v,-1,1):null;
  }
  const btn=pad.buttons[index];
  if(source[0]==='b'&&btn)return clamp(typeof btn.value==='number'?btn.value:Number(!!btn.pressed),0,1);
  return null;
}
function normalizedPedal(config,raw){
  if(raw===null)return null;
  const span=config.full-config.rest;
  if(Math.abs(span)<.035)return null; // Calibration must have distinct endpoints.
  const progress=clamp((raw-config.rest)/span,0,1);
  return progress<=config.deadzone?0:progress>=1-config.deadzone?1:clamp((progress-config.deadzone)/(1-2*config.deadzone),0,1);
}
function assignedShifterButton(pad){
  const pressed=INPUT_GEAR_KEYS.filter(g=>{
    const raw=rawInput(pad,controller.profile.gears[g]);return raw!==null&&raw>.62;
  });
  return pressed.length===1?Number(pressed[0]==='r'?-1:pressed[0]):pressed.length?null:0;
}
function shifterButtons(pad){
  return new Set(pad.buttons.map((btn,i)=>btn.pressed||btn.value>.6?`b${i}`:null).filter(Boolean));
}
function clearHardwareShift(){
  controller.shiftArmed=false;controller.gearCandidate=0;controller.gearCandidateAt=state.time;
  controller.lastHardwareGear=0;controller.learn=null;
}
function refreshPadsIfChanged(pads){
  const fp=pads.map(p=>[padKey(p),p.axes.length,p.buttons.length].join(':')).join(';');
  if(fp!==controller.lastDeviceFingerprint){controller.lastDeviceFingerprint=fp;refreshControllerUI(pads);}
}
function pollController(){
  const pads=availablePads();refreshPadsIfChanged(pads);
  const pedalPad=deviceFor(controller.profile.pedalDevice,pads);
  const shiftPad=deviceFor(controller.profile.shifterDevice,pads);
  controller.activePedal=!!pedalPad;controller.activeShift=!!shiftPad;
  controller.lastHardware={};
  if(controller.profile.pedalDevice&&pedalPad)controller.seenPedalDevice=true;
  controller.lostPedalDevice=!!controller.profile.pedalDevice&&!pedalPad&&controller.seenPedalDevice;
  if(controller.lostPedalDevice&&!controller.disconnectHandled){gpMessage('踏板控制器中斷：切斷油門並暫時踩下離合器，請確認 USB 連線。');controller.disconnectHandled=true;}
  if(pedalPad)controller.disconnectHandled=false;
  for(const name of PEDAL_NAMES){
    const config=controller.profile.pedals[name];const raw=rawInput(pedalPad,config.source);
    controller.lastHardware[name]={raw,value:normalizedPedal(config,raw)};
  }
  if(!shiftPad){
    if(controller.profile.shifterDevice&&controller.shiftArmed){gpMessage('排檔控制器已斷線，原有檔位保留；不再接受硬體換檔訊號。');clearHardwareShift();}
    return;
  }
  // Learning a physical gear must observe a NEW press, not a button held before 'learn'.
  if(controller.learn){
    const current=shifterButtons(shiftPad);
    // Release-to-arm: a gear already held when learning began can still be mapped
    // once it has been physically released and pressed again.
    for(const btn of controller.learn.baseline)if(!current.has(btn))controller.learn.baseline.delete(btn);
    for(const btn of current)if(!controller.learn.baseline.has(btn)){
      controller.profile.gears[controller.learn.gear]=btn;
      gpMessage('已將 '+(controller.learn.gear==='r'?'R':controller.learn.gear)+' 檔映射為 '+btn.toUpperCase());
      controller.learn=null;refreshControllerUI(pads);clearHardwareShift();return;
    }
  }
  const gear=assignedShifterButton(shiftPad);
  if(gear===null){$('gp-shifter-state').textContent='偵測到多個檔位按鈕同時按下：暫停硬體換檔，請檢查映射。';return;}
  if(gear!==controller.gearCandidate){controller.gearCandidate=gear;controller.gearCandidateAt=state.time;return;}
  // Avoid bouncing neutral during switch transitions; require a stable detent.
  // Initial arming needs 75 ms at neutral; during actual shifts the lever may pass
  // neutral very quickly. Use 25 ms for neutral and 55 ms for a gear detent.
  const dwell=controller.shiftArmed?(gear===0?.025:.055):.075;
  if(state.time-controller.gearCandidateAt<dwell)return;
  if(!controller.shiftArmed){
    if(gear===0){controller.shiftArmed=true;controller.lastHardwareGear=0;
      $('gp-shifter-state').textContent='實體排檔已就緒。先踩離合器，再進入檔位。';}
    return;
  }
  if(gear===controller.lastHardwareGear)return;
  if(gear===0){
    if(state.pendingGear!==null||state.gear!==0)requestGear(0);
    controller.lastHardwareGear=0;return;
  }
  if(controller.lastHardwareGear!==0){
    $('gp-shifter-state').textContent='必須先經過空檔，才能從一個檔位進入另一個檔位。';showShiftFailure('未經空檔');return;
  }
  const accepted=requestGear(gear);
  controller.lastHardwareGear=gear; // Failure requires user to remove and reinsert lever.
  $('gp-shifter-state').textContent=accepted?'已要求切換至 '+gearLabel(gear)+' 檔；等待同步器。':'入檔受阻，請排回空檔並重新操作。';
}
function controllerTarget(name,manual){
  if(controller.lostPedalDevice)return name==='clutch'?1:0;
  const value=controller.lastHardware[name]?.value;
  return value===null||value===undefined?manual:value;
}
function calibrate(name,part){
  const pads=availablePads(),pad=deviceFor(controller.profile.pedalDevice,pads);
  const config=controller.profile.pedals[name],raw=rawInput(pad,config.source);
  if(raw===null){gpMessage('校準失敗：請先選擇踏板裝置與有效來源。');return;}
  const prop=part==='rest'?'rest':'full';config[prop]=raw;
  gpMessage(name.toUpperCase()+' '+(part==='rest'?'鬆開':'踩到底')+' 原始值 '+raw.toFixed(3)+(Math.abs(config.full-config.rest)<.035?'；兩端太接近，請重新校準。':''));
}
function replaceProfile(profile,notification){
  controller.profile=cleanProfile(profile);controller.seenPedalDevice=false;controller.lostPedalDevice=false;
  controller.disconnectHandled=false;clearHardwareShift();refreshControllerUI();gpMessage(notification);
}
function persistProfile(){
  try{localStorage.setItem(PROFILE_KEY,JSON.stringify(controller.profile));gpMessage('校準已儲存於這個瀏覽器。建議另匯出 JSON 備份。');}
  catch{gpMessage('此瀏覽器不允許本機儲存；請按「匯出校準 JSON」備份。');}
}
function downloadFile(name,content,mime){
  const blob=new Blob([content],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
// V0.6 event-based training: measure RPM difference at the actual clutch bite point.
// Values are pedagogical, not representative of measured clutch friction or certified grading.
const trainer={scores:[],pending:null,neutralFrom:0,neutralAt:-99,clutchPressAt:-99,
  blocked:0,stalls:0,tip:'',lastClutch:0};
const SHIFT_FAILURE_TIPS={
  '同步器忙碌':['同步器正在對速','請踩住離合器，等入檔完成；或先回 N 空檔再試。'],
  '移動中倒檔鎖定':['倒檔無法掛入','先踩煞車使車輛幾乎完全停止，再踩離合器掛 R。'],
  '離合器未充分分離':['離合器未踩到底','請踩住 Shift，離合器踩踏至少 78%，再重新選擇檔位。'],
  '倒檔輸入軸尚未停止':['倒檔齒輪仍在轉動','踩住離合器，稍等輸入軸降速後再掛 R。'],
  '同步器尚未完成便鬆開離合器':['同步器尚未對速完成','重新踩下離合器，回 N 空檔，再掛目標檔位並等待同步。'],
  '同步器逾時':['同步器無法完成對速','回 N 空檔並保持踩住離合器，等待軸速穩定後重試。'],
  '未經空檔':['排檔桿未經空檔','先把排檔桿移到 N，再推進下一檔。']
};
let failureTimer=null, lastFailureReason='', lastFailureAt=-Infinity;
function hideShiftFailure(){if(failureTimer!==null){clearTimeout(failureTimer);failureTimer=null;}$('shift-failure').hidden=true;}
function showShiftFailure(reason){
  const now=performance.now();
  if(reason===lastFailureReason && now-lastFailureAt<900)return;
  lastFailureReason=reason;lastFailureAt=now;
  const [title,hint]=SHIFT_FAILURE_TIPS[reason]||['換檔失敗','請回 N 空檔，踩下離合器並稍候，再嘗試換檔。'];
  $('shift-failure-title').textContent='換檔失敗 · '+title;
  $('shift-failure-hint').textContent=hint;
  $('shift-failure').hidden=false;
  if(failureTimer!==null)clearTimeout(failureTimer);
  failureTimer=setTimeout(()=>{failureTimer=null;$('shift-failure').hidden=true;},5800);
}
function shiftReject(reason){trainer.blocked++;trainer.tip=reason;recordEvent('blocked',reason);showShiftFailure(reason);}
function shiftNeutral(old){
  if(old!==0){trainer.neutralFrom=old;trainer.neutralAt=state.time;}
  if(trainer.pending&&trainer.pending.engagedAt===null)trainer.pending=null;
  recordEvent('neutral','回空檔');
}
function shiftRequested(target,from){
  const inferred=from!==0?from:state.time-trainer.neutralAt<3?trainer.neutralFrom:0;
  const neutralAt=inferred!==0&&state.time-trainer.neutralAt<4?trainer.neutralAt:state.time;
  const beganAt=inferred!==0&&state.time-trainer.clutchPressAt<5?trainer.clutchPressAt:neutralAt;
  const nowRPM=radToRPM(state.engineOmega);
  trainer.pending={from:inferred,to:target,at:state.time,beganAt,neutralAt,
    engagedAt:null,releaseAt:null,fullyReleasedAt:null,rpmError:0,signedError:0,targetRPM:0,
    clutchStartRPM:nowRPM,neutralPeakRPM:nowRPM,peakThrottle:state.throttle,lowestThrottle:state.throttle,blipRise:0,
    jerkPeak:0,smoothAcceleration:state.accel,lastAcceleration:state.accel,maxHeat:state.heat};
  recordEvent('gear_request',`${gearLabel(inferred)} → ${gearLabel(target)}`);
}
function shiftEngaged(target){
  if(trainer.pending&&trainer.pending.to===target)trainer.pending.engagedAt=state.time;
  recordEvent('gear_engaged',gearLabel(target));
}
function scorePending(shift){
  const downshift=shift.from>0&&shift.to>0&&shift.to<shift.from;
  const duration=Math.max(0,shift.engagedAt-shift.at);
  const totalDuration=Math.max(0,(shift.fullyReleasedAt??state.time)-shift.beganAt);
  const rpmLoss=Math.min(downshift?48:40,shift.rpmError/(downshift?29:42));
  const smoothLoss=Math.min(24,shift.jerkPeak*1.25);
  const timeLoss=Math.min(17,Math.max(0,totalDuration-1.30)*6.4);
  const heatLoss=Math.min(11,Math.max(0,shift.maxHeat-130)*.18);
  const score=clamp(Math.round(100-rpmLoss-smoothLoss-timeLoss-heatLoss),0,100);
  const blipped=shift.blipRise>.18 && shift.neutralPeakRPM-shift.clutchStartRPM>135;
  const item={time:state.time,from:shift.from,to:shift.to,downshift,score,
    rpmError:Math.round(shift.rpmError),signedError:Math.round(shift.signedError),
    targetRPM:Math.round(shift.targetRPM),blipped,
    jerk:Math.round(shift.jerkPeak*10)/10,
    duration:Math.round(duration*100)/100,
    neutralTime:Math.round(Math.max(0,shift.engagedAt-shift.neutralAt)*100)/100,
    biteTime:Math.round(Math.max(0,shift.releaseAt-shift.engagedAt)*100)/100,
    totalTime:Math.round(totalDuration*100)/100,
    releaseTime:Math.round(Math.max(0,(shift.fullyReleasedAt??state.time)-shift.releaseAt)*100)/100};
  trainer.scores.unshift(item);if(trainer.scores.length>80)trainer.scores.pop();
  if(downshift && shift.signedError< -180){trainer.tip='降檔時 RPM 偏低：離合器接合前需要補油約 '+Math.round(-shift.signedError)+' RPM';}
  else if(downshift && shift.signedError>180){trainer.tip='降檔時補油過量：接合前應降低約 '+Math.round(shift.signedError)+' RPM';}
  else if(downshift && shift.rpmError<150){trainer.tip='降檔對速良好'+(blipped?'，已偵測補油操作':'；此速度區間不一定需要額外補油');}
  else trainer.tip=score>=90?'換檔平順':score>=70?'操作良好，可改善接合時間':'建議練習離合器接合與轉速匹配';
  recordEvent('score',`${gearLabel(item.from)}>${gearLabel(item.to)} ${score}/100, 差 ${item.signedError} RPM, 全程 ${item.totalTime}s`);
  return item;
}
function trainingStep(dt){
  if(trainer.lastClutch<.78&&state.clutch>=.78&&state.gear!==0)trainer.clutchPressAt=state.time;
  const shift=trainer.pending;
  if(shift){
    if(shift.releaseAt===null){
      shift.neutralPeakRPM=Math.max(shift.neutralPeakRPM,radToRPM(state.engineOmega));
      shift.lowestThrottle=Math.min(shift.lowestThrottle,state.throttle);
      shift.blipRise=Math.max(shift.blipRise,state.throttle-shift.lowestThrottle);
      shift.peakThrottle=Math.max(shift.peakThrottle,state.throttle);
    }
    if(shift.engagedAt===null){
      if(state.time-shift.at>6)trainer.pending=null;
    }else{
      if(shift.releaseAt===null && state.clutch<=P.clutchBiteAt){
        // Sample BEFORE engine and input shaft have been equalized by a fully locked clutch.
        shift.releaseAt=state.time;
        shift.targetRPM=Math.abs(radToRPM(state.inputOmega));
        shift.signedError=radToRPM(state.engineOmega)-shift.targetRPM;
        shift.rpmError=Math.abs(shift.signedError);
        shift.smoothAcceleration=state.accel;shift.lastAcceleration=state.accel;
        recordEvent('clutch_bite',`接合點 ${Math.round(P.clutchBiteAt*100)}%，轉速差 ${Math.round(shift.signedError)} RPM`);
      }
      if(shift.releaseAt!==null){
        if(shift.fullyReleasedAt===null && state.clutch<.13)shift.fullyReleasedAt=state.time;
        const filter=clamp(dt/.11,0,1);
        shift.smoothAcceleration+=filter*(state.accel-shift.smoothAcceleration);
        const smoothedJerk=Math.abs((shift.smoothAcceleration-shift.lastAcceleration)/dt);
        shift.jerkPeak=Math.max(shift.jerkPeak,smoothedJerk);
        shift.lastAcceleration=shift.smoothAcceleration;
        shift.maxHeat=Math.max(shift.maxHeat,state.heat);
        if(state.time-shift.releaseAt>.55){scorePending(shift);trainer.pending=null;}
      }else if(state.time-shift.engagedAt>8){trainer.pending=null;}
    }
  }
  trainer.lastClutch=state.clutch;
}
function revGuidance(){
  const manual=$('rev-gear-select').value;
  const current=state.gear>0?state.gear:trainer.pending?.from||trainer.neutralFrom||0;
  const target=manual==='auto'?(state.pendingGear>0?state.pendingGear:current>1?current-1:current===1?1:2):Number(manual);
  const rpmNow=radToRPM(state.engineOmega);
  if(!target || !state.engineOn || Math.abs(state.velocity)<.55){
    $('rev-target-rpm').textContent='--';$('rev-delta-rpm').textContent='--';
    $('rev-tip').textContent=!state.engineOn?'引擎尚未啟動':'需有行進車速';$('rev-tip').className='';return;
  }
  const targetRPM=Math.abs(radToRPM(state.shaftOmega*gearGain(target)));
  const delta=targetRPM-rpmNow;
  $('rev-target-rpm').textContent=Math.round(targetRPM)+' RPM';
  $('rev-delta-rpm').textContent=(delta>0?'+':'')+Math.round(delta)+' RPM';
  $('rev-tip').textContent=targetRPM>P.damageRPM?'不安全 / 超轉':
    delta>160?'補油升轉':delta< -160?'降低轉速':'已接近目標';
  $('rev-tip').className=Math.abs(delta)>160||targetRPM>P.damageRPM?'warn':'';
}
const telemetry={running:false,samples:[],events:[],clock:0,start:0,elapsed:0,limit:18000,vehicleId:'standard',startedOn:''};
function recordEvent(kind,message){
  if(!telemetry.running)return;
  telemetry.events.push({time:state.time-telemetry.start,kind,message});
  if(telemetry.events.length>600)telemetry.events.shift();
}
function recordStep(dt){
  if(!telemetry.running)return;
  telemetry.clock+=dt;telemetry.elapsed=state.time-telemetry.start;
  if(telemetry.elapsed>=900||telemetry.samples.length>=telemetry.limit){telemetry.running=false;return;}
  if(telemetry.clock<.05)return;
  telemetry.clock-=.05;
  telemetry.samples.push({time:telemetry.elapsed,gear:state.gear,rpm:radToRPM(state.engineOmega),
    kmh:state.velocity*3.6,clutch:state.clutch,throttle:state.throttle,brake:state.brake,
    driveSlip:state.driveSlip,coastSlip:state.coastSlip,accel:state.accel,shaftTorque:state.shaftTorque,
    surface:state.surface,tcs:state.tcsEnabled,abs:state.absEnabled,grade:state.grade,engineOn:state.engineOn,
    steer:vehicleMotion.steerInput,wheelAngleDeg:vehicleMotion.steerAngle*180/Math.PI,
    yawRate:vehicleMotion.yawRate,lateralG:vehicleMotion.lateralAccel/9.81,
    rollDeg:vehicleMotion.roll*180/Math.PI,pitchDeg:vehicleMotion.pitch*180/Math.PI,
    roadOffset:vehicleMotion.offset,roadDistance:route.distance,
    heaveMm:vehicleMotion.heave*1000,
    suspensionTravelMm:WHEEL_IDS.map(id=>wheelModel[id].travel*1000),
    wheelContacts:WHEEL_IDS.map(id=>wheelModel[id].contact),
    camberDeg:WHEEL_IDS.map(id=>wheelModel[id].camber*180/Math.PI),
    toeDeg:WHEEL_IDS.map(id=>wheelModel[id].toe*180/Math.PI),
    treadTempC:WHEEL_IDS.map(id=>wheelModel[id].treadTemp),
    carcassTempC:WHEEL_IDS.map(id=>wheelModel[id].carcassTemp),
    pressureKpa:WHEEL_IDS.map(id=>wheelModel[id].pressureKpa),
    tireWearPct:WHEEL_IDS.map(id=>wheelModel[id].tireWear*100),
    aligningMomentNm:WHEEL_IDS.map(id=>wheelModel[id].aligningMoment),
    steeringFeedbackNm:tireSystem.feedbackNm,
    rackRateDegS:steeringRack.rate*180/Math.PI,
    rackDriverTorqueNm:steeringRack.driverTorqueNm,
    rackAssistTorqueNm:steeringRack.assistTorqueNm,
    rackRoadTorqueNm:steeringRack.roadTorqueNm,
    steeringWheelFeelNm:steeringRack.wheelFeelNm,
    casterDeg:P.steerCasterDeg,mechanicalTrailMm:effectiveMechanicalTrail()*1000});
}
function resetTrainingAndTrace(){
  trainer.scores.length=0;trainer.pending=null;trainer.neutralFrom=0;trainer.neutralAt=-99;trainer.clutchPressAt=-99;
  trainer.blocked=0;trainer.stalls=0;trainer.tip='';trainer.lastClutch=0;
  telemetry.running=false;telemetry.clock=0;telemetry.start=state.time;telemetry.elapsed=0;
  telemetry.vehicleId=vehicleId;telemetry.startedOn='';replay.playing=false;replay.time=0;replay.imported=null;
  $('replay-notice').textContent='';
  telemetry.samples.length=0;telemetry.events.length=0;
}
function csvEscape(value){
  const s=String(value??'');return /[,"\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
function buildCSV(){
  const cols=['row_type','time_s','gear','rpm','speed_kmh','clutch_pct','throttle_pct','brake_pct','drive_slip_pct','free_slip_pct','accel_ms2','shaft_nm','surface','tcs','abs','event_type','detail'];
  const lines=[cols.join(',')],rows=[];
  for(const row of telemetry.samples)rows.push({t:row.time,type:'sample',v:[row.gear,row.rpm.toFixed(1),row.kmh.toFixed(2),(row.clutch*100).toFixed(1),
    (row.throttle*100).toFixed(1),(row.brake*100).toFixed(1),(row.driveSlip*100).toFixed(2),(row.coastSlip*100).toFixed(2),row.accel.toFixed(3),
    row.shaftTorque.toFixed(2),row.surface,Number(row.tcs),Number(row.abs),'','']});
  for(const row of telemetry.events)rows.push({t:row.time,type:'event',v:[...Array(13).fill(''),row.kind,row.message]});
  rows.sort((a,b)=>a.t-b.t);
  for(const row of rows)lines.push([row.type,row.t.toFixed(3),...row.v].map(csvEscape).join(','));
  return '\ufeff'+lines.join('\r\n')+'\r\n';
}
function updateTrainingUI(){
  const avg=trainer.scores.length?Math.round(trainer.scores.reduce((v,a)=>v+a.score,0)/trainer.scores.length):null;
  $('score-latest').textContent=trainer.scores[0]?.score??'--';
  $('score-average').textContent=avg??'--';$('score-count').textContent=String(trainer.scores.length);
  $('score-faults').textContent=String(trainer.blocked+trainer.stalls);
  $('score-group-value').textContent=trainer.scores.length?'最近 '+trainer.scores[0].score+' 分 · 共 '+trainer.scores.length+' 次':trainer.blocked+trainer.stalls?'未評分 · 阻擋 '+(trainer.blocked+trainer.stalls)+' 次':'尚未評分';
  $('coach-status').textContent=trainer.tip||'換檔訓練待命';
  const last=trainer.scores[0];
  $('shift-total-time').textContent=last?last.totalTime.toFixed(2)+' s':'-- s';
  $('shift-neutral-time').textContent=last?last.neutralTime.toFixed(2)+' s':'-- s';
  $('shift-sync-time').textContent=last?last.duration.toFixed(2)+' s':'-- s';
  $('shift-bite-time').textContent=last?last.biteTime.toFixed(2)+' s':'-- s';
  const li=trainer.scores.slice(0,6).map(entry=>{
    const row=document.createElement('li'),text=document.createElement('span'),number=document.createElement('strong');
    text.textContent=`${gearLabel(entry.from)} → ${gearLabel(entry.to)} ${entry.downshift?(entry.blipped?'· 已補油':'· 無明顯補油'):''} · 咬合差 ${entry.signedError>0?'+':''}${entry.signedError} RPM · 入檔 ${entry.duration}s · 全程 ${entry.totalTime}s · 頓挫 ${entry.jerk} m/s³`;
    number.textContent=entry.score+'/100';row.append(text,number);return row;
  });
  if(li.length)$('training-history').replaceChildren(...li);
  else $('training-history').textContent='完成換檔且重新接合離合器後顯示評分。';
  revGuidance();
  $('record-status').textContent=telemetry.running?'● 錄製中 '+telemetry.elapsed.toFixed(1)+'s':'錄製停止 · '+telemetry.elapsed.toFixed(1)+'s';
  $('record-status').classList.toggle('rec-on',telemetry.running);
  $('record-count').textContent=telemetry.samples.length+' 筆';
  $('record-toggle').textContent=telemetry.running?'■ 停止記錄':'● 開始記錄';
  $('record-download').disabled=!telemetry.samples.length&&!telemetry.events.length;
  const pads=availablePads(),pedal=deviceFor(controller.profile.pedalDevice,pads);
  for(const name of PEDAL_NAMES){
    const obj=controller.lastHardware[name];
    const raw=obj?.raw;const value=obj?.value;
    $('gp-'+name+'-raw').textContent='RAW '+(raw===null||raw===undefined?'--':raw.toFixed(3))+' | OUT '+(value===null||value===undefined?'--':Math.round(value*100)+'%');
    $('gp-'+name+'-meter').style.width=(value===null||value===undefined?0:Math.round(value*100))+'%';
  }
}


// V0.6 visual-only telemetry replay. The player NEVER rewrites live vehicle state.
// Samples are recorded at 20 Hz. Interpolation is for presentation only, not a
// deterministic restoration of 120 Hz physics state.
const replay={playing:false,time:0,rate:1,imported:null};
function replaySource(){return replay.imported||telemetry;}
function replayDuration(){
  const samples=replaySource().samples;return samples.length?samples[samples.length-1].time:0;
}
function replayStep(dt){
  if(!replay.playing)return;
  if(telemetry.running||!replaySource().samples.length){replay.playing=false;return;}
  replay.time=Math.min(replayDuration(),replay.time+Math.max(0,dt)*replay.rate);
  if(replay.time>=replayDuration())replay.playing=false;
}
function replaySnapshot(time){
  const rows=replaySource().samples;if(!rows.length)return null;
  const t=clamp(time,rows[0].time,rows[rows.length-1].time);
  let lo=0,hi=rows.length-1;
  while(lo<hi){const mid=(lo+hi+1)>>1;if(rows[mid].time<=t)lo=mid;else hi=mid-1;}
  const a=rows[lo],b=rows[Math.min(lo+1,rows.length-1)];
  const alpha=b.time>a.time?clamp((t-a.time)/(b.time-a.time),0,1):0;
  const blend=k=>a[k]+(b[k]-a[k])*alpha;
  return {time:t,gear:a.gear,rpm:blend('rpm'),kmh:blend('kmh'),
    clutch:blend('clutch'),throttle:blend('throttle'),brake:blend('brake'),
    driveSlip:blend('driveSlip'),accel:blend('accel'),surface:a.surface,
    wheelAngleDeg:(a.wheelAngleDeg||0)+((b.wheelAngleDeg||0)-(a.wheelAngleDeg||0))*alpha,
    yawRate:(a.yawRate||0)+((b.yawRate||0)-(a.yawRate||0))*alpha,
    lateralG:(a.lateralG||0)+((b.lateralG||0)-(a.lateralG||0))*alpha,
    rollDeg:(a.rollDeg||0)+((b.rollDeg||0)-(a.rollDeg||0))*alpha,
    roadOffset:(a.roadOffset||0)+((b.roadOffset||0)-(a.roadOffset||0))*alpha,
    heaveMm:(a.heaveMm||0)+((b.heaveMm||0)-(a.heaveMm||0))*alpha,
    averageTreadC:(a.treadTempC||[35,35,35,35]).reduce((s,v)=>s+v,0)/4+
      (((b.treadTempC||[35,35,35,35]).reduce((s,v)=>s+v,0)-
      (a.treadTempC||[35,35,35,35]).reduce((s,v)=>s+v,0))/4)*alpha,
    averagePressureKpa:(a.pressureKpa||[220,220,220,220]).reduce((s,v)=>s+v,0)/4+
      (((b.pressureKpa||[220,220,220,220]).reduce((s,v)=>s+v,0)-
      (a.pressureKpa||[220,220,220,220]).reduce((s,v)=>s+v,0))/4)*alpha,
    contacts:(a.wheelContacts||[true,true,true,true]).filter(Boolean).length};
}
function formatClock(seconds){
  const cent=Math.round(Math.max(0,seconds)*100);
  return String(Math.floor(cent/6000)).padStart(2,'0')+':'+String(Math.floor(cent/100)%60).padStart(2,'0')+'.'+String(cent%100).padStart(2,'0');
}
function buildReplaySession(){
  if(replay.imported)return replay.imported;
  const scores=trainer.scores.filter(item=>item.time>=telemetry.start&&item.time<=telemetry.start+telemetry.elapsed)
    .map(item=>({...item,time:item.time-telemetry.start}));
  return {schema:'shiftlab.session.v1',version:1,vehicleId:telemetry.vehicleId,
    startedOn:telemetry.startedOn,sampleHz:20,playbackMode:'telemetry-only',
    samples:telemetry.samples,events:telemetry.events,scores};
}
function buildReplayJSON(){return JSON.stringify(buildReplaySession(),null,0);}
function validNumber(n,min,max){return typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;}
function validateReplay(input){
  if(!input||input.schema!=='shiftlab.session.v1'||input.version!==1)throw new Error('不支援的回放格式或版本');
  if(!Array.isArray(input.samples)||input.samples.length<1||input.samples.length>18000)throw new Error('樣本數量不正確');
  if(!Array.isArray(input.events)||input.events.length>600)throw new Error('事件數量不正確');
  if(input.scores!==undefined&&(!Array.isArray(input.scores)||input.scores.length>80))throw new Error('評分資料不正確');
  const id=String(input.vehicleId||'standard');
  if(!VEHICLES[id])throw new Error('未知的車型設定');
  let prev=-1;
  const samples=input.samples.map(sample=>{
    if(!sample||typeof sample!=='object')throw new Error('無效樣本');
    const fields={time:[0,900],rpm:[0,15000],kmh:[-300,400],clutch:[0,1],throttle:[0,1],
      brake:[0,1],driveSlip:[-5,5],coastSlip:[-5,5],accel:[-100,100],shaftTorque:[-20000,20000]};
    for(const [k,[min,max]] of Object.entries(fields))if(!validNumber(sample[k],min,max))throw new Error('樣本 '+k+' 不合法');
    if(sample.time<prev)throw new Error('樣本時間必須遞增');prev=sample.time;
    if(!Number.isInteger(sample.gear)||sample.gear< -1||sample.gear>6)throw new Error('檔位不正確');
    if(!Object.hasOwn(P.surfaces,sample.surface))throw new Error('路面不正確');
    const optional={steer:[-1,1],wheelAngleDeg:[-45,45],yawRate:[-3,3],lateralG:[-5,5],
      rollDeg:[-30,30],pitchDeg:[-20,20],heaveMm:[-500,500],
      roadOffset:[-5000,5000],roadDistance:[0,100000000],steeringFeedbackNm:[-3000,3000],
      rackRateDegS:[-1000,1000],rackDriverTorqueNm:[-2000,2000],
      rackAssistTorqueNm:[-2000,2000],rackRoadTorqueNm:[-2000,2000],
      steeringWheelFeelNm:[-100,100],casterDeg:[0,15],mechanicalTrailMm:[0,120]};
    const extra={};
    for(const [name,[lo,hi]] of Object.entries(optional)){
      if(sample[name]!==undefined && !validNumber(sample[name],lo,hi))throw new Error('樣本 '+name+' 超出範圍');
      extra[name]=sample[name]??0;
    }
    if(sample.suspensionTravelMm!==undefined &&
       (!Array.isArray(sample.suspensionTravelMm)||sample.suspensionTravelMm.length!==4||
        !sample.suspensionTravelMm.every(n=>validNumber(n,-250,250))))throw new Error('懸吊行程資料錯誤');
    if(sample.wheelContacts!==undefined &&
       (!Array.isArray(sample.wheelContacts)||sample.wheelContacts.length!==4||
        !sample.wheelContacts.every(v=>typeof v==='boolean')))throw new Error('輪胎接觸資料錯誤');
    for(const name of ['camberDeg','toeDeg']){
      if(sample[name]!==undefined &&
         (!Array.isArray(sample[name])||sample[name].length!==4||
          !sample[name].every(n=>validNumber(n,-15,15))))throw new Error(name+' data invalid');
    }
    const tireArrays={treadTempC:[-30,230],carcassTempC:[-30,210],
      pressureKpa:[80,450],tireWearPct:[0,100],aligningMomentNm:[-2000,2000]};
    for(const [name,[lo,hi]] of Object.entries(tireArrays)){
      if(sample[name]!==undefined &&
         (!Array.isArray(sample[name])||sample[name].length!==4||
          !sample[name].every(n=>validNumber(n,lo,hi))))throw new Error(name+' data invalid');
    }
    return {time:sample.time,rpm:sample.rpm,kmh:sample.kmh,gear:sample.gear,
      clutch:sample.clutch,throttle:sample.throttle,brake:sample.brake,
      driveSlip:sample.driveSlip,coastSlip:sample.coastSlip,accel:sample.accel,shaftTorque:sample.shaftTorque,
      surface:sample.surface,tcs:!!sample.tcs,abs:!!sample.abs,
      grade:validNumber(sample.grade,-20,20)?sample.grade:0,engineOn:!!sample.engineOn,...extra,
      suspensionTravelMm:sample.suspensionTravelMm||[0,0,0,0],
      wheelContacts:sample.wheelContacts||[true,true,true,true],
      camberDeg:sample.camberDeg||[0,0,0,0],
      toeDeg:sample.toeDeg||[0,0,0,0],
      treadTempC:sample.treadTempC||[35,35,35,35],
      carcassTempC:sample.carcassTempC||[35,35,35,35],
      pressureKpa:sample.pressureKpa||[220,220,220,220],
      tireWearPct:sample.tireWearPct||[0,0,0,0],
      aligningMomentNm:sample.aligningMomentNm||[0,0,0,0]};
  });
  const duration=samples.at(-1).time;
  const events=input.events.map(evt=>{
    if(!evt||!validNumber(evt.time,0,900)||typeof evt.kind!=='string'||typeof evt.message!=='string')throw new Error('事件格式錯誤');
    return {time:Math.min(duration,evt.time),kind:evt.kind.slice(0,36),message:evt.message.slice(0,180)};
  }).sort((a,b)=>a.time-b.time);
  const scores=(input.scores||[]).filter(item=>item&&validNumber(item.time,0,900)&&validNumber(item.score,0,100))
    .map(item=>({time:item.time,from:Number(item.from)||0,to:Number(item.to)||0,score:item.score}));
  return {schema:'shiftlab.session.v1',version:1,vehicleId:id,
    startedOn:typeof input.startedOn==='string'?input.startedOn.slice(0,50):'',sampleHz:20,
    playbackMode:'telemetry-only',samples,events,scores};
}
const replayChartCache={rows:null,length:-1,upperSpeed:80};
function drawReplayChart(){
  const canvas=$('replay-chart'),ctx=canvas.getContext('2d'),rows=replaySource().samples;
  const r=canvas.getBoundingClientRect(),width=Math.max(150,r.width||720),height=Math.max(120,r.height||170);
  const scale=Math.min(window.devicePixelRatio||1,2);
  const dw=Math.round(width*scale),dh=Math.round(height*scale);
  if(canvas.width!==dw||canvas.height!==dh){canvas.width=dw;canvas.height=dh;}
  ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,width,height);
  ctx.fillStyle='#0b1826';ctx.fillRect(0,0,width,height);
  const x0=42,x1=width-12,y0=16,y1=height-26,span=Math.max(.05,replayDuration());
  ctx.font='10px Consolas,monospace';ctx.textBaseline='middle';
  for(let i=0;i<=4;i++){
    const y=y0+(y1-y0)*i/4;ctx.strokeStyle='#284054';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x1,y);ctx.stroke();
    ctx.fillStyle='#819ab0';ctx.textAlign='right';ctx.fillText((4-i)*25+'%',x0-6,y);
  }
  if(!rows.length){ctx.fillStyle='#90a8b9';ctx.textAlign='center';ctx.fillText('先錄製一段駕駛操作，才能觀看曲線',width/2,height/2);return;}
  const vehicle=VEHICLES[replaySource().vehicleId]||VEHICLES.standard;
  const upperRPM=(vehicle.params.redlineRPM||BASE_PHYSICS.redlineRPM)*1.15;
  if(replayChartCache.rows!==rows||replayChartCache.length!==rows.length){
    let maxSpeed=80;for(const row of rows)maxSpeed=Math.max(maxSpeed,Math.abs(row.kmh));
    replayChartCache.rows=rows;replayChartCache.length=rows.length;
    replayChartCache.upperSpeed=Math.ceil(maxSpeed/20)*20;
  }
  const upperSpeed=replayChartCache.upperSpeed;
  function line(field,upper,color){
    ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=1.7;
    const step=Math.max(1,Math.floor(rows.length/Math.max(width*1.2,200)));
    for(let i=0;i<rows.length;i+=step){const row=rows[i];
      const x=x0+(x1-x0)*row.time/span,y=y1-clamp(Math.abs(row[field])/upper,0,1)*(y1-y0);
      if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    const last=rows.at(-1);ctx.lineTo(x0+(x1-x0)*last.time/span,y1-clamp(Math.abs(last[field])/upper,0,1)*(y1-y0));ctx.stroke();
  }
  line('rpm',upperRPM,'#77f0c4');line('kmh',upperSpeed,'#80bafa');
  const evts=replaySource().events||[];
  ctx.strokeStyle='#edc577aa';ctx.lineWidth=1;
  for(const evt of evts)if(['gear_engaged','stall','score'].includes(evt.kind)){
    const x=x0+(x1-x0)*evt.time/span;ctx.beginPath();ctx.moveTo(x,y0);ctx.lineTo(x,y1);ctx.stroke();
  }
  const playX=x0+(x1-x0)*replay.time/span;
  ctx.strokeStyle='#fff';ctx.lineWidth=1.7;ctx.beginPath();ctx.moveTo(playX,y0);ctx.lineTo(playX,y1);ctx.stroke();
  ctx.fillStyle='#77f0c4';ctx.textAlign='left';ctx.fillText('● RPM',x0,y1+13);
  ctx.fillStyle='#80bafa';ctx.fillText('● km/h',x0+62,y1+13);
  ctx.fillStyle='#e8d092';ctx.fillText('| SHIFT',x0+148,y1+13);
}
function updateReplayUI(){
  const source=replaySource(),duration=replayDuration(),has=source.samples.length>0;
  const ready=has&&!telemetry.running;
  $('replay-play').disabled=!ready;$('replay-export').disabled=!ready;
  $('replay-play').textContent=replay.playing?'Ⅱ 暫停':'▶ 播放';
  $('replay-seek').disabled=!ready;
  $('replay-seek').max=String(duration);$('replay-seek').value=String(clamp(replay.time,0,duration));
  $('replay-time').textContent=formatClock(replay.time)+' / '+formatClock(duration);
  $('replay-session').textContent=has?
    `${VEHICLES[source.vehicleId]?.short||'未知車型'} · ${source.samples.length} 筆 · ${replay.imported?'匯入紀錄':'本次紀錄'}`:'尚無回放資料';
  const frame=replaySnapshot(replay.time);
  if(frame){
    $('replay-rpm').textContent=Math.round(frame.rpm).toLocaleString('en-US');
    $('replay-speed').textContent=frame.kmh.toFixed(1);
    $('replay-gear').textContent=gearLabel(frame.gear);
    $('replay-pedals').textContent=[frame.clutch,frame.throttle,frame.brake].map(p=>Math.round(p*100)+'%').join(' / ');
    $('replay-steer').textContent=frame.wheelAngleDeg.toFixed(1)+'° / '+(frame.yawRate*180/Math.PI).toFixed(1)+'°/s';
    $('replay-body').textContent=frame.lateralG.toFixed(2)+'g / '+frame.rollDeg.toFixed(1)+'°';
    $('replay-suspension').textContent=Math.round(frame.heaveMm)+' mm / '+frame.contacts+'/4';
    $('replay-thermal').textContent=frame.averageTreadC.toFixed(1)+'°C / '+frame.averagePressureKpa.toFixed(0)+' kPa';
    const evts=source.events||[];
    let lo=0,hi=evts.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(evts[mid].time<=replay.time)lo=mid+1;else hi=mid;}
    $('replay-event').textContent=lo?('['+formatClock(evts[lo-1].time)+'] '+evts[lo-1].message):'尚未發生換檔事件 · 可拖曳時間軸分析';
  }else{
    $('replay-rpm').textContent='--';$('replay-speed').textContent='--';
    $('replay-gear').textContent='N';$('replay-pedals').textContent='-- / -- / --';
    $('replay-steer').textContent='-- / --';$('replay-body').textContent='-- / --';$('replay-suspension').textContent='-- / --';$('replay-thermal').textContent='-- / --';
    $('replay-event').textContent='錄製完成後可播放或匯出 JSON；回放不會控制目前車輛。';
  }
  drawReplayChart();
}

function initialReset(){
  resetFourWheels();resetHandlingDynamics();$('diff-select').value='open';$('split-mu-select').value='same';
  Object.assign(state,{engineOn:false,ignitionOn:false,engineOmega:0,inputOmega:0,velocity:0,
    shaftOmega:0,shaftTwist:0,drivenWheelOmega:0,coastWheelOmega:0,
    driveSlip:0,coastSlip:0,tireForceDrive:0,tireForceCoast:0,shaftTorque:0,
    tractionLimit:0,tireTemp:35,tcsCut:0,absMod:1,absPressureDrive:1,absPressureCoast:1,wheelSpinTime:0,wheelLockTime:0,
    surface:'dry',tcsEnabled:false,absEnabled:false,
    gear:0,pendingGear:null,syncRemaining:0,syncStartedAt:0,syncDeltaRPM:0,syncTorque:0,syncWear:0,
    shiftState:'NEUTRAL',clutchLocked:false,clutch:0,throttle:0,brake:0,grade:0,
    heat:P.temperatureAir,wear:0,damage:0,clutchTorque:0,driveForce:0,accel:0,jerk:0,
    stalled:false,time:0,shiftAttempts:0,lastEvent:''});
  route.distance=0;resetVehiclePose(0);route.gradeMode='route';route.sliderSeen=0;$('grade-mode').value='route';
  $('steer-slider').value=0;releaseKeyboardOverride();resetAdvancedGamepad();steeringSettings.assist=false;steeringSettings.cameraMode='dynamic';$('lane-assist').checked=false;$('camera-mode').value='dynamic';
  keys.clear();['clutch','throttle','brake','grade'].forEach(p=>{$(p+'-slider').value='0';});
  $('surface-select').value='dry';$('tcs-enabled').checked=false;$('abs-enabled').checked=false;
  gateHand.active=false;gateHand.x=170;gateHand.y=139;gateHand.neutralX=170;gateHand.phase='rail';
  resetTrainingAndTrace();clearHardwareShift();
  history.length=0;hideShiftFailure();log('已重置。空檔按 I 啟動引擎。');
}
function dumpClutch(){
  // Unlike controlled pedal release, this deliberately drops the clutch in one step.
  keys.delete('shift');$('clutch-slider').value='0';state.clutch=0;
  log('離合器已快速彈放：可能造成熄火、頓挫或車輪打滑。','warn');
}
function startEngine(){
  if(state.engineOn){log('引擎已在運轉中。');return;}
  if(state.damage>.98){log('引擎已嚴重損壞，請重置模擬器。','error');return;}
  if(state.gear!==0 && state.clutch<.85){log('啟動受阻：請切空檔或將離合器踩到底。','warn');return;}
  state.ignitionOn=true;state.engineOn=true;state.stalled=false;
  state.engineOmega=rpmToRad(1040);recordEvent('engine_start','引擎啟動');log('引擎啟動成功。保持空檔，準備踩離合器。');
}
function requestGear(g){
  if(!(String(g) in P.ratios))return false;
  if(g===0){
    const oldGear=state.gear;const had=oldGear!==0 || state.pendingGear!==null;
    state.gear=0;state.pendingGear=null;state.syncRemaining=0;state.syncTorque=0;
    state.shiftState='NEUTRAL';state.clutchLocked=false;
    if(had){shiftNeutral(oldGear);log('已回空檔：引擎與車輪脫離齒輪傳動。');}
    return true;
  }
  if(state.pendingGear!==null){shiftReject('同步器忙碌');log('同步器仍在對速，請完成或回空檔。','warn');return false;}
  if(g===state.gear)return true;
  if(g===-1 && Math.abs(state.velocity)>.28){shiftReject('移動中倒檔鎖定');log('倒檔鎖定：必須幾乎完全停車。','error');soundGrind();return false;}
  const ratio=P.ratios[g]*P.finalDrive;
  const targetInput=state.shaftOmega*ratio;
  const deltaRPM=Math.abs(radToRPM(state.inputOmega-targetInput));
  const fullyPressed=state.clutch>=.78;
  const clutchlessAllowed=!$('strict').checked && state.gear===0 && state.throttle<.06 && deltaRPM<75;
  if(!fullyPressed&&!clutchlessAllowed){
    state.wear=clamp(state.wear+.0005,0,1);state.syncWear=clamp(state.syncWear+.00025,0,1);
    state.shiftState='BLOCKED';shiftReject('離合器未充分分離');
    log('換入 '+gearLabel(g)+' 檔受阻：離合器未充分分離，請先踩到底。','error');soundGrind();
    return false;
  }
  if(g===-1 && Math.abs(radToRPM(state.inputOmega))>230){
    state.shiftState='BLOCKED';shiftReject('倒檔輸入軸尚未停止');
    log('倒車齒輪仍在旋轉：踩住離合器稍候再掛 R。','warn');soundGrind();return false;
  }
  const from=state.gear;
  if(state.gear!==0){state.gear=0;state.clutchLocked=false;log('排入空檔：同步器開始對速。');}
  shiftRequested(g,from);
  state.pendingGear=g;state.shiftState='SYNCHRONIZING';state.syncRemaining=P.synchroMinTime;
  state.syncStartedAt=state.time;state.shiftAttempts++;
  state.syncDeltaRPM=deltaRPM;
  return true;
}
function torqueAt(rpm){
  const map=P.torqueMap;
  for(let i=1;i<map.length;i++)if(rpm<map[i][0]){
    const p=map[i-1],n=map[i],t=(rpm-p[0])/(n[0]-p[0]);return p[1]+(n[1]-p[1])*t;
  }
  return map[map.length-1][1];
}
const moveToward=(value,target,maxDelta)=>value<target?Math.min(value+maxDelta,target):Math.max(value-maxDelta,target);
function controlStep(dt){
  const slider=Number($('grade-slider').value);
  // Preserve the V0.6 manual-grade interface even for scripts that assign .value directly.
  if(route.gradeMode==='route' && slider!==route.sliderSeen){route.gradeMode='manual';$('grade-mode').value='manual';}
  route.sliderSeen=slider;
  state.grade=route.gradeMode==='route'?roadPointAt(route.distance).grade:slider;
  state.surface=$('surface-select').value;
  state.tcsEnabled=$('tcs-enabled').checked;
  state.absEnabled=$('abs-enabled').checked;
  pollController();
  const targets={
    clutch:keys.has('shift')?1:(hostControls.active&&hostControls.clutch!==null?
      clamp(hostControls.clutch,0,1):controllerTarget('clutch',+$('clutch-slider').value/100)),
    throttle:keys.has('w')?1:(hostControls.active&&hostControls.throttle!==null?
      clamp(hostControls.throttle,0,1):controllerTarget('throttle',+$('throttle-slider').value/100)),
    brake:keys.has('s')?1:(hostControls.active&&hostControls.brake!==null?
      clamp(hostControls.brake,0,1):controllerTarget('brake',+$('brake-slider').value/100))
  };
  // A foot can depress the clutch faster than it can smoothly release it.
  state.clutch=moveToward(state.clutch,targets.clutch,dt*(targets.clutch>state.clutch?9:1.6));
  state.throttle=moveToward(state.throttle,targets.throttle,dt*(targets.throttle>state.throttle?3.4:4));
  state.brake=moveToward(state.brake,targets.brake,dt*6);
  steeringControlStep(dt);
}
function driveRatio(gear){return (P.ratios[gear]||0)*P.finalDrive/P.wheelRadius;}
function smooth01(x){const t=clamp(x,0,1);return t*t*(3-2*t);}
function clutchEngagement(depressed){
  if(depressed>=P.clutchOpenAt)return 0;
  if(depressed>P.clutchBiteAt)return P.clutchBiteTorque*smooth01((P.clutchOpenAt-depressed)/(P.clutchOpenAt-P.clutchBiteAt));
  if(depressed<=P.clutchFullAt)return 1;
  return P.clutchBiteTorque+(1-P.clutchBiteTorque)*smooth01((P.clutchBiteAt-depressed)/(P.clutchBiteAt-P.clutchFullAt));
}
function torqueCapacity(){
  // The clutch plate is open above 82% pedal travel. Engagement rises nonlinearly.
  const engagement=clutchEngagement(state.clutch);
  const thermalFade=clamp(1-Math.max(0,state.heat-225)/340,.38,1);
  return P.clutchMaxTorque*engagement*thermalFade*(1-.60*state.wear);
}
function engineNetTorque(rpm){
  const fuelLimit=clamp((P.redlineRPM+650-rpm)/650,0,1);
  const combustion=state.engineOn?state.throttle*(1-state.tcsCut)*torqueAt(rpm)*fuelLimit*(1-state.damage*.75):0;
  const idle=state.engineOn?clamp(23+.26*(P.idleRPM-rpm),0,92)*(1-clamp(state.throttle/.36,0,1)):0;
  const friction=state.engineOmega>0?11+Math.max(0,rpm)*.014:0;
  return combustion+idle-friction;
}
function resistForce(v){
  const aero=P.aeroFactor*v*Math.abs(v);
  const rolling=P.rollingCoeff*P.mass*9.81*Math.tanh(v/.28);
  const grade=P.mass*9.81*Math.sin(Math.atan(state.grade/100));
  return -(aero+rolling+grade);
}
function applyBrake(freeForce,v){
  const available=P.maxBrakeForce*state.brake;
  if(available===0)return 0;
  if(Math.abs(v)<.12 && Math.abs(freeForce)<available)return -freeForce;
  const direction=Math.abs(v)>.08?Math.sign(v):Math.sign(freeForce);
  return -direction*available;
}
// V1.1 four-corner planar double-track model.
// Local convention: X right, Z forward; positive yaw turns right.
// +Fy is rightwards, +Fx is forward in each wheel's heading.
// Four distinct wheel angular states; one FWD front differential connected to
// the existing clutch / gearbox / shaft. V1.1 couples the four normal loads to independent unsprung suspension states.
const WHEEL_IDS=['FL','FR','RL','RR'];
// Default steering stays driver-commanded; the self-aligning compliance is opt-in.
const TIRE_COMPOUNDS=Object.freeze({
  road:{optimum:73,width:35,peakGain:.075,hotFade:.0024,wearFactor:1},
  sport:{optimum:87,width:29,peakGain:.12,hotFade:.0029,wearFactor:1.25},
  endurance:{optimum:78,width:41,peakGain:.065,hotFade:.0016,wearFactor:.60}
});
const tireSystem={compound:'road',ambientC:25,coldPressureKpa:220,
  referenceTempC:35,steerCompliance:false,feedbackNm:0,instantFeedbackNm:0};
function setTireSetting(field,value){
  if(field==='compound'){
    if(!Object.hasOwn(TIRE_COMPOUNDS,value))return false;
    tireSystem.compound=value;
    $('tire-compound').value=value;return true;
  }
  if(field==='ambientC'){
    if(![10,25,40].includes(Number(value)))return false;
    tireSystem.ambientC=Number(value);$('tire-ambient').value=String(value);return true;
  }
  if(field==='coldPressureKpa'){
    if(![195,220,245].includes(Number(value)))return false;
    tireSystem.coldPressureKpa=Number(value);$('tire-cold-pressure').value=String(value);return true;
  }
  if(field==='steerCompliance'){
    tireSystem.steerCompliance=Boolean(value);
    $('tire-steer-compliance').checked=tireSystem.steerCompliance;return true;
  }
  return false;
}
function tirePressureKpa(carcassTemp){
  const kelvin=Math.max(180,carcassTemp+273.15);
  const coldKelvin=tireSystem.referenceTempC+273.15;
  return clamp((tireSystem.coldPressureKpa+101.325)*kelvin/coldKelvin-101.325,100,420);
}
function tireGripFactor(temp,pressure,wear=0){
  const model=TIRE_COMPOUNDS[tireSystem.compound];
  const bell=t=>Math.exp(-Math.pow((t-model.optimum)/model.width,2));
  // Normalize to 35 C on the baseline road compound for V1.4 compatibility.
  const thermal=1+model.peakGain*(bell(temp)-bell(35))-
    model.hotFade*Math.max(0,temp-105)-.0007*Math.max(0,20-temp);
  const pressureFactor=1-.32*Math.pow((pressure-220)/100,2);
  return clamp(thermal*clamp(pressureFactor,.75,1)*
    (1-.24*clamp(wear,0,1)),.57,1.13);
}
// A lumped two-node tire; heating from contact-patch slip work and cooling
// to the environment. This is NOT a full tread-depth or carcass FE model.
function tireThermalStep(w,h){
  const slipSpeed=w.omega*P.wheelRadius-w.vx;
  const slipWork=Math.abs(w.fx*slipSpeed)+Math.abs(w.fy*w.vy);
  const rollingWork=Math.max(0,w.normal)*Math.abs(w.vx)*.008;
  const heat=clamp(slipWork+rollingWork,0,55000);
  const transfer=(w.treadTemp-w.carcassTemp)*P.tireTreadCarcassConductance;
  const cooling=(w.treadTemp-tireSystem.ambientC)*
    (P.tireCoolingBase+P.tireCoolingSpeed*Math.abs(w.vx));
  w.treadTemp=clamp(w.treadTemp+(heat-transfer-cooling)*h/P.tireTreadHeatCapacity,-15,215);
  const carcassLoss=(w.carcassTemp-tireSystem.ambientC)*3.6;
  w.carcassTemp=clamp(w.carcassTemp+(transfer-carcassLoss)*h/P.tireCarcassHeatCapacity,-15,195);
  w.tireWear=clamp(w.tireWear+slipWork*h/
    P.tireWearEnergy*TIRE_COMPOUNDS[tireSystem.compound].wearFactor,0,1);
  w.pressureKpa=tirePressureKpa(w.carcassTemp);
  w.gripFactor=tireGripFactor(w.treadTemp,w.pressureKpa,w.tireWear);
  w.heatPower=heat;
  // V1.4 telemetry compatibility.
  w.temperature=w.treadTemp;
}

const suspension={road:'smooth',intensity:.50,bodyMass:0,contacts:4,
  maxTravel:0,initialized:false,enabled:true,oscillation:0};
const wheelModel={FL:{},FR:{},RL:{},RR:{},drive:'FWD',differential:'open',splitMu:'same'};
// Calibration panel does not bypass physical tire/vehicle integration.
const handling={balance:'neutral',feel:'balanced',escEnabled:false,yawReference:0,yawError:0,
  beta:0,phase:'中性',escWheel:'',escDemand:0,escTarget:0,
  escBrakeNm:0,escTrimSide:'',escTrim:0,activeTime:0};
const HANDLING_FEELS=Object.freeze({
  balanced:{latBonus:.085,longBonus:.045},
  sport:{latBonus:.035,longBonus:.015},
  raw:{latBonus:0,longBonus:0}
});
function setHandlingFeel(name){
  if(!Object.hasOwn(HANDLING_FEELS,name))return false;
  handling.feel=name;
  const select=document.getElementById('handling-feel');if(select)select.value=name;
  return true;
}
function effectiveTireSlideRetention(axis){
  const current=axis==='long'?P.tireLongSlideRetention:P.tireLatSlideRetention;
  const extra=HANDLING_FEELS[handling.feel][axis==='long'?'longBonus':'latBonus'];
  // Never increase the coefficient of adhesion / peak available tire force.
  return clamp(current+extra,0,.97);
}
const HANDLING_BALANCES=Object.freeze({
  neutral:{front:1,rear:1},
  understeer:{front:.88,rear:1.05},
  oversteer:{front:1.06,rear:.87}
});
function setHandlingBalance(name){
  if(!HANDLING_BALANCES[name])return false;
  handling.balance=name;
  P.frontGripScale=HANDLING_BALANCES[name].front;
  P.rearGripScale=HANDLING_BALANCES[name].rear;
  const select=document.getElementById('handling-balance');if(select)select.value=name;
  return true;
}
function setBrakeBias(value){
  const numeric=Number(value);
  if(!Number.isFinite(numeric)||numeric<.55||numeric>.80)return false;
  P.frontBrakeBias=numeric;
  const select=document.getElementById('handling-brake-bias');
  if(select && [...select.options].some(option=>Number(option.value)===numeric))select.value=String(value);
  return true;
}
function setESCEnabled(value){
  handling.escEnabled=!!value;
  if(!handling.escEnabled){handling.escWheel='';handling.escDemand=0;handling.escTarget=0;
    handling.escBrakeNm=0;handling.escTrimSide='';handling.escTrim=0;}
  const select=document.getElementById('handling-esc');
  if(select)select.value=handling.escEnabled?'on':'off';
  return handling.escEnabled;
}
function resetHandlingDynamics(){
  Object.assign(handling,{yawReference:0,yawError:0,beta:0,phase:'中性',escWheel:'',escDemand:0,escTarget:0,
    escBrakeNm:0,escTrimSide:'',escTrim:0,activeTime:0});
}
// Bicycle steady-state reference (NOT an imposed yaw), capped by tire friction.
// delta = L*r/u + m*(wf/Cf-wr/Cr)*u*r; u may be negative in reverse.
function steadyYawReference(speed,steer,friction){
  const speedAbs=Math.abs(speed);
  if(speedAbs<2)return 0;
  const cf=Math.max(1000,P.cornerStiffFront*P.frontGripScale);
  const cr=Math.max(1000,P.cornerStiffRear*P.rearGripScale);
  const kus=P.mass*(P.frontStaticLoad/cf-(1-P.frontStaticLoad)/cr);
  const denominator=Math.max(P.wheelbase*.58,P.wheelbase+kus*speed*speed);
  const geometric=speed*Math.tan(steer)/denominator;
  const cap=Math.max(0.005,Math.max(0,friction)*9.81/Math.max(2,speedAbs));
  return clamp(geometric,-cap,cap);
}
function updateHandlingControl(h){
  const m=vehicleMotion,speed=state.velocity,mu=P.surfaces[state.surface].mu;
  handling.yawReference=steadyYawReference(speed,m.steerAngle,mu);
  handling.yawError=handling.yawReference-m.yawRate;
  handling.beta=Math.atan2(m.lateralVelocity,Math.max(2,Math.abs(speed)));
  const desired=handling.yawReference,actual=m.yawRate;
  const threshold=Math.max(.065,Math.abs(desired)*.25);
  const signedError=Math.sign(desired)*(actual-desired);
  handling.phase=Math.abs(desired)<.05?
    (Math.abs(actual)>threshold?'偏航偏離':'中性'):
    signedError>threshold?'轉向過度':signedError<-threshold?'轉向不足':'中性';
  let wheel='',target=0;
  if(handling.escEnabled && speed>P.escMinSpeed && suspension.contacts>=3 &&
      Math.abs(handling.yawError)>threshold && Math.abs(m.offset)<7.5 &&
      m.contactCooldown<=0){
    // Correct even with centered steering: split-mu braking generates yaw
    // although the driver's desired yaw is zero. Never force-set yawRate.
    const needPositive=handling.yawError>0;
    const under=Math.abs(desired)>.05 &&
      Math.sign(handling.yawError)===Math.sign(desired);
    wheel=(under?'R':'F')+(needPositive?'R':'L');
    // The actuated wheel must have grip or the controller has no authority.
    const available=wheelModel[wheel]?.mu??mu;
    const authority=clamp(available/.30,0,1);
    target=clamp((Math.abs(handling.yawError)-threshold)*P.escCorrectionGain,0,.85)*authority;
  }
  // Avoid pulse transfer between opposite wheels in one physics substep.
  if(wheel && handling.escWheel!==wheel)handling.escDemand=0;
  handling.escWheel=wheel;
  handling.escTarget=target;
  handling.escDemand=moveToward(handling.escDemand,target,h*(target>handling.escDemand?4:7));
  handling.escBrakeNm=P.escBrakeMaxNm*handling.escDemand;
  // Split-mu braking: braking only the low-grip wheel cannot undo yaw.
  // Reduce high-grip-side driver brake torque to avoid creating extra yaw;
  // this is a brake-balance intervention, not an artificial yaw impulse.
  let trimSide='',trimTarget=0;
  if(handling.escEnabled && speed>P.escMinSpeed && state.brake>.20 &&
    wheelModel.splitMu!=='same' && suspension.contacts>=3 &&
    Math.abs(handling.yawError)>threshold && Math.abs(desired)<.08){
    const candidate=handling.yawError<0?'R':'L';
    const highSide=wheelModel.splitMu.startsWith('left_')?'R':'L';
    if(candidate===highSide){
      trimSide=candidate;
      trimTarget=clamp((Math.abs(handling.yawError)-threshold)*1.6,0,.70);
    }
  }
  if(trimSide!==handling.escTrimSide)handling.escTrim=0;
  handling.escTrimSide=trimSide;
  handling.escTrim=moveToward(handling.escTrim,trimTarget,h*(trimTarget>handling.escTrim?4.2:7));
  if(handling.escBrakeNm>5 || handling.escTrim>.01)handling.activeTime+=h;
  return {wheel:handling.escWheel,torque:handling.escBrakeNm,yawReference:desired};
}
function wheelName(id){return id==='FL'?'左前':id==='FR'?'右前':id==='RL'?'左後':'右後';}
function resetFourWheels(){
  for(const id of WHEEL_IDS)Object.assign(wheelModel[id],{
    id,front:id[0]==='F',left:id[1]==='L',omega:0,slip:0,slipAngle:0,
    vx:0,vy:0,steer:0,fx:0,fy:0,fxBody:0,fyBody:0,
    normal:0,mu:0,capacity:0,usage:0,absPressure:1,brakeTorque:0,
    driveTorque:0,escBrakeTorque:0,temperature:35,
    treadTemp:35,carcassTemp:35,pressureKpa:tireSystem.coldPressureKpa,
    tireWear:0,gripFactor:1,heatPower:0,aligningMoment:0,pneumaticTrail:0,
    hubZ:0,hubV:0,springForce:0,staticSpring:0,staticNormal:0,
    roadHeight:0,roadSpeed:0,baseRoadHeight:0,lastRoadHeight:0,travel:0,contact:true,unsprung:0,
    bumpStop:0,camber:0,toe:0,camberThrust:0,baseSteer:0,
    pureFx:0,pureFy:0,combinedCapacity:0,slideSeverity:0,gripPhase:'黏著',criticalSlipAngle:0
  });
  wheelModel.differential='open';wheelModel.splitMu='same';
  tireSystem.feedbackNm=0;tireSystem.instantFeedbackNm=0;
  suspension.initialized=false;
}
resetFourWheels();
function gearGain(gear){return (P.ratios[gear]||0)*P.finalDrive;}
function contactSlip(omega,velocity){
  const treadSpeed=omega*P.wheelRadius;
  return (treadSpeed-velocity)/Math.max(2,Math.abs(velocity),Math.abs(treadSpeed));
}
// At parking speeds the algebraic slip ratio is ill-conditioned. Use a
// patch-speed denominator that approaches the V1.2 slip-velocity stiffness:
// linear Fiala slope 3 * Fpeak / (peakSlip * referenceSpeed).
// This keeps low-speed launches clutch-load-consistent without changing the
// slip definition used by ABS/TCS diagnostics or high-speed peak slip.
function regularizedTireSlip(omega,velocity){
  const treadSpeed=omega*P.wheelRadius;
  const reference=P.tireSlipVelocity*3/Math.max(.02,P.tirePeakLongSlip);
  return (treadSpeed-velocity)/Math.max(reference,Math.abs(velocity),Math.abs(treadSpeed));
}
// Fiala-inspired cubic adhesion branch with a C1-continuous slide tail.
// normalizedDemand=1 is the peak; beyond 1 force tends to the kinetic fraction.
// This is a low-parameter approximation, not a Magic Formula tire-data fit.
function peakSlipCurve(normalizedDemand,slideRetention,slideWidth){
  const a=Math.abs(normalizedDemand),sign=Math.sign(normalizedDemand);
  if(a<=1)return sign*(1-(1-a)**3);
  const tail=(a-1)/Math.max(.01,slideWidth);
  return sign*(slideRetention+(1-slideRetention)*Math.exp(-tail*tail));
}
function tireForce(omega,velocity,normal,mu){
  if(normal<=0||mu<=0)return 0;
  const slip=regularizedTireSlip(omega,velocity);
  const forceRatio=peakSlipCurve(slip/Math.max(.02,P.tirePeakLongSlip),
    effectiveTireSlideRetention('long'),P.tireLongSlideWidth);
  return mu*normal*forceRatio;
}
// Clamp the resultant, not each Cartesian component separately. In prolonged
// full sliding, the effective envelope contracts toward kinetic friction.
function combineTireForces(fx,fy,capacity,longExcess,latExcess){
  if(!(capacity>0))return {fx:0,fy:0,limit:0,severity:0};
  const longSeverity=roadSmooth(longExcess/Math.max(.01,P.tireLongSlideWidth));
  const latSeverity=roadSmooth(latExcess/Math.max(.01,P.tireLatSlideWidth));
  const limit=capacity*Math.min(
    1-(1-effectiveTireSlideRetention('long'))*longSeverity,
    1-(1-effectiveTireSlideRetention('lat'))*latSeverity);
  const mag=Math.hypot(fx,fy);
  const scale=mag>limit?limit/Math.max(1e-9,mag):1;
  return {fx:fx*scale,fy:fy*scale,limit,severity:Math.max(longSeverity,latSeverity)};
}
function brakeTorqueForAxle(omega,tireReaction,driveTorque,limit,modulation){
  const budget=limit*modulation;
  if(budget<=0)return {torque:0,modulation};
  const external=driveTorque-tireReaction;
  if(Math.abs(omega)<.13 && Math.abs(external)<budget)return {torque:external,modulation};
  return {torque:(Math.abs(omega)>.13?Math.sign(omega):Math.sign(external))*budget,modulation};
}
function updateABS(pressure,slip,velocity,h,brakingActive=state.brake>=.02){
  if(!state.absEnabled||!brakingActive||Math.abs(velocity)<2.8)return moveToward(pressure,1,h*5);
  const locking=-Math.sign(velocity)*slip;
  if(locking>.16)return moveToward(pressure,0,P.absPressureRelease*h);
  if(locking<.09)return moveToward(pressure,1,P.absPressureRise*h);
  return pressure;
}
// Preserve prior debug/automation hooks that seed the two legacy axle averages.
// Never use those averages as the physics source after synchronizing.
function importLegacyAxleSpeeds(){
  const front=(wheelModel.FL.omega+wheelModel.FR.omega)*.5;
  const rear=(wheelModel.RL.omega+wheelModel.RR.omega)*.5;
  if(Math.abs(front-state.drivenWheelOmega)>.5){
    const difference=state.drivenWheelOmega-front;
    wheelModel.FL.omega+=difference;wheelModel.FR.omega+=difference;
  }
  if(Math.abs(rear-state.coastWheelOmega)>.5){
    const difference=state.coastWheelOmega-rear;
    wheelModel.RL.omega+=difference;wheelModel.RR.omega+=difference;
  }
}
function exportLegacyAxleSpeeds(){
  state.drivenWheelOmega=(wheelModel.FL.omega+wheelModel.FR.omega)*.5;
  state.coastWheelOmega=(wheelModel.RL.omega+wheelModel.RR.omega)*.5;
}
// Independent vertical dynamics for each of the four contact patches.
// All displacements are perturbations about the statically loaded ride height.
// Body corner displacement = heave - x*roll - z*pitch (positive = up).
// Wheel hub displacement is a separate unsprung DOF. The road normal is
// calculated at the tire, NOT assigned by a single axle force split.
function wheelCoords(id){
  const front=id[0]==='F',left=id[1]==='L';
  return {x:(left?-1:1)*(front?P.trackFront:P.trackRear)*.5,
    z:front?P.wheelbase*(1-P.frontStaticLoad):-P.wheelbase*P.frontStaticLoad};
}
function suspensionRoadTexture(s,lateral){
  if(suspension.intensity<=0)return 0;
  // Use the map's hash, without advancing its generator RNG.
  const p=(route.seedHash||0)*.000021,side=lateral*1.23;
  const start=roadSmooth((s-18)/60);
  const amp=suspension.intensity;
  const broad=Math.sin(.68*s+p+side)*Math.sin(.24*s+p*.6-side*.6);
  if(suspension.road==='rough')return start*amp*(.025*broad+.012*Math.sin(2.2*s+side*1.7+p));
  if(suspension.road==='ripples')return start*amp*(.024*Math.sin(2*Math.PI*s/5.2+p)+.007*broad);
  if(suspension.road==='bumps'){
    const spacing=67,phase=((s+13)%spacing+spacing)%spacing;
    const t=clamp((phase-13)/3,0,1);
    return start*amp*(phase>=13&&phase<=16?.090*Math.sin(Math.PI*t)**2:0)+start*amp*.002*broad;
  }
  return start*amp*(.0035*broad+.0015*Math.sin(1.45*s+side+p));
}
function wheelRoadHeight(id){
  const m=vehicleMotion,pos=wheelCoords(id),angle=m.headingError;
  // First-order arc-length/lateral projection around the nearest road station.
  // This avoids the expensive full nearest-polyline search at every 480 Hz
  // substep while sampling the correct local grade, crown and superelevation.
  const c=Math.cos(angle),q=Math.sin(angle);
  const s=clamp(route.distance+pos.z*c-pos.x*q,0,roadTotalDistance());
  const side=m.offset+pos.x*c+pos.z*q;
  const sample=roadPointAt(s),center=roadPointAt(route.distance);
  const centerH=center.y+roadCrossElevation(center,clamp(m.offset,-6.2,6.2));
  const target=sample.y+roadCrossElevation(sample,clamp(side,-6.2,6.2));
  const tangent=center.grade*.01*pos.z+roadBankAt(center)*pos.x;
  return target-centerH-tangent+suspensionRoadTexture(s,side);
}
function resetSuspension(){
  const m=vehicleMotion;
  m.heave=0;m.heaveRate=0;m.heaveAccel=0;
  m.roll=0;m.rollRate=0;m.pitch=0;m.pitchRate=0;
  const g=9.81;
  let unsprungTotal=0;
  for(const id of WHEEL_IDS){
    const w=wheelModel[id];
    w.unsprung=w.front?P.unsprungFront:P.unsprungRear;
    unsprungTotal+=w.unsprung;
  }
  suspension.bodyMass=Math.max(P.mass*.55,P.mass-unsprungTotal);
  for(const id of WHEEL_IDS){
    const w=wheelModel[id];
    const normal=P.mass*g*(w.front?P.frontStaticLoad:1-P.frontStaticLoad)*.5;
    w.staticNormal=normal;
    w.staticSpring=normal-w.unsprung*g;
    w.hubZ=0;w.hubV=0;w.springForce=w.staticSpring;
    w.normal=normal;w.baseRoadHeight=wheelRoadHeight(id);
    w.roadHeight=0;w.lastRoadHeight=0;w.roadSpeed=0;
    w.travel=0;w.contact=true;w.bumpStop=0;
  }
  suspension.contacts=4;suspension.maxTravel=0;
  suspension.initialized=true;
}
function cornerSuspensionStep(h){
  if(!suspension.enabled)return null;
  if(!suspension.initialized)resetSuspension();
  const m=vehicleMotion,ms=suspension.bodyMass;
  let sprungNet=0,rollTorque=-ms*(P.cgHeight-P.rollCenterHeight)*m.lateralAccel;
  let pitchTorque=-ms*P.cgHeight*state.accel;
  let contacts=0,maxTravel=0;
  // One instant for all corners prevents iteration-order-dependent bar loads.
  const corners={};
  for(const id of WHEEL_IDS){
    const w=wheelModel[id],pos=wheelCoords(id);
    const zBody=m.heave-pos.x*m.roll-pos.z*m.pitch;
    const vBody=m.heaveRate-pos.x*m.rollRate-pos.z*m.pitchRate;
    corners[id]={pos,relative:w.hubZ-zBody,relativeV:w.hubV-vBody};
  }
  // Force couples are equal/opposite on each axle; an anti-roll bar cannot
  // create net vertical heave force in the symmetric linear operating range.
  const frontBar=P.antiRollFront*(corners.FL.relative-corners.FR.relative);
  const rearBar=P.antiRollRear*(corners.RL.relative-corners.RR.relative);
  const bar={FL:frontBar,FR:-frontBar,RL:rearBar,RR:-rearBar};
  for(const id of WHEEL_IDS){
    const w=wheelModel[id],{pos,relative,relativeV}=corners[id];
    const springK=w.front?P.springFront:P.springRear;
    const baseDamping=w.front?P.damperFront:P.damperRear;
    // Positive relative speed denotes suspension compression.
    const damperC=baseDamping*(relativeV>=0?
      P.compressionDampingFactor:P.reboundDampingFactor);
    const stop=relative>P.bumpTravel?P.bumpStopK*(relative-P.bumpTravel)**1.4:
      relative< -P.droopTravel?-P.bumpStopK*(-P.droopTravel-relative)**1.4:0;
    const deltaSpring=springK*relative+damperC*relativeV+stop+bar[id];
    const springForce=Math.max(0,w.staticSpring+deltaSpring);
    const springVariation=springForce-w.staticSpring;
    const road=wheelRoadHeight(id)-w.baseRoadHeight;
    const groundVelocity=clamp((road-w.lastRoadHeight)/h,-8,8);
    const tire=clamp(w.staticNormal+P.tireVerticalK*(road-w.hubZ)+
      P.tireVerticalC*(groundVelocity-w.hubV),0,w.staticNormal*4);
    w.normal=tire;w.contact=tire>1;
    if(w.contact)contacts++;
    w.roadHeight=road;w.roadSpeed=groundVelocity;
    w.lastRoadHeight=road;w.springForce=springForce;
    w.bumpStop=stop;
    w.hubV=clamp(w.hubV+((tire-w.staticNormal)-springVariation)*h/w.unsprung,-8,8);
    w.hubZ=clamp(w.hubZ+w.hubV*h,-.38,.38);
    w.travel=clamp(relative,-P.droopTravel,P.bumpTravel);
    maxTravel=Math.max(maxTravel,Math.abs(w.travel));
    sprungNet+=springVariation;
    rollTorque-=pos.x*springVariation;
    pitchTorque-=pos.z*springVariation;
  }
  m.heaveAccel=clamp(sprungNet/ms,-60,60);
  m.heaveRate=clamp(m.heaveRate+m.heaveAccel*h,-6,6);
  m.heave=clamp(m.heave+m.heaveRate*h,-.24,.24);
  const rollAccel=clamp(rollTorque/P.rollInertia,-45,45);
  const pitchAccel=clamp(pitchTorque/P.pitchInertia,-45,45);
  m.rollAngularAccel=rollAccel;m.pitchAngularAccel=pitchAccel;
  m.rollRate=clamp(m.rollRate+rollAccel*h,-2.8,2.8);
  m.pitchRate=clamp(m.pitchRate+pitchAccel*h,-2.8,2.8);
  m.roll=clamp(m.roll+m.rollRate*h,-.30,.30);
  m.pitch=clamp(m.pitch+m.pitchRate*h,-.30,.30);
  suspension.contacts=contacts;suspension.maxTravel=maxTravel;
  return WHEEL_IDS.map(id=>wheelModel[id].normal);
}
function individualWheelLoads(nFront,nRear,ay){
  // Positive ay = turn right, vehicle transfers load toward outside (left).
  const frontTransfer=P.mass*ay*P.cgHeight*P.frontRollShare/Math.max(.8,P.trackFront);
  const rearTransfer=P.mass*ay*P.cgHeight*(1-P.frontRollShare)/Math.max(.8,P.trackRear);
  const split=(axle,t)=>{
    const minLoad=Math.min(25,axle*.035);
    const left=clamp(axle*.5+t,minLoad,axle-minLoad);
    return [left,axle-left];
  };
  const [fl,fr]=split(nFront,frontTransfer),[rl,rr]=split(nRear,rearTransfer);
  return {FL:fl,FR:fr,RL:rl,RR:rr,frontTransfer,rearTransfer};
}
function ackermannSteer(delta,id){
  if(id[0]!=='F'||Math.abs(delta)<.0002)return id[0]==='F'?delta:0;
  const radius=P.wheelbase/Math.tan(Math.abs(delta));
  const inside=(delta>0)===(id[1]==='R');
  return Math.sign(delta)*Math.atan(P.wheelbase/Math.max(.1,radius+(inside?-P.trackFront/2:P.trackFront/2)));
}
function wheelSurfaceMu(id,base){
  const {left}=wheelModel[id],split=wheelModel.splitMu;
  if((split.startsWith('left_')&&left)||(split.startsWith('right_')&&!left)){
    return Math.min(base,split.endsWith('ice')?.13:.68);
  }
  return base;
}
function wheelAlignment(w){
  // Signed axes: +gamma means the tire top leans to vehicle-right; +steer is right.
  // A negative static camber value tilts the tire top inward on each side.
  // Camber gain and bump steer depend on independently calculated wheel travel.
  const side=w.left?-1:1;
  const front=w.front;
  const travel=clamp(w.travel,-P.droopTravel,P.bumpTravel);
  const staticCamber=front?P.staticCamberFrontDeg:P.staticCamberRearDeg;
  const camberGain=front?P.camberGainFrontDegPerM:P.camberGainRearDegPerM;
  const toeIn=front?P.toeInFrontDeg:P.toeInRearDeg;
  const bumpSteer=front?P.bumpSteerFrontDegPerM:P.bumpSteerRearDegPerM;
  const rad=Math.PI/180;
  // Toe-in: left tire points to the right; right tire points to the left.
  // Chassis roll sign is inherited from the 4-corner suspension solver.
  return {
    camber:clamp(vehicleMotion.roll+side*(staticCamber-camberGain*travel)*rad,-.16,.16),
    toe:clamp(-side*(toeIn+bumpSteer*travel)*rad,-.035,.035)
  };
}
function wheelCornerForce(w,normal,baseMu,h){
  const m=vehicleMotion,r=m.yawRate,u=state.velocity,v=m.lateralVelocity;
  const x=(w.left?-1:1)*(w.front?P.trackFront:P.trackRear)*.5;
  const z=w.front?P.wheelbase*(1-P.frontStaticLoad):-P.wheelbase*P.frontStaticLoad;
  const alignment=wheelAlignment(w);
  const baseSteer=ackermannSteer(m.steerAngle,w.id);
  const steer=baseSteer+alignment.toe;
  // Velocity at each of the 4 contact patches includes rigid-body rotation.
  const longitudinalBody=u-x*r,lateralBody=v+z*r;
  const vx=longitudinalBody*Math.cos(steer)+lateralBody*Math.sin(steer);
  const vy=lateralBody*Math.cos(steer)-longitudinalBody*Math.sin(steer);
  const alpha=-Math.atan2(vy,Math.max(2,Math.abs(vx)));
  const mu=wheelSurfaceMu(w.id,baseMu)*(w.front?P.frontGripScale:P.rearGripScale);
  const nominal=P.mass*9.81*(w.front?P.frontStaticLoad:1-P.frontStaticLoad)*.5;
  const muLoad=mu*Math.pow(Math.max(.06,normal/Math.max(1,nominal)),P.tireLoadExponent-1);
  const lateralRoadOffset=Math.abs(m.offset+x*Math.cos(m.headingError));
  const offroad=1-.52*roadSmooth((lateralRoadOffset-3.35)/4.5);
  const pressure=tirePressureKpa(w.carcassTemp);
  const thermalGrip=tireGripFactor(w.treadTemp,pressure,w.tireWear);
  const capacity=normal*muLoad*offroad*thermalGrip;
  const c=(w.front?P.cornerStiffFront:P.cornerStiffRear)*.5*
    referenceCornerLoadMultiplier(normal,nominal)*thermalGrip;
  let fx=tireForce(w.omega,vx,normal,muLoad*offroad*thermalGrip);
  const pureFx=fx;
  // Camber thrust modifies lateral demand; it is NOT added after the tire
  // friction cap. This avoids extra force appearing above the friction circle.
  const camberK=(w.front?P.camberThrustFront:P.camberThrustRear)*
    Math.pow(Math.max(0,normal/Math.max(1,nominal)),.85);
  const camberDemand=camberK*alignment.camber*Math.tanh(vx/1.6);
  const lateralDemand=c*Math.tan(clamp(alpha,-1.30,1.30))+camberDemand;
  const normalizedLat=lateralDemand/Math.max(1e-9,3*capacity);
  const targetFy=capacity*peakSlipCurve(normalizedLat,
    effectiveTireSlideRetention('lat'),P.tireLatSlideWidth);
  const relaxation=w.front?P.lateralRelaxationFront:P.lateralRelaxationRear;
  const smooth=1-Math.exp(-Math.max(Math.abs(vx),2)*h/Math.max(.25,relaxation));
  let fy=w.fy+(targetFy-w.fy)*smooth;
  const slip=contactSlip(w.omega,vx);
  const forceSlip=regularizedTireSlip(w.omega,vx);
  const combined=combineTireForces(fx,fy,capacity,
    Math.max(0,Math.abs(forceSlip)/Math.max(.02,P.tirePeakLongSlip)-1),
    Math.max(0,Math.abs(normalizedLat)-1));
  fx=combined.fx;fy=combined.fy;
  w.normal=normal;w.mu=muLoad*offroad*thermalGrip;w.capacity=capacity;
  w.gripFactor=thermalGrip;w.pressureKpa=pressure;
  w.pureFx=pureFx;
  w.pureFy=targetFy;w.combinedCapacity=combined.limit;
  w.slideSeverity=combined.severity;
  w.gripPhase=normal<1?'離地':combined.severity>.40?'滑動':
    Math.max(Math.abs(forceSlip)/Math.max(.02,P.tirePeakLongSlip),Math.abs(normalizedLat))>.86?'峰值':'黏著';
  w.criticalSlipAngle=Math.atan(3*capacity/Math.max(1,c));
  w.baseSteer=baseSteer;w.steer=steer;w.toe=alignment.toe;
  w.camber=alignment.camber;w.camberThrust=camberDemand;
  w.slipAngle=alpha;w.slip=slip;
  w.vx=vx;w.vy=vy;w.fx=fx;w.fy=fy;
  w.fxBody=fx*Math.cos(steer)-fy*Math.sin(steer);
  w.fyBody=fx*Math.sin(steer)+fy*Math.cos(steer);
  w.usage=clamp(Math.hypot(fx,fy)/Math.max(.1,capacity),0,1);
  // Mechanical trail reduces toward zero as the patch saturates. A tire's
  // aligning torque is not a yaw-moment applied directly to the vehicle.
  const saturation=roadSmooth(Math.abs(normalizedLat)*.78);
  w.pneumaticTrail=normal>1?P.tirePneumaticTrail*Math.max(.015,1-.97*saturation):0;
  w.aligningMoment=Math.abs(vx)>1.1?-fy*w.pneumaticTrail*Math.tanh(Math.abs(vx)/4):0;
  tireThermalStep(w,h);
  return {x,z};
}
function fourCornerForces(nFront,nRear,mu,h){
  const m=vehicleMotion;
  const loads=(suspension.enabled||chassisBridge)?{
    FL:wheelModel.FL.normal,FR:wheelModel.FR.normal,
    RL:wheelModel.RL.normal,RR:wheelModel.RR.normal,
    frontTransfer:(wheelModel.FL.normal-wheelModel.FR.normal)/2,
    rearTransfer:(wheelModel.RL.normal-wheelModel.RR.normal)/2
  }:individualWheelLoads(nFront,nRear,m.lateralAccel);
  let totalFx=0,totalFy=0,yawMoment=0;
  let fFront=0,fRear=0;
  for(const id of WHEEL_IDS){
    const w=wheelModel[id];
    const pos=wheelCornerForce(w,loads[id],mu,h);
    totalFx+=w.fxBody;totalFy+=w.fyBody;
    yawMoment+=pos.z*w.fyBody-pos.x*w.fxBody;
    if(w.front)fFront+=w.fy;else fRear+=w.fy;
  }
  tireSystem.instantFeedbackNm=wheelModel.FL.aligningMoment+wheelModel.FR.aligningMoment;
  tireSystem.feedbackNm+=(tireSystem.instantFeedbackNm-tireSystem.feedbackNm)*
    (1-Math.exp(-h*15));
  // Pneumatic tire trail plus caster-projected mechanical trail act on the
  // steering axes. They are NOT injected as a fabricated vehicle yaw moment.
  const lateralFront=wheelModel.FL.fy+wheelModel.FR.fy;
  const casterRad=P.steerCasterDeg*Math.PI/180;
  const geometricMoment=-lateralFront*effectiveMechanicalTrail();
  const frontNormal=wheelModel.FL.normal+wheelModel.FR.normal;
  const casterJacking=-frontNormal*P.steerJackingLever*
    Math.pow(Math.sin(casterRad),2)*Math.sin(2*m.steerAngle);
  const feedbackBlend=1-Math.exp(-h*17);
  steeringRack.pneumaticNm+=(tireSystem.instantFeedbackNm-steeringRack.pneumaticNm)*feedbackBlend;
  steeringRack.mechanicalNm+=(geometricMoment-steeringRack.mechanicalNm)*feedbackBlend;
  steeringRack.jackingNm+=(casterJacking-steeringRack.jackingNm)*feedbackBlend;
  steeringRack.roadTorqueNm=steeringRackRoadMoment();
  steeringRack.wheelFeelNm=clamp(-steeringRack.roadTorqueNm/
    Math.max(8,P.steerGearRatio),-55,55);
  const frontCap=wheelModel.FL.capacity+wheelModel.FR.capacity;
  const rearCap=wheelModel.RL.capacity+wheelModel.RR.capacity;
  m.frontForce=fFront;m.rearForce=fRear;
  m.frontAxleTransfer=loads.frontTransfer;m.rearAxleTransfer=loads.rearTransfer;
  m.frontGripCapacity=frontCap;m.rearGripCapacity=rearCap;
  m.frontSlipAngle=(wheelModel.FL.slipAngle+wheelModel.FR.slipAngle)/2;
  m.rearSlipAngle=(wheelModel.RL.slipAngle+wheelModel.RR.slipAngle)/2;
  m.gripUsageFront=Math.max(wheelModel.FL.usage,wheelModel.FR.usage);
  m.gripUsageRear=Math.max(wheelModel.RL.usage,wheelModel.RR.usage);
  m.frontYawMoment=WHEEL_IDS.slice(0,2).reduce((sum,id)=>{
    const w=wheelModel[id];const x=(w.left?-1:1)*P.trackFront*.5;
    return sum+P.wheelbase*(1-P.frontStaticLoad)*w.fyBody-x*w.fxBody;
  },0);
  m.rearYawMoment=yawMoment-m.frontYawMoment;
  return {totalFx,totalFy,yawMoment,loads};
}
function integrateFourCornerChassis(totalFx,totalFy,yawMoment,h){
  const m=vehicleMotion,u=state.velocity,v=m.lateralVelocity,r=m.yawRate;
  const ax=(totalFx+resistForce(u))/P.mass+v*r;
  let ay=totalFy/P.mass;
  if(chassisBridge){
    // Rapier is the sole pose/velocity integrator in desktop 3D mode.
    // The existing four-wheel solver only supplies tire forces and torque.
    const before=state.accel;
    chassisBridge.stepForces(totalFx,totalFy,yawMoment,resistForce(u)+
      P.mass*9.81*Math.sin(Math.atan(state.grade/100)),h);
    m.contactCooldown=Math.max(0,m.contactCooldown-h);
    state.accel=clamp((state.velocity-u)/h,-200,200);
    state.jerk=clamp((state.accel-before)/h,-500,500);
    return;
  }
  // Integrate tire forces at all speeds. The old 1.65-rad/s hard ceiling
  // clamped real spins and concealed ESC failures; 8 is only a safety guard.
  const atRest=1-smooth01(Math.abs(u)/1.5);
  const yawDamping=atRest*.60*r;
  m.yawRate=clamp(r+(yawMoment/P.yawInertia-yawDamping)*h,-8,8);
  m.lateralVelocity=clamp(v+(ay-u*r)*h,-90,90);
  m.lateralAccel=ay;
  m.heading+=m.yawRate*h;
  m.x+=(u*Math.sin(m.heading)+m.lateralVelocity*Math.cos(m.heading))*h;
  m.z+=(u*Math.cos(m.heading)-m.lateralVelocity*Math.sin(m.heading))*h;
  if(!suspension.enabled){
    suspensionStep('roll','rollRate',ay,h);
    suspensionStep('pitch','pitchRate',ax,h);
  }
  m.contactCooldown=Math.max(0,m.contactCooldown-h);
  const last=state.accel;
  state.accel=ax;state.velocity=clamp(u+ax*h,-50,90);
  state.jerk=clamp((ax-last)/h,-500,500);
}
// Legacy hook kept for external scripts. Physics production path uses fourCornerForces.
function integrateMechanical(h){
  const gain=gearGain(state.gear),pendingGain=gearGain(state.pendingGear);
  const v=state.velocity,mu=P.surfaces[state.surface].mu;
  importLegacyAxleSpeeds();
  const frontAvg=(wheelModel.FL.omega+wheelModel.FR.omega)/2;
  const totalNormal=P.mass*9.81;
  const nFront=clamp(totalNormal*P.frontStaticLoad-P.mass*state.accel*P.cgHeight/P.wheelbase,totalNormal*.17,totalNormal*.83);
  const nRear=totalNormal-nFront;
  if(chassisBridge)chassisBridge.beforeForces(h);
  else if(suspension.enabled)cornerSuspensionStep(h);
  const forces=fourCornerForces(nFront,nRear,mu,h);
  const esc=updateHandlingControl(h);
  const frontFx=wheelModel.FL.fx+wheelModel.FR.fx;
  const rearFx=wheelModel.RL.fx+wheelModel.RR.fx;
  const slipDrive=(wheelModel.FL.slip+wheelModel.FR.slip)*.5;
  const slipCoast=(wheelModel.RL.slip+wheelModel.RR.slip)*.5;
  const driveDir=Math.sign(v)||Math.sign(frontAvg)||Math.sign(gain)||1;
  const spin=Math.max(...[wheelModel.FL,wheelModel.FR].map(w=>driveDir*w.slip))>.17&&state.gear!==0&&state.throttle>.08;
  const targetCut=state.tcsEnabled&&spin?clamp(.28+Math.max(0,driveDir*Math.max(wheelModel.FL.slip,wheelModel.FR.slip)-.17)*.67,.28,.78):0;
  state.tcsCut=moveToward(state.tcsCut,targetCut,h*(targetCut>state.tcsCut?4.8:2.8));
  const contact=Math.abs(state.shaftTwist)>P.shaftBacklash;
  const contactTwist=contact?state.shaftTwist-Math.sign(state.shaftTwist)*P.shaftBacklash:0;
  const tShaft=clamp(contact?(P.shaftStiffness*contactTwist+P.shaftDamping*(state.shaftOmega-frontAvg)):0,-P.shaftMaxTorque,P.shaftMaxTorque);
  const jShaft=P.inertiaOutputShaft+(gain?P.inertiaInput*gain*gain:0);
  if(gain)state.inputOmega=state.shaftOmega*gain;
  const engNet=engineNetTorque(radToRPM(state.engineOmega));
  const cap=torqueCapacity(),slipCrank=state.engineOmega-state.inputOmega;
  let clutchTorque=0,locked=false;
  if(gain&&cap>.001){
    const required=(slipCrank/h+engNet/P.inertiaEngine+gain*tShaft/jShaft)/
      (1/P.inertiaEngine+gain*gain*P.driveEfficiency/jShaft);
    if(Math.abs(slipCrank)<rpmToRad(P.clutchLockRPM)&&Math.abs(required)<=cap&&
       state.engineOn&&state.engineOmega>rpmToRad(150)&&state.inputOmega>=0){
      clutchTorque=required;locked=true;
    }else clutchTorque=clamp(P.clutchStiffness*slipCrank,-cap,cap);
  }else if(cap>.001){
    const maxImpulse=Math.abs(slipCrank)/(h*(1/P.inertiaEngine+1/P.inertiaInput));
    clutchTorque=clamp(clamp(P.clutchStiffness*slipCrank,-cap,cap),-maxImpulse,maxImpulse);
  }
  let syncTorque=0;
  if(state.pendingGear!==null){
    const mismatch=state.shaftOmega*pendingGain-state.inputOmega;
    const maxSync=P.synchroMaxTorque*(1-.70*state.syncWear);
    syncTorque=clamp(mismatch*P.inertiaInput/h-clutchTorque,-maxSync,maxSync);
    state.syncWear=clamp(state.syncWear+Math.abs(syncTorque*mismatch)*h/16000000,0,1);
  }
  const fullBraking=P.maxBrakeForce*state.brake*P.wheelRadius;
  // Front differential sends equal axle torque to left and right (open diff).
  // The limited-slip demonstration resists speed difference, without creating energy.
  const lsd=wheelModel.differential==='lsd'?Math.min(300,Math.max(0,P.diffLockNm||170)):0;
  const transfer=lsd*Math.tanh((wheelModel.FR.omega-wheelModel.FL.omega)/7);
  const drivenNm={FL:tShaft*.5+transfer,FR:tShaft*.5-transfer,RL:0,RR:0};
  let minPressure=1;
  for(const id of WHEEL_IDS){
    const w=wheelModel[id],isFront=w.front;
    const requested=fullBraking*(isFront?P.frontBrakeBias:1-P.frontBrakeBias)*.5;
    const escTorque=id===esc.wheel?esc.torque:0;
    const trimSide=handling.escTrimSide;
    const trimmed=trimSide&&(w.left?'L':'R')===trimSide;
    const budget=requested*(trimmed?1-handling.escTrim:1)+escTorque;
    const localV=w.vx;
    w.absPressure=updateABS(w.absPressure,w.slip,localV,h,budget>1);
    const reaction=w.fx*P.wheelRadius;
    const brake=brakeTorqueForAxle(w.omega,reaction,drivenNm[id],budget,w.absPressure);
    w.escBrakeTorque=escTorque;
    w.driveTorque=drivenNm[id];w.brakeTorque=brake.torque;
    minPressure=Math.min(minPressure,w.absPressure);
    const inertia=(isFront?P.inertiaDriveWheels:P.inertiaCoastWheels)*.5;
    w.omega=clamp(w.omega+(drivenNm[id]-reaction-brake.torque)*h/inertia,-700,700);
    if(state.brake>.02&&Math.abs(localV)>.5&&w.omega*localV<0)w.omega=0;
  }
  state.absMod=minPressure;
  state.absPressureDrive=Math.min(wheelModel.FL.absPressure,wheelModel.FR.absPressure);
  state.absPressureCoast=Math.min(wheelModel.RL.absPressure,wheelModel.RR.absPressure);
  state.engineOmega=clamp(state.engineOmega+(engNet-clutchTorque)*h/P.inertiaEngine,0,rpmToRad(13000));
  if(gain){
    state.shaftOmega+=((clutchTorque*gain*P.driveEfficiency)-tShaft-.55*state.shaftOmega)*h/jShaft;
  }else{
    state.shaftOmega+=(-tShaft-syncTorque*pendingGain-.55*state.shaftOmega)*h/jShaft;
    const drag=.65*Math.tanh(state.inputOmega/.8)+.032*state.inputOmega;
    state.inputOmega+=(clutchTorque+syncTorque-drag)*h/P.inertiaInput;
  }
  state.shaftOmega=clamp(state.shaftOmega,-600,600);
  exportLegacyAxleSpeeds();
  state.shaftTwist=clamp(state.shaftTwist+(state.shaftOmega-state.drivenWheelOmega)*h,-.85,.85);
  integrateFourCornerChassis(forces.totalFx,forces.totalFy,forces.yawMoment,h);
  // Same parked static-brake constraint as V0.9.2, now applied to each corner.
  const brakeForceAvailable=Math.min(fullBraking/P.wheelRadius,totalNormal*mu*.9);
  const hill=Math.abs(P.mass*9.81*Math.sin(Math.atan(state.grade/100)));
  if(state.brake>.04&&Math.abs(state.velocity)<.035&&brakeForceAvailable>hill+130&&
    Math.abs(tShaft)<fullBraking*P.frontBrakeBias*.92&&Math.abs(state.coastWheelOmega)<.8){
    state.velocity=0;state.accel=0;
    for(const id of WHEEL_IDS)wheelModel[id].omega=0;
    exportLegacyAxleSpeeds();
  }
  if(locked)state.engineOmega=Math.max(0,state.shaftOmega*gain);
  if(gain)state.inputOmega=state.shaftOmega*gain;
  if(state.engineOn&&radToRPM(state.engineOmega)<P.stallRPM){
    state.engineOn=false;state.stalled=true;state.ignitionOn=true;trainer.stalls++;
    recordEvent('stall','引擎熄火');log('引擎熄火：低轉速負載超過扭矩，請踩離合器重新發動。','error');
  }
  if(state.engineOn&&radToRPM(state.engineOmega)>P.damageRPM){
    state.damage=clamp(state.damage+h*(.012+Math.max(0,radToRPM(state.engineOmega)-P.damageRPM)/3500),0,1);
    if(state.damage>.98){state.engineOn=false;log('引擎超轉嚴重損壞，需重置才能重新發動。','error');}
  }
  state.clutchLocked=locked;state.clutchTorque=clutchTorque;
  state.driveForce=frontFx+rearFx;state.tireForceDrive=frontFx;state.tireForceCoast=rearFx;
  state.tractionLimit=wheelModel.FL.capacity+wheelModel.FR.capacity;
  state.driveSlip=slipDrive;state.coastSlip=slipCoast;
  state.shaftTorque=tShaft;state.syncTorque=syncTorque;
  const slipPower=Math.abs(clutchTorque*slipCrank);
  state.heat=clamp(state.heat+slipPower*h/P.clutchHeatCapacity-(state.heat-P.temperatureAir)*P.clutchCooling*h,P.temperatureAir,420);
  if(state.heat>170)state.wear=clamp(state.wear+(state.heat-170)*h/450000,0,1);
  state.tireTemp=WHEEL_IDS.reduce((sum,id)=>sum+wheelModel[id].temperature,0)/4;
  if(spin)state.wheelSpinTime+=h;
  if(Math.abs(v)>2.8&&state.brake>.05&&WHEEL_IDS.some(id=>-driveDir*wheelModel[id].slip>.25))state.wheelLockTime+=h;
}
function advancePhysics(dt){
  synchronizeRoadPose();
  state.time+=dt;controlStep(dt);
  if(state.pendingGear!==null && $('strict').checked && state.clutch<.69){
    state.pendingGear=null;state.syncRemaining=0;state.syncTorque=0;
    state.syncWear=clamp(state.syncWear+.0004,0,1);state.shiftState='BLOCKED';
    shiftReject('同步器尚未完成便鬆開離合器');trainer.pending=null;
    log('同步器尚未完成便鬆開離合器：換檔中止。','error');soundGrind();
  }
  // Four integration microsteps preserve the public 120 Hz stepping contract while
  // resolving fast tire/shaft transients without synchronizing to visual frame rate.
  const micro=4;const h=dt/micro;const beforeVelocity=state.velocity;
  for(let i=0;i<micro;i++)integrateMechanical(h);
  updateVehicleRoadPosition(dt);
  if(state.pendingGear!==null){
    state.syncRemaining=Math.max(0,state.syncRemaining-dt);
    const target=state.pendingGear;
    state.syncDeltaRPM=Math.abs(radToRPM(state.shaftOmega*gearGain(target)-state.inputOmega));
    if(state.syncRemaining<=0 && state.syncDeltaRPM<P.synchroToleranceRPM){
      state.pendingGear=null;state.gear=target;
      state.inputOmega=state.shaftOmega*gearGain(target);
      state.syncTorque=0;state.syncDeltaRPM=0;state.shiftState='ENGAGED';shiftEngaged(target);hideShiftFailure();
      if(Math.abs(radToRPM(state.inputOmega))>P.damageRPM){
        log('已入 '+gearLabel(target)+' 檔，但當前軸速對應引擎轉速超出安全範圍！','warn');
      }else log('成功入 '+gearLabel(target)+' 檔，請平順接合離合器。');
      soundShift();
    }else if(state.time-state.syncStartedAt>3){
      state.pendingGear=null;state.syncRemaining=0;state.syncTorque=0;state.shiftState='BLOCKED';
      shiftReject('同步器逾時');trainer.pending=null;
      log('同步器長時間無法對速：請保持踩下離合器並重試。','warn');soundGrind();
    }
  }else if(state.shiftState!=='BLOCKED'){
    state.shiftState=state.gear===0?'NEUTRAL':'ENGAGED';
    state.syncDeltaRPM=0;
  }
  trainingStep(dt);recordStep(dt);
  roadPhase=(roadPhase+Math.abs(state.velocity)*dt*.45)%1200;
}
// Audio is a lightweight synthetic preview, not sample-based recordings.
const audio={ctx:null,oscA:null,oscB:null,gain:null,filter:null,enabled:false};
async function toggleAudio(){
  if(audio.enabled){audio.enabled=false;if(audio.ctx)await audio.ctx.suspend();$('audio').textContent='♫　啟用音效';$('audio-status').textContent='聲音已關閉';return;}
  try{
    if(!audio.ctx){
      const Ctor=window.AudioContext||window.webkitAudioContext;
      if(!Ctor)throw new Error('瀏覽器不支援 Web Audio');
      audio.ctx=new Ctor();audio.oscA=audio.ctx.createOscillator();audio.oscB=audio.ctx.createOscillator();
      audio.oscA.type='sawtooth';audio.oscB.type='triangle';
      const gA=audio.ctx.createGain(),gB=audio.ctx.createGain();gA.gain.value=.63;gB.gain.value=.25;
      audio.filter=audio.ctx.createBiquadFilter();audio.filter.type='lowpass';audio.filter.frequency.value=500;
      audio.gain=audio.ctx.createGain();audio.gain.gain.value=0;
      audio.oscA.connect(gA);audio.oscB.connect(gB);gA.connect(audio.filter);gB.connect(audio.filter);
      audio.filter.connect(audio.gain);audio.gain.connect(audio.ctx.destination);
      audio.oscA.start();audio.oscB.start();
    }
    await audio.ctx.resume();audio.enabled=true;
    $('audio').textContent='♫　關閉音效';$('audio-status').textContent='合成四缸引擎聲已啟用（示範音效，不是實車錄音）。';
  }catch(e){$('audio-status').textContent='無法啟用聲音：'+(e?.message||String(e));}
}
function soundBeep(freq=110,duration=.12,amount=.03){
  if(!audio.enabled||!audio.ctx)return;
  const t=audio.ctx.currentTime,osc=audio.ctx.createOscillator(),gain=audio.ctx.createGain();
  osc.type='sawtooth';osc.frequency.setValueAtTime(freq,t);osc.frequency.exponentialRampToValueAtTime(Math.max(30,freq*.5),t+duration);
  gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(amount,t+.009);
  gain.gain.exponentialRampToValueAtTime(.0001,t+duration);osc.connect(gain);gain.connect(audio.ctx.destination);osc.start(t);osc.stop(t+duration+.02);
}
function soundGrind(){soundBeep(79,.22,.025)}
function soundShift(){soundBeep(315,.045,.012)}
function updateAudio(){
  if(!audio.enabled||!audio.ctx)return;
  const t=audio.ctx.currentTime,rpm=radToRPM(state.engineOmega),fireHz=clamp(rpm/30,1,290);
  audio.oscA.frequency.setTargetAtTime(fireHz,t,.035);
  audio.oscB.frequency.setTargetAtTime(fireHz*1.9,t,.035);
  audio.filter.frequency.setTargetAtTime(180+rpm*.19+state.throttle*420,t,.06);
  const volume=state.engineOn ? (.017+.026*state.throttle+Math.min(rpm/7000,.8)*.005) : 0;
  audio.gain.gain.setTargetAtTime(volume,t,.045);
}
function drawGauge(canvas,amount,value,maxValue,majorUnit,color,redStart){
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  const cx=w/2,cy=h*.54,r=Math.min(w*.335,h*.42);
  ctx.clearRect(0,0,w,h);
  const start=Math.PI*.76,end=Math.PI*2.24,span=end-start;
  const arc=(r2,a,b,c,thickness)=>{ctx.beginPath();ctx.arc(cx,cy,r2,a,b);ctx.strokeStyle=c;ctx.lineWidth=thickness;ctx.lineCap='round';ctx.stroke()};
  arc(r,start,end,'#2c3e52',15);
  if(redStart!==null){arc(r,start+redStart*span,end,'#f67571',15)}
  arc(r,start,start+span*clamp(value/maxValue,0,1),color,8);
  const ticks=Math.round(maxValue/majorUnit);
  for(let j=0;j<=ticks*5;j++){
    const p=j/(ticks*5),ang=start+p*span,major=j%5===0;
    let inner=r-(major?30:24),outer=r-(major?7:15);
    ctx.strokeStyle=major?'#d5e2ee':'#536a7f';ctx.lineWidth=major?3:1.6;
    ctx.beginPath();ctx.moveTo(cx+Math.cos(ang)*inner,cy+Math.sin(ang)*inner);ctx.lineTo(cx+Math.cos(ang)*outer,cy+Math.sin(ang)*outer);ctx.stroke();
    if(major){ctx.fillStyle='#9cbbca';ctx.font='600 21px Consolas,monospace';ctx.textAlign='center';ctx.textBaseline='middle';const label=maxValue>100?j/5*majorUnit:Math.round(j/5*majorUnit/1000);ctx.fillText(String(label),cx+Math.cos(ang)*(r-63),cy+Math.sin(ang)*(r-63));}
  }
  const needle=start+clamp(value/maxValue,0,1)*span;
  ctx.save();ctx.translate(cx,cy);ctx.rotate(needle);
  ctx.shadowBlur=14;ctx.shadowColor=color;ctx.beginPath();ctx.moveTo(-26,-5);ctx.lineTo(r-33,0);ctx.lineTo(-26,5);ctx.closePath();ctx.fillStyle='#f0f6fd';ctx.fill();ctx.shadowBlur=0;
  ctx.restore();ctx.beginPath();ctx.arc(cx,cy,12,0,TAU);ctx.fillStyle='#c3d7e2';ctx.fill();
  ctx.beginPath();ctx.arc(cx,cy,5,0,TAU);ctx.fillStyle='#1b293c';ctx.fill();
}
// H-pattern pointer control works in SVG's fixed 380 x 280 logical coordinate system.
const H_SLOTS={0:[170,139],1:[70,65],2:[70,215],3:[170,65],4:[170,215],5:[270,65],6:[270,215],'-1':[345,215]};
const H_COLUMNS=[70,170,270,345];
const gateHand={active:false,pointerId:null,x:170,y:139,neutralX:170,
  phase:'rail',column:170,entering:false,lastX:0,lastY:0,moved:0,lastDragEnd:-99,suppressClick:false};
function nearestColumn(x){return H_COLUMNS.reduce((a,b)=>Math.abs(x-a)<=Math.abs(x-b)?a:b);}
function gateCoordinates(ev){
  const r=$('gate').getBoundingClientRect();
  return {x:clamp((ev.clientX-r.left)/r.width*380,0,380),y:clamp((ev.clientY-r.top)/r.height*280,0,280)};
}
function displayLeverPosition(){
  if(gateHand.active)return [gateHand.x,gateHand.y];
  if(state.pendingGear!==null){
    const [x,y]=H_SLOTS[state.pendingGear];
    return [x,y<139?y+19:y-19];
  }
  if(state.gear===0)return [gateHand.neutralX,139];
  return H_SLOTS[state.gear];
}
function shifterMessage(msg,warning=false){
  const el=$('drag-feedback');el.textContent=msg;
  el.style.borderColor=warning?'#896343':'#336452';
  el.style.color=warning?'#ffd17c':'#9ff3d4';
}
function tryCompleteGateSlot(){
  if(state.gear!==0||state.pendingGear!==null)return;
  if(!gateHand.entering)return;
  const x=gateHand.column,y=gateHand.y;
  const candidate=x===70?(y<139?1:2):x===170?(y<139?3:4):x===270?(y<139?5:6):
    y>139?-1:null;
  if(candidate===null)return;
  const nearEnd=y<79 || y>201;
  if(!nearEnd)return;
  if(requestGear(candidate)){
    gateHand.x=x;gateHand.y=H_SLOTS[candidate][1];
    gateHand.entering=false;
    shifterMessage('同步器正在對速，保持離合器踩下，等待入檔。');
  }else{
    // Simulate a blocked gate: lever is bounced away from the engagement detent.
    gateHand.y=y<139?95:184;
    shifterMessage('阻力阻擋入檔：請踩離合器或降低輸入軸速度。',true);
  }
}
function updateGateDrag(dx,dy){
  if(!gateHand.active)return;
  if(gateHand.phase==='slot'){
    gateHand.x=gateHand.column;
    const fromY=gateHand.y;
    gateHand.y=clamp(fromY+dy,65,215);
    // Leaving an engaged gear always requires travelling through the centre crossover.
    if(!gateHand.entering){
      const isUpper=fromY<139;
      if((isUpper && gateHand.y>=138)||(!isUpper && gateHand.y<=140)){
        if(state.gear!==0)requestGear(0);
        gateHand.y=139;gateHand.phase='rail';gateHand.entering=true;
        gateHand.neutralX=gateHand.column;
        shifterMessage('已回空檔。橫向選擋後再向上／下推入。');
      }
    }else if(state.pendingGear===null){tryCompleteGateSlot();}
  }else{
    // In neutral, lateral travel is free. Longitudinal travel only begins at a gate column.
    const newX=clamp(gateHand.x+dx,70,345);
    const col=nearestColumn(newX);
    if(Math.abs(dy)>3 && Math.abs(dx)<=20 && Math.abs(newX-col)<=16){
      gateHand.x=col;gateHand.column=col;gateHand.phase='slot';
      gateHand.y=clamp(139+dy,65,215);gateHand.entering=true;
      gateHand.neutralX=col;
      tryCompleteGateSlot();
    }else{
      gateHand.x=newX;gateHand.y=139;gateHand.neutralX=newX;
    }
  }
}
const gate=$('gate');
gate.addEventListener('pointerdown',ev=>{
  if(ev.button!==0 || gateHand.active)return;
  const p=gateCoordinates(ev),[x,y]=displayLeverPosition();
  if(Math.hypot(p.x-x,p.y-y)>32)return;
  gateHand.active=true;gateHand.pointerId=ev.pointerId;
  gateHand.x=x;gateHand.y=y;gateHand.lastX=p.x;gateHand.lastY=p.y;
  gateHand.moved=0;gateHand.column=nearestColumn(x);
  gateHand.phase=Math.abs(y-139)<=8?'rail':'slot';
  gateHand.entering=state.gear===0;
  gate.classList.add('dragging');
  gate.setPointerCapture(ev.pointerId);
  ev.preventDefault();
});
gate.addEventListener('pointermove',ev=>{
  if(!gateHand.active||ev.pointerId!==gateHand.pointerId)return;
  const pos=gateCoordinates(ev);
  const dx=pos.x-gateHand.lastX,dy=pos.y-gateHand.lastY;
  gateHand.lastX=pos.x;gateHand.lastY=pos.y;
  gateHand.moved+=Math.hypot(dx,dy);
  if(Math.abs(dx)+Math.abs(dy)>0.3)updateGateDrag(dx,dy);
  ev.preventDefault();
});
function finishGateDrag(ev){
  if(!gateHand.active||ev.pointerId!==gateHand.pointerId)return;
  gateHand.active=false;gateHand.pointerId=null;
  gate.classList.remove('dragging');
  gateHand.suppressClick=gateHand.moved>5;
  gateHand.lastDragEnd=performance.now();
  if(state.gear===0 && state.pendingGear===null){
    gateHand.neutralX=nearestColumn(gateHand.x);
    shifterMessage('排檔桿已停在空檔。沿 H 槽選擇下一檔。');
  }
}
gate.addEventListener('pointerup',finishGateDrag);
gate.addEventListener('pointercancel',finishGateDrag);
gate.addEventListener('lostpointercapture',ev=>{if(gateHand.active)finishGateDrag(ev);});
gate.addEventListener('click',ev=>{
  if(gateHand.suppressClick && performance.now()-gateHand.lastDragEnd<450){
    ev.preventDefault();ev.stopPropagation();gateHand.suppressClick=false;
  }
},true);
function ui(){
  const rpm=radToRPM(state.engineOmega),speed=state.velocity*3.6;
  $('rpm').textContent=Math.round(rpm).toLocaleString('en-US');$('speed').textContent=Math.round(Math.abs(speed));
  const gear=gearLabel(state.gear);
  $('metric-gear').textContent=gear;$('gear-indicator').textContent=state.pendingGear!==null?'↻':gear;
  $('metric-slip').innerHTML=Math.round(Math.abs(radToRPM(state.engineOmega-state.inputOmega))).toLocaleString('en-US')+' <small>RPM</small>';
  $('metric-force').innerHTML=Math.round(state.driveForce).toLocaleString('en-US')+' <small>N</small>';
  const heat=Math.round(state.heat);$('metric-heat').innerHTML=heat+' <small>°C</small>';
  $('metric-heat').className=heat>200?'error':heat>130?'warning':'';
  $('shift-state').textContent=state.shiftState;
  $('shift-state').className=state.shiftState==='BLOCKED'?'alert':'';
  $('sync-delta').textContent=Math.round(state.syncDeltaRPM).toLocaleString('en-US')+' RPM';
  $('sync-delta').className=state.pendingGear!==null&&state.syncDeltaRPM>400?'alert':'';
  $('clutch-status').textContent=state.clutchLocked?'LOCKED':state.clutch>.78?'OPEN':Math.abs(state.clutchTorque)>2?'SLIPPING':'FREE';
  const selected=state.pendingGear??state.gear;
  $('target-rpm').textContent=selected!==0?Math.round(Math.abs(radToRPM(state.shaftOmega*gearGain(selected)))).toLocaleString('en-US')+' RPM':'-- RPM';
  $('grade-value').textContent=(state.grade>0?'+':'')+state.grade.toFixed(1)+'%';
  const surf=P.surfaces[state.surface];
  $('surface-label').textContent=surf.label;
  $('surface-mu').textContent='μ '+surf.mu.toFixed(2);
  const driveDirection=Math.sign(state.velocity)||Math.sign(state.drivenWheelOmega)||Math.sign(gearGain(state.gear))||1;
  const driveSlipRelative=state.driveSlip*driveDirection;
  const locking=state.brake>.12 && Math.abs(state.velocity)>3 && WHEEL_IDS.some(id=>
    -Math.sign(state.velocity)*wheelModel[id].slip>.17);
  const spinning=state.gear!==0 && state.throttle>.1 && ['FL','FR'].some(id=>
    driveDirection*wheelModel[id].slip>.19);
  $('tire-state').textContent=locking?'WHEEL LOCK / 抱死':spinning?'WHEEL SPIN / 空轉':state.tcsCut>.12?'TCS ACTIVE / 循跡':'GRIP / 抓地';
  $('tire-state').className='tire-state'+(locking?' locked':spinning?' alert':'');
  for(const axle of ['drive','free']){
    const slip=axle==='drive'?state.driveSlip:state.coastSlip;
    const bar=$(axle+'-slip-bar');
    const amt=Math.min(Math.abs(slip)*100,100)/2;
    bar.style.width=amt+'%';
    bar.style.left=slip<0?(50-amt)+'%':'50%';
    bar.className='traction-fill'+(axle==='free'?' free':'')+(slip<0?' negative':'');
    $(axle+'-slip-value').textContent=(slip*100).toFixed(1)+'%';
  }
  $('wheel-speed').textContent=(state.drivenWheelOmega*P.wheelRadius*3.6).toFixed(1)+' km/h';
  $('shaft-torque').textContent=Math.round(state.shaftTorque)+' Nm';
  $('shaft-twist').textContent=(state.shaftTwist*180/Math.PI).toFixed(1)+'°';
  $('long-g').textContent=(state.accel/9.81).toFixed(2)+' g';
  const m=vehicleMotion;
  const wheelDeg=m.steerAngle*180/Math.PI;
  $('steer-angle').textContent=(wheelDeg>0?'+':'')+wheelDeg.toFixed(1)+'°';
  $('dyn-steer').textContent=(wheelDeg>0?'+':'')+wheelDeg.toFixed(1)+'°';
  $('dyn-yaw').textContent=(m.yawRate*180/Math.PI).toFixed(1)+' °/s';
  $('handling-yaw-ref').textContent=(handling.yawReference*180/Math.PI).toFixed(1)+' °/s';
  $('handling-yaw-error').textContent=(handling.yawError*180/Math.PI).toFixed(1)+' °/s';
  $('handling-beta').textContent=(handling.beta*180/Math.PI).toFixed(1)+'°';
  $('handling-mode').textContent=handling.phase+' · '+(handling.escEnabled?
    (handling.escTrim>.01?'ESC '+handling.escTrimSide+'側卸壓 '+Math.round(handling.escTrim*100)+'%':
    handling.escWheel && handling.escBrakeNm>5?'ESC '+handling.escWheel+' '+Math.round(handling.escBrakeNm)+'Nm':'ESC 待命'):'ESC OFF');
  $('handling-esc-box').classList.toggle('warning',handling.phase!=='中性');
  $('dyn-lat-g').textContent=(m.lateralAccel/9.81).toFixed(2)+' g';
  $('dyn-body').textContent=(m.roll*180/Math.PI).toFixed(1)+'° / '+(m.pitch*180/Math.PI).toFixed(1)+'°';
  $('dyn-offset').textContent=(m.offset>0?'+':'')+m.offset.toFixed(1)+' m';
  $('dyn-slip-angles').textContent=(m.frontSlipAngle*180/Math.PI).toFixed(1)+'° / '+(m.rearSlipAngle*180/Math.PI).toFixed(1)+'°';
  $('dyn-axle-grip').textContent=Math.round(m.gripUsageFront*100)+'% / '+Math.round(m.gripUsageRear*100)+'%';
  $('steering-wheel-icon').style.transform='rotate('+(-m.steerInput*170).toFixed(1)+'deg)';
  $('keyboard-steer-current').textContent=(keyboardSteering.value>0?'+':'')+Math.round(keyboardSteering.value*100)+'%';
  const sources={keyboard:'鍵盤微調',gamepad:'USB 類比搖桿','gamepad-neutral':'搖桿待置中','lane-assist':'循跡輔助',slider:'畫面滑桿'};
  $('adv-source-caption').textContent=sources[advancedSteering.source]||'畫面滑桿';
  $('adv-live-source').textContent=sources[advancedSteering.source]||'畫面滑桿';
  $('adv-live-raw').textContent=advancedSteering.raw===null?'-- / --':advancedSteering.raw.toFixed(3)+' / '+advancedSteering.normalized.toFixed(3);
  $('adv-live-output').textContent=(advancedSteering.output*100).toFixed(1)+'%';
  $('adv-live-speed').textContent=Math.round(advancedSpeedFactor()*advancedSteering.keyboardSpeed*43)+'%';
  $('adv-status').textContent=advancedSteering.status;
  $('dyn-offset-box').classList.toggle('warning',Math.abs(m.offset)>3.4);
  $('road-steer-legend').classList.toggle('warning',Math.abs(m.offset)>3.4);
  $('road-steer-legend').textContent='相對道路航向 '+(m.headingError*180/Math.PI).toFixed(0)+'° · 偏移 '+m.offset.toFixed(1)+' m';
  $('dynamics-status').textContent=m.contact?'護欄接觸：簡化碰撞使車速下降，請減速修正方向':
    Math.abs(m.offset)>3.65?'已離開路面：降低速度並往車道中心修正':
    Math.abs(m.lateralAccel)>P.surfaces[state.surface].mu*9.81*.8?'接近橫向抓地力極限：請減速、減少方向盤角度':
    steeringSettings.assist?'循跡輔助啟用：可用 A / D 暫時接管方向':'手動轉向：A / D 或 ← / →，急彎請主動減速';
  $('fourwheel-status').textContent='FWD · '+(wheelModel.differential==='lsd'?'DEMO LSD':'OPEN DIFF');
  for(const id of WHEEL_IDS){
    const w=wheelModel[id],key=id.toLowerCase();
    $(key+'-kmh').textContent=(w.omega*P.wheelRadius*3.6).toFixed(1);
    $(key+'-fz').textContent=Math.round(w.normal).toLocaleString('en-US');
    $(key+'-fx').textContent=Math.round(w.fx).toLocaleString('en-US');
    $(key+'-fy').textContent=Math.round(w.fy).toLocaleString('en-US');
    $(key+'-slip').textContent=(w.slip*100).toFixed(1);
    $(key+'-travel').textContent=Math.round(w.travel*1000);
    $(key+'-contact').textContent=w.contact?'是':'離地';
    $(key+'-camber').textContent=(w.camber*180/Math.PI).toFixed(2);
    $(key+'-toe').textContent=(w.toe*180/Math.PI).toFixed(2);
    $(key+'-phase').textContent=w.gripPhase;
    $(key+'-tread').textContent=w.treadTemp.toFixed(1);
    $(key+'-carcass').textContent=w.carcassTemp.toFixed(1);
    $(key+'-pressure').textContent=Math.round(w.pressureKpa);
    $(key+'-align').textContent=w.aligningMoment.toFixed(1);
    $(key+'-wear').textContent=(w.tireWear*100).toFixed(2);
    $(key+'-grip').style.width=Math.round(w.usage*100)+'%';
    const thermalWarning=w.treadTemp>125||w.pressureKpa>285||w.pressureKpa<180||w.tireWear>.65;
    const warning=!w.contact || w.usage>.92 || thermalWarning ||
      (state.brake>.1 && Math.abs(w.slip)>.20);
    const card=document.querySelector('.wheel-card[data-wheel="'+id+'"]');
    card.classList.toggle('warning',warning);
    $(key+'-status').textContent=!w.contact?'離地':w.treadTemp>125?'胎溫過高':
      (w.pressureKpa>285||w.pressureKpa<180)?'胎壓異常':w.gripPhase==='滑動'?'滑動':warning?'接近極限':'正常';
  }
  const meanTread=WHEEL_IDS.reduce((sum,id)=>sum+wheelModel[id].treadTemp,0)/4;
  const meanPressure=WHEEL_IDS.reduce((sum,id)=>sum+wheelModel[id].pressureKpa,0)/4;
  $('tire-thermal-readout').textContent='平均胎面 '+meanTread.toFixed(1)+'°C · 平均胎壓 '+
    meanPressure.toFixed(0)+' kPa · 方向機回正力矩 '+tireSystem.feedbackNm.toFixed(1)+' Nm';
  $('rack-motion').textContent=(m.steerAngle*180/Math.PI).toFixed(2)+'° / '+
    (steeringRack.rate*180/Math.PI).toFixed(1)+'°/s';
  $('rack-input-torque').textContent=steeringRack.driverTorqueNm.toFixed(0)+' / '+
    steeringRack.assistTorqueNm.toFixed(0)+' Nm';
  $('rack-road-torque').textContent=steeringRack.pneumaticNm.toFixed(0)+' / '+
    (steeringRack.mechanicalNm+steeringRack.jackingNm).toFixed(0)+' Nm';
  $('rack-wheel-feel').textContent=steeringRack.wheelFeelNm.toFixed(1)+' Nm';
  $('suspension-readout').textContent='車身升沉 '+Math.round(vehicleMotion.heave*1000)+' mm · 已接地 '+suspension.contacts+'/4 · 最大行程 '+Math.round(suspension.maxTravel*1000)+' mm · Camber / Toe 依輪更新';
  $('assists-status').textContent=(state.tcsEnabled?'TCS '+Math.round(state.tcsCut*100)+'%':'TCS OFF')+' / '+(state.absEnabled?'ABS '+Math.round(state.absMod*100)+'%':'ABS OFF');
  const currentSection=route.segments.find(seg=>seg.start<=route.distance && seg.end>=route.distance);
  const curve=currentSection?.type.includes('hairpin')?(currentSection.turnDeg<0?'左迴頭彎':'右迴頭彎'):
    currentSection?.type==='left'?'左彎':currentSection?.type==='right'?'右彎':'直線';
  $('grade-hud').textContent=curve+' / '+(state.grade>0?'+':'')+state.grade.toFixed(1)+'%';
  $('engine-status').textContent=state.engineOn?'ENGINE RUNNING':state.stalled?'ENGINE STALLED':'ENGINE OFF';
  $('engine-status').style.color=state.engineOn?'#77f0c4':'#ffd17c';
  $('ignition').textContent=state.engineOn?'●　引擎運轉中　[I]':'⏻　發動引擎　[I]';
  $('road-hint').textContent=state.velocity<-.35?'倒車中':Math.abs(speed)<1?'車輛靜止':Math.round(Math.abs(speed))+' km/h · '+gear+' 檔';
  $('damage').textContent='離合磨耗 '+(state.wear*100).toFixed(2)+'% / 同步器 '+(state.syncWear*100).toFixed(2)+'%';
  $('clutch-contact-display').textContent='目前接合容量 '+Math.round(clutchEngagement(state.clutch)*100)+'% · 咬合點在踏板踩下 '+Math.round(P.clutchBiteAt*100)+'%';
  const [x,y]=displayLeverPosition();
  $('lever').style.left=(x/380*100)+'%';$('lever').style.top=(y/280*100)+'%';
  document.querySelectorAll('.gear-button').forEach(btn=>{
    const g=+btn.dataset.gear;
    btn.classList.toggle('active',g===state.gear);
    btn.classList.toggle('pending',g===state.pendingGear);
  });
  for(const pedal of ['clutch','throttle','brake']){
    const val=Math.round(state[pedal]*100);$(pedal+'-value').textContent=val+'%';$(pedal+'-bar').style.width=val+'%';
    $('hud-'+pedal+'-value').textContent=val+'%';
    $('hud-'+pedal+'-fill').style.width=val+'%';
    $('hud-'+pedal+'-track').setAttribute('aria-valuenow',String(val));
  }
  const revGaugeTop=Math.ceil((P.redlineRPM+600)/1000)*1000;
  drawGauge($('rpm-gauge'),rpm/revGaugeTop,rpm,revGaugeTop,1000,'#77f0c4',P.redlineRPM/revGaugeTop);
  drawGauge($('speed-gauge'),Math.abs(speed)/220,Math.abs(speed),220,20,'#80bafa',null);
  refreshRoadUI();drawRoad();drawRouteMap();drawRouteMap('mini-map',560);updateTrainingUI();updateReplayUI();
}
function frame(now){
  // A same-origin Three/Rapier host can step this exact powertrain and tire
  // solver without racing a second animation-frame simulation loop.
  if(externalClock){window.requestAnimationFrame(frame);return;}
  if(!lastFrame)lastFrame=now;
  const elapsed=Math.min(.065,(now-lastFrame)/1000);lastFrame=now;
  acc+=elapsed;
  const dt=1/120;let count=0;
  while(acc>=dt&&count<12){advancePhysics(dt);acc-=dt;count++;}
  if(count===12)acc=0;
  replayStep(elapsed);
  if(now-lastAudioUpdate>40){updateAudio();lastAudioUpdate=now;}
  ui();window.requestAnimationFrame(frame);
}
const specialKeys={Shift:'shift',ArrowUp:'w',ArrowDown:'s',ArrowLeft:'a',ArrowRight:'d'};
function keyNormalize(e){
  // e.code is essential: Shift+1 yields e.key='!' on many layouts.
  if(/^Digit[0-6]$/.test(e.code))return e.code.slice(-1);
  if(/^Numpad[0-6]$/.test(e.code))return e.code.slice(-1);
  if(e.code==='ShiftLeft'||e.code==='ShiftRight')return 'shift';
  if(/^Key[Wsrimad]$/i.test(e.code))return e.code.slice(-1).toLowerCase();
  return specialKeys[e.key]||e.key.toLowerCase();
}
window.addEventListener('keydown',e=>{
  // Do not steal A/D and gear shortcuts while the driver edits seed, JSON or mappings.
  if(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || e.target?.isContentEditable ||
    (e.target instanceof HTMLInputElement && e.target.type!=='range'))return;
  if(e.target instanceof HTMLInputElement && e.target.type==='range' && ['ArrowLeft','ArrowRight'].includes(e.key))return;
  const k=keyNormalize(e);
  if(['shift','w','s','a','d','i','m','r','c','0','1','2','3','4','5','6'].includes(k))e.preventDefault();
  if(!e.repeat){if(k==='i')startEngine();if(k==='m')toggleAudio();if(k==='c')dumpClutch();if(k==='r')requestGear(-1);if(/^[0-6]$/.test(k))requestGear(+k);}
  if(['a','d'].includes(k)&&!keys.has(k))$('steer-slider').value=0; // keyboard takes the wheel until release
  if(['shift','w','s','a','d'].includes(k))keys.add(k);
});
window.addEventListener('keyup',e=>keys.delete(keyNormalize(e)));
window.addEventListener('blur',()=>keys.clear());
document.querySelectorAll('[data-gear]').forEach(el=>el.addEventListener('click',()=>requestGear(+el.dataset.gear)));
$('vehicle-select').addEventListener('change',e=>applyVehicle(e.target.value));
$('reference-fit-enabled').addEventListener('change',ev=>toggleReferenceCalibration(ev.target.checked));
$('clutch-bite-adjust').addEventListener('input',e=>{P.clutchBiteAt=clamp(Number(e.target.value)/100,.25,.65);$('clutch-bite-label').textContent=Math.round(P.clutchBiteAt*100)+'%';});
$('steer-slider').addEventListener('input',releaseKeyboardOverride);
$('steer-center').addEventListener('click',()=>{$('steer-slider').value=0;releaseKeyboardOverride();});
$('lane-assist').addEventListener('change',ev=>{steeringSettings.assist=ev.target.checked;});
$('camera-mode').addEventListener('change',ev=>{steeringSettings.cameraMode=ev.target.value==='stable'?'stable':'dynamic';});
$('recover-car').addEventListener('click',()=>{
  if(Math.abs(state.velocity)>.25){log('車輛仍在移動：停車後才可重新定位到車道中心。','warn');return;}
  resetVehiclePose(route.distance);log('已在目前里程重新定位車輛與鏡頭。');ui();
});
$('shift-failure-close').addEventListener('click',hideShiftFailure);
$('ignition').addEventListener('click',startEngine);$('audio').addEventListener('click',toggleAudio);$('reset').addEventListener('click',initialReset);$('clutch-dump').addEventListener('click',dumpClutch);


function setupRoadAppearance(){
  const key='shiftlab.road.appearance.v08';
  try{
    const val=JSON.parse(localStorage.getItem(key)||'null');
    if(val&&typeof val==='object')for(const setting of ['guardrails','centerline','quality']){
      if(typeof val[setting]==='string')roadAppearance[setting]=val[setting];
    }
    if(typeof val?.drainage==='boolean')roadAppearance.drainage=val.drainage;
  }catch{}
  const options={
    guardrails:['both','outside','off'],
    centerline:['adaptive','solid','broken'],quality:['high','standard']
  };
  for(const [prop,id] of [['guardrails','road-rail-mode'],['centerline','road-line-style'],['quality','road-quality']]){
    if(!options[prop].includes(roadAppearance[prop]))roadAppearance[prop]=ROAD_APPEARANCE_DEFAULTS[prop];
    const el=$(id);el.value=roadAppearance[prop];
    el.addEventListener('change',()=>{
      roadAppearance[prop]=options[prop].includes(el.value)?el.value:ROAD_APPEARANCE_DEFAULTS[prop];
      try{localStorage.setItem(key,JSON.stringify(roadAppearance));}catch{}
      drawRoad();
    });
  }
  $('road-drainage').checked=roadAppearance.drainage;
  $('road-drainage').addEventListener('change',()=>{
    roadAppearance.drainage=$('road-drainage').checked;
    try{localStorage.setItem(key,JSON.stringify(roadAppearance));}catch{}
    drawRoad();
  });
}

function configureDeviceSelects(){
  $('gp-pedals-device').addEventListener('change',ev=>{
    controller.profile.pedalDevice=ev.target.value;controller.seenPedalDevice=false;
    controller.lostPedalDevice=false;refreshControllerUI();gpMessage('請設定踏板來源並校準鬆開／踩到底兩端。');
  });
  $('gp-shifter-device').addEventListener('change',ev=>{
    controller.profile.shifterDevice=ev.target.value;clearHardwareShift();refreshControllerUI();
    gpMessage('排檔桿請先回空檔約 0.1 秒，控制器才會啟用。');
  });
  for(const name of PEDAL_NAMES){
    $(`gp-${name}-source`).addEventListener('change',ev=>{
      const p=controller.profile.pedals[name];p.source=ev.target.value;
      p.rest=p.source.startsWith('b')?0:-1;p.full=1;
      gpMessage(name+' 已選 '+(p.source||'手動滑桿')+'；請記錄鬆開和踩到底的原始值。');
    });
  }
  for(const g of INPUT_GEAR_KEYS)$(`gp-gear-${g}`).addEventListener('change',ev=>{
    controller.profile.gears[g]=ev.target.value;clearHardwareShift();
    gpMessage(gearLabel(g==='r'?-1:Number(g))+' 檔已設定 '+(ev.target.value||'未映射')+'，請先回空檔。');
  });
  document.querySelectorAll('[data-calibrate]').forEach(el=>el.addEventListener('click',()=>{
    const [name,part]=el.dataset.calibrate.split(':');calibrate(name,part);
  }));
  document.querySelectorAll('[data-learn]').forEach(el=>el.addEventListener('click',()=>{
    const shift=deviceFor(controller.profile.shifterDevice,availablePads());
    if(!shift){gpMessage('請先選擇有效的排檔控制器。');return;}
    controller.learn={gear:el.dataset.learn,baseline:shifterButtons(shift)};
    gpMessage('正在學習 '+el.dataset.learn.toUpperCase()+' 檔：請先排回空檔，再將排檔桿推入目標檔位。');
  }));
  $('gp-save').addEventListener('click',persistProfile);
  $('gp-export').addEventListener('click',()=>downloadFile('SHIFT_LAB_V05_Controller_Profile.json',JSON.stringify(controller.profile,null,2),'application/json;charset=utf-8'));
  $('gp-import').addEventListener('click',()=>$('gp-import-file').click());
  $('gp-import-file').addEventListener('change',async ev=>{
    const file=ev.target.files?.[0];if(!file)return;
    if(file.size>100000){gpMessage('JSON 設定檔超過 100 KB，已拒絕匯入。');ev.target.value='';return;}
    try{const content=JSON.parse(await file.text());replaceProfile(content,'校準設定已匯入。');}
    catch{gpMessage('JSON 檔案解析失敗，原有設定未變更。');}
    ev.target.value='';
  });
  $('gp-clear').addEventListener('click',()=>replaceProfile(freshProfile(),'映射已清空，保留鍵盤操作。'));
  $('record-toggle').addEventListener('click',()=>{
    if(telemetry.running){telemetry.running=false;updateReplayUI();return;}
    if(telemetry.samples.length || telemetry.events.length){telemetry.samples.length=0;telemetry.events.length=0;}
    replay.imported=null;replay.playing=false;replay.time=0;$('replay-notice').textContent='';
    telemetry.start=state.time;telemetry.clock=0;telemetry.elapsed=0;telemetry.running=true;
    telemetry.vehicleId=vehicleId;telemetry.startedOn=new Date().toISOString();
    recordEvent('record_start','開始本次駕駛紀錄');updateReplayUI();
  });
  $('record-download').addEventListener('click',()=>{
    if(telemetry.samples.length||telemetry.events.length)downloadFile('SHIFT_LAB_Drive_'+Date.now()+'.csv',buildCSV(),'text/csv;charset=utf-8');
  });
  $('record-clear').addEventListener('click',()=>{resetTrainingAndTrace();gpMessage('已清除訓練評分與駕駛紀錄，車輛狀態保持不變。');updateTrainingUI();updateReplayUI();});
  $('replay-play').addEventListener('click',()=>{
    if(telemetry.running||!replaySource().samples.length)return;
    if(replay.time>=replayDuration())replay.time=0;
    replay.playing=!replay.playing;updateReplayUI();
  });
  $('replay-seek').addEventListener('input',ev=>{
    replay.time=clamp(Number(ev.target.value)||0,0,replayDuration());updateReplayUI();
  });
  $('replay-rate').addEventListener('change',ev=>{replay.rate=[.5,1,2].includes(Number(ev.target.value))?Number(ev.target.value):1;});
  $('replay-export').addEventListener('click',()=>{
    if(replaySource().samples.length)downloadFile('SHIFT_LAB_V06_Training_'+Date.now()+'.json',buildReplayJSON(),'application/json;charset=utf-8');
  });
  $('replay-import').addEventListener('click',()=>$('replay-import-file').click());
  $('replay-import-file').addEventListener('change',async ev=>{
    const file=ev.target.files?.[0];if(!file)return;
    if(telemetry.running){$('replay-notice').textContent='請先停止目前錄製，再匯入訓練紀錄。';ev.target.value='';return;}
    if(file.size>12000000){$('replay-notice').textContent='檔案超過 12 MB，已拒絕匯入。';ev.target.value='';return;}
    try{
      const session=validateReplay(JSON.parse(await file.text()));
      replay.imported=session;replay.time=0;replay.playing=false;
      $('replay-notice').textContent='已匯入 '+session.samples.length+' 筆資料。按播放或拖曳時間軸開始分析。';
      updateReplayUI();
    }catch(err){$('replay-notice').textContent='匯入失敗：'+(err?.message||'無效 JSON')+'。原有回放未變更。';}
    ev.target.value='';
  });
  try{const item=localStorage.getItem(PROFILE_KEY);if(item)replaceProfile(JSON.parse(item),'已載入此瀏覽器儲存的控制器校準。');}
  catch{gpMessage('無法讀取本機設定；仍可透過 JSON 匯出／匯入保存。');}
  refreshControllerUI();
}
window.addEventListener('gamepadconnected',()=>refreshControllerUI());
window.addEventListener('gamepaddisconnected',()=>refreshControllerUI());
configureDeviceSelects();
setupRoadControls();
setupRoadAppearance();
setupKeyboardSteering();
setupAdvancedSteering();
renderVehicleSpecs();
updateReplayUI();

log('請先按 I 或「發動引擎」。切換檔位前先踩離合器。');
$('suspension-road').addEventListener('change',ev=>{
  const supported=['smooth','rough','ripples','bumps'];
  suspension.road=supported.includes(ev.target.value)?ev.target.value:'smooth';
  resetSuspension();log('懸吊測試路面：'+ev.target.selectedOptions[0].textContent);
});
$('suspension-intensity').addEventListener('input',ev=>{
  suspension.intensity=clamp(Number(ev.target.value)/100,0,1);
  $('suspension-intensity-value').textContent=Math.round(suspension.intensity*100)+'%';
  resetSuspension();
});
$('diff-select').addEventListener('change',ev=>{wheelModel.differential=ev.target.value==='lsd'?'lsd':'open';log('前差速器：'+(wheelModel.differential==='lsd'?'示範限滑':'開放式'));});
$('split-mu-select').addEventListener('change',ev=>{const options=['same','left_wet','right_wet','left_ice','right_ice'];wheelModel.splitMu=options.includes(ev.target.value)?ev.target.value:'same';log('已變更左右抓地測試：'+$('split-mu-select').selectedOptions[0].textContent);});
$('handling-balance').addEventListener('change',ev=>{
  if(setHandlingBalance(ev.target.value))log('動態校正：前軸抓地 '+Math.round(P.frontGripScale*100)+'%，後軸 '+Math.round(P.rearGripScale*100)+'%；使用四輪真實受力運算。');
});
$('handling-brake-bias').addEventListener('change',ev=>{
  if(setBrakeBias(ev.target.value))log('已設定前軸煞車分配 '+Math.round(P.frontBrakeBias*100)+'%。');
});
$('handling-feel').addEventListener('change',ev=>setHandlingFeel(ev.target.value));
$('handling-esc').addEventListener('change',ev=>{
  setESCEnabled(ev.target.value==='on');log('ESC 單輪煞車示範：'+(handling.escEnabled?'已開啟':'已關閉')+'。');
});
for(const [id,field] of [['tire-compound','compound'],['tire-ambient','ambientC'],
  ['tire-cold-pressure','coldPressureKpa']]){
  $(id).addEventListener('change',ev=>setTireSetting(field,ev.target.value));
}
$('tire-steer-compliance').addEventListener('change',ev=>
  setTireSetting('steerCompliance',ev.target.checked));
for(const [id,field] of [['rack-mode','mode'],['rack-caster','caster'],
  ['rack-trail','trail'],['rack-feel','feel']]){
  $(id).addEventListener('change',ev=>setSteeringRackSetting(field,ev.target.value));
}
syncSteeringRackSettingsUI();
window.__SHIFT_LAB_DEBUG__={state,params:P,wheelModel,WHEEL_IDS,REAL_OBD_BENCHMARK,
  MEASURED_DATA_QUALITY,P1_REAL_DYNAMICS,V185_GASOLINE_VALIDATION,evaluateMeasuredTransferGate,
  REFERENCE_FITS,REFERENCE_TIRE_FIT,referenceCalibration,toggleReferenceCalibration,referenceCornerLoadMultiplier,
  tireSystem,TIRE_COMPOUNDS,steeringRack,STEER_RACK_MODES,setSteeringRackSetting,
  syncSteeringRackSettingsUI,resetSteeringRack,effectiveMechanicalTrail,steeringRackRoadMoment,steeringRackStep,setTireSetting,tirePressureKpa,tireGripFactor,tireThermalStep,regularizedTireSlip,peakSlipCurve,combineTireForces,suspension,resetSuspension,cornerSuspensionStep,wheelRoadHeight,suspensionRoadTexture,wheelCoords,resetFourWheels,individualWheelLoads,ackermannSteer,wheelCornerForce,fourCornerForces,integrateFourCornerChassis,importLegacyAxleSpeeds,exportLegacyAxleSpeeds,requestGear,advancePhysics,startEngine,dumpClutch,reset:initialReset,gateHand,updateGateDrag,displayLeverPosition,gearGain,contactSlip,tireForce,integrateMechanical,ui,controller,trainer,telemetry,refreshControllerUI,pollController,rawInput,normalizedPedal,replaceProfile,buildCSV,calibrate,recordStep,trainingStep,scorePending,VEHICLES,applyVehicle,clutchEngagement,torqueCapacity,revGuidance,replay,replayStep,replaySource,replayDuration,replaySnapshot,buildReplayJSON,validateReplay,updateReplayUI,showShiftFailure,hideShiftFailure,route,generateRoad,roadPointAt,roadTotalDistance,roadFeatures,drawRoad,drawRouteMap,roadAppearance,roadRenderDiagnostics,roadBankAt,roadCrossElevation,roadSampleMeters,roadClipNear,roadCameraPoint:roadVertex,roadTelemetryStep,updateRoadStats,vehicleMotion,steeringSettings,steeringControlStep,resetVehiclePose,maximumSteerAngle,nearestRoadPosition,lateralDynamicsStep,updateVehicleRoadPosition,synchronizeRoadPose,roadProject,keyboardSteering,keyboardSteeringStep,bufferedKeyboardInput,setKeyboardTuning,releaseKeyboardOverride,axleLoadEfficiency,axleForceBudget,suspensionStep,estimatedRollGradient,estimatedCornerRollGradient,estimatedPitchGradient,wheelAlignment,handling,HANDLING_BALANCES,
  advancedSteering,ADV_STEER_DEFAULTS,ADV_STEER_PRESETS,validatedAdvancedSteering,
  advancedSpeedFactor,advancedKeyboardInput,normalizedAdvancedAxis,
  pollAdvancedGamepadSteering,refreshAdvancedGamepadUI,advancedSteeringTarget,
  restoreAdvancedSteering,calibrateAdvancedAxis,resetAdvancedGamepad,
  setHandlingBalance,setBrakeBias,setESCEnabled,setHandlingFeel,HANDLING_FEELS,
  effectiveTireSlideRetention,resetHandlingDynamics,
  steadyYawReference,updateHandlingControl,
  resolvePlanarGuardrail,setChassisBridge,setExternalClock,inputKeys:keys,hostControls,roadRailEnabled};
window.requestAnimationFrame(frame);
})();