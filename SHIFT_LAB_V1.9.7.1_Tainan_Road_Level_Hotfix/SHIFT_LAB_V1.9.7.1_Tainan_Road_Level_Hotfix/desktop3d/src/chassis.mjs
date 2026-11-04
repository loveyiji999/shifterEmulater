import * as THREE from 'three';
import {rayContactDistance} from './ray-contact.mjs';
import {vehicleLayout} from './vehicle-layout.mjs';

// Single authority for translation, yaw, pitch, roll and collision.
// SHIFT LAB still calculates four contact-patch forces, engine, shaft, gearbox,
// wheel angular speeds, tires, ABS/TCS/ESC and steering-rack mechanics.
export class RapierChassisBridge {
  constructor(RAPIER,world,road,physics) {
    this.RAPIER=RAPIER;this.world=world;this.road=road;this.physics=physics;
    this.rigidBody=null;this.collider=null;
    this.colliders=[];
    this.bumpStops={};this.bumpStopHandles=new Set();
    // Rapier 0.18 invokes hooks only through stepWithEvents. A queue is needed
    // even though no collision events are requested or consumed here.
    this.eventQueue=RAPIER.EventQueue?new RAPIER.EventQueue(true):undefined;
    this.physicsHooks={
      filterContactPair:(a,b)=>{
        const stopA=this.bumpStopHandles.has(a),stopB=this.bumpStopHandles.has(b);
        if((stopA&&!this.road.groundHandles.has(b))||(stopB&&!this.road.groundHandles.has(a)))return null;
        return this.RAPIER.SolverFlags.COMPUTE_IMPULSE;
      },
      filterIntersectionPair:()=>true
    };
    this.q=new THREE.Quaternion();this.euler=new THREE.Euler(0,0,0,'YXZ');
    this.temp=new THREE.Vector3();
    this.collisionCount=0; // total rail and barrier episodes
    this.railHits=0;this.barrierHits=0;
    this.maxImpactImpulse=0;this.maxBarrierPenetration=0;
    this.lastImpact={type:'',impulse:0,time:0};
    this.lastContact=false;this.lastRail=false;this.lastBarrier=false;
    this.lastWheelContacts=0;
    this.wheelCastHits=0;this.wheelCastMisses=0;this.invalidWheelLoads=0;
    this.contactMicrosteps=0;this.totalSuspensionMicrosteps=0;
    this.eventHistory=[];
    this.maxExternalForceN=0;this.maxExternalTorqueNm=0;this.forceResetCount=0;
    this.wheelVisualState={};
    this.wheelPhases={};
  }
  create(params){
    const layout=vehicleLayout(params);
    for(const key of ['mass','pitchInertia','yawInertia','rollInertia'])
      if(!Number.isFinite(params[key])||params[key]<=0)throw Error('Invalid chassis parameter: '+key);
    const d=this.RAPIER.RigidBodyDesc.dynamic()
      .setAdditionalMassProperties(params.mass,{x:0,y:0,z:0},
        {x:Math.max(200,params.pitchInertia),y:params.yawInertia,z:Math.max(200,params.rollInertia)},
        {x:0,y:0,z:0,w:1})
      .setCcdEnabled(true).setCanSleep(false)
      .setLinearDamping(.022).setAngularDamping(.14);
    const nextBody=this.world.createRigidBody(d),nextColliders=[],nextStops={};
    // Collider mass is zero to preserve the supplied measured/illustrative
    // chassis inertias, rather than double-counting hull density.
    try{
      for(const part of layout.colliders){
        const h=part.halfExtents,c=part.center;
        const shape=part.kind==='convex'?this.RAPIER.ColliderDesc.convexHull(new Float32Array(part.vertices)):
          this.RAPIER.ColliderDesc.cuboid(h.x,h.y,h.z);
        if(!shape)throw Error('Invalid convex vehicle panel');
        nextColliders.push(this.world.createCollider(shape.setTranslation(c.x,c.y,c.z)
          .setDensity(0).setFriction(.55).setRestitution(.08),nextBody));
      }
      // Mechanical maximum-jounce stops. Their normal impulses are solved by
      // Rapier only; zero/min friction prevents duplicating the core tire force.
      // They contact drivable ground only, not rails/walls or other structures.
      for(const id of ['FL','FR','RL','RR']){
        const front=id[0]==='F',x=(id[1]==='L'?-1:1)*(front?params.trackFront:params.trackRear)/2;
        const z=front?params.wheelbase*(1-params.frontStaticLoad):-params.wheelbase*params.frontStaticLoad;
        nextStops[id]=this.world.createCollider(this.RAPIER.ColliderDesc.cylinder(.11,params.wheelRadius)
          .setTranslation(x,-params.cgHeight+params.wheelRadius+params.bumpTravel,z)
          .setRotation({x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2})
          .setDensity(0).setFriction(0).setFrictionCombineRule(this.RAPIER.CoefficientCombineRule.Min)
          .setRestitution(0).setRestitutionCombineRule(this.RAPIER.CoefficientCombineRule.Min)
          .setContactSkin(.003).setActiveHooks(this.RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS),nextBody);
      }
    }catch(error){this.world.removeRigidBody(nextBody);throw error;}
    if(this.rigidBody)this.world.removeRigidBody(this.rigidBody);
    this.rigidBody=nextBody;this.colliders=nextColliders;this.collider=nextColliders[0];
    this.bumpStops=nextStops;this.bumpStopHandles=new Set(Object.values(nextStops).map(c=>c.handle));
  }
  reset(roadPoint,params){
    if(!this.rigidBody||Math.abs(this.rigidBody.mass()-params.mass)>1)this.create(params);
    const b=this.rigidBody;
    b.setTranslation({x:roadPoint.x,y:roadPoint.y+params.cgHeight+.025,z:roadPoint.z},true);
    b.setRotation(this.initialRoadRotation(roadPoint,roadPoint.heading),true);
    b.setLinvel({x:0,y:0,z:0},true);b.setAngvel({x:0,y:0,z:0},true);
    b.resetForces(true);b.resetTorques(true);
    this.resetImpactTelemetry();this.sync();
  }
  initialRoadRotation(roadPoint,heading){
    const normal=roadPoint.surfaceNormal;
    if(!normal||![normal.x,normal.y,normal.z].every(Number.isFinite)||normal.y<.2)
      return {x:0,y:Math.sin(heading/2),z:0,w:Math.cos(heading/2)};
    // Initial pose only. Rapier remains the authority for all later rotation.
    const up=new THREE.Vector3(normal.x,normal.y,normal.z).normalize();
    const forward=new THREE.Vector3(Math.sin(heading),
      -(up.x*Math.sin(heading)+up.z*Math.cos(heading))/up.y,Math.cos(heading)).normalize();
    const right=new THREE.Vector3().crossVectors(up,forward).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward));
  }
  resetImpactTelemetry(){
    this.wheelVisualState={};
    this.wheelPhases={};
    for(const id of this.physics.WHEEL_IDS||[])if(this.physics.wheelModel[id])this.physics.wheelModel[id].contactSurface=null;
    this.collisionCount=0;this.railHits=0;this.barrierHits=0;
    this.maxImpactImpulse=0;this.maxBarrierPenetration=0;
    this.lastImpact={type:'',impulse:0,time:0};
    this.lastContact=false;this.lastRail=false;this.lastBarrier=false;
    this.eventHistory=[];
    this.lastWheelContacts=0;
    this.wheelCastHits=0;this.wheelCastMisses=0;this.invalidWheelLoads=0;
    this.contactMicrosteps=0;this.totalSuspensionMicrosteps=0;
    this.maxExternalForceN=0;this.maxExternalTorqueNm=0;this.forceResetCount=0;
  }
  // Scenario/QA setup only. Set both Rapier pose and legacy route/wheel states,
  // otherwise SHIFT LAB's road-projection guard or wheel slip would diverge.
  teleport({roadPoint,side=0,angle=0,speed=0}){
    const d=this.physics,P=d.params,b=this.rigidBody;
    const heading=roadPoint.heading+angle;
    const rightX=Math.cos(roadPoint.heading),rightZ=-Math.sin(roadPoint.heading);
    const x=roadPoint.x+rightX*side,z=roadPoint.z+rightZ*side;
    // Keep the road point height and the scalar-route fallback for QA.
    const surfaceY=Number.isFinite(roadPoint.y)?roadPoint.y:this.road.position(roadPoint.s,side).y;
    const y=surfaceY+P.cgHeight+.025;
    b.setTranslation({x,y,z},true);
    b.setRotation(this.initialRoadRotation(roadPoint,heading),true);
    b.setLinvel({x:Math.sin(heading)*speed,y:0,z:Math.cos(heading)*speed},true);
    b.setAngvel({x:0,y:0,z:0},true);
    // A teleport must not retain forces or moments from the previous test.
    b.resetForces(true);b.resetTorques(true);
    if(typeof this.world.updateSceneQueries==='function')this.world.updateSceneQueries();
    for(const id of d.WHEEL_IDS){
      const wheel=d.wheelModel[id];wheel.omega=speed/P.wheelRadius;
      wheel.absPressure=1;
    }
    d.state.drivenWheelOmega=speed/P.wheelRadius;
    d.state.coastWheelOmega=speed/P.wheelRadius;
    d.route.distance=roadPoint.s;
    d.vehicleMotion.routeS=roadPoint.s;
    d.vehicleMotion.offset=side;
    this.resetImpactTelemetry();this.sync();
  }
  beforeForces(h){
    const d=this.physics,P=d.params,b=this.rigidBody;
    // Rapier user forces and torques persist across world.step(). Without this
    // pair of resets, each of the four suspension struts adds its load again
    // at every 1/480s microstep; parked vehicles accelerate into the sky.
    b.resetForces(true);b.resetTorques(true);
    this.forceResetCount++;
    const pos=b.translation(),rot=b.rotation(),lin=b.linvel(),omega=b.angvel();
    this.q.set(rot.x,rot.y,rot.z,rot.w);
    const up=new THREE.Vector3(0,1,0).applyQuaternion(this.q).normalize();
    const down={x:-up.x,y:-up.y,z:-up.z};
    let contacts=0,maxTravel=0;
    this.totalSuspensionMicrosteps++;
    for(const id of d.WHEEL_IDS){
      const w=d.wheelModel[id],corner=d.wheelCoords(id);
      if(this.bumpStops[id]){
        const half=(w.steer||0)/2,s=Math.sin(half),c=Math.cos(half),r=Math.SQRT1_2;
        this.bumpStops[id].setRotationWrtParent({x:s*r,y:s*r,z:c*r,w:c*r});
      }
      const mount=new THREE.Vector3(corner.x,-.15,corner.z).applyQuaternion(this.q);
      const origin={x:pos.x+mount.x,y:pos.y+mount.y,z:pos.z+mount.z};
      const restLoad=P.mass*9.81*(w.front?P.frontStaticLoad:1-P.frontStaticLoad)/2;
      const stiffness=w.front?P.springFront:P.springRear;
      const damper=w.front?P.damperFront:P.damperRear;
      const rest=P.cgHeight-.15+restLoad/stiffness;
      const maxDistance=rest+(w.front?P.droopTravel:P.droopTravel)+.28;
      const ray=new this.RAPIER.Ray(origin,down);
      const cast=this.world.castRayAndGetNormal||this.world.castRay;
      const hit=cast.call(this.world,ray,maxDistance,true,
        this.RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,this.collider,b,
        candidate=>this.road.groundHandles.has(candidate.handle));
      const distance=rayContactDistance(hit,maxDistance);
      w.contactSurface=null;
      this.wheelVisualState[id]={distance:null,contact:false,
        hubLocalY:-P.cgHeight+P.wheelRadius-P.droopTravel};
      if(distance===null){
        if(hit)this.invalidWheelLoads++;
        this.wheelCastMisses++;
        w.normal=0;w.contact=false;w.travel=-P.droopTravel;
        w.springForce=0;
        continue;
      }
      this.wheelCastHits++;
      if(this.road.surfaceAtHit)w.contactSurface=this.road.surfaceAtHit(hit,{x:origin.x+down.x*distance,y:origin.y+down.y*distance,z:origin.z+down.z*distance});
      const compression=rest-distance;
      const r=new THREE.Vector3(mount.x,mount.y,mount.z);
      const turn=new THREE.Vector3(omega.x,omega.y,omega.z).cross(r);
      const pointSpeed=new THREE.Vector3(lin.x,lin.y,lin.z).add(turn);
      const verticalSpeed=pointSpeed.dot(up);
      const load=Math.max(0,Math.min(restLoad*4.2,
        stiffness*compression-damper*verticalSpeed));
      if(!Number.isFinite(load)){
        this.invalidWheelLoads++;w.normal=0;w.contact=false;
        w.springForce=0;w.travel=-P.droopTravel;continue;
      }
      w.normal=load;w.contact=load>1;
      this.wheelVisualState[id]={distance,contact:w.contact,
        hubLocalY:w.contact?-.15-distance+P.wheelRadius:-P.cgHeight+P.wheelRadius-P.droopTravel};
      w.travel=Math.max(-P.droopTravel,Math.min(P.bumpTravel,compression-restLoad/stiffness));
      w.roadHeight=0;w.hubZ=0;w.hubV=0;w.springForce=load;
      if(w.contact){
        this.rigidBody.addForceAtPoint({x:up.x*load,y:up.y*load,z:up.z*load},origin,true);
        contacts++;
      }
      maxTravel=Math.max(maxTravel,Math.abs(w.travel));
    }
    this.lastWheelContacts=contacts;
    if(contacts>0)this.contactMicrosteps++;
    d.suspension.contacts=contacts;
    d.suspension.maxTravel=maxTravel;
  }
  stepForces(totalFx,totalFy,yawMoment,resistance,h){
    const d=this.physics,b=this.rigidBody,m=d.vehicleMotion;
    this.q.set(b.rotation().x,b.rotation().y,b.rotation().z,b.rotation().w);
    const forward=new THREE.Vector3(0,0,1).applyQuaternion(this.q);
    const right=new THREE.Vector3(1,0,0).applyQuaternion(this.q);
    // Apply each wheel's already-computed BODY-frame tire forces at its
    // contact patch. This reproduces their summed yaw moment without injecting
    // it a second time, while creating real pitch and roll load transfer.
    const position=b.translation();
    for(const id of d.WHEEL_IDS){
      const wheel=d.wheelModel[id];
      // Cosmetic angular position derived from the solver's angular velocity,
      // once per physics microstep. Rendering/pausing never advances it.
      this.wheelPhases[id]=((this.wheelPhases[id]||0)+(Number.isFinite(wheel.omega)?wheel.omega:0)*h)%(Math.PI*2);
      if(!wheel.contact)continue;
      const local=d.wheelCoords(id);
      const arm=new THREE.Vector3(local.x,-d.params.cgHeight,local.z).applyQuaternion(this.q);
      const force=new THREE.Vector3().copy(forward).multiplyScalar(wheel.fxBody)
        .addScaledVector(right,wheel.fyBody);
      b.addForceAtPoint({x:force.x,y:force.y,z:force.z},
        {x:position.x+arm.x,y:position.y+arm.y,z:position.z+arm.z},true);
    }
    // Aerodynamic and rolling forces act at the CG. Road grade is handled by
    // Rapier gravity on the actual road mesh, not counted a second time here.
    b.addForce({x:forward.x*resistance,y:forward.y*resistance,z:forward.z*resistance},true);
    const force=b.userForce(),torque=b.userTorque();
    const forceN=Math.hypot(force.x,force.y,force.z);
    const torqueNm=Math.hypot(torque.x,torque.y,torque.z);
    if(!Number.isFinite(forceN)||!Number.isFinite(torqueNm))
      throw new Error('3D wheel force / torque became non-finite');
    this.maxExternalForceN=Math.max(this.maxExternalForceN,forceN);
    this.maxExternalTorqueNm=Math.max(this.maxExternalTorqueNm,torqueNm);
    this.world.timestep=h;this.world.step(this.eventQueue,this.physicsHooks);
    this.sync();
    m.lateralAccel=totalFy/d.params.mass;
    this.captureContacts(h);
  }
  captureContacts(h){
    const m=this.physics.vehicleMotion;
    let rail=false,barrier=false,impact=0,maxDepth=0;
    for(const collider of this.colliders.length?this.colliders:[this.collider])this.world.contactPairsWith(collider,other=>{
      const isRail=this.road.railHandles.has(other.handle);
      const isBarrier=this.road.barrierHandles.has(other.handle);
      if(!isRail&&!isBarrier)return;
      let localImpulse=0,localDepth=0,confirmed=false;
      this.world.contactPair(collider,other,manifold=>{
        const count=manifold.numContacts();
        for(let i=0;i<count;i++){
          const force=Math.abs(manifold.contactImpulse(i));
          const depth=Math.max(0,-manifold.contactDist(i));
          if(Number.isFinite(force))localImpulse+=force;
          if(Number.isFinite(depth))localDepth=Math.max(localDepth,depth);
          if(force>.0001||depth>.001)confirmed=true;
        }
      });
      if(!confirmed)return;
      rail ||=isRail;barrier ||=isBarrier;
      impact+=localImpulse;
      maxDepth=Math.max(maxDepth,localDepth);
    });
    if(rail&&!this.lastRail){this.railHits++;m.guardrailHits++;}
    if(barrier&&!this.lastBarrier)this.barrierHits++;
    if((rail||barrier)&&!this.lastContact){
      this.collisionCount++;
      const type=barrier?'路障':'護欄';
      this.lastImpact={type,impulse:impact,time:this.physics.state.time};
      this.eventHistory.push({type,time:this.physics.state.time,
        speed:Math.hypot(...Object.values(this.rigidBody.linvel())),impulse:impact});
      if(this.eventHistory.length>30)this.eventHistory.shift();
    }
    if((rail||barrier)&&impact>this.lastImpact.impulse){
      this.lastImpact={type:barrier?'路障':'護欄',impulse:impact,time:this.physics.state.time};
    }
    this.maxImpactImpulse=Math.max(this.maxImpactImpulse,impact);
    this.maxBarrierPenetration=Math.max(this.maxBarrierPenetration,maxDepth);
    this.lastRail=rail;this.lastBarrier=barrier;
    this.lastContact=rail||barrier;
    m.contact=rail||barrier;
    if(m.contact)m.contactCooldown=.28;
  }
  sync(){
    const d=this.physics,b=this.rigidBody,m=d.vehicleMotion,P=d.params;
    const t=b.translation(),q=b.rotation(),v=b.linvel(),w=b.angvel();
    this.q.set(q.x,q.y,q.z,q.w);
    this.euler.setFromQuaternion(this.q,'YXZ');
    m.heading=this.euler.y;m.pitch=this.euler.x;m.roll=this.euler.z;
    const fwd=new THREE.Vector3(0,0,1).applyQuaternion(this.q);
    const right=new THREE.Vector3(1,0,0).applyQuaternion(this.q);
    d.state.velocity=v.x*fwd.x+v.y*fwd.y+v.z*fwd.z;
    m.lateralVelocity=v.x*right.x+v.y*right.y+v.z*right.z;
    m.yawRate=w.y;m.pitchRate=w.x;m.rollRate=w.z;
    m.x=t.x;m.z=t.z;m.y=t.y-P.cgHeight;
  }
  dispose(){
    if(this.rigidBody)this.world.removeRigidBody(this.rigidBody);
    this.rigidBody=null;this.collider=null;this.colliders=[];this.bumpStops={};this.bumpStopHandles.clear();
    this.eventQueue?.free();this.eventQueue=undefined;
  }
}
