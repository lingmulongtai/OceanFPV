import * as T from 'three';

/** Ship-local metric projection; split charts without changing rendered faces. */
export function metricPaintGeometry(source:T.BufferGeometry,period=2.5) {
  const geometry=source.index?source.toNonIndexed():source.clone(),position=geometry.attributes.position;
  const uv=new T.Float32BufferAttribute(new Float32Array(position.count*2),2),a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
  for(let i=0;i<position.count;i+=3) {
    a.fromBufferAttribute(position,i);b.fromBufferAttribute(position,i+1).sub(a);c.fromBufferAttribute(position,i+2).sub(a);b.cross(c);
    const x=Math.abs(b.x),y=Math.abs(b.y),z=Math.abs(b.z),axis=y>=x&&y>=z?'y':x>=z?'x':'z';
    for(let j=i;j<i+3;j++) {
      const px=position.getX(j),py=position.getY(j),pz=position.getZ(j);
      uv.setXY(j,(axis==='x'?pz:px)/period,(axis==='y'?pz:py)/period);
    }
  }
  geometry.setAttribute('uv',uv);return geometry;
}
