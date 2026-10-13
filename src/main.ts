import './style.css';
import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World, type LightPreset } from './world';
import { Flight, type FlightMode } from './flight';
import { Inputs, type Channel } from './input';
import { Race, GATES, formatTime } from './race';
import { type SeaState } from './sea';
import { FlightAudio } from './audio';
import { readStored, writeStored } from './storage';
import { loadPhotographicSky } from './sky';

const $ = <E extends HTMLElement = HTMLElement>(id:string) => document.getElementById(id) as E;
const value = (id:string) => $<HTMLInputElement>(id).value;
const checked = (id:string) => $<HTMLInputElement>(id).checked;
const show = (id:string,visible:boolean) => $(id).classList.toggle('hidden',!visible);
const canvas = $<HTMLCanvasElement>('scene');

async function boot() {
  let renderer:T.WebGLRenderer;
  try {
    renderer = new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  } catch {
    show('unsupported',true);$('start-note').textContent='WebGL2を利用できません。';return;
  }
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=0.7;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
  renderer.info.autoReset=false;
  const world=new World();
  world.ocean.configureFiltering(renderer.extensions.has('OES_texture_float_linear'));
  // Bake the expensive procedural atmosphere once; the visible background and
  // water reflection sample the same HDR sky. Slow rotation gives cloud drift.
  const skyScene=new T.Scene();skyScene.add(world.sky);const skyTarget=new T.WebGLCubeRenderTarget(512,{type:T.HalfFloatType});
  const skyCamera=new T.CubeCamera(1,20000,skyTarget);skyCamera.update(renderer,skyScene);
  world.scene.background=skyTarget.texture;
  const pmrem=new T.PMREMGenerator(renderer);let environment=pmrem.fromCubemap(skyTarget.texture);world.scene.environment=environment.texture;pmrem.dispose();
  let photoSky:Awaited<ReturnType<typeof loadPhotographicSky>>=null,photoEnvironment:T.WebGLRenderTarget|null=null;
  const camera=new T.PerspectiveCamera(65,innerWidth/innerHeight,0.06,18000);
  const renderTarget=new T.WebGLRenderTarget(innerWidth,innerHeight,{type:T.HalfFloatType,samples:Math.min(4,renderer.capabilities.maxSamples)});
  const composer=new EffectComposer(renderer,renderTarget);composer.addPass(new RenderPass(world.scene,camera));
  const bloom=new UnrealBloomPass(new T.Vector2(innerWidth,innerHeight),0.035,0.35,2.4);composer.addPass(bloom);composer.addPass(new OutputPass());
  const flight=new Flight(),input=new Inputs(),race=new Race(),sound=new FlightAudio();
  let sea:SeaState='breeze', selectedRace=false, playing=false, paused=false, hudVisible=true, time=0,flightTime=0;
  let accumulator=0,last=performance.now(),lastHUD=0,lastControllerUI=0,frameCount=0,fpsTime=last,toastUntil=0;
  let cameraMode='fpv',cameraTilt=12,fov=95,returnToPause=false;
  const cameraTiltQuaternion=new T.Quaternion();const desiredCamera=new T.Vector3();
  let supported=true;
  const controls=['mode','camera','light','sea','quality','fov','tilt','rate','expo','volume','bloom','foam','mouse','input-source','deadzone'];
  const saved=readStored<Record<string,string|boolean>>('settings',{});
  for(const id of controls) {
    const element=$(id) as HTMLInputElement|HTMLSelectElement;
    if (element instanceof HTMLInputElement && element.type==='checkbox') {
      if(typeof saved[id]==='boolean') element.checked=saved[id];
    } else if(typeof saved[id]==='string') {
      if(element instanceof HTMLSelectElement) { if(Array.from(element.options).some(o=>o.value===saved[id])) element.value=String(saved[id]); }
      else if(Number.isFinite(Number(saved[id]))) element.value=String(saved[id]);
    }
  }
  const storedBest=readStored<number|null>('best',null);
  race.best=typeof storedBest==='number'&&storedBest>0&&Number.isFinite(storedBest)?storedBest:null;

  function toast(message:string,duration=3500) { $('toast').textContent=message;show('toast',true);toastUntil=performance.now()+duration; }
  function saveSettings() {
    const settings:Record<string,string|boolean>={};
    controls.forEach(id=> {const e=$(id) as HTMLInputElement;settings[id]=e.type==='checkbox'?e.checked:e.value;});
    writeStored('settings',settings);
  }
  function resize() {
    const ratio=value('quality')==='ultra'?2:Math.min(devicePixelRatio||1,value('quality')==='high'?1.5:1);
    world.ocean.setQuality(value('quality'));
    world.quality=value('quality');
    renderer.shadowMap.enabled=value('quality')!=='balanced';
    const samples=value('quality')==='balanced'?0:Math.min(4,renderer.capabilities.maxSamples);
    for(const target of [composer.renderTarget1,composer.renderTarget2]) {
      if(target.samples!==samples) {target.samples=samples;target.dispose();}
    }
    renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight);
    composer.setPixelRatio(ratio);composer.setSize(innerWidth,innerHeight);
    camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  }
  function applySettings() {
    const oldMode=flight.mode;
    flight.mode=value('mode') as FlightMode;flight.rate=Number(value('rate'));flight.expo=Number(value('expo'));
    if(oldMode!==flight.mode) flight.angularVelocity.set(0,0,0);
    cameraMode=value('camera');cameraTilt=Number(value('tilt'));fov=Number(value('fov'));
    const lightChanged=world.light!==value('light');
    world.setLight(value('light') as LightPreset);sea=value('sea') as SeaState;
    if(lightChanged) {
      skyCamera.update(renderer,skyScene);
      const generator=new T.PMREMGenerator(renderer);environment.dispose();
      environment=generator.fromCubemap(skyTarget.texture);world.scene.environment=environment.texture;generator.dispose();
    }
    if(world.light==='day'&&photoSky&&photoEnvironment) {
      world.scene.background=photoSky.texture;world.scene.environment=photoEnvironment.texture;world.scene.environmentIntensity=0.6;
      world.sun.copy(photoSky.sun);world.sunlight.position.copy(world.sun).multiplyScalar(280);
    }else {world.scene.background=skyTarget.texture;world.scene.environment=environment.texture;world.scene.environmentIntensity=1;}
    if(lightChanged)world.forest?.relight(renderer,world.scene);
    world.ocean.material.uniforms.foamEnabled.value=checked('foam');bloom.enabled=checked('bloom')&&value('quality')!=='balanced';
    renderer.toneMappingExposure=value('light')==='day'?0.68:value('light')==='golden'?0.7:0.58;
    input.useMouse=checked('mouse');input.source=value('input-source') as Inputs['source'];input.deadzone=Number(value('deadzone'))/100;
    if(!input.useMouse&&document.pointerLockElement) document.exitPointerLock();
    sound.volume=Number(value('volume'))/100;sound.applyVolume();
    $('fov-value').textContent=`${fov}°`;$('tilt-value').textContent=`${cameraTilt}°`;
    $('rate-value').textContent=`${flight.rate}°/s`;$('expo-value').textContent=flight.expo.toFixed(2);
    $('volume-value').textContent=`${Math.round(sound.volume*100)}%`;$('deadzone-value').textContent=`${Math.round(input.deadzone*100)}%`;
    show('radio-controls',input.source==='radio');show('xbox-help',input.source!=='radio');
    resize();saveSettings();
  }
  controls.forEach(id=>$(id).addEventListener('input',()=>applySettings()));
  window.addEventListener('resize',resize);applySettings();

  function canArm() {
    if(input.source!=='keyboard'&&!input.pad) {toast('接続デバイスがありません。設定でキーボードを選ぶか、接続してボタンを押してください。');return false;}
    if(input.calibrating) {toast('校正を保存してからアームしてください。');return false;}
    if(input.source==='radio') {
      const axes=Object.values(input.profile.axes);
      if(new Set(axes).size!==4||axes.some(a=>a>=(input.pad?.axes.length??0))) {toast('送信機の4軸を重複なく割り当ててください。');return false;}
      if(input.sticks().throttle>0.12) {toast('安全のためスロットルを下げてからアームしてください。');return false;}
    }
    return true;
  }
  function arm() {
    if(!supported||$<HTMLButtonElement>('start').disabled)return;
    if(!canArm()) return;
    flight.armed=true;flight.crashed=false;void sound.start();toast('ARMED · フライト開始');
  }
  function startFlight() {
    if(!supported||$<HTMLButtonElement>('start').disabled)return;
    input.poll();if(!canArm()) {openDialog('settings-dialog');return;}
    if(selectedRace){time=0;world.ocean.advance(time,sea);}
    flight.reset();race.reset(selectedRace);flightTime=0;playing=true;paused=false;accumulator=0;input.clear();
    const launch=world.launchPose(time);flight.position.copy(launch.position);flight.previous.copy(launch.position);flight.velocity.copy(launch.velocity);flight.orientation.setFromAxisAngle(new T.Vector3(0,1,0),launch.heading);
    show('intro',false);show('intro-footer',false);show('scene-label',false);show('hud',hudVisible);document.body.classList.add('flying');
    flight.armed=true;world.updateGates(race.active,race.next);void sound.start();
    toast(selectedRace?'緑のゲートを番号順に通過。6ゲート × 3周。':'Spaceで上昇、WASDで傾き、Q/Eで旋回。Escで一時停止。',5500);
    document.activeElement instanceof HTMLElement&&document.activeElement.blur();
  }
  function restart() {
    closeAll();startFlight();
  }
  function closeAll() {document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(d=>d.close());}
  function pause(title='フライトを一時停止',message='ひと息ついて、また海へ。') {
    if(!playing||paused) return;
    paused=true;input.clear();document.exitPointerLock?.();sound.update(0,false);
    $('pause-title').textContent=title;$('pause-copy').textContent=message;
    show('resume',!flight.crashed&&!race.finished);show('results',false);
    $<HTMLDialogElement>('pause-dialog').showModal();
  }
  function resume() {
    if(!supported||flight.crashed||race.finished) return;
    input.poll();if(!canArm()) return;
    closeAll();paused=false;last=performance.now();accumulator=0;input.clear();void sound.start();
  }
  function menu() {
    closeAll();playing=false;paused=false;flight.reset();race.reset(false);input.clear();sound.update(0,false);document.exitPointerLock?.();
    show('intro',true);show('intro-footer',true);show('scene-label',true);show('hud',false);document.body.classList.remove('flying');world.updateGates(false,0);
  }
  function openDialog(id:string) {
    if(!supported||$<HTMLDialogElement>(id).open) return;
    returnToPause=$<HTMLDialogElement>('pause-dialog').open;
    if(returnToPause) $<HTMLDialogElement>('pause-dialog').close();
    if(playing) paused=true;
    input.clear();document.exitPointerLock?.();sound.update(0,false);
    $<HTMLDialogElement>(id).showModal();
  }
  function closeDialog(id:string) {
    $<HTMLDialogElement>(id).close();
    if(input.calibrating) {input.finishCalibration();$<HTMLButtonElement>('save-calibration').disabled=true;}
    if(returnToPause&&playing) {$<HTMLDialogElement>('pause-dialog').showModal();returnToPause=false;}
    else if(playing&&!flight.crashed&&!race.finished) {
      input.poll();
      if(!canArm()) {
        $('pause-title').textContent='入力デバイスを確認してください';$('pause-copy').textContent='接続とスロットルを確認して再開してください。';
        show('resume',true);$<HTMLDialogElement>('pause-dialog').showModal();return;
      }
      paused=false;accumulator=0;input.clear();void sound.start();
    }
  }
  ['settings-dialog','help-dialog'].forEach(id=>$<HTMLDialogElement>(id).addEventListener('cancel',e=> {e.preventDefault();closeDialog(id);}));
  $<HTMLDialogElement>('pause-dialog').addEventListener('cancel',e=> {e.preventDefault();resume();});
  document.querySelectorAll<HTMLElement>('[data-close]').forEach(b=>b.addEventListener('click',()=>closeDialog(b.dataset.close!)));
  $('start').addEventListener('click',startFlight);$('resume').addEventListener('click',resume);$('restart').addEventListener('click',restart);$('back-menu').addEventListener('click',menu);
  $('home').addEventListener('click',e=> {e.preventDefault();if(playing) pause();});
  $('open-settings').addEventListener('click',()=>openDialog('settings-dialog'));
  ['open-help','footer-help'].forEach(id=>$(id).addEventListener('click',()=>openDialog('help-dialog')));
  ['free-mode','race-mode'].forEach(id=>$(id).addEventListener('click',()=> {
    selectedRace=id==='race-mode';
    ['free-mode','race-mode'].forEach(mode=> {const active=(mode==='race-mode')===selectedRace;$(mode).classList.toggle('active',active);$(mode).setAttribute('aria-pressed',String(active));});
  }));
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach(b=>b.addEventListener('click',()=> {
    document.querySelectorAll<HTMLElement>('[data-tab]').forEach(tab=> {const active=tab===b;tab.classList.toggle('active',active);tab.setAttribute('aria-pressed',String(active));});
    show('tab-flight',b.dataset.tab==='flight');show('tab-controller',b.dataset.tab==='controller');updateControllerUI();
  }));
  $<HTMLSelectElement>('gamepad-device').addEventListener('change',()=> {input.selectedIndex=Number(value('gamepad-device'));input.clear();});
  const channels:Channel[]=['roll','pitch','yaw','throttle'];
  const channelNames:Record<Channel,string>={roll:'ロール',pitch:'ピッチ',yaw:'ヨー',throttle:'スロットル'};
  for(const channel of channels) {
    const row=document.createElement('div');row.className='mapping-row';
    const label=document.createElement('span');label.textContent=channelNames[channel];
    const select=document.createElement('select');select.id=`axis-${channel}`;select.setAttribute('aria-label',`${channelNames[channel]} 軸`);
    for(let i=0;i<16;i++) {const option=new Option(`Axis ${i}`,String(i));select.add(option);}
    select.addEventListener('change',()=> {input.profile.axes[channel]=Number(select.value);input.saveProfile();});
    const reverseLabel=document.createElement('label'),reverse=document.createElement('input');reverse.type='checkbox';reverse.id=`invert-${channel}`;reverse.setAttribute('aria-label',`${channelNames[channel]} 反転`);
    reverse.addEventListener('change',()=> {input.profile.invert[channel]=reverse.checked;input.saveProfile();});reverseLabel.append(reverse);row.append(label,select,reverseLabel);$('axis-mapping').append(row);
  }
  $('calibrate').addEventListener('click',()=> {
    if(input.beginCalibration()) {
      $<HTMLButtonElement>('save-calibration').disabled=false;
      $('calibration-help').textContent='中心を記録しました。すべてのスティック・スロットルを上下左右の端まで動かして「保存」を押してください。';
    } else toast('先に送信機を接続して軸を動かしてください。');
  });
  $('save-calibration').addEventListener('click',()=> {
    input.finishCalibration();$<HTMLButtonElement>('save-calibration').disabled=true;
    $('calibration-help').textContent='校正を保存しました。各軸の反転を確認し、スロットルを最下端にしてからアームしてください。';
  });
  function updateControllerUI() {
    const pads=input.pads(),select=$<HTMLSelectElement>('gamepad-device');
    const signature=pads.map(p=>`${p.index}:${p.id}`).join('|');
    if(select.dataset.signature!==signature) {
      select.replaceChildren(new Option('自動選択','-1'));
      pads.forEach(p=>select.add(new Option(`${p.index}: ${p.id}`,String(p.index))));
      select.value=String(input.selectedIndex);select.dataset.signature=signature;
    }
    const p=input.pad;
    $('connection').lastChild!.textContent=input.source==='keyboard'?' KEYBOARD':p?(input.source==='radio'?' USB RADIO':' GAMEPAD'):' DISCONNECTED';
    $('device-status').textContent=p?`${p.id} · ${p.axes.length}軸 / ${p.buttons.length}ボタン · ${p.mapping||'custom'}`:'コントローラー未検出 — 接続してボタンまたはスティックを操作';
    if(p&&input.source==='radio') {
      const mapped=input.sticks();
      $('device-status').textContent+=`\nTHROTTLE ${Math.round(mapped.throttle*100)}% · ROLL ${mapped.roll.toFixed(2)} · PITCH ${mapped.pitch.toFixed(2)} · YAW ${mapped.yaw.toFixed(2)}`;
    }
    const monitor=$('axis-monitor');
    if(monitor.childElementCount!==(p?.axes.length??0)) {
      monitor.replaceChildren();p?.axes.forEach((_,i)=> {
        const item=document.createElement('div');item.className='axis-item';
        const label=document.createElement('span');label.textContent=`A${i}`;
        const track=document.createElement('div');track.className='axis-track';track.append(document.createElement('i'));
        const number=document.createElement('span');item.append(label,track,number);monitor.append(item);
      });
    }
    p?.axes.forEach((v,i)=> {const item=monitor.children[i];(item.children[1].firstChild as HTMLElement).style.width=`${(v+1)*50}%`;item.children[2].textContent=v.toFixed(2);});
    for(const channel of channels) {
      $<HTMLSelectElement>(`axis-${channel}`).value=String(input.profile.axes[channel]);
      $<HTMLInputElement>(`invert-${channel}`).checked=input.profile.invert[channel];
    }
  }
  input.onDisconnect=()=>pause('コントローラー接続が切れました','再接続してボタンを押すか、設定でキーボードを選んでください。');
  input.onAction=action=> {
    if(action==='pause') {if(playing) {if(paused&&$<HTMLDialogElement>('pause-dialog').open) resume();else if(!paused) pause();}return;}
    if(action==='settings') {if(!document.querySelector('dialog[open]')) openDialog('settings-dialog');return;}
    if(action==='reset'&&playing&&(!paused||$<HTMLDialogElement>('pause-dialog').open)) {restart();return;}
    if(paused||!playing) return;
    if(action==='arm') {
      if(flight.armed) {flight.armed=false;flight.motor=0;toast('DISARMED · モーター停止。F / A で再アーム');}
      else arm();
    }
    if(action==='camera') {cameraMode=cameraMode==='fpv'?'chase':'fpv';$<HTMLSelectElement>('camera').value=cameraMode;saveSettings();toast(cameraMode==='fpv'?'FPV CAMERA':'CHASE CAMERA');}
    if(action==='mute') {sound.muted=!sound.muted;sound.applyVolume();toast(sound.muted?'音声をミュート':'音声をオン');}
    if(action==='hud') {hudVisible=!hudVisible;show('hud',hudVisible);}
  };
  canvas.addEventListener('click',()=> {
    if(playing&&!paused&&input.useMouse&&input.source==='keyboard') {
      try {const result=canvas.requestPointerLock();if(result) void result.catch(()=>toast('マウス操作を開始できませんでした。キーボード操作も使用できます。'));} catch {toast('マウスロックを利用できません。');}
    }
  });
  document.addEventListener('visibilitychange',()=> {if(document.hidden) {pause('フライトを一時停止','別のタブに移動したため一時停止しました。');sound.suspend();input.clear();}});
  window.addEventListener('blur',()=>pause('フライトを一時停止','画面から離れたため一時停止しました。'));
  canvas.addEventListener('webglcontextlost',e=> {e.preventDefault();supported=false;paused=true;flight.armed=false;flight.motor=0;input.clear();input.enabled=false;closeAll();document.exitPointerLock?.();$<HTMLButtonElement>('start').disabled=true;show('unsupported',true);$('unsupported-reason').textContent='GPUの描画状態を失いました。再読み込みしてください。';$('unsupported').querySelector<HTMLButtonElement>('button')!.focus();sound.suspend();});

  const minimap=$<HTMLCanvasElement>('minimap').getContext('2d')!;
  function drawMinimap() {
    const ctx=minimap;ctx.clearRect(0,0,240,240);ctx.save();ctx.translate(120,120);
    ctx.strokeStyle='#c9eed521';ctx.lineWidth=1;
    for(const radius of [38,76,114]) {ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.stroke();}
    ctx.beginPath();ctx.moveTo(-120,0);ctx.lineTo(120,0);ctx.moveTo(0,-120);ctx.lineTo(0,120);ctx.stroke();
    const scale=race.active?1.7:0.14,origin=race.active?new T.Vector3():flight.position;
    const project=(x:number,z:number)=>[(x-origin.x)*scale,(z-origin.z)*scale];
    if(!race.active)for(const island of world.islands){const [x,z]=project(island.x,island.z);ctx.fillStyle='#90af8b30';ctx.beginPath();ctx.arc(x,z,island.size*scale,0,Math.PI*2);ctx.fill();}
    for(const [root,length,width]of [[world.ship,92,4.4],[world.cruise.root,260,17],[world.yacht,28,4.5]]as const){const [x,z]=project(root.position.x,root.position.z);ctx.save();ctx.translate(x,z);ctx.rotate(-root.rotation.y);ctx.fillStyle='#d2e3d799';ctx.beginPath();ctx.moveTo(0,-length*0.5*scale);ctx.lineTo(width*scale,-length*0.35*scale);ctx.lineTo(width*scale,length*0.45*scale);ctx.lineTo(-width*scale,length*0.45*scale);ctx.lineTo(-width*scale,-length*0.35*scale);ctx.closePath();ctx.fill();ctx.restore();}
    if(race.active) GATES.forEach((g,i)=> {const [x,z]=project(g.position.x,g.position.z);ctx.fillStyle=i===race.next?'#b5ebd4':'#769488';ctx.beginPath();ctx.arc(x,z,4,0,Math.PI*2);ctx.fill();});
    const pos=flight.position.clone();const direction=new T.Vector3(0,0,-1).applyQuaternion(flight.orientation);const angle=Math.atan2(direction.x,-direction.z);
    const [px,pz]=project(pos.x,pos.z);const x=Math.max(-108,Math.min(108,px)),z=Math.max(-108,Math.min(108,pz));ctx.translate(x,z);ctx.rotate(angle);
    ctx.fillStyle='#eeb982';ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(5,5);ctx.lineTo(0,2);ctx.lineTo(-5,5);ctx.closePath();ctx.fill();ctx.restore();
  }
  function hud() {
    $('speed').textContent=String(Math.round(flight.velocity.length()*3.6));
    $('altitude').textContent=(flight.position.y-world.ocean.heightAt(flight.position.x,flight.position.z)).toFixed(1);
    $('vertical').textContent=(flight.velocity.y>=0?'+':'')+flight.velocity.y.toFixed(1);
    $('flight-mode').textContent=flight.mode.toUpperCase();$('arm-state').textContent=flight.armed?'ARMED':'DISARMED';
    $('input-label').textContent=input.source.toUpperCase();
    const direction=new T.Vector3(0,0,-1).applyQuaternion(flight.orientation);
    const heading=(T.MathUtils.radToDeg(Math.atan2(direction.x,-direction.z))+360)%360;
    const letters=['N','NE','E','SE','S','SW','W','NW'];$('heading').textContent=`${Math.round(heading).toString().padStart(3,'0')}° ${letters[Math.round(heading/45)%8]}`;
    $('race-label').textContent=race.active?`LAP ${race.lap} / 3`:'FREE FLIGHT';$('timer').textContent=formatTime(race.active?race.elapsed:flightTime);
    $('race-detail').textContent=race.active?`GATE ${race.next+1} / 6${race.best?` · BEST ${formatTime(race.best)}`:''}`:`DIST ${Math.round(flight.distance)} m · MAX ${Math.round(flight.maxSpeed*3.6)} km/h`;
    show('gate-target',race.active&&!race.finished);
    if(race.active) {
      const delta=GATES[race.next].position.clone().sub(flight.position);
      const local=delta.clone().applyQuaternion(flight.orientation.clone().invert());
      const arrow=local.z>0?'↶':local.x>4?'→':local.x< -4?'←':'↑';
      $('gate-target').textContent=`${arrow} GATE ${String(race.next+1).padStart(2,'0')} · ${Math.round(delta.length())} m`;
    }
    const sticks=input.sticks();$('left-stick').style.transform=`translate(${sticks.yaw*18}px,${-sticks.throttle*18}px)`;
    $('right-stick').style.transform=`translate(${sticks.roll*18}px,${sticks.pitch*18}px)`;
    drawMinimap();
  }
  function frame(now:number) {
    requestAnimationFrame(frame);
    const dt=Math.min((now-last)/1000,0.06);last=now;
    input.poll();
    if(now-lastControllerUI>180) {updateControllerUI();lastControllerUI=now;}
    if(!supported||document.hidden) return;
    if(!paused) time+=dt;
    world.ocean.advance(time,sea);
    world.advanceVessels(time);
    if(playing&&!paused&&!flight.crashed&&!race.finished) {
      accumulator+=dt;
      const sticks=input.sticks();
      while(accumulator>=1/120) {
        const step=1/120;flight.step(step,sticks,sea==='swell'?0.65:sea==='breeze'?0.2:0);flightTime+=step;accumulator-=step;
        const collision=world.collision(flight.position,time,sea);
        if(collision) {flight.crashed=true;flight.armed=false;flight.motor=0;pause('フライト終了',`${collision}。Rまたは「やり直す」で離陸地点へ。`);break;}
        if(race.step(step,flight.previous,flight.position)) {
          world.updateGates(race.active,race.next);
          if(race.finished) {
            writeStored('best',race.best);pause('コース完走！','6ゲート × 3周を飛び切りました。');
            show('results',true);$('results').textContent=`TOTAL ${formatTime(race.elapsed)} · BEST ${formatTime(race.best!)}\nLAPS ${race.laps.map(formatTime).join(' / ')}`;
            break;
          }
          toast(`GATE CLEAR · ${race.next===0?`LAP ${race.lap} / 3`:`NEXT ${race.next+1}`}`,1100);
        }
      }
    } else accumulator=0;
    if(!playing) {
      const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      const drift=reduced?0:Math.sin(time*0.045)*4;
      camera.fov=58;camera.position.set(112+drift,42,137+drift);camera.lookAt(-25,10,-125);
      world.drone.visible=false;
    } else {
      camera.fov=fov;
      if(cameraMode==='fpv') {
        camera.position.copy(flight.position);cameraTiltQuaternion.setFromAxisAngle(new T.Vector3(1,0,0),T.MathUtils.degToRad(cameraTilt));
        camera.quaternion.copy(flight.orientation).multiply(cameraTiltQuaternion);world.drone.visible=false;
      } else {
        desiredCamera.set(0,2.2,6).applyQuaternion(flight.orientation).add(flight.position);
        camera.position.copy(desiredCamera);camera.lookAt(flight.position.clone().add(new T.Vector3(0,0,-2).applyQuaternion(flight.orientation)));world.drone.visible=true;
      }
    }
    camera.updateProjectionMatrix();
    world.update(time,camera.position,sea,flight.position,flight.orientation,flight.motor);
    world.scene.backgroundRotation.y=time*0.00015;
    world.scene.environmentRotation.y=world.scene.backgroundRotation.y;
    if(world.light==='day'&&photoSky) {world.sun.copy(photoSky.sun).applyAxisAngle(new T.Vector3(0,1,0),world.scene.backgroundRotation.y);world.sunlight.position.copy(world.sun).multiplyScalar(280);}
    world.ship.updateMatrixWorld(true);
    sound.update(flight.motor,playing&&!paused&&flight.armed);
    renderer.info.reset();composer.render();
    if(now-lastHUD>100) {if(playing) hud();lastHUD=now;}
    if(toastUntil&&now>toastUntil) {show('toast',false);toastUntil=0;}
    frameCount++;
    if(now-fpsTime>1000) {$('fps').textContent=`${Math.round(frameCount*1000/(now-fpsTime))} FPS`;frameCount=0;fpsTime=now;}
  }
  world.updateGates(false,0);
  const lightingReady=loadPhotographicSky().then(loadedSky=> {
    if(!supported)return;
    photoSky=loadedSky;
    if(photoSky){const generator=new T.PMREMGenerator(renderer);photoEnvironment=generator.fromEquirectangular(photoSky.texture);generator.dispose();applySettings();}
  });
  const [missingSurfaces]=await Promise.all([world.loadSurfaceTextures(renderer,lightingReady),lightingReady]);
  if(!supported)return;
  camera.position.set(112,42,137);camera.lookAt(-25,10,-125);
  world.update(0,camera.position,sea,flight.position,flight.orientation,0);
  composer.render();
  $<HTMLButtonElement>('start').disabled=false;
  $('start-note').textContent=missingSurfaces.length?'一部の素材を読み込めませんでした。標準素材でプレイできます。':innerWidth<600?'PCのキーボードまたは接続コントローラーでプレイできます。':'インストール不要 · キーボード / Xbox / USB送信機';
  if(import.meta.env.DEV&&new URLSearchParams(location.search).has('test')) {
    Object.assign(window,{__OCEANFPV__:{flight,race,input,world,camera,getState:()=>({playing,paused,time,flightTime,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles})}});
  }
  requestAnimationFrame(frame);
}
void boot().catch(error=> {
  console.error(error);show('unsupported',true);$('unsupported-reason').textContent='描画の初期化中にエラーが発生しました。WebGL2対応の最新ブラウザで再読み込みしてください。';
});
