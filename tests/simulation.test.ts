import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { Flight, NEUTRAL, rateCurve } from '../src/flight';
import { DEFAULT_RADIO, mapGamepad, normalizeAxis } from '../src/input';
import { crossedGate, GATES, Race } from '../src/race';
import { seaHeight } from '../src/sea';

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
