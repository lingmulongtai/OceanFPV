import * as T from 'three';

export function deckOutline(length:number,beam:number,radius=6) {
  const w=beam/2,l=length/2,r=Math.min(radius,w,l),shape=new T.Shape();
  shape.moveTo(-w+r,-l);shape.lineTo(w-r,-l);shape.absarc(w-r,-l+r,r,-Math.PI/2,0,false);
  shape.lineTo(w,l-r);shape.absarc(w-r,l-r,r,0,Math.PI/2,false);
  shape.lineTo(-w+r,l);shape.absarc(-w+r,l-r,r,Math.PI/2,Math.PI,false);
  shape.lineTo(-w,-l+r);shape.absarc(-w+r,-l+r,r,Math.PI,Math.PI*1.5,false);
  return shape;
}
export function deckGeometry(length:number,beam:number,height:number,radius=6) {
  const geometry=new T.ExtrudeGeometry(deckOutline(length,beam,radius),{depth:height,bevelEnabled:false,curveSegments:12});
  geometry.rotateX(Math.PI/2);geometry.translate(0,height/2,0);return geometry;
}
export function windowRibbon(length:number,beam:number,height:number,radius=6,endsOnly=false,end:'both'|'bow'|'aft'='both') {
  const points=deckOutline(length,beam,radius).getPoints(12),positions:number[]=[],uvs:number[]=[],indices:number[]=[];
  for(let i=0;i<points.length;i++) {const p=points[i];positions.push(p.x,-height/2,p.y,p.x,height/2,p.y);uvs.push(i/points.length,0,i/points.length,1);if(i){const a=(i-1)*2,b=i*2,previous=points[i-1],longSide=Math.abs(p.x-previous.x)<1e-7&&Math.abs(Math.abs(p.x)-beam/2)<1e-7,selected=end==='both'||(end==='aft'?Math.min(p.y,previous.y)>=length/2-radius-1e-7:Math.max(p.y,previous.y)<=-length/2+radius+1e-7);if(selected&&(!endsOnly||!longSide))indices.push(a,a+1,b,a+1,b+1,b);}}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
