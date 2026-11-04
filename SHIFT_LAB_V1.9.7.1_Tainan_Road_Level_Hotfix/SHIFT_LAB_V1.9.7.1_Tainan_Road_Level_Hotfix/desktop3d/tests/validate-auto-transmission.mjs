import assert from 'node:assert/strict';
import {chooseAutomaticGear,gearSpeedRPM,automaticClutch,isAutomaticMode} from '../src/automatic-transmission.mjs';

const cars={
  standard:{wheelRadius:.31,finalDrive:3.9,idleRPM:850,redlineRPM:6800,ratios:{1:3.55,2:2.06,3:1.40,4:1.03,5:.84,6:.72}},
  city:{wheelRadius:.295,finalDrive:4.12,idleRPM:800,redlineRPM:6400,ratios:{1:3.71,2:2.10,3:1.40,4:1.06,5:.85,6:.72}},
  turbo:{wheelRadius:.325,finalDrive:3.58,idleRPM:820,redlineRPM:7100,ratios:{1:3.36,2:2.08,3:1.45,4:1.12,5:.91,6:.74}},
  diesel:{wheelRadius:.355,finalDrive:3.71,idleRPM:750,redlineRPM:4450,ratios:{1:4.03,2:2.25,3:1.50,4:1.08,5:.83,6:.64}}
};
const decide=(car,gear,speed,extra={})=>chooseAutomaticGear({params:cars[car],gear,
  pendingGear:null,speedMps:speed,throttle:0,brake:0,secondsSinceShift:2,...extra});
for(const [name,p] of Object.entries(cars)){
  assert.equal(decide(name,0,0),1,`${name}: neutral -> first`);
  assert.equal(decide(name,6,0.05),1,`${name}: complete stop -> first`);
  assert.equal(decide(name,5,1.9,{brake:1}),1,`${name}: near stop -> first`);
  assert.equal(decide(name,2,3,{brake:.8}),1,`${name}: downshift near stop`);
  assert.equal(decide(name,5,12,{brake:1}),4,`${name}: decelerating -> lower gear`);
  assert.equal(decide(name,5,12,{brake:1,pendingGear:4}),null,`${name}: no overlap during synchro`);
  assert.equal(decide(name,5,12,{brake:1,secondsSinceShift:.1}),null,`${name}: non-urgent shift debounce`);
  const firstUp=Array.from({length:400},(_,i)=>i/10).find(speed=>decide(name,1,speed,{throttle:1})===2);
  assert.ok(firstUp>6&&firstUp<28,`${name}: full throttle first upshift: ${firstUp}`);
  assert.ok(gearSpeedRPM(firstUp,1,p)<=p.redlineRPM*1.0,`${name}: shift before overrev`);
  const nextAfter=decide(name,2,firstUp,{throttle:1});
  assert.notEqual(nextAfter,1,`${name}: no immediate gear hunting`);
  assert.equal(automaticClutch({gear:6,pendingGear:null,shiftRequested:false,
    speedMps:0.2,throttle:0,engineOn:true,engineRPM:650,params:p}),1,`${name}: protect engine from stall`);
  assert.equal(automaticClutch({gear:3,pendingGear:2,shiftRequested:false,
    speedMps:15,throttle:0,engineOn:true,engineRPM:2000,params:p}),1,`${name}: clutch open during synchro`);
  assert.equal(decide(name,2,15,{secondsSinceShift:0,pendingGear:3}),null,`${name}: busy -> no second request`);
}
assert.equal(isAutomaticMode('assisted'),true);
assert.equal(isAutomaticMode('manual'),false);
// Monotonic braking from high speed must return to launch gear for every preset.
for(const name of Object.keys(cars)){
  let current=6;
  for(let speed=34;speed>=0;speed-=.25){
    const requested=decide(name,current,speed,{throttle:0,brake:1});
    if(requested!==null){
      assert.ok(requested<=current,`${name}: braking should not upshift at ${speed} m/s`);
      assert.ok(requested===current-1||requested===1,
        `${name}: downshift step cannot skip intermediate gears except near halt`);
      current=requested;
    }
  }
  assert.equal(current,1,`${name}: braking to a stop must reach first gear`);
}
console.log('PASS v1.8.9.2 automatic transmission: 4 vehicles, braking to first, no manual override, no hunting');
