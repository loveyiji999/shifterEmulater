const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
// Authored terrain grading, separate from the immutable V3 road alignment.
// Keep soil below the deck at abutments and ease into the valley over 32m.
export function valleyDepth(feature,s,deckThickness=.8){
  const minimum=deckThickness+.4,maximum=feature.kind==='suspension'?18:12;
  const distance=Math.min(Math.max(0,s-feature.start),Math.max(0,feature.end-s));
  return minimum+(maximum-minimum)*smooth(distance/32);
}
