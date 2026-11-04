// Exact triangle partition: no simplification, clipping or duplicate faces.
// Compact vertex buffers keep each Rapier shape AABB local to its own cells.
export function partitionColliderMesh(vertices,indices,cellSize=16){
  const buckets=new Map();
  for(let face=0;face<indices.length/3;face++){
    const offset=face*3,a=indices[offset]*3,b=indices[offset+1]*3,c=indices[offset+2]*3;
    const x=Math.floor((vertices[a]+vertices[b]+vertices[c])/(3*cellSize));
    const y=Math.floor((vertices[a+1]+vertices[b+1]+vertices[c+1])/(3*cellSize));
    const z=Math.floor((vertices[a+2]+vertices[b+2]+vertices[c+2])/(3*cellSize));
    const key=x+','+y+','+z;let bucket=buckets.get(key);
    if(!bucket){bucket={vertices:[],indices:[],faces:[],remap:new Map()};buckets.set(key,bucket);}
    bucket.faces.push(face);
    for(let n=offset;n<offset+3;n++){
      const source=indices[n];let local=bucket.remap.get(source);
      if(local===undefined){local=bucket.vertices.length/3;bucket.remap.set(source,local);
        bucket.vertices.push(vertices[source*3],vertices[source*3+1],vertices[source*3+2]);}
      bucket.indices.push(local);
    }
  }
  return [...buckets.values()].map(b=>({vertices:new Float32Array(b.vertices),indices:new Uint32Array(b.indices),faces:new Uint32Array(b.faces)}));
}
