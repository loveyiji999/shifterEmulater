// Deterministic viewport / legacy-input polarity regression.
// No Rapier dependency: validates the exact right-handed chase projection.
import assert from 'node:assert/strict';
import {legacyDirectionalKey,legacySteerFromVisualAxis,
  visualSteeringFromLegacy,visualDirectionLabel} from '../src/steering-input.mjs';

// Three.js lookAt from a trailing camera toward +Z (up +Y):
// camera-right = viewing direction x camera-up = +Z x +Y = -X.
const screenRightX = -1;
const screenDisplacementFromLegacySteer=steer=>screenRightX*steer;
assert.equal(legacyDirectionalKey('a'),'d');
assert.equal(legacyDirectionalKey('d'),'a');
assert.equal(legacyDirectionalKey('w'),'w');
assert.equal(legacyDirectionalKey('s'),'s');
assert.equal(legacyDirectionalKey('shift'),'shift');
assert.equal(legacySteerFromVisualAxis(-1),1);
assert.equal(legacySteerFromVisualAxis(1),-1);
assert.equal(legacySteerFromVisualAxis(-0.5),0.5);
assert.equal(legacySteerFromVisualAxis(1,true),1);
assert.equal(legacySteerFromVisualAxis(Infinity),0);
assert.equal(visualSteeringFromLegacy(0.4),-0.4);
assert.equal(visualDirectionLabel(visualSteeringFromLegacy(0.4)),'← 左轉');
assert.equal(visualDirectionLabel(visualSteeringFromLegacy(-0.4)),'右轉 →');
assert.equal(visualDirectionLabel(0),'正前方');
// A/left-stick-left -> screen LEFT; D/right-stick-right -> screen RIGHT.
assert.ok(screenDisplacementFromLegacySteer(legacySteerFromVisualAxis(-1))<0);
assert.ok(screenDisplacementFromLegacySteer(legacySteerFromVisualAxis(1))>0);
// The bridge must never change front/rear wheel-force or yaw-moment signs.
console.log('PASS v1.8.8: A/Left => screen left, D/Right => screen right; controls only');
