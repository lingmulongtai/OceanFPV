import {Vector4} from 'three';

/** Explicit replacement for one coarse island channel, using its rendered triangles. */
export class IslandDepth {
  constructor(readonly channel:number,readonly data:Float32Array,readonly width:number,readonly bounds:Vector4) {
    if(!Number.isInteger(channel)||channel<0||channel>2||!Number.isInteger(width)||width<2||data.length!==width*width||!bounds.toArray().every(Number.isFinite)||bounds.z<=0||bounds.w<=0)throw new Error('Invalid detailed island depth');
  }
  sample(x:number,z:number) {
    if(!Number.isFinite(x)||!Number.isFinite(z))return null;
    const last=this.width-1,px=(x-this.bounds.x)/this.bounds.z*last,pz=(z-this.bounds.y)/this.bounds.w*last;
    if(px<0||px>last||pz<0||pz>last)return null;
    const ix=Math.min(Math.floor(px),last-1),iz=Math.min(Math.floor(pz),last-1),u=px-ix,v=pz-iz,i=iz*this.width+ix;
    const a=this.data[i],b=this.data[i+this.width],d=this.data[i+1],c=this.data[i+this.width+1],lower=u+v<=1;
    return {height:lower?a+(b-a)*v+(d-a)*u:c+(b-c)*(1-u)+(d-c)*(1-v),dx:(lower?d-a:c-b)*last/this.bounds.z,dz:(lower?b-a:c-d)*last/this.bounds.w};
  }
}
