import assert from 'node:assert/strict';
// Compare oriented triangles including duplicate counts, independent of packing.
export function assertColliderTriangles(meshes,colliders){
  const expected=new Map(),actual=new Map();
  const add=(map,v,i)=>{for(let n=0;n<i.length;n+=3){const values=[];
    for(let k=0;k<3;k++)for(let a=0;a<3;a++)values.push(v[i[n+k]*3+a]);
    const key=values.join(',');map.set(key,(map.get(key)||0)+1);}};
  for(const mesh of meshes)add(expected,mesh.geometry.attributes.position.array,mesh.geometry.index.array);
  for(const collider of colliders)add(actual,collider.vertices(),collider.indices());
  assert.equal(actual.size,expected.size,'all original oriented triangles must remain');
  for(const [key,count] of expected)assert.equal(actual.get(key),count,'missing or duplicated collision triangle: '+key);
}
