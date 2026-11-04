// Pure data only. No evaluator, external references or live-state writes.
export function readDesignData(input){
  if(typeof input==='string'){
    if(input.length>2_000_000)throw Error('Design document exceeds size limit');
    input=JSON.parse(input);
  }
  let count=0;
  const copy=(value,depth)=>{
    if(++count>20000||depth>24)throw Error('Design document exceeds complexity limit');
    if(value===null||typeof value==='boolean')return value;
    if(typeof value==='number'){if(!Number.isFinite(value))throw Error('Non-finite design value');return value;}
    if(typeof value==='string'){if(value.length>65536)throw Error('Design string exceeds limit');return value;}
    if(Array.isArray(value)){
      const descriptors=Object.getOwnPropertyDescriptors(value);
      for(let i=0;i<value.length;i++)if(!descriptors[i]||!('value' in descriptors[i]))throw Error('Unsafe design array');
      return value.map(v=>copy(v,depth+1));
    }
    if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))
      throw Error('Plain design data required');
    const result={};
    for(const [key,descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))){
      if(['__proto__','prototype','constructor'].includes(key)||!('value' in descriptor))throw Error('Unsafe design property');
      result[key]=copy(descriptor.value,depth+1);
    }
    return result;
  };
  return copy(input,0);
}
export function requireKeys(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))
    throw Error('Unknown or invalid '+label+' field');
}
export function requireText(value,label,max=120){
  if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('Invalid '+label);
}
export function inRange(value,min,max,label){
  if(!Number.isFinite(value)||value<min||value>max)throw Error('Invalid '+label);
}
export function designFingerprint(value){
  const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?
    Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
  const text=JSON.stringify(ordered(readDesignData(value)));
  let hash=2166136261;
  for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
  // Compatibility fingerprint, not a security signature.
  return (hash>>>0).toString(16).padStart(8,'0');
}
