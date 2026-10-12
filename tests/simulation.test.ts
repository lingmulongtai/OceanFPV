import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { Flight, NEUTRAL, rateCurve } from '../src/flight';
import { DEFAULT_RADIO, Inputs, mapGamepad, normalizeAxis } from '../src/input';
import { crossedGate, GATES, Race } from '../src/race';
import { seaHeight } from '../src/sea';
import { inverseFFT, SpectralSea } from '../src/spectrum';

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
    assert.ok(c.displacement.every(Number.isFinite));assert.ok(c.normal.every(Number.isFinite));
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
