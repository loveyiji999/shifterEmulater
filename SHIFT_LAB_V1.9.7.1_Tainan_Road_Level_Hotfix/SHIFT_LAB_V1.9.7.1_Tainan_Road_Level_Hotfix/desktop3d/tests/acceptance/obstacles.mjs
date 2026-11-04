import * as THREE from 'three';

// The static objects below exist ONLY in the acceptance environment.
// They are not baked into the v1.8.6 four-wheel solver or procedural route.
export class AcceptanceObstacles{
  constructor(RAPIER,world,scene,road){
    this.RAPIER=RAPIER;this.world=world;this.scene=scene;this.road=road;
    this.objects=[];this.barrierS=104;
    this.barrierCenter=this.road.position(this.barrierS,0);
    this.barrierCenter.y+=.68;
    this.activeScenario='free';
  }
  add(collider,mesh,ground=false){
    this.objects.push({collider,mesh,ground});this.scene.add(mesh);
    this.road.obstacleHandles.add(collider.handle);
    if(!ground)this.road.barrierHandles.add(collider.handle);
    if(ground)this.road.groundHandles.add(collider.handle);
  }
  makeBarrier(){
    const center=this.road.position(this.barrierS,0);
    this.barrierCenter={x:center.x,y:center.y+.68,z:center.z};
    this.barrierPoint=this.barrierCenter;
    const collider=this.world.createCollider(this.RAPIER.ColliderDesc.cuboid(3.65,.72,.19)
      .setTranslation(center.x,center.y+.68,center.z)
      .setFriction(.64).setRestitution(.07));
    const material=new THREE.MeshStandardMaterial({color:0xe7edf0,metalness:.16,roughness:.67});
    const mesh=new THREE.Group();mesh.position.set(center.x,center.y+.68,center.z);
    const block=new THREE.Mesh(new THREE.BoxGeometry(7.30,1.44,.38),material);
    block.castShadow=true;block.receiveShadow=true;mesh.add(block);
    const stripe=new THREE.MeshStandardMaterial({color:0xef6b4a,roughness:.86});
    for(let i=0;i<13;i++){
      const bar=new THREE.Mesh(new THREE.BoxGeometry(.34,1.46,.02),stripe);
      bar.position.set(-3.3+i*.55,0,.204);bar.rotation.z=.32;mesh.add(bar);
    }
    this.add(collider,mesh);
  }
  makeRamp(){
    const start=142,end=165,half=3.15;
    // Thin triangle mesh: an intentionally modest speed bump/ramp, not a launch pad.
    const stations=[start,149,156,end],rise=[.06,.80,.80,.06];
    const vertices=[];for(let i=0;i<stations.length;i++)for(const side of [-half,half]){
      const p=this.road.position(stations[i],side);
      vertices.push(p.x,p.y+rise[i],p.z);
    }
    const triangles=[];for(let i=0;i<stations.length-1;i++){
      const a=i*2,b=a+1,c=a+2,d=c+1;triangles.push(a,c,b,b,c,d);
    }
    const array=new Float32Array(vertices),index=new Uint32Array(triangles);
    const collider=this.world.createCollider(this.RAPIER.ColliderDesc.trimesh(array,index)
      .setFriction(.77).setRestitution(0));
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',
      new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(triangles);
    geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xbfa772,
      roughness:.96,side:THREE.DoubleSide}));mesh.receiveShadow=true;
    this.add(collider,mesh,true);
  }
  configure(scenario){
    // Rapier 0.18.x has reports of setEnabled(false) not disabling contacts.
    // Remove/recreate actual colliders instead of merely hiding their meshes.
    const mode=['frontal','fast','ramp'].includes(scenario)?scenario:'free';
    if(this.activeScenario===mode&&this.objects.length)return;
    this.dispose();
    this.activeScenario=mode;
    if(mode==='frontal'||mode==='fast')this.makeBarrier();
    if(mode==='ramp')this.makeRamp();
    if(typeof this.world.updateSceneQueries==='function')this.world.updateSceneQueries();
  }
  dispose(){
    for(const o of this.objects){
      this.road.obstacleHandles.delete(o.collider.handle);
      this.road.barrierHandles.delete(o.collider.handle);
      if(o.ground)this.road.groundHandles.delete(o.collider.handle);
      this.world.removeCollider(o.collider,true);this.scene.remove(o.mesh);
      const materials=new Set();
      o.mesh.traverse(mesh=>{
        if(mesh.geometry)mesh.geometry.dispose();
        if(mesh.material){
          for(const material of (Array.isArray(mesh.material)?mesh.material:[mesh.material]))materials.add(material);
        }
      });
      for(const material of materials)material.dispose();
    }
    this.objects=[];
  }
}
