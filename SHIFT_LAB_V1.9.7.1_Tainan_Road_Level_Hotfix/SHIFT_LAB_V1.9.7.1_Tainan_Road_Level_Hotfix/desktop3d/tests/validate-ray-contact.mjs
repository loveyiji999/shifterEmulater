import assert from 'node:assert/strict';
import {rayContactDistance} from '../src/ray-contact.mjs';
// Rapier 0.18.x castRay returns RayColliderHit.timeOfImpact; former .toi bug
// yielded NaN spring force and zero ground-contact wheels.
assert.equal(rayContactDistance({timeOfImpact:.38},.95),.38);
assert.equal(rayContactDistance({timeOfImpact:0},.95),0);
assert.equal(rayContactDistance({timeOfImpact:.951},.95),null);
assert.equal(rayContactDistance({timeOfImpact:-.1},.95),null);
assert.equal(rayContactDistance({timeOfImpact:Number.NaN},.95),null);
assert.equal(rayContactDistance({toi:.38},.95),null);
assert.equal(rayContactDistance(null,.95),null);
console.log('PASS Rapier ray impact property and safe suspension distance');
