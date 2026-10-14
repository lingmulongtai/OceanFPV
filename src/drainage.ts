/** Bounded terrain carving from single-direction, eight-neighbour catchments. */
export function drainageCuts(heights:Float64Array,width:number,weights:Float64Array,maxDepth:number,radius=2.5) {
  const count=heights.length,rows=count/width;
  if(!Number.isInteger(rows)||width<2||rows<2||weights.length!==count)throw new Error('Invalid drainage grid');
  const downstream=new Int32Array(count).fill(-1),catchment=new Float64Array(count).fill(1),cuts=new Float64Array(count);
  for(let i=0;i<count;i++) {
    const x=i%width,z=Math.floor(i/width);let steepest=0;
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++) {
      if((dx===0&&dz===0)||x+dx<0||x+dx>=width||z+dz<0||z+dz>=rows)continue;
      const neighbour=i+dz*width+dx,drop=(heights[i]-heights[neighbour])/Math.hypot(dx,dz);
      if(drop>steepest){steepest=drop;downstream[i]=neighbour;}
    }
  }
  const order=Array.from({length:count},(_,i)=>i).sort((a,b)=>heights[b]-heights[a]);
  for(const i of order)if(downstream[i]>=0)catchment[downstream[i]]+=catchment[i];
  const reach=Math.ceil(radius);
  for(let i=0;i<count;i++) {
    if(catchment[i]<12||weights[i]<=0)continue;
    const depth=maxDepth*Math.min(1,Math.log2(catchment[i]/12+1)/4)*weights[i],x=i%width,z=Math.floor(i/width);
    for(let dz=-reach;dz<=reach;dz++)for(let dx=-reach;dx<=reach;dx++) {
      if(x+dx<0||x+dx>=width||z+dz<0||z+dz>=rows)continue;
      const distance=Math.hypot(dx,dz)/radius;if(distance>=1)continue;
      const target=i+dz*width+dx,t=1-distance*distance;
      cuts[target]=Math.max(cuts[target],depth*t*t*weights[target]);
    }
  }
  // Work uphill so carving cannot turn an existing downstream edge into a dam.
  for(let k=order.length-1;k>=0;k--) {
    const i=order[k],next=downstream[i];
    if(next>=0)cuts[i]=Math.min(cuts[i],Math.max(0,heights[i]-heights[next]+cuts[next]-1e-6));
  }
  return {cuts,downstream,catchment};
}
