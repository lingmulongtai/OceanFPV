import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';

export type RoomSurface='floor'|'ceiling'|'back'|'partition'|'front'|'balcony'|'aft-floor'|'aft-ceiling'|'aft-back';
const WIDTH=256,HEIGHT=384,TILE_X=128,TILE_Y=64,PAD=2;
const atlasUV=(chart:number,u:number,v:number)=>[(chart%2*TILE_X+PAD+T.MathUtils.clamp(u,0,1)*(TILE_X-2*PAD))/WIDTH,(Math.floor(chart/2)*TILE_Y+PAD+T.MathUtils.clamp(v,0,1)*(TILE_Y-2*PAD))/HEIGHT];

/** Dedicated charts leave photographed UV0, positions and normals intact. */
export function roomOcclusionUV(geometry:T.BufferGeometry,floor=0,cabin=0,side=1,surface?:RoomSurface,end=1) {
  const p=geometry.attributes.position,n=geometry.attributes.normal,uv=new T.Float32BufferAttribute(new Float32Array(p.count*2),2);
  for(let i=0;i<p.count;i++) {
    let chart=-1,u=0,v=0;const x=Math.abs(p.getX(i)),y=p.getY(i),z=p.getZ(i);
    if(surface==='floor'&&n.getY(i)>0.9){chart=0;u=(x-7.6)/6.22;v=(z-cabin-0.04)/3.42;}
    if(surface==='ceiling'&&n.getY(i)<-0.9){chart=1;u=(x-7.6)/6.22;v=(z-cabin-0.04)/3.42;}
    if(surface==='back'&&n.getX(i)*side>0.9){chart=2;u=(z-cabin-0.04)/3.42;v=(y-floor-0.06)/2.49;}
    if(surface==='partition'&&Math.abs(n.getZ(i))>0.9){chart=n.getZ(i)>0?3:4;u=(x-7.6)/6.22;v=(y-floor-0.06)/2.49;}
    if(surface==='front'&&n.getX(i)*side<-0.9){chart=5;u=(z-cabin-0.04)/3.42;v=(y-floor-0.06)/2.49;}
    if(surface==='balcony'&&n.getY(i)<-0.9){chart=6;u=(x-13.76)/2.4;v=(z-cabin-0.04)/3.42;}
    if(surface==='aft-floor'&&n.getY(i)>.9){chart=8;u=(p.getX(i)*end+13.82)/27.64;v=(z-cabin)*end/6.07;}
    if(surface==='aft-ceiling'&&n.getY(i)<-.9){chart=9;u=(p.getX(i)*end+13.82)/27.64;v=(z-cabin)*end/6.07;}
    if(surface==='aft-back'&&n.getZ(i)*end>.9){chart=10;u=(p.getX(i)*end+13.82)/27.64;v=(y-floor-.06)/2.49;}
    const a=chart<0?[0.999,0.999]:atlasUV(chart,u,v);uv.setXY(i,a[0],a[1]);
  }
  geometry.setAttribute('uv1',uv);return geometry;
}

/** Cosine-weighted short-range visibility against copied opaque triangles. */
export class ContactOcclusion {
  private geometry:T.BufferGeometry;
  private tree:MeshBVH;
  private ray=new T.Ray();private tangent=new T.Vector3();private bitangent=new T.Vector3();
  constructor(blockers:T.BufferGeometry[]) {
    const copies=blockers.map(g=>{const flat=g.index?g.toNonIndexed():g.clone(),copy=new T.BufferGeometry();copy.setAttribute('position',flat.attributes.position.clone());flat.dispose();return copy;});
    this.geometry=mergeGeometries(copies)!;copies.forEach(g=>g.dispose());this.tree=new MeshBVH(this.geometry);
  }
  visibility(point:T.Vector3,normal:T.Vector3,radius=1.2,samples=32) {
    this.tangent.set(Math.abs(normal.y)>0.9?1:0,Math.abs(normal.y)>0.9?0:1,0).cross(normal).normalize();this.bitangent.crossVectors(normal,this.tangent);
    this.ray.origin.copy(point).addScaledVector(normal,0.002);let occlusion=0;
    for(let i=0;i<samples;i++) {
      const cosine=Math.sqrt((i+0.5)/samples),r=Math.sqrt(1-cosine*cosine),angle=i*Math.PI*(3-Math.sqrt(5));
      this.ray.direction.copy(normal).multiplyScalar(cosine).addScaledVector(this.tangent,r*Math.cos(angle)).addScaledVector(this.bitangent,r*Math.sin(angle));
      const hit=this.tree.raycastFirst(this.ray,T.DoubleSide,0.001,radius);
      if(hit)occlusion+=1-T.MathUtils.smoothstep(hit.distance,0,radius);
    }
    return 1-occlusion/samples;
  }
  dispose(){this.geometry.dispose();}
}

/** One rigid cabin template; neighbouring floor/roof/walls are included by caller. */
export function bakeCabinOcclusion(blockers:T.BufferGeometry[],floor:number,cabin:number,aft?:{blockers:T.BufferGeometry[];front:number}) {
  const sampler=new ContactOcclusion(blockers),pixels=new Uint8Array(WIDTH*HEIGHT*4).fill(255),point=new T.Vector3();
  const charts=[
    [[7.6,floor+0.06,cabin+0.04],[6.22,0,0],[0,0,3.42],[0,1,0]],
    [[7.6,floor+2.55,cabin+0.04],[6.22,0,0],[0,0,3.42],[0,-1,0]],
    [[7.62,floor+0.06,cabin+0.04],[0,0,3.42],[0,2.49,0],[1,0,0]],
    [[7.6,floor+0.06,cabin+0.04],[6.22,0,0],[0,2.49,0],[0,0,1]],
    [[7.6,floor+0.06,cabin+3.46],[6.22,0,0],[0,2.49,0],[0,0,-1]],
    [[13.72,floor+0.06,cabin+0.04],[0,0,3.42],[0,2.49,0],[-1,0,0]],
    [[13.76,floor+2.55,cabin+0.04],[2.4,0,0],[0,0,3.42],[0,-1,0]]
  ];
  charts.forEach((chart,index)=> {
    const [origin,u,v,normal]=chart.map(a=>new T.Vector3(...a));
    for(let y=0;y<TILE_Y;y++)for(let x=0;x<TILE_X;x++) {
      const s=T.MathUtils.clamp((x-PAD+0.5)/(TILE_X-2*PAD),0.0001,0.9999),t=T.MathUtils.clamp((y-PAD+0.5)/(TILE_Y-2*PAD),0.0001,0.9999);
      point.copy(origin).addScaledVector(u,s).addScaledVector(v,t);const value=Math.round(255*sampler.visibility(point,normal));
      const offset=((Math.floor(index/2)*TILE_Y+y)*WIDTH+index%2*TILE_X+x)*4;pixels[offset]=pixels[offset+1]=pixels[offset+2]=value;
    }
  });sampler.dispose();
  if(aft){
    const room=new ContactOcclusion(aft.blockers),charts=[
      [[-13.82,.06,aft.front],[27.64,0,0],[0,0,6.07],[0,1,0]],
      [[-13.82,2.55,aft.front],[27.64,0,0],[0,0,6.07],[0,-1,0]],
      [[-13.82,.06,aft.front],[27.64,0,0],[0,2.49,0],[0,0,1]]
    ];
    charts.forEach((chart,offset)=>{const index=offset+8,[origin,u,v,normal]=chart.map(a=>new T.Vector3(...a));for(let y=0;y<TILE_Y;y++)for(let x=0;x<TILE_X;x++){
      const s=T.MathUtils.clamp((x-PAD+.5)/(TILE_X-2*PAD),.0001,.9999),t=T.MathUtils.clamp((y-PAD+.5)/(TILE_Y-2*PAD),.0001,.9999);point.copy(origin).addScaledVector(u,s).addScaledVector(v,t);const value=Math.round(255*room.visibility(point,normal,8));
      const pixel=((Math.floor(index/2)*TILE_Y+y)*WIDTH+index%2*TILE_X+x)*4;pixels[pixel]=pixels[pixel+1]=pixels[pixel+2]=value;
    }});room.dispose();
  }
  const texture=new T.DataTexture(pixels,WIDTH,HEIGHT,T.RGBAFormat);texture.channel=1;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;return texture;
}
