// Frozen revision 2, retained only to validate earlier saved data documents.
// Current shared reference geometry with open wheel wells is defined below.
export function vehicleLayoutV2(params){
  if(!Number.isFinite(params.wheelbase)||params.wheelbase<=0)throw Error('Invalid vehicle wheelbase');
  const halfLength=Math.max(1.55,params.wheelbase*.70);
  return {revision:2,
    body:{width:1.74,height:.56,length:halfLength*2,centerY:0},
    cabin:{width:1.34,height:.45,length:1.60,center:{x:0,y:.43,z:-.16}},
    colliders:[
      {id:'body',halfExtents:{x:.87,y:.28,z:halfLength},center:{x:0,y:0,z:0}},
      {id:'cabin',halfExtents:{x:.67,y:.225,z:.8},center:{x:0,y:.43,z:-.16}}
    ],
    bodyHullToleranceM:.001,decorativeLampOverhangM:.01,
    // Reference ray suspension has a finite-width visual tire, not a deforming
    // contact patch. Permit at most 15 mm local plane overlap/gap in diagnostics.
    wheelSurfaceToleranceM:.015,
    wheelContactModel:'suspension-rays-and-core-tire-forces'};
}

// Open wheel wells use a conservative sphere enclosing the entire spinning
// tire/rim at EVERY steering angle. Its upper envelope at maximum bump bounds
// the whole vertical travel. Tangent panels stay outside that envelope.
export function vehicleLayout(params){
  const {wheelbase,wheelRadius,cgHeight,bumpTravel,droopTravel,trackFront,trackRear,frontStaticLoad}=params;
  for(const value of [wheelbase,wheelRadius,cgHeight,bumpTravel,droopTravel,trackFront,trackRear])
    if(!Number.isFinite(value)||value<=0)throw Error('Invalid wheel-well geometry parameter');
  if(!(frontStaticLoad>0&&frontStaticLoad<1))throw Error('Invalid wheel-well axle distribution');
  const clearance=.02,wheelHalfWidth=.123,sweepRadius=Math.hypot(wheelRadius,wheelHalfWidth)+clearance;
  const innerHalfWidth=Math.min(.84,Math.min(trackFront,trackRear)/2-sweepRadius);
  if(innerHalfWidth<.1)throw Error('Wheel envelope leaves insufficient chassis space');
  const maxHubY=-cgHeight+wheelRadius+bumpTravel;
  const top=Math.max(.28,maxHubY+sweepRadius+.03),bottom=-.28;
  const frontZ=wheelbase*(1-frontStaticLoad),rearZ=-wheelbase*frontStaticLoad;
  const lowZ=Math.min(-wheelbase*.70,rearZ-sweepRadius-.3),highZ=Math.max(wheelbase*.70,frontZ+sweepRadius+.3);
  const length=highZ-lowZ,centerZ=(lowZ+highZ)/2;
  const body={width:1.74,height:top-bottom,length,centerY:(top+bottom)/2,centerZ};
  const cabin={width:1.34,height:.45,length:Math.min(1.6,wheelbase-2*sweepRadius-.04),
    center:{x:0,y:top+.225-.02,z:(frontZ+rearZ)/2}};
  const colliders=[
    {id:'body',kind:'box',halfExtents:{x:innerHalfWidth,y:body.height/2,z:length/2},center:{x:0,y:body.centerY,z:centerZ}},
    {id:'cabin',kind:'box',halfExtents:{x:cabin.width/2,y:cabin.height/2,z:cabin.length/2},center:cabin.center}
  ];
  const triangles=[0,2,1,1,2,3,4,5,6,5,7,6,0,1,4,1,5,4,2,6,3,3,6,7,0,4,2,2,4,6,1,3,5,3,7,5];
  for(const side of [-1,1]){
    const inner=side*innerHalfWidth,outer=side*.87,cx=(inner+outer)/2,half=Math.abs(outer-inner)/2;
    const panel=(id,a,b,y0,y1)=>{
      if(!(b>a&&top>Math.max(y0,y1)))throw Error('Degenerate wheel-well panel');
      const vertices=[];
      for(const x of [-half,half])for(const z of [a,b])for(const high of [false,true])
        vertices.push(x,high?top:z===a?y0:y1,z);
      colliders.push({id:`side-${side}-${id}`,kind:'convex',vertices,indices:triangles.slice(),center:{x:cx,y:0,z:0}});
    };
    let end=lowZ;
    for(const [axle,z] of [['rear',rearZ],['front',frontZ]]){
      panel(axle+'-flat',end,z-sweepRadius,bottom,bottom);
      const height=d=>maxHubY+Math.sqrt(Math.max(0,sweepRadius*sweepRadius-d*d));
      for(let i=0;i<8;i++){
        const a=-sweepRadius*Math.cos(Math.PI*i/8),b=-sweepRadius*Math.cos(Math.PI*(i+1)/8);
        const f0=height(a),f1=height(b),slope=(f1-f0)/(b-a);
        const critical=Math.max(a,Math.min(b,-slope*sweepRadius/Math.sqrt(1+slope*slope)));
        const lift=height(critical)-(f0+slope*(critical-a))+.0001;
        panel(axle+'-arch-'+i,z+a,z+b,f0+lift,f1+lift);
      }
      end=z+sweepRadius;
    }
    panel('nose-flat',end,highZ,bottom,bottom);
  }
  return {revision:3,body,cabin,colliders,bodyHullToleranceM:.001,decorativeLampOverhangM:.01,
    wheelSurfaceToleranceM:.015,wheelContactModel:'suspension-rays-and-core-tire-forces',
    wheelWells:{clearanceM:clearance,enclosingRadiusM:sweepRadius,wheelHalfWidthM:wheelHalfWidth,
      minHubY:-cgHeight+wheelRadius-droopTravel,maxHubY,innerHalfWidth,
      axles:{front:frontZ,rear:rearZ},certificate:'vertical-swept-sphere-conservative-tangent-panels'}};
}
