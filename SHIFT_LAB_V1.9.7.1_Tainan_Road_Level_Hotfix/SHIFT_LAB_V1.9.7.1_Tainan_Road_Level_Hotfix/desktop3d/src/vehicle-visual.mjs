import * as THREE from 'three';
import {readVehicleDefinition} from './vehicle-definition.mjs';
import {vehicleLayout} from './vehicle-layout.mjs';

export function createVehicleVisual(input){
  const definition=readVehicleDefinition(input),P=definition.physics,layout=vehicleLayout(P);
  const group=new THREE.Group();group.name='reference-vehicle';
  const paint=new THREE.MeshStandardMaterial({color:0x1cb5a0,metalness:.45,roughness:.34});
  const glass=new THREE.MeshStandardMaterial({color:0x173b51,metalness:.22,roughness:.24});
  const tire=new THREE.MeshStandardMaterial({color:0x171d20,roughness:.99});
  const alloy=new THREE.MeshStandardMaterial({color:0xb7c4cb,metalness:.75,roughness:.3});
  const collisionMeshes=layout.colliders.map(part=>{
    let geometry;
    if(part.kind==='convex'){
      geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(part.vertices,3));
      geometry.setIndex(part.indices);const indexed=geometry;geometry=geometry.toNonIndexed();indexed.dispose();
      geometry.computeVertexNormals();
    }else{const h=part.halfExtents;geometry=new THREE.BoxGeometry(h.x*2,h.y*2,h.z*2);}
    const mesh=new THREE.Mesh(geometry,part.id==='cabin'?glass:paint);mesh.name=part.id;
    mesh.position.copy(part.center);mesh.castShadow=true;
    if(part.id==='cabin')group.add(mesh);return mesh;
  });
  const cabin=collisionMeshes[1];
  // Render the union boundary, not overlapping internal caps between convex
  // collision panels. All painted surfaces still share one draw call.
  const positions=[],normals=[];
  const triangle=(a,b,c)=>{
    const normal=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize();
    for(const v of [a,b,c]){positions.push(v.x,v.y,v.z);normals.push(normal.x,normal.y,normal.z);}
  };
  const center=collisionMeshes[0],cp=center.geometry.getAttribute('position'),cn=center.geometry.getAttribute('normal'),ci=center.geometry.index;
  for(let i=0;i<ci.count;i++){const j=ci.getX(i);positions.push(cp.getX(j)+center.position.x,cp.getY(j)+center.position.y,cp.getZ(j)+center.position.z);
    normals.push(cn.getX(j),cn.getY(j),cn.getZ(j));}
  for(const side of [-1,1]){
    const parts=layout.colliders.filter(part=>part.id.startsWith(`side-${side}-`));
    const lower=[];
    const point=(z,y)=>{const last=lower.at(-1);if(!last||last.x!==z||last.y!==y)lower.push(new THREE.Vector2(z,y));};
    for(const part of parts){point(part.vertices[2],part.vertices[1]);point(part.vertices[8],part.vertices[7]);}
    const top=parts[0].vertices[4];
    const contour=[...lower,new THREE.Vector2(lower.at(-1).x,top),new THREE.Vector2(lower[0].x,top)];
    if(THREE.ShapeUtils.isClockWise(contour))contour.reverse();
    const outer=side*.87,inner=side*layout.wheelWells.innerHalfWidth;
    const at=(p,x)=>new THREE.Vector3(x,p.y,p.x);
    for(const indices of THREE.ShapeUtils.triangulateShape(contour,[])){
      const [a,b,c]=indices.map(i=>at(contour[i],outer));
      const normal=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a));
      if(normal.x*side<0)triangle(a,c,b);else triangle(a,b,c);
    }
    for(let i=0;i<contour.length;i++){
      const a=contour[i],b=contour[(i+1)%contour.length];
      const ia=at(a,inner),oa=at(a,outer),ib=at(b,inner),ob=at(b,outer);
      if(side>0){triangle(ia,oa,ib);triangle(oa,ob,ib);}
      else{triangle(ia,ib,oa);triangle(oa,ib,ob);}
    }
  }
  const bodyGeometry=new THREE.BufferGeometry();
  bodyGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  bodyGeometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  const body=new THREE.Mesh(bodyGeometry,paint);body.name='body-with-open-wheel-wells';body.castShadow=true;group.add(body);
  const white=new THREE.MeshStandardMaterial({color:0xe2f4ff,emissive:0x576d75});
  const red=new THREE.MeshStandardMaterial({color:0xde3739,emissive:0x441016});
  for(const side of [-1,1])for(const front of [-1,1]){
    const lamp=new THREE.Mesh(new THREE.BoxGeometry(.26,.10,.02),front>0?white:red);
    lamp.position.set(side*.62,layout.body.centerY+.05,layout.body.centerZ+front*layout.body.length/2);group.add(lamp);
  }
  const tireGeometry=new THREE.CylinderGeometry(P.wheelRadius,P.wheelRadius,.22,24).rotateZ(Math.PI/2);
  const hubGeometry=new THREE.CylinderGeometry(P.wheelRadius*.62,P.wheelRadius*.62,.225,16).rotateZ(Math.PI/2);
  const spokeGeometry=new THREE.BoxGeometry(.012,.035,P.wheelRadius*1.7);
  const wheels=definition.appearance.wheels.map(({id,mount})=>{
    const pivot=new THREE.Group(),spin=new THREE.Group();
    pivot.name=id;pivot.position.set(mount.x,-P.cgHeight+P.wheelRadius,mount.z);
    pivot.add(spin);group.add(pivot);
    const cylinder=new THREE.Mesh(tireGeometry,tire);cylinder.castShadow=true;spin.add(cylinder);
    const hub=new THREE.Mesh(hubGeometry,alloy);spin.add(hub);
    const face=id[1]==='L'?-.117:.117;
    for(let i=0;i<3;i++){
      const spoke=new THREE.Mesh(spokeGeometry,alloy);spoke.position.x=face;spoke.rotation.x=i*Math.PI/3;spin.add(spoke);
    }
    return {id,pivot,spin,cylinder};
  });
  return {group,wheels,definition,layout,body,cabin,collisionMeshes};
}

export function syncVehicleVisual(vehicle,rigidBody,wheelModel,wheelVisualState,dt,wheelPhases){
  if(!Number.isFinite(dt)||dt<0)throw Error('Invalid visual timestep');
  const t=rigidBody.translation(),q=rigidBody.rotation();
  vehicle.group.position.copy(t);vehicle.group.quaternion.set(q.x,q.y,q.z,q.w);
  for(const {id,pivot,spin} of vehicle.wheels){
    const suspension=wheelVisualState[id];
    if(suspension)pivot.position.y=suspension.hubLocalY;
    pivot.rotation.y=wheelModel[id].steer||0;
    // X is the wheel axle AFTER baking the cylinder's Y->X geometry rotation.
    // Steering is on a parent, so spinning never changes its steering axis.
    spin.rotation.x=wheelPhases?.[id]??(spin.rotation.x+(wheelModel[id].omega||0)*dt)%(Math.PI*2);
  }
}

export function disposeVehicleVisual(vehicle){
  vehicle.group.parent?.remove(vehicle.group);
  const geometries=new Set(),materials=new Set();
  for(const mesh of vehicle.collisionMeshes||[])geometries.add(mesh.geometry);
  vehicle.group.traverse(object=>{if(object.geometry)geometries.add(object.geometry);
    if(object.material)for(const m of Array.isArray(object.material)?object.material:[object.material])materials.add(m);});
  for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();
}
