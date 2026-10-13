import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, Raycaster, Vector3 } from 'three';
import { Flight, NEUTRAL, rateCurve } from '../src/flight';
import { DEFAULT_RADIO, Inputs, mapGamepad, normalizeAxis } from '../src/input';
import { crossedGate, GATES, Race } from '../src/race';
import { seaHeight } from '../src/sea';
import { inverseFFT, SpectralSea } from '../src/spectrum';
import { closedHullGeometry, foredeckGeometry, hullNameGeometry, upperHullSidePose } from '../src/hull';
import { deckGeometry, vesselBoxContains, windowRibbon } from '../src/cruise';
import { vesselPose, vesselWakeTrail, WAKE_SAMPLES, WAKE_STEP } from '../src/navigation';
import { coastalTreeSites, terrainHeight, terrainSurfaceHeight, TERRAIN_SEGMENTS } from '../src/terrain';
import { bathymetryData, BATHY_SIZE, COASTS } from '../src/bathymetry';
import { metricPaintGeometry } from '../src/paint';

test('passenger glazing faces outwards on every side without DoubleSide correction',()=> {
  const geometry=windowRibbon(196.14,27.64,1.72,6.07),mesh=new Mesh(geometry,new MeshBasicMaterial());
  mesh.updateMatrixWorld(true);
  for(const [origin,direction] of [
    [new Vector3(20,0,0),new Vector3(-1,0,0)],
    [new Vector3(-20,0,0),new Vector3(1,0,0)],
    [new Vector3(0,0,110),new Vector3(0,0,-1)],
    [new Vector3(0,0,-110),new Vector3(0,0,1)]
  ]) {
    const hit=new Raycaster(origin,direction).intersectObject(mesh)[0];assert.ok(hit);
    assert.ok(hit.face!.normal.dot(direction)<-0.99);
  }
  const p=geometry.attributes.position,n=geometry.attributes.normal;
  for(let i=0;i<p.count;i++)assert.ok(n.getX(i)*p.getX(i)+n.getZ(i)*p.getZ(i)>0);
  geometry.dispose();mesh.material.dispose();
});

test('hull paint charts cover both sides and end caps without changing triangles',()=> {
  const source=closedHullGeometry(260,34,9,7,true),original=source.toNonIndexed(),mapped=metricPaintGeometry(source);
  const p=mapped.attributes.position,uv=mapped.attributes.uv;
  assert.deepEqual([...p.array],[...original.attributes.position.array]);
  assert.deepEqual([...mapped.attributes.normal.array],[...original.attributes.normal.array]);
  const a=new Vector3(),b=new Vector3(),c=new Vector3();let capFaces=0;
  for(let i=0;i<p.count;i+=3) {
    a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);
    const normal=b.clone().sub(a).cross(c.clone().sub(a));
    const area=Math.abs((uv.getX(i+1)-uv.getX(i))*(uv.getY(i+2)-uv.getY(i))-(uv.getX(i+2)-uv.getX(i))*(uv.getY(i+1)-uv.getY(i)));
    if(normal.lengthSq()>1e-12)assert.ok(area>1e-10);
    if(a.z===b.z&&b.z===c.z&&Math.abs(a.z)===130)capFaces++;
    if(Math.abs(a.z)<5&&Math.abs(normal.x)>Math.abs(normal.y)&&Math.abs(normal.x)>Math.abs(normal.z))for(let j=i;j<i+3;j++) {
      assert.ok(Math.abs(uv.getX(j)*2.5-p.getZ(j))<0.00002);assert.ok(Math.abs(uv.getY(j)*2.5-p.getY(j))<0.00002);
    }
  }
  assert.equal(capFaces,12);[source,original,mapped].forEach(g=>g.dispose());
});

test('painted roof charts retain geometry and a 2.5 metre photographed period',()=> {
  const source=new BoxGeometry(34.2,0.42,12);source.translate(0,33.82,-70);
  const original=source.toNonIndexed(),mapped=metricPaintGeometry(source),position=mapped.attributes.position,uv=mapped.attributes.uv;
  assert.deepEqual([...position.array],[...original.attributes.position.array]);
  assert.deepEqual([...mapped.attributes.normal.array],[...original.attributes.normal.array]);
  for(let i=0;i<position.count;i+=3)for(let j=1;j<3;j++) {
    const a=new Vector3().fromBufferAttribute(position,i),b=new Vector3().fromBufferAttribute(position,i+j);
    const textureDistance=Math.hypot(uv.getX(i+j)-uv.getX(i),uv.getY(i+j)-uv.getY(i))*2.5;
    assert.ok(Math.abs(textureDistance-a.distanceTo(b))<0.00002);
  }
  const deck=deckGeometry(199,32.6,0.28),projected=metricPaintGeometry(deck);
  const dp=projected.attributes.position,duv=projected.attributes.uv,dn=projected.attributes.normal;
  for(let i=0;i<dp.count;i++)if(Math.abs(dn.getY(i))>0.99) {
    assert.ok(Math.abs(duv.getX(i)*2.5-dp.getX(i))<0.00002);assert.ok(Math.abs(duv.getY(i)*2.5-dp.getZ(i))<0.00002);
  }
  [source,original,mapped,deck,projected].forEach(g=>g.dispose());
});

test('coastal trees root on dry rendered triangles below 35 degrees',()=> {
  for(const coast of COASTS) {
    const sites=coastalTreeSites(coast.x,coast.z,coast.size,coast.height);assert.ok(sites.length>60&&sites.length<=170);
    assert.deepEqual(sites,coastalTreeSites(coast.x,coast.z,coast.size,coast.height));
    const geometry=new PlaneGeometry(coast.size*2.4,coast.size*2.4,TERRAIN_SEGMENTS,TERRAIN_SEGMENTS);geometry.rotateX(-Math.PI/2);
    const p=geometry.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,terrainHeight(p.getX(i),p.getZ(i),coast.size,coast.height));
    const material=new MeshBasicMaterial({side:DoubleSide}),mesh=new Mesh(geometry,material);mesh.updateMatrixWorld();
    for(let i=0;i<sites.length;i+=5) {
      const site=sites[i];assert.ok(site.y>10&&site.scale>=0.65&&site.scale<=1.35);
      const origin=new Vector3(site.x-coast.x,site.y+10,site.z-coast.z),hit=new Raycaster(origin,new Vector3(0,-1,0),0,20).intersectObject(mesh)[0];
      assert.ok(hit);assert.ok(Math.abs(hit.point.y-site.y)<0.0001);assert.ok(hit.face!.normal.y>Math.cos(35*Math.PI/180));
    }
    geometry.dispose();material.dispose();
  }
});

test('ship names follow the curved hull at a small offset on both sides',()=> {
  const hull=closedHullGeometry(260,34,9,7,true),material=new MeshBasicMaterial({side:DoubleSide}),mesh=new Mesh(hull,material);mesh.updateMatrixWorld();
  for(const side of [-1,1]) {
    const name=hullNameGeometry(side),p=name.attributes.position,n=name.attributes.normal;
    for(let i=0;i<p.count;i++) {
      const vertex=new Vector3().fromBufferAttribute(p,i),normal=new Vector3().fromBufferAttribute(n,i),hits=new Raycaster(vertex,normal.negate()).intersectObject(mesh);
      assert.ok(hits.length>0);assert.ok(hits[0].distance>0.03&&hits[0].distance<0.05);
    }
    name.dispose();
  }
  hull.dispose();material.dispose();
});

test('hull fixtures touch actual rendered side triangles and face outwards',()=> {
  const geometry=closedHullGeometry(260,34,9,7,true),material=new MeshBasicMaterial({side:DoubleSide}),mesh=new Mesh(geometry,material);mesh.updateMatrixWorld();
  for(const side of [-1,1])for(const y of [4.2,7.6])for(const z of [-120,-113,-96,-85,0,85,99,120]) {
    const pose=upperHullSidePose(y,z,side),ray=new Raycaster(pose.point.clone().addScaledVector(pose.normal,2),pose.normal.clone().negate()),hits=ray.intersectObject(mesh);
    assert.ok(hits.length>0);assert.ok(Math.abs(hits[0].distance-2)<0.00002);
    assert.ok(hits[0].point.distanceTo(pose.point)<0.00002);assert.ok(pose.normal.x*side>0);
  }
  geometry.dispose();material.dispose();
});

test('bow planking stays on the hull instead of cutting through or extending beyond it',()=> {
  const hull=closedHullGeometry(260,34,9,7,true),wood=foredeckGeometry(),hp=hull.attributes.position,wp=wood.attributes.position;
  for(let i=0;i<wp.count;i++) {
    const station=Math.round((wp.getZ(i)/260+0.5)*128),top=hp.getY(station*6),halfWidth=hp.getX(station*6+1);
    assert.ok(wp.getY(i)-top>0.04&&wp.getY(i)-top<0.05);
    assert.ok(Math.abs(wp.getX(i))<halfWidth-0.4);
  }
  hull.dispose();wood.dispose();
});

test('wave tangents match displaced surface geometry for every sea strength',()=> {
  const sea=new SpectralSea();sea.update(6);
  for(const scale of [0.55,1.15,2.15]) {sea.update(6,scale);const strength=new Vector3(sea.horizontalScale,scale,sea.horizontalScale);
  for(const c of sea.cascades)for(let i=0;i<32;i++) {
    const step=c.length/c.size,x=(i*17%c.size)*step,z=(i*31%c.size)*step;
    const point=(x:number,z:number)=>new Vector3(c.sample(x,z,0),c.sample(x,z,1),c.sample(x,z,2)).multiply(strength).add(new Vector3(x,0,z));
    const actualX=point(x+step,z).sub(point(x-step,z)).divideScalar(2*step),actualZ=point(x,z+step).sub(point(x,z-step)).divideScalar(2*step);
    const tx=new Vector3(...[0,1,2].map(j=>c.sample(x,z,j,c.tangentX))).multiply(strength).add(new Vector3(1,0,0));
    const tz=new Vector3(...[0,1,2].map(j=>c.sample(x,z,j,c.tangentZ))).multiply(strength).add(new Vector3(0,0,1));
    assert.ok(tx.distanceTo(actualX)<0.00003);assert.ok(tz.distanceTo(actualZ)<0.00003);
    const normal=tz.clone().cross(tx).normalize();assert.ok(Math.abs(normal.dot(actualX))<0.00003);assert.ok(Math.abs(normal.dot(actualZ))<0.00003);
  }
  }
});

test('rough wave compression stays bounded without reducing swell height',()=> {
  const sea=new SpectralSea();
  for(const time of [0,3,6,12]) {
    sea.update(time,2.15);const horizontal=sea.horizontalScale;
    for(let i=0;i<1000;i++) {
      const x=-1800+(i*31.731)%3600,z=-1800+(i*83.973)%3600;
      const sum=(field:'tangentX'|'tangentZ',channel:number)=>sea.cascades.reduce((v,c)=>v+c.sample(x,z,channel,c[field]),0)*horizontal;
      const jacobian=(1+sum('tangentX',0))*(1+sum('tangentZ',2))-sum('tangentX',2)*sum('tangentZ',0);
      assert.ok(jacobian>0.03);
      assert.ok(Math.abs(sea.heightAt(x,z,2.15)-sea.heightAt(x,z,1.15)*2.15/1.15)<1e-9);
    }
  }
});

test('rough seas generate more whitecaps and changing presets clears stale foam while paused',()=> {
  const sea=new SpectralSea(),foam=()=>sea.cascades.reduce((sum,c)=>sum+c.displacement.reduce((v,x,i)=>v+(i%4===3?x:0),0),0);
  sea.update(6,0.55);const calm=foam();sea.update(6,2.15);assert.ok(foam()>calm+100);
  assert.equal(sea.update(6,0.55),true);assert.ok(foam()<0.01);assert.equal(sea.update(6,0.55),false);
  sea.update(12,2.15);sea.update(0,2.15);const fresh=new SpectralSea();fresh.update(0,2.15);
  for(let i=0;i<3;i++)assert.deepEqual(sea.cascades[i].displacement,fresh.cascades[i].displacement);
});

test('coastal water depths follow the same terrain triangles as visible shores',()=> {
  const data=bathymetryData(),n=BATHY_SIZE;
  for(const [channel,coast]of COASTS.entries())for(let i=0;i<80;i++) {
    const gx=7.23+(i*31.7)%174,gz=4.71+(i*17.8)%181,ix=Math.floor(gx),iz=Math.floor(gz),u=gx-ix,v=gz-iz;
    const h=(x:number,z:number)=>data[(z*n+x)*4+channel],a=h(ix,iz),b=h(ix,iz+1),d=h(ix+1,iz),c=h(ix+1,iz+1);
    const sampled=u+v<=1?a+(b-a)*v+(d-a)*u:c+(b-c)*(1-u)+(d-c)*(1-v);
    const expected=terrainSurfaceHeight((gx/(n-1)*2-1)*coast.size*1.2,(gz/(n-1)*2-1)*coast.size*1.2,coast.size,coast.height);
    assert.ok(Math.abs(sampled-expected)<0.00002);
  }
});

test('rounded passenger decks leave corner airspace flyable and keep deck contacts solid',()=> {
  const box={min:new Vector3(-16,-1,-100),max:new Vector3(16,1,100),radius:8};
  assert.equal(vesselBoxContains(box,new Vector3(15.8,0,99.8)),false);
  assert.equal(vesselBoxContains(box,new Vector3(15.8,0,90)),true);
  assert.equal(vesselBoxContains(box,new Vector3(0,0,99.8)),true);
  assert.equal(vesselBoxContains(box,new Vector3(0,1.3,0)),false);
  const geometry=deckGeometry(200,32,2,8);geometry.computeBoundingBox();
  assert.ok(geometry.boundingBox!.min.distanceTo(box.min)<1e-5);
  assert.ok(geometry.boundingBox!.max.distanceTo(box.max)<1e-5);
  assert.ok(Array.from(geometry.attributes.position.array).every(Number.isFinite));geometry.dispose();
});

test('terrain contact height follows the rendered triangle grid continuously',()=> {
  const size=260,height=130,step=size*2.4/192;
  for(let i=0;i<190;i+=17) {
    const x=-size*1.2+i*step,z=-size*1.2+(i+1)*step;
    assert.ok(Math.abs(terrainSurfaceHeight(x,z,size,height)-terrainHeight(x,z,size,height))<1e-8);
    const expected=(terrainHeight(x,z,size,height)+terrainHeight(x+step,z,size,height))/2;
    assert.ok(Math.abs(terrainSurfaceHeight(x+step/2,z,size,height)-expected)<1e-8);
    assert.ok(Math.abs(terrainSurfaceHeight(x-0.0001,z,size,height)-terrainSurfaceHeight(x+0.0001,z,size,height))<0.01);
  }
});

test('terrain sampling stays finite and continuous through the coastline',()=> {
  for(let x=-400;x<400;x+=31)for(let z=-400;z<400;z+=43) {
    const y=terrainHeight(x,z,260,130);assert.ok(Number.isFinite(y)&&y>=-9&&y<210);
    assert.ok(Math.abs(terrainHeight(x+0.001,z,260,130)-y)<0.02);
  }
});

test('stern trails follow past ship transforms and never predate launch',()=> {
  for(const [kind,length] of [['explorer',92],['cruise',260],['yacht',28]] as const)for(const time of [0,3,8,27,190]) {
    const trail=vesselWakeTrail(kind,time,length);assert.equal(trail.length,WAKE_SAMPLES);
    for(const point of trail) {
      assert.ok(point.age>=0&&point.age<=time&&point.age<=WAKE_STEP*(WAKE_SAMPLES-1));
      const pose=vesselPose(kind,time-point.age),stern=new Vector3(0,0,length/2).applyAxisAngle(new Vector3(0,1,0),pose.heading).add(new Vector3(pose.x,0,pose.z));
      assert.ok(Math.hypot(point.x-stern.x,point.z-stern.z)<1e-9);assert.ok(point.speed>1);
    }
    assert.deepEqual(trail,vesselWakeTrail(kind,time,length));
  }
  const turned=vesselWakeTrail('cruise',120,260),current=vesselPose('cruise',120),oldest=turned.at(-1)!;
  const lateral=Math.cos(current.heading)*(oldest.x-turned[0].x)-Math.sin(current.heading)*(oldest.z-turned[0].z);
  assert.ok(Math.abs(lateral)>50,'old stern positions must leave the current straight heading');
  vesselWakeTrail('cruise',800,260);
  const reset=vesselWakeTrail('cruise',0,260);assert.ok(reset.every(p=>p.age===0&&p.x===reset[0].x&&p.z===reset[0].z));
});

test('vessel routes move continuously and the bow follows the travel direction',()=> {
  for(const kind of ['explorer','cruise','yacht'] as const)for(let t=0;t<800;t+=13) {
    const pose=vesselPose(kind,t),next=vesselPose(kind,t+0.001);
    assert.ok(pose.speed>1);assert.ok(Math.hypot(next.x-pose.x,next.z-pose.z)>0);
    assert.ok(Math.abs((next.x-pose.x)/0.001-pose.vx)<0.002);assert.ok(Math.abs((next.z-pose.z)/0.001-pose.vz)<0.002);
    assert.ok(Math.abs(-Math.sin(pose.heading)*pose.speed-pose.vx)<1e-10);
    assert.ok(Math.abs(-Math.cos(pose.heading)*pose.speed-pose.vz)<1e-10);
  }
});

test('bow and stern are closed with every hull edge shared by two faces',()=> {
  for(const geo of [closedHullGeometry(),closedHullGeometry(260,34,9,7,true)]) {
    const edges=new Map<string,number>(),index=geo.index!;
    for(let i=0;i<index.count;i+=3)for(let j=0;j<3;j++) {const a=index.getX(i+j),b=index.getX(i+(j+1)%3),key=a<b?`${a}:${b}`:`${b}:${a}`;edges.set(key,(edges.get(key)??0)+1);}
    assert.ok(Array.from(edges.values()).every(count=>count===2));assert.ok(Array.from(geo.attributes.position.array).every(Number.isFinite));geo.dispose();
  }
});

test('two dimensional inverse FFT reconstructs an impulse and a cosine',()=> {
  const size=8,real=new Float64Array(size*size),imaginary=new Float64Array(size*size);
  real.fill(1);inverseFFT(real,imaginary,size);
  assert.ok(Math.abs(real[0]-1)<1e-12);assert.ok(real.slice(1).every(v=>Math.abs(v)<1e-12));
  real.fill(0);imaginary.fill(0);real[1]=real[size-1]=size*size/2;inverseFFT(real,imaginary,size);
  for(let z=0;z<size;z++) for(let x=0;x<size;x++) assert.ok(Math.abs(real[z*size+x]-Math.cos(x*Math.PI*2/size))<1e-10);
});
test('spectral waves evolve, remain periodic within each cascade and produce finite contact heights',()=> {
  const sea=new SpectralSea(),first=sea.heightAt(17,39);
  for(const c of sea.cascades) {
    assert.ok(Math.abs(c.sample(13,19)-c.sample(13+c.length,19-c.length))<1e-6);
    assert.ok(c.displacement.every(Number.isFinite));assert.ok(c.tangentX.every(Number.isFinite));assert.ok(c.tangentZ.every(Number.isFinite));
    const rms=Math.sqrt(c.displacement.reduce((s,v,i)=>s+(i%4===1?v*v:0),0)/(c.size*c.size));assert.ok(rms>0.02&&rms<2);
  }
  sea.update(9);assert.notEqual(sea.heightAt(17,39),first);
  for(let x=-1800;x<1800;x+=79) assert.ok(Number.isFinite(sea.heightAt(x,x*0.3,2)));
  assert.ok(Math.abs(sea.heightAt(20,35)-sea.heightAt(20.001,35))<0.01);
});

test('Angle spring throttle holds altitude after spool-up', () => {
  const flight = new Flight(); flight.armed = true;
  for(let i=0;i<1200;i++) flight.step(1/120,NEUTRAL,0);
  assert.ok(Math.abs(flight.position.y-5.4)<0.4);
  assert.ok(Math.abs(flight.velocity.y)<0.02);
});
test('Pitch forward and roll right accelerate along expected world axes', () => {
  const pitch = new Flight(); pitch.armed = true;
  const roll = new Flight(); roll.armed = true;
  for(let i=0;i<120;i++) {
    pitch.step(1/120,{...NEUTRAL,pitch:-1},0);
    roll.step(1/120,{...NEUTRAL,roll:1},0);
  }
  assert.ok(pitch.velocity.z<-2); assert.ok(roll.velocity.x>2);
});
test('Acro quaternion remains normalized through sustained rotations', () => {
  const flight = new Flight(); flight.armed = true; flight.mode='acro';
  for(let i=0;i<2400;i++) flight.step(1/120,{roll:0.3,pitch:-0.2,yaw:0.1,throttle:0.35,absoluteThrottle:true},0);
  assert.ok(Math.abs(flight.orientation.length()-1)<1e-10);
  assert.ok(flight.position.toArray().every(Number.isFinite));
});
test('Disarming cuts motor thrust and the drone falls under gravity', () => {
  const flight = new Flight();const start=flight.position.y;
  flight.step(1/120,{...NEUTRAL,throttle:1},0);
  assert.ok(flight.position.y<start);assert.equal(flight.motor,0);
});
test('Rate curve clamps spikes and has symmetric endpoint rates', () => {
  assert.equal(rateCurve(2,500,0.3),rateCurve(1,500,0.3));
  assert.equal(rateCurve(-1,500,0.3),-rateCurve(1,500,0.3));
  assert.equal(rateCurve(NaN,500,0.3),0);
});
test('Xbox right stick is roll/pitch and left stick is yaw/climb', () => {
  const sticks=mapGamepad({axes:[0.8,-1,1,-1],buttons:[]},false,DEFAULT_RADIO,0.08);
  assert.equal(sticks.roll,1);assert.equal(sticks.pitch,-1);assert.equal(sticks.throttle,1);
  assert.ok(sticks.yaw>0.7);assert.equal(sticks.absoluteThrottle,false);
});
test('Radio throttle reverses to zero at bottom and one at top', () => {
  const bottom=mapGamepad({axes:[0,0,0,1],buttons:[]},true,DEFAULT_RADIO,0.08);
  const top=mapGamepad({axes:[0,0,0,-1],buttons:[]},true,DEFAULT_RADIO,0.08);
  assert.equal(bottom.throttle,0);assert.equal(top.throttle,1);assert.equal(top.absoluteThrottle,true);
});
test('Missing radio throttle axis fails closed', () => {
  assert.equal(mapGamepad({axes:[0,0],buttons:[]},true,DEFAULT_RADIO,0.08).throttle,0);
});
test('Asymmetric calibration preserves center and both full ranges', () => {
  const c={min:-0.7,center:0.1,max:0.9};
  assert.equal(normalizeAxis(0.1,c),0);assert.equal(normalizeAxis(-0.7,c),-1);assert.equal(normalizeAxis(0.9,c),1);
  assert.equal(normalizeAxis(0.12,c),0);assert.equal(normalizeAxis(NaN),0);
  assert.ok(Number.isFinite(normalizeAxis(0.5,{min:NaN,center:0,max:1})));
});
test('Gate crossing requires forward direction and aperture intersection', () => {
  const gate=GATES[0]; const a=gate.position.clone().addScaledVector(gate.normal,-10),b=gate.position.clone().addScaledVector(gate.normal,10);
  assert.ok(crossedGate(a,b,gate));assert.equal(crossedGate(b,a,gate),false);
  assert.equal(crossedGate(a.clone().add(new Vector3(0,10,0)),b.clone().add(new Vector3(0,10,0)),gate),false);
});
test('Race only completes after all ordered gates and three laps', () => {
  const race=new Race();race.reset(true);
  for(let i=0;i<18;i++) {
    const gate=GATES[i%6];
    assert.ok(race.step(1,gate.position.clone().addScaledVector(gate.normal,-1),gate.position.clone().addScaledVector(gate.normal,1)));
  }
  assert.equal(race.finished,true);assert.equal(race.elapsed,18);assert.deepEqual(race.laps,[6,6,6]);
  race.step(5,new Vector3(),new Vector3());assert.equal(race.elapsed,18);
});
test('All sea presets produce continuous finite heights for collision sampling', () => {
  for(const state of ['calm','breeze','swell'] as const) for(let i=0;i<400;i++) {
    const h=seaHeight(i*11,-i*9,i*0.15,state);
    assert.ok(Number.isFinite(h));assert.ok(Math.abs(h)<8);
    assert.ok(Math.abs(h-seaHeight(i*11+0.001,-i*9,i*0.15,state))<0.01);
  }
});

test('Held Xbox buttons dispatch once even when reset re-polls synchronously', () => {
  Object.assign(globalThis,{window:{addEventListener(){}},document:{addEventListener(){}}});
  let currentPads:Gamepad[]=[];
  Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>currentPads});
  const input=new Inputs();input.source='xbox';let resets=0;
  const pad={id:'Xbox',index:0,connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
  currentPads=[pad as unknown as Gamepad];input.poll();
  input.onAction=action=> {if(action==='reset') {resets++;assert.ok(resets<2);input.clear();input.poll();}};
  pad.buttons[2].pressed=true;input.poll();input.poll();input.poll();assert.equal(resets,1);
});
test('Losing the selected pad pauses even if another pad is still connected', () => {
  Object.assign(globalThis,{window:{addEventListener(){}},document:{addEventListener(){}}});
  const first={id:'Radio A',index:0,connected:true,axes:[0,0,0,1],buttons:[]} as unknown as Gamepad;
  const second={id:'Radio B',index:1,connected:true,axes:[0,0,0,-1],buttons:[]} as unknown as Gamepad;
  let pads=[first,second];Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>pads});
  const input=new Inputs();input.source='radio';let disconnects=0;input.onDisconnect=()=>disconnects++;
  input.poll();assert.equal(input.sticks().throttle,0);
  pads=[second];input.poll();assert.equal(disconnects,1);
});
test('Mouse mode falls back to keyboard when pointer lock is unavailable', () => {
  Object.assign(globalThis,{window:{addEventListener(){}},document:{addEventListener(){},pointerLockElement:null}});
  const input=new Inputs();input.useMouse=true;input.keys.add('KeyW');input.keys.add('KeyD');
  assert.equal(input.sticks().pitch,-1);assert.equal(input.sticks().roll,1);
});
