/** Prepare metre-spaced coastal heights for the fixed 193-vertex terrain mesh. */
export function prepareCoastalGrid(source:Float32Array,n:number,padding:number,maxEncodedHeight:number) {
  if(!Number.isInteger(n)||n<2||!Number.isInteger(padding)||padding<0||!Number.isInteger(maxEncodedHeight)||maxEncodedHeight<0)throw new Error('Invalid coastal grid dimensions or storage range');
  const width=193,extentMetres=n+padding*2,unitMetres=.001;
  if(source.length!==n*n||source.some(h=>!Number.isFinite(h)||h===-32767))throw new Error('Missing or invalid DTM heights');
  const land=Uint8Array.from(source,h=>h>.3?1:0),seen=new Uint8Array(source.length);
  for(let seed=0;seed<land.length;seed++)if(land[seed]&&!seen[seed]) {
    const queue=[seed];seen[seed]=1;let edge=false;
    for(let k=0;k<queue.length;k++) {
      const i=queue[k],x=i%n,z=Math.floor(i/n);if(x===0||x===n-1||z===0||z===n-1)edge=true;
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++) {
        const nx=x+dx,nz=z+dz,j=nz*n+nx;
        if(nx>=0&&nx<n&&nz>=0&&nz<n&&land[j]&&!seen[j]){seen[j]=1;queue.push(j);}
      }
    }
    if(edge)for(const i of queue)land[i]=0;
  }
  const side=extentMetres,distance=new Float32Array(side*side).fill(1e6),heights=new Float32Array(side*side);
  for(let z=0;z<n;z++)for(let x=0;x<n;x++)if(land[z*n+x]){const i=(z+padding)*side+x+padding;distance[i]=0;heights[i]=source[z*n+x];}
  for(const direction of [1,-1])for(let z=direction===1?0:side-1;z>=0&&z<side;z+=direction)for(let x=direction===1?0:side-1;x>=0&&x<side;x+=direction) {
    const i=z*side+x;if(distance[i]===0)continue;
    for(const [dx,dz,cost] of [[-direction,0,1],[-direction,-direction,Math.SQRT2],[0,-direction,1],[direction,-direction,Math.SQRT2]]) {
      const nx=x+dx,nz=z+dz;if(nx>=0&&nx<side&&nz>=0&&nz<side)distance[i]=Math.min(distance[i],distance[nz*side+nx]+cost);
    }
  }
  for(let i=0;i<heights.length;i++)if(distance[i]!==0)heights[i]=-Math.min(9,.4*distance[i]);
  const output:number[]=[];
  for(let z=0;z<width;z++)for(let x=0;x<width;x++) {
    const gx=x/(width-1)*extentMetres-.5,gz=z/(width-1)*extentMetres-.5;
    let height=-9;
    if(gx>=0&&gz>=0&&gx<side-1&&gz<side-1) {
      const ix=Math.floor(gx),iz=Math.floor(gz),u=gx-ix,v=gz-iz,i=iz*side+ix;
      height=(heights[i]*(1-u)+heights[i+1]*u)*(1-v)+(heights[i+side]*(1-u)+heights[i+side+1]*u)*v;
    }
    const encoded=Math.round(height/unitMetres);if(encoded< -32768||encoded>maxEncodedHeight)throw new Error('Height exceeds the declared millimetre storage range');output.push(encoded);
  }
  return {version:1,width,extentMetres,unitMetres,heights:output};
}
