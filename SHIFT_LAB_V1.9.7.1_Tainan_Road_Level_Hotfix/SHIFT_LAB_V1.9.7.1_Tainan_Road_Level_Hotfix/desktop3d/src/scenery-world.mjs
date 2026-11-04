import * as THREE from 'three';
export class SceneryWorld {
  constructor(road){this.road=road;const maps=road.materialLibrary.textures('earth');
    this.materials={trunk:new THREE.MeshStandardMaterial({color:0x66503a,roughness:1,vertexColors:true}),
      foliage:new THREE.MeshStandardMaterial({color:0x375b37,roughness:1,vertexColors:true}),
      rock:new THREE.MeshStandardMaterial({color:0x85877d,roughness:.95,vertexColors:true,flatShading:true,map:maps.color,normalMap:maps.normal,roughnessMap:maps.roughness})};
    this.setCondition(road.surfaceMap.condition);
  }
  setCondition(condition){
    const profile=this.road.surfaceMap.profile('natural_stone.'+condition);
    this.materials.rock.color.set(profile.pbr.color);this.materials.rock.roughness=profile.pbr.roughness;
    this.materials.foliage.color.set(condition==='snow'?'#c1cfc2':condition==='ice'?'#718e7d':condition==='wet'?'#2b492d':'#375b37');
    this.materials.trunk.color.set(condition==='wet'?'#4e3e2d':'#66503a');
  }
  create(data,staged=false,deferCollider=null){
    const road=this.road,result={objects:[],colliders:[],models:data.models};
    try{
      for(const [kind,part] of Object.entries(data.meshes)){
        const geometry=new THREE.BufferGeometry();
        for(const [name,array,size] of [['position',part.vertices,3],['normal',part.normals,3],['uv',part.uv,2],['color',part.colors,3]])geometry.setAttribute(name,new THREE.BufferAttribute(array,size));
        if(part.sky){geometry.setAttribute('skyVisibility',new THREE.BufferAttribute(part.sky,1));geometry.setAttribute('tunnelId',new THREE.BufferAttribute(part.tunnelIds,1));}
        geometry.setIndex(new THREE.BufferAttribute(part.indices,1));
        const mesh=new THREE.Mesh(geometry,this.materials[kind]);road.skyLighting?.registerStatic(mesh);mesh.visible=!staged;mesh.castShadow=true;mesh.receiveShadow=true;
        mesh.userData.sceneryKind=kind;if(kind==='rock')mesh.userData.surfaceLayerId=data.layerId;road.scene.add(mesh);result.objects.push(mesh);
      }
      for(const piece of data.collisions){
        const desc=road.rapier.ColliderDesc.trimesh(piece.vertices,piece.indices).setFriction(piece.kind==='rock'?.7:.55);
        if(staged)desc.setEnabled(false);
        const create=()=>{
          const collider=road.world.createCollider(desc),handles=piece.kind==='rock'?road.groundHandles:road.barrierHandles;
          handles.add(collider.handle);result.colliders.push({collider,handles,kind:piece.kind,id:piece.id});
          if(piece.kind==='rock')road.surfaceMap.bind(collider,{kind:'rock',layerId:data.layerId,renderFaces:piece.renderFaces,sceneryId:piece.id,faces:Array(piece.indices.length/3).fill('natural_stone.'+road.surfaceMap.condition)});
        };
        if(staged&&deferCollider)deferCollider(create);else create();
      }
      return result;
    }catch(error){this.dispose(result);throw error;}
  }
  activate(scenery){if(!scenery)return;for(const mesh of scenery.objects)mesh.visible=true;for(const {collider} of scenery.colliders)collider.setEnabled(true);}
  dispose(scenery){if(!scenery)return;const road=this.road;
    for(const {collider,handles} of scenery.colliders){handles.delete(collider.handle);road.surfaceMap.unbind(collider);road.world.removeCollider(collider,true);}
    for(const mesh of scenery.objects){road.scene.remove(mesh);mesh.geometry.dispose();}
  }
}
