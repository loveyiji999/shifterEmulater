import assert from 'node:assert/strict';
import {AUTOMATIC_RANGES,checkAutomaticRange,automaticRangeRequest,
  automaticDisplayGear} from '../src/automatic-range.mjs';
import {automaticClutch} from '../src/automatic-transmission.mjs';

const params={wheelRadius:.31,finalDrive:3.9,idleRPM:850,redlineRPM:6800,
  ratios:{'-1':-3.27,1:3.55,2:2.06,3:1.40,4:1.03,5:.84,6:.72}};
const check=(current,target,speedMps=0,brake=1,paused=false,pendingGear=null)=>
  checkAutomaticRange({current,target,speedMps,brake,paused,pendingGear});
const demand=(range,gear,pendingGear=null,extra={})=>automaticRangeRequest({
  range,gear,pendingGear,speedMps:0,throttle:0,brake:0,params,
  secondsSinceShift:5,...extra});

assert.deepEqual(AUTOMATIC_RANGES,['P','R','N','D']);
for(const pos of AUTOMATIC_RANGES)assert.ok(check('N',pos).ok);
for(const target of ['P','R','D']){
  assert.equal(check('N',target,1,.95).ok,false,`${target}: rolling shift reject`);
  assert.equal(check('N',target,.02,0).ok,false,`${target}: foot brake interlock`);
  assert.equal(check('N',target,.02,0,true).ok,true,`${target}: paused stationary Settings allowed`);
  assert.equal(check('N',target,.02,1,false,1).ok,target==='P',`${target}: pending synchro`);
}
assert.ok(check('D','N',40,0).ok,'N should disengage at road speed');
assert.ok(!check('D','P',.351,1).ok);
assert.ok(check('D','P',.35,1).ok);
assert.ok(!check('N','W',0,1).ok,'reject invalid ranges');
assert.ok(!check('N','R',NaN,1).ok,'fail closed on non-finite velocity');
assert.equal(demand('P',4),0,'P releases all numbered forward gears');
assert.equal(demand('P',-1),0,'P releases reverse');
assert.equal(demand('N',6,5),0,'N cancels synchronizer');
assert.equal(demand('N',0),null);
assert.equal(demand('R',0),-1,'R engages mechanical -1');
assert.equal(demand('R',-1),null,'R holds -1 without hunting');
assert.equal(demand('R',4),0,'R releases D before reverse');
assert.equal(demand('R',0,3),null,'R cannot issue overlapping request');
assert.equal(demand('D',-1),0,'D releases reverse before first');
assert.equal(demand('D',0),1,'D engages first from N');
assert.equal(demand('D',3,2),null,'D cannot override pending synchro');
assert.equal(demand('D',6,null,{speedMps:.05,brake:1}),1,'D downshifts near stop');
for(const range of ['P','N'])assert.equal(automaticDisplayGear(range,4),range);
assert.equal(automaticDisplayGear('R',-1),'R');
assert.equal(automaticDisplayGear('R',0),'N');
assert.equal(automaticDisplayGear('D',2),'2');
assert.equal(automaticDisplayGear('D',0),'N');
const reverseClutch=automaticClutch({gear:-1,pendingGear:null,shiftRequested:false,
  speedMps:0,throttle:.6,engineOn:true,engineRPM:1500,params});
assert.ok(reverseClutch>0&&reverseClutch<1,'engaged reverse can transmit clutch torque');
assert.equal(automaticClutch({gear:-1,pendingGear:-1,shiftRequested:false,
  speedMps:0,engineOn:true,params}),1,'reverse synchro needs open clutch');
assert.equal(automaticClutch({gear:0,pendingGear:null,shiftRequested:false,
  speedMps:0,engineOn:true,params}),1,'neutral clutch open');
console.log('PASS v1.8.9.3 PRND: safe transitions, reverse torque, N/P disengagement, D shift');
