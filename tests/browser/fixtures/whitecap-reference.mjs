const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
function hash(x,z){let h=Math.imul(x,0x9e3779b9)^Math.imul(z,0x85ebca6b);h=Math.imul(h^(h>>>16),0x85ebca6b);h=Math.imul(h^(h>>>13),0xc2b2ae35);h^=h>>>16;return(h>>>8)/16777216;}
function noise(x,z){const i=Math.floor(x),j=Math.floor(z);let u=x-i,v=z-j;u=u*u*(3-2*u);v=v*v*(3-2*v);return((1-u)*hash(i,j)+u*hash(i+1,j))*(1-v)+((1-u)*hash(i,j+1)+u*hash(i+1,j+1))*v;}
/** Independent periodic bilinear reference over the uploaded Float32 fields. */
function sample(c,x,z,channel,data=c.displacement){
 const px=x/c.length*c.size,pz=z/c.length*c.size,ix=Math.floor(px),iz=Math.floor(pz),u=px-ix,v=pz-iz,n=c.size;
 const at=(dx,dz)=>data[((((iz+dz)%n+n)%n)*n+((ix+dx)%n+n)%n)*4+channel];
 return((1-u)*at(0,0)+u*at(1,0))*(1-v)+((1-u)*at(0,1)+u*at(1,1))*v;
}
export function whitecapReference(sea,renderTime=sea.time){
 const fbm=(x,z)=>.55*noise(x,z)+.3*noise(x*2.17+8.6,z*2.17+8.6)+.15*noise(x*4.79,z*4.79);
 const point=(q,p)=>{
  const w=Math.max(...sea.cascades.map(c=>sample(c,...q,3))),fresh=Math.max(...sea.cascades.map(c=>sample(c,...q,3,c.tangentX))),ratio=w>1e-5?fresh/w:Math.min(1,fresh/1e-5);
  const angle=.7,along=(p[0]*Math.cos(angle)+p[1]*Math.sin(angle))*.035,across=(-p[0]*Math.sin(angle)+p[1]*Math.cos(angle))*.11;
  const breakup=(1-ratio)*smooth(.25,.75,fbm(along,across))*1.5+ratio;
  return Math.max(0,Math.min(1,smooth(.12,.8,w)*smooth(.42,.76,fbm(p[0]*.53+renderTime*.12,p[1]*.53-renderTime*.09))*breakup));
 };
 const displaced=q=>q.map((v,j)=>v+sea.cascades.reduce((v,c,i)=>v+sea.horizontalScales[i]*sample(c,...q,j*2),0));
 const anchors=[];for(let i=0;i<50000&&anchors.length<8;i++){const q=[250+(i*13.713)%400,50+(i*19.371)%500],p=displaced(q),value=point(q,p);if(value>.12&&value<.65)anchors.push({q,p});}
 for(const q of[[-120.2,-437.3],[-212.71,-15.94],[-840.8,359.3],[435.2,-739.7]])anchors.push({q,p:displaced(q)});
 const footprints=[['resolved',[.04,0],[0,.04]],['transition',[.135,0],[0,.135]],['quarter',[.25,0],[0,.25]],['one',[1,0],[0,1]],['three',[3,0],[0,3]],['elongated',[2,0],[0,.0625]],['rotated',[1.4,1.4],[-.044,.044]],['sheared',[-.4,1.8],[.04,-.01]]];
 const integrate=(c,size,phase=.5)=>{let sum=0;for(let y=0;y<size;y++)for(let x=0;x<size;x++){const u=(x+phase)/size-.5,v=(y+phase)/size-.5;sum+=point(c.q.map((q,j)=>q+c.qdx[j]*u+c.qdy[j]*v),c.p.map((p,j)=>p+c.pdx[j]*u+c.pdy[j]*v));}return sum/(size*size);};
 const cases=[];
 for(const[family,qdx,qdy]of footprints)for(const[anchor,seed]of anchors.entries()){
  const jacobian=[1,0,0,1];for(const [band,c]of sea.cascades.entries()){jacobian[0]+=sea.horizontalScales[band]*sample(c,...seed.q,0,c.tangentX);jacobian[1]+=sea.horizontalScales[band]*sample(c,...seed.q,0,c.tangentZ);jacobian[2]+=sea.horizontalScales[band]*sample(c,...seed.q,2,c.tangentX);jacobian[3]+=sea.horizontalScales[band]*sample(c,...seed.q,2,c.tangentZ);}
  const transformed=v=>[jacobian[0]*v[0]+jacobian[1]*v[1],jacobian[2]*v[0]+jacobian[3]*v[1]],c={family,anchor,...seed,qdx,qdy,pdx:transformed(qdx),pdy:transformed(qdy)},reference64=integrate(c,64),reference128=integrate(c,128),shifted=(integrate(c,128,.2113248654)+integrate(c,128,.7886751346))/2;
  const original=point(c.q,c.p),footprint=Math.max(Math.hypot(...qdx),Math.hypot(...qdy)),weight=smooth(23.3/256,23.3/128,footprint),candidate=original*(1-weight)+integrate(c,4)*weight;
  cases.push({...c,original,candidate,reference64,reference128,convergence:Math.max(Math.abs(reference64-reference128),Math.abs(shifted-reference128))});
 }
 return{cases,maximumConvergence:Math.max(...cases.map(c=>c.convergence)),inactive:cases.filter(c=>c.original===0).length};
}
