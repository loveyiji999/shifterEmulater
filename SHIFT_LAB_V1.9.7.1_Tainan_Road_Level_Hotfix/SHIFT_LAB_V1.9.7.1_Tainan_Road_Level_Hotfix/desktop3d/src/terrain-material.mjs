import * as THREE from 'three';
import {TERRAIN_MATERIALS} from './terrain-surface.mjs';

export class TerrainMaterial extends THREE.MeshStandardMaterial {
  constructor(library,surfaces){
    const earth=library.textures('earth');
    super({color:0xffffff,roughness:1,vertexColors:true,side:THREE.DoubleSide,
      map:earth.color,normalMap:earth.normal,roughnessMap:earth.roughness});
    const gravel=library.textures('gravel'),rock=library.textures('exposed_rock');
    this.name='terrain-three-layer';this.userData.surfaceMaterials=[...TERRAIN_MATERIALS];
    this.uniforms={terrainGravelMap:{value:gravel.color},terrainGravelNormal:{value:gravel.normal},terrainGravelRough:{value:gravel.roughness},
      terrainRockMap:{value:rock.color},terrainRockNormal:{value:rock.normal},terrainRockRough:{value:rock.roughness},
      terrainTints:{value:TERRAIN_MATERIALS.map(()=>new THREE.Color())},terrainRough:{value:new THREE.Vector3()},terrainMacro:{value:1}};
    this.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,this.uniforms);
      shader.vertexShader='attribute vec3 terrainWeights;varying vec3 vTerrainWeights;varying vec2 vTerrainUv;varying vec3 vTerrainPosition;varying vec3 vTerrainNormal;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTerrainWeights=terrainWeights;vTerrainUv=uv;vTerrainPosition=position;vTerrainNormal=normal;');
      shader.fragmentShader=`varying vec3 vTerrainWeights;varying vec2 vTerrainUv;varying vec3 vTerrainPosition;varying vec3 vTerrainNormal;
uniform sampler2D terrainGravelMap,terrainGravelNormal,terrainGravelRough;
uniform sampler2D terrainRockMap,terrainRockNormal,terrainRockRough;
uniform vec3 terrainTints[3];uniform vec3 terrainRough;uniform float terrainMacro;
`+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
vec3 tw=max(vTerrainWeights,vec3(0.0));tw/=max(dot(tw,vec3(1.0)),.000001);
vec2 guv=vTerrainUv/2.0;
vec3 terrainN=normalize(vTerrainNormal),tri=pow(abs(terrainN),vec3(4.0));tri/=max(dot(tri,vec3(1.0)),.000001);
vec2 rx=vTerrainPosition.yz/4.0,ry=vTerrainPosition.xz/4.0,rz=vTerrainPosition.xy/4.0;
vec3 rockColor=texture2D(terrainRockMap,rx).rgb*tri.x+texture2D(terrainRockMap,ry).rgb*tri.y+texture2D(terrainRockMap,rz).rgb*tri.z;
diffuseColor.rgb*=texture2D(map,vMapUv).rgb*terrainTints[0]*tw.x
  +texture2D(terrainGravelMap,guv).rgb*terrainTints[1]*tw.y
  +rockColor*terrainTints[2]*tw.z;`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','diffuseColor.rgb*=mix(vec3(1.0),vColor,terrainMacro);');
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
float roughnessFactor=texture2D(roughnessMap,vRoughnessMapUv).g*terrainRough.x*tw.x
  +texture2D(terrainGravelRough,guv).g*terrainRough.y*tw.y
  +(texture2D(terrainRockRough,rx).g*tri.x+texture2D(terrainRockRough,ry).g*tri.y+texture2D(terrainRockRough,rz).g*tri.z)*terrainRough.z*tw.z;`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
vec3 mapN=(texture2D(normalMap,vNormalMapUv).xyz*2.0-1.0)*tw.x
  +(texture2D(terrainGravelNormal,guv).xyz*2.0-1.0)*tw.y;
mapN.xy*=normalScale;
vec3 nx=texture2D(terrainRockNormal,rx).xyz*2.0-1.0,ny=texture2D(terrainRockNormal,ry).xyz*2.0-1.0,nz=texture2D(terrainRockNormal,rz).xyz*2.0-1.0;
nx.xy*=normalScale;ny.xy*=normalScale;nz.xy*=normalScale;
vec3 rockN=normalize(vec3(abs(nx.z)*terrainN.x,nx.x+terrainN.y,nx.y+terrainN.z)*tri.x
  +vec3(ny.x+terrainN.x,abs(ny.z)*terrainN.y,ny.y+terrainN.z)*tri.y
  +vec3(nz.x+terrainN.x,nz.y+terrainN.y,abs(nz.z)*terrainN.z)*tri.z);
vec3 rockView=normalize((viewMatrix*vec4(rockN,0.0)).xyz)*faceDirection;
normal=normalize(tbn*mapN+rockView*tw.z);`);
    };
    this.setCondition(surfaces);
  }
  customProgramCacheKey(){return 'terrain-three-layer-v1';}
  setCondition(surfaces){
    const profiles=TERRAIN_MATERIALS.map(id=>surfaces.profile(id+'.'+surfaces.condition));
    profiles.forEach((p,i)=>this.uniforms.terrainTints.value[i].set(p.pbr.color));
    this.uniforms.terrainRough.value.fromArray(profiles.map(p=>p.pbr.roughness));
    this.uniforms.terrainMacro.value=['snow','ice'].includes(surfaces.condition)?0:1;
  }
}
