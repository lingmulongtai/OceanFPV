import * as T from 'three';

export function hullHalfWidth(u:number,beam:number,transom=false) {
  const rounded=Math.pow(Math.max(Math.sin(Math.PI*u),0.001),0.42);
  return beam*0.5*(transom&&u>0.78?T.MathUtils.lerp(rounded,0.72,T.MathUtils.smoothstep(u,0.78,1)):rounded);
}
export function hullDeckHeight(u:number,length=92,deck=1.6) {return deck+length/92*0.75*Math.pow(1-u,4);}
/** Bow planking follows the same stations and sheer as the closed hull below it. */
export function foredeckGeometry(length=260,beam=34,deck=9) {
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[],columns=8,first=2,last=15;
  for(let station=first;station<=last;station++)for(let column=0;column<=columns;column++) {
    const u=station/128,z=(u-0.5)*length,x=(column/columns*2-1)*(hullHalfWidth(u,beam)-0.45);
    positions.push(x,hullDeckHeight(u,length,deck)+0.045,z);uvs.push(x/1.8,z/1.8);
  }
  for(let row=0;row<last-first;row++)for(let col=0;col<columns;col++) {const i=row*(columns+1)+col,j=i+columns+1;indices.push(i,j,i+1,i+1,j,j+1);}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
/** Closed station hull adapted from OceanLab. End caps share boundary vertices. */
export function closedHullGeometry(length=92,beam=8.8,deck=1.6,draft=2.7,transom=false) {
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[],stations=128;
  for(let i=0;i<=stations;i++) {
    const u=i/stations,z=(u-0.5)*length,w=hullHalfWidth(u,beam,transom),top=hullDeckHeight(u,length,deck);
    const section=[[-w,top],[w,top],[w*0.94,-draft*0.48],[w*0.48,-draft],[-w*0.48,-draft],[-w*0.94,-draft*0.48]];
    section.forEach(([x,y],j)=>{positions.push(x,y,z);uvs.push(u*length/4,j/6);});
  }
  for(let i=0;i<stations;i++) for(let j=0;j<6;j++) {const a=i*6+j,b=(i+1)*6+j,c=i*6+(j+1)%6,d=(i+1)*6+(j+1)%6;indices.push(a,b,c,c,b,d);}
  for(const end of [0,stations]) {
    const center=positions.length/3;let cy=0;for(let j=0;j<6;j++)cy+=positions[(end*6+j)*3+1]/6;
    positions.push(0,cy,(end/stations-0.5)*length);uvs.push(end/stations*length/4,0.5);
    for(let j=0;j<6;j++) {const a=end*6+j,b=end*6+(j+1)%6;if(end===0)indices.push(center,a,b);else indices.push(center,b,a);}
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();return geo;
}
