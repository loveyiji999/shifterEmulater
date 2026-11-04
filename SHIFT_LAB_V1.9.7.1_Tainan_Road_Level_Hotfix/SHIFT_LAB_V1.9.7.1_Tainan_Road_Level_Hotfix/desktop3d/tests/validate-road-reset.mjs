import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SurfaceMap} from '../src/surface-map.mjs';
import {TerrainWorld} from '../src/terrain-world.mjs';
import {SurfaceMaterialLibrary} from '../src/surface-materials.mjs';

// Run the ACTUAL RoadWorld JS against deterministic stand-ins for THREE and
// Rapier, so it verifies collider handles, object disposal and geometry rebuild.
// This is not a substitute for a real Rapier WASM browser test.
class Object3D{
  constructor(){this.children=[];this.position={set(){}};this.rotation={};this.quaternion={set(){}};}
  add(...items){this.children.push(...items);}
  traverse(callback){callback(this);for(const x of this.children)x.traverse(callback);}
}
class Group extends Object3D{}
class Geometry{
  constructor(){this.disposed=false;this.groups=[];}
  dispose(){this.disposed=true;}
  setAttribute(){}
  setIndex(){}
  computeVertexNormals(){}
  addGroup(start,count,index){this.groups.push([start,count,index]);}
}
class Mesh extends Object3D{
  constructor(geometry,material){super();this.geometry=geometry;this.material=material;}
}
class ColliderDesc{
  static trimesh(v,i){return new ColliderDesc();}
  static cuboid(x,y,z){return new ColliderDesc();}
  setFriction(){return this;}setRestitution(){return this;}
  setTranslation(){return this;}setRotation(){return this;}
}
const THREE={MeshStandardMaterial:class{},Mesh,Group,Object3D,BufferGeometry:Geometry,
  Float32BufferAttribute:class{},BoxGeometry:Geometry,CylinderGeometry:Geometry,ConeGeometry:Geometry,DoubleSide:2};
const raw=fs.readFileSync(new URL('../src/road.mjs',import.meta.url),'utf8');
const rewritten=raw.replace(/^import .*;\r?\n/gm,'').replace('export class RoadWorld','class RoadWorld');
const RoadWorld=new Function('THREE','SurfaceMap','TerrainWorld','SurfaceMaterialLibrary',rewritten+';return RoadWorld;')(THREE,SurfaceMap,TerrainWorld,SurfaceMaterialLibrary);
let nextHandle=1;
const active=new Map(),removed=new Set(),created=new Set(),view=new Set();
const world={createCollider(desc){const obj={handle:nextHandle++};active.set(obj.handle,obj);created.add(obj.handle);return obj;},
  removeCollider(obj){assert.ok(active.has(obj.handle),'removed missing collider');active.delete(obj.handle);removed.add(obj.handle);}};
const scene={add(obj){view.add(obj);},remove(obj){assert.ok(view.delete(obj),'removed unknown render object');}};
const physics={route:{seedHash:123},roadTotalDistance(){return 2800;},
  roadPointAt(s){return {s,x:this.route.seedHash/10+s*.03,y:0,z:s,heading:0,grade:0};},
  roadCrossElevation(){return 0;},roadRailEnabled(){return true;}};
const road=new RoadWorld({ColliderDesc},world,scene,physics);
road.ensure(70);
assert.ok(road.chunks.size>=3);
assert.ok(road.groundHandles.size>=3);
assert.ok(road.railHandles.size>20);
assert.ok(view.size>0);
const firstHandles=new Set(active.keys());
road.clear();
assert.equal(active.size,0,'orphan physical collider after clear');
assert.equal(view.size,0,'orphan visual object after clear');
assert.equal(road.groundHandles.size,0);
assert.equal(road.railHandles.size,0);
assert.equal(road.chunks.size,0);
assert.equal(road.assertClean(),true);
assert.deepEqual(road.resourceStats(),{chunks:0,ground:0,rails:0,barriers:0,obstacles:0});
assert.ok([...firstHandles].every(h=>removed.has(h)));
physics.route.seedHash=998;
road.ensure(70);
assert.ok(road.groundHandles.size>=3);
assert.ok([...active.keys()].every(h=>!firstHandles.has(h)),'reused or leaked handles');
road.clear();road.assertClean();
assert.equal(active.size,0);
assert.equal(view.size,0);
assert.ok(created.size>removed.size-1 && created.size===removed.size);
console.log('PASS v1.8.9.2 road generation/rebuild: zero orphan colliders and render chunks');
