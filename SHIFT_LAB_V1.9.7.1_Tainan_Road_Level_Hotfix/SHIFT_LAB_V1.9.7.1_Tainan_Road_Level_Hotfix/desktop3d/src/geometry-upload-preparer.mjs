import * as THREE from 'three';

// A zero-count offscreen draw exercises Three's normal attribute/index upload
// and disposal ownership without drawing the terrain or touching its collider.
export class GeometryUploadPreparer {
  constructor(renderer){
    this.renderer=renderer;this.scene=new THREE.Scene();this.camera=new THREE.Camera();
    this.material=new THREE.MeshBasicMaterial();
    this.mesh=new THREE.Mesh(new THREE.BufferGeometry(),this.material);this.mesh.frustumCulled=false;
    this.scene.add(this.mesh);this.target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false,stencilBuffer:false});
    renderer.initRenderTarget(this.target);renderer.compile(this.scene,this.camera);
  }
  prepare(source){
    const renderer=this.renderer,geometry=source.geometry;
    if(!geometry.boundingSphere)geometry.computeBoundingSphere();
    const target=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),level=renderer.getActiveMipmapLevel();
    const shadow=renderer.shadowMap.autoUpdate,start=geometry.drawRange.start,count=geometry.drawRange.count;
    const previous=this.mesh.geometry;
    try{
      this.mesh.geometry=geometry;geometry.setDrawRange(0,0);
      renderer.shadowMap.autoUpdate=false;renderer.setRenderTarget(this.target);renderer.render(this.scene,this.camera);
    }finally{
      geometry.setDrawRange(start,count);this.mesh.geometry=previous;renderer.shadowMap.autoUpdate=shadow;
      renderer.setRenderTarget(target,face,level);
    }
  }
  dispose(){this.target.dispose();this.material.dispose();this.mesh.geometry.dispose();}
}
