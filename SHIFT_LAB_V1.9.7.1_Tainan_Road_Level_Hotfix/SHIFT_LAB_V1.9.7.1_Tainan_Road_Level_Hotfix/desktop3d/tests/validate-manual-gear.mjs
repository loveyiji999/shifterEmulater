import assert from 'node:assert/strict';
import {engageParkedManualGear} from '../src/manual-gear.mjs';
const makeCore=()=>({
  state:{gear:0,pendingGear:null,velocity:0,clutch:0},
  hostControls:{active:false,clutch:0,brake:0,throttle:0},requests:[],ticks:0,
  requestGear(g){this.requests.push(g);
    if(g===0){this.state.pendingGear=null;this.state.gear=0;return true;}
    if(this.state.clutch<.78)return false;
    this.state.gear=0;this.state.pendingGear=g;return true;},
  step(){this.ticks++;
    const s=this.state,h=this.hostControls;
    s.clutch=Math.min(1,s.clutch+(h.clutch-s.clutch)*.16);
    if(s.pendingGear!==null&&this.ticks>22){s.gear=s.pendingGear;s.pendingGear=null;}
  }
});
let c=makeCore(),result=await engageParkedManualGear({core:c,gear:3,step:()=>c.step()});
assert.equal(result.ok,true,result.reason);assert.equal(c.state.gear,3);
assert.deepEqual(c.requests,[3]);assert.equal(c.hostControls.clutch,0);
assert.ok(c.ticks>=22,'physical clutch and synchronizer must progress');
c=makeCore();c.state.velocity=4;
result=await engageParkedManualGear({core:c,gear:1,step:()=>c.step()});
assert.equal(result.ok,false);assert.deepEqual(c.requests,[]);assert.equal(c.ticks,0);
c=makeCore();c.state.pendingGear=4;
result=await engageParkedManualGear({core:c,gear:2,step:()=>c.step()});
assert.equal(result.ok,false);assert.equal(c.ticks,0);
c=makeCore();result=await engageParkedManualGear({core:c,gear:0,step:()=>c.step()});
assert.equal(result.ok,true);assert.equal(c.ticks,0);
c=makeCore();c.requestGear=()=>false;
result=await engageParkedManualGear({core:c,gear:-1,step:()=>c.step()});
assert.equal(result.ok,false);assert.equal(c.hostControls.brake,0);
c=makeCore();result=await engageParkedManualGear({core:c,gear:1,step:()=>c.step(),extraSpeed:1});
assert.equal(result.ok,false);assert.equal(c.ticks,0);
console.log('PASS v1.8.9.2 manual selector: stationary clutch actuation, synchro, lockout, no direct gear mutation');
