// Published gameplay choices. Surface coefficients below are authored values,
// not measured material data; appearance never supplies tire friction.
export const PAVEMENT_MATERIAL_IDS=Object.freeze(['asphalt_dense','asphalt_open','concrete','concrete_paver','clay_paver','natural_stone','gravel','earth','timber','steel']);
export const pavementProfileId=(material,condition)=>(['earth','natural_stone'].includes(material)?'pavement_':'')+material+'.'+condition;
export const pavementHasMarkings=material=>!['gravel','earth','timber','steel'].includes(material);
// Existing asphalt/concrete/gravel profiles remain at their original source.
// Earth and stone pavement use explicit profiles distinct from terrain/boulders.
export const ADDITIONAL_PAVEMENT_DATA=Object.freeze({
  asphalt_open:{mu:[.99,.70,.32,.13],rolling:[.014,.014,.02,.02],color:['#394046','#29343a','#e4ebeb','#93b5c1'],rough:[.97,.35,.98,.18],meters:2},
  concrete_paver:{mu:[.92,.60,.30,.12],rolling:[.018,.02,.024,.022],color:['#a49b89','#777366','#e4ebeb','#93b5c1'],rough:[.9,.4,.98,.2],meters:2},
  clay_paver:{mu:[.88,.55,.29,.12],rolling:[.019,.022,.026,.022],color:['#a05a3c','#713d2a','#e4ebeb','#93b5c1'],rough:[.88,.38,.98,.2],meters:2},
  natural_stone:{mu:[.90,.57,.30,.12],rolling:[.02,.022,.026,.022],color:['#9a9890','#666b69','#d9e0df','#93b5c1'],rough:[.8,.4,.98,.2],meters:2},
  earth:{mu:[.62,.38,.28,.12],rolling:[.035,.045,.03,.02],color:['#747455','#4c4b36','#d9e0df','#8badaf'],rough:[1,.72,.98,.23],meters:4},
  timber:{mu:[.75,.45,.28,.12],rolling:[.017,.019,.022,.02],color:['#8c6843','#5f4934','#d9e0df','#93b5c1'],rough:[.82,.38,.98,.19],meters:2},
  steel:{mu:[.74,.42,.24,.10],rolling:[.012,.014,.02,.02],color:['#a0aab0','#727f87','#d9e0df','#93b5c1'],rough:[.48,.24,.98,.18],metal:[.85,.85,0,0],meters:2}
});
