// Rapier 0.18 RayColliderHit exposes `timeOfImpact`, not `toi`.
// Return null for absent/invalid hits so a NaN cannot silently poison wheel loads.
export function rayContactDistance(hit,maxDistance){
  const distance=hit?.timeOfImpact;
  return Number.isFinite(distance)&&distance>=0&&distance<=maxDistance+1e-5?distance:null;
}
