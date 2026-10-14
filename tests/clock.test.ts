import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationClock, SIMULATION_STEP } from '../src/clock';
import { Flight, NEUTRAL } from '../src/flight';
import { Race } from '../src/race';
import { vesselPose } from '../src/navigation';

test('render cadence does not slow flight, vessels or race time',()=> {
  const run=(frames:number[])=> {
    const clock=new SimulationClock(),flight=new Flight(),race=new Race();
    clock.reset(0);flight.armed=true;race.reset(true);let time=0,ticks=0;
    for(const now of frames)assert.equal(clock.advance(now,step=> {
      time+=step;ticks++;flight.step(step,{...NEUTRAL,throttle:0.5,pitch:-0.2},0.2);
      race.step(step,flight.previous,flight.position);
    }),true);
    return {time,ticks,position:flight.position.toArray(),velocity:flight.velocity.toArray(),orientation:flight.orientation.toArray(),raceTime:race.elapsed,ship:vesselPose('cruise',time)};
  };
  const sixty=Array.from({length:120},(_,i)=>(i+1)*2000/120),five=Array.from({length:10},(_,i)=>(i+1)*200);
  const irregular=[7,57,310,355,817,830,1275,1501,1907,2000];
  const expected=run(sixty);assert.equal(expected.ticks,240);assert.ok(Math.abs(expected.time-2)<1e-10);
  assert.deepEqual(run(five),expected);assert.deepEqual(run(irregular),expected);
});

test('bounded catch-up retains remaining ticks instead of discarding elapsed time',()=> {
  const clock=new SimulationClock();clock.reset(0);let ticks=0;
  assert.equal(clock.advance(6500,()=>{ticks++;}),true);assert.equal(ticks,600);
  assert.equal(clock.advance(6500,()=>{ticks++;}),true);assert.equal(ticks,780);
  assert.equal(clock.advance(6500,()=>{ticks++;}),true);assert.equal(ticks,780);
});

test('explicit resets exclude loading, pause, dialog and visibility gaps',()=> {
  const clock=new SimulationClock();let ticks=0;
  for(const baseline of [100000,150000,200000,250000]) {
    clock.reset(baseline);assert.equal(clock.advance(baseline+100,()=>{ticks++;}),true);
  }
  assert.equal(ticks,48);
  // A stale RAF stamp after an input-triggered restart must not create negative debt.
  clock.reset(300000);assert.equal(clock.advance(299900,()=>{ticks++;}),true);
  assert.equal(clock.advance(300100,()=>{ticks++;}),true);assert.equal(ticks,60);
});

test('unsafe gaps stop before any tick and require a fresh baseline',()=> {
  const clock=new SimulationClock();clock.reset(0);let ticks=0;
  assert.equal(clock.advance(10001,()=>{ticks++;}),false);assert.equal(ticks,0);
  clock.reset(10001);assert.equal(clock.advance(10101,()=>{ticks++;}),true);assert.equal(ticks,12);
  clock.reset(0);assert.equal(clock.advance(6500,()=>{}),true);
  assert.equal(clock.advance(15001,()=>{ticks++;}),false);assert.equal(ticks,12);
});

test('crash or completion stops world and flight on the same fixed tick',()=> {
  const clock=new SimulationClock();clock.reset(0);let time=0,ticks=0;
  assert.equal(clock.advance(1000,step=> {time+=step;return ++ticks<5;}),true);
  assert.equal(ticks,5);assert.equal(time,5*SIMULATION_STEP);
  assert.equal(clock.advance(1000,()=>{ticks++;}),true);assert.equal(ticks,5);
});
