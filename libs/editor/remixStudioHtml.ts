export type RemixMode = 'green-screen' | 'collab' | 'sound' | 'cut';
export interface RemixStudioConfig {
  mode: RemixMode;
  videoUrl: string;
  sourceUrl: string;
  title: string;
  creator?: string;
  bridgeKey: string;
}

/** Shared by the web recorder and the native WebView. Camera frames stay on device. */
export function buildRemixStudioHtml(config: RemixStudioConfig): string {
  const json = JSON.stringify(config).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><meta charset="utf-8"><style>
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:#101010;color:#fff;font:14px system-ui,sans-serif}button,select,input{font:inherit}button,select{border:1px solid #444;border-radius:12px;background:#262626;color:#fff;padding:10px 14px}button:disabled{opacity:.4}button.primary{background:#fff;color:#111;font-weight:700}header,.row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}header{padding:12px 16px;justify-content:space-between}h1{font-size:18px;margin:0}.stage{height:min(51vh,540px);display:flex;justify-content:center;background:#000}canvas{height:100%;max-width:100%;object-fit:contain;touch-action:none}section{max-width:680px;margin:auto;padding:12px 16px}label{display:flex;align-items:center;gap:8px;margin:8px 0}input[type=range]{flex:1;min-width:70px;accent-color:#ddd}small,#status{color:#bbb}#status{min-height:22px;margin:8px 0}#status.error{color:#ffb4ab}video.capture{position:fixed;width:2px;height:2px;left:0;top:0;opacity:.01;pointer-events:none}#review{width:100%;max-height:51vh;background:#000}#credit{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:85vw}fieldset{border:0;padding:0;margin:0}output{min-width:42px;font-variant-numeric:tabular-nums}#clock{font-variant-numeric:tabular-nums;font-size:17px}a{color:inherit}</style></head><body>
<header><h1 id="title"></h1><button id="close" aria-label="Close remix">Close</button></header>
<div class="stage" id="stage"><canvas id="canvas" width="720" height="1280" aria-label="Live remix preview"></canvas></div><video id="review" controls playsinline hidden></video>
<section><div id="credit"></div><p id="status" role="status" aria-live="polite">Loading source video…</p>
<fieldset id="settings"><label>Start <input id="trim" type="range" min="0" max="0" step="0.1" value="0"><output id="trimValue">0.0s</output></label>
<div class="row"><label>Length <select id="length"><option value="15">15 seconds</option><option value="60">60 seconds</option></select></label><label id="cutLabel" hidden>Excerpt <select id="cutLength"><option>1</option><option>2</option><option>3</option><option>4</option><option selected>5</option></select> sec</label><label id="layoutLabel">Layout <select id="layout"></select></label></div>
<label>Source volume <input id="sourceVolume" type="range" min="0" max="1" step="0.05" value="0.7"></label><label>Microphone <input id="micVolume" type="range" min="0" max="1" step="0.05" value="1"></label>
<div class="row"><button id="sample" disabled>Play sample</button><button id="camera" disabled>Enable camera</button><button id="flip" disabled>Flip camera</button><label><input id="countdown" type="checkbox" checked>3 sec timer</label></div>
<small id="hint"></small></fieldset>
<div class="row" style="margin-top:12px"><button class="primary" id="record" disabled>Record</button><button id="stop" hidden>Stop</button><strong id="clock"></strong><button id="retake" hidden>Retake</button><button class="primary" id="use" hidden>Use video</button></div>
</section><video id="source" class="capture" playsinline crossorigin="anonymous" preload="auto"></video><video id="cameraVideo" class="capture" autoplay playsinline muted></video>
<script>const config = ${json};</script><script type="module">${REMIX_STUDIO_RUNTIME}</script></body></html>`;
}

export const REMIX_STUDIO_RUNTIME = String.raw`
const $ = id => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d'), source = $('source'), camera = $('cameraVideo');
const mask = document.createElement('canvas'), person = document.createElement('canvas');
const maskCtx = mask.getContext('2d'), personCtx = person.getContext('2d');
let stream = null, segmenter = null, audio = null, mix = null, sourceGain = null, micGain = null, monitor = null, micNode = null;
let recorder = null, capture = null, result = null, resultUrl = null, chunks = [], recordedBytes = 0, lastFrame = -1;
let ready = false, busy = false, recording = false, counting = false, closed = false, discarded = false, facing = 'user';
let started = 0, measured = 0, samplePlaying = false, animation = 0, countTimer = 0, recordTimer = 0;
let subject = {x:.5,y:.6,scale:.8}, pointers = new Map(), pinch = null;
const names = {'green-screen':'Green screen',collab:'Collab',sound:'Use this sound',cut:'Cut this video'};
const MAX_BYTES = 24 * 1024 * 1024;
function send(type, data = {}) { const packet = {key:config.bridgeKey,type,...data}; if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(packet)); else parent.postMessage(packet, '*'); }
function status(text, error = false) { $('status').textContent = text; $('status').className = error ? 'error' : ''; }
function range() { const start = Number($('trim').value), remaining = Math.max(0, source.duration - start); return {start, duration:Math.min(Number($('length').value),remaining), cut:Math.min(Number($('cutLength').value),remaining)}; }
function liveError(error) { if(closed)return; status(error.message || String(error), true); if(recording) stop(true); send('error',{error:error.message || String(error)}); }
function controls() { $('settings').disabled = busy || recording || counting || !!result; $('record').disabled = !ready || !stream || busy || counting || !!result; $('camera').disabled = !ready || busy; $('flip').disabled = !stream || busy; $('stop').hidden = !recording && !counting; $('record').hidden = recording || counting || !!result; $('retake').hidden = !result; $('use').hidden = !result; }
function cover(context, image, x,y,w,h, mirror = false) {
  const iw=image.videoWidth || image.width, ih=image.videoHeight || image.height; if(!iw || !ih)return;
  const scale=Math.max(w/iw,h/ih), sw=w/scale, sh=h/scale;
  context.save(); context.beginPath(); context.rect(x,y,w,h); context.clip();
  if(mirror){ context.translate(x+w,y);context.scale(-1,1);x=0;y=0; }
  context.drawImage(image,(iw-sw)/2,(ih-sh)/2,sw,sh,x,y,w,h);context.restore();
}
function draw(now) {
  if(closed)return; animation=requestAnimationFrame(draw);
  if(result)return;
  const w=canvas.width,h=canvas.height,r=range(), elapsed=recording?(now-started)/1000:0;
  if(recording && elapsed >= (config.mode==='cut' ? Math.min(60,r.cut+Number($('length').value)) : r.duration)){stop();return;}
  if(recording && config.mode==='cut' && elapsed>=r.cut){ source.pause(); if(sourceGain)sourceGain.gain.value=0; }
  if(samplePlaying && source.currentTime>=r.start+(config.mode==='cut'?r.cut:r.duration)){source.pause();samplePlaying=false;}
  ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
  const cameraReady=camera.readyState>=2 && stream;
  if(config.mode==='green-screen') {
    cover(ctx,source,0,0,w,h);
    if(cameraReady && segmenter) {
      if(camera.currentTime!==lastFrame) {
        lastFrame=camera.currentTime;
        try { segmenter.segmentForVideo(camera,now,seg => {
          const masks=seg.confidenceMasks, foreground=masks && (masks.length>1 ? masks[1] : masks[0]);
          if(!foreground)throw new Error('The camera mask is unavailable.');
          const pixels=foreground.getAsFloat32Array(); mask.width=foreground.width;mask.height=foreground.height;
          const rgba=maskCtx.createImageData(mask.width,mask.height);
          for(let i=0;i<pixels.length;i++){rgba.data[i*4]=255;rgba.data[i*4+1]=255;rgba.data[i*4+2]=255;rgba.data[i*4+3]=Math.round(Math.max(0,Math.min(1,(pixels[i]-.15)/.7))*255);}
          maskCtx.putImageData(rgba,0,0);
          person.width=480;person.height=Math.round(480*camera.videoHeight/camera.videoWidth);
          personCtx.drawImage(camera,0,0,person.width,person.height);personCtx.globalCompositeOperation='destination-in';personCtx.drawImage(mask,0,0,person.width,person.height);personCtx.globalCompositeOperation='source-over';
        }); } catch(error){liveError(error);stream?.getTracks().forEach(t=>t.stop());stream=null;segmenter?.close();segmenter=null;controls();return;}
      }
      const ph=h*subject.scale,pw=ph*person.width/Math.max(1,person.height);ctx.save();ctx.translate(w*subject.x,h*subject.y);if(facing==='user')ctx.scale(-1,1);ctx.drawImage(person,-pw/2,-ph/2,pw,ph);ctx.restore();
    }
  } else if(config.mode==='collab') {
    const stacked=$('layout').value==='stacked';cover(ctx,source,0,0,stacked?w:w/2,stacked?h/2:h);
    if(cameraReady)cover(ctx,camera,stacked?0:w/2,stacked?h/2:0,stacked?w:w/2,stacked?h/2:h,facing==='user');
  } else if(config.mode==='cut' && (!recording || elapsed<r.cut)) cover(ctx,source,0,0,w,h);
  else if(cameraReady)cover(ctx,camera,0,0,w,h,facing==='user');
  else if(config.mode==='sound')cover(ctx,source,0,0,w,h);
  if(micGain)micGain.gain.value=recording && config.mode==='cut' && elapsed<r.cut?0:Number($('micVolume').value);
  if(recording)$('clock').textContent=elapsed.toFixed(1)+'s';
}
function waitMedia(element,event,begin) { return new Promise((resolve,reject)=>{let timer;const finish=error=>{clearTimeout(timer);element.removeEventListener(event,done);element.removeEventListener('error',failed);error?reject(error):resolve();};const done=()=>finish(),failed=()=>finish(new Error('This source video could not be opened.'));element.addEventListener(event,done,{once:true});element.addEventListener('error',failed,{once:true});timer=setTimeout(()=>finish(new Error('The video took too long to load. Try again.')),25000);try{begin();}catch(error){finish(error);}}); }
async function seek() {const time=range().start;if(Math.abs(source.currentTime-time)<.03 && source.readyState>=2)return;await waitMedia(source,'seeked',()=>source.currentTime=time);}
async function initAudio() {
  if(!audio){audio=new AudioContext();mix=audio.createMediaStreamDestination();sourceGain=audio.createGain();monitor=audio.createGain();sourceGain.gain.value=Number($('sourceVolume').value);monitor.gain.value=0;audio.createMediaElementSource(source).connect(sourceGain);sourceGain.connect(mix);sourceGain.connect(monitor);monitor.connect(audio.destination);source.muted=false;}
  await audio.resume();
}
async function enableCamera() {
  if(busy || closed)return;busy=true;controls();status('Opening camera…');
  try {
    await initAudio();
    if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;camera.srcObject=null;}
    const next=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:720},height:{ideal:1280},frameRate:{ideal:24,max:30}},audio:{echoCancellation:true,noiseSuppression:true}});
    if(closed){next.getTracks().forEach(t=>t.stop());return;}
    if(stream)stream.getTracks().forEach(t=>t.stop());if(micNode)micNode.disconnect();stream=next;camera.srcObject=next;await camera.play();
    micGain ||= audio.createGain();micNode=audio.createMediaStreamSource(next);micNode.connect(micGain);micGain.disconnect();micGain.connect(mix);
    if(config.mode==='green-screen' && !segmenter){
      status('Preparing live background removal…');
      const {FilesetResolver,ImageSegmenter}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs');
      const files=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm');
      const task=await ImageSegmenter.createFromOptions(files,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite'},runningMode:'VIDEO',outputConfidenceMasks:true,outputCategoryMask:false});
      if(closed){task.close();return;}segmenter=task;
    }
    lastFrame=-1;status('Ready. Use headphones to keep the source out of your microphone.');
  }catch(error){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}liveError(error);}
  finally{busy=false;controls();}
}
async function start() {
  if(recording || counting || busy || !ready || !stream)return;
  counting=true;controls();source.pause();samplePlaying=false;
  try {
    await initAudio();await seek();
    if($('countdown').checked){for(let n=3;n>0;n--){if(!counting || closed)return;status(String(n));await new Promise(resolve=>{countTimer=setTimeout(resolve,1000);});}}
    if(!counting || closed)return;
    chunks=[];recordedBytes=0;discarded=false;result=null;capture=canvas.captureStream(24);
    for(const track of mix.stream.getAudioTracks())capture.addTrack(track.clone());
    const mime=['video/webm;codecs=vp8,opus','video/mp4','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
    if(!mime)throw new Error('Video recording is unavailable on this device.');
    recorder=new MediaRecorder(capture,{mimeType:mime,videoBitsPerSecond:2000000,audioBitsPerSecond:128000});
    recorder.ondataavailable=event=>{if(event.data.size){recordedBytes+=event.data.size;if(recordedBytes>MAX_BYTES){discarded=true;liveError(new Error('Recording is too large. Please use a shorter take.'));return;}chunks.push(event.data);}};
    recorder.onerror=()=>liveError(new Error('Recording failed. Please try another take.'));
    recorder.onstop=()=>{capture?.getTracks().forEach(t=>t.stop());capture=null;source.pause();if(monitor)monitor.gain.value=0;if(!discarded && chunks.length && measured>.25){result=new Blob(chunks,{type:mime.split(';')[0]});resultUrl=URL.createObjectURL(result);$('review').src=resultUrl;$('review').hidden=false;$('stage').hidden=true;status('Review your take before using it.');}chunks=[];controls();};
    sourceGain.gain.value=Number($('sourceVolume').value);monitor.gain.value=1;
    await source.play();if(closed || !counting){source.pause();capture?.getTracks().forEach(t=>t.stop());capture=null;return;}
    started=performance.now();recording=true;counting=false;recorder.start(500);controls();status('Recording');
    const r=range();recordTimer=setTimeout(()=>stop(),1000*(config.mode==='cut'?Math.min(60,r.cut+Number($('length').value)):r.duration));
  }catch(error){counting=false;recording=false;capture?.getTracks().forEach(t=>t.stop());capture=null;source.pause();if(monitor)monitor.gain.value=0;liveError(error);controls();}
}
function stop(discard=false){discarded ||= discard;counting=false;clearTimeout(recordTimer);if(recording)measured=(performance.now()-started)/1000;recording=false;source.pause();if(monitor)monitor.gain.value=0;if(recorder && recorder.state!=='inactive')recorder.stop();else{capture?.getTracks().forEach(t=>t.stop());capture=null;controls();}}
function dispose(){if(closed)return;closed=true;stop(true);clearTimeout(countTimer);cancelAnimationFrame(animation);stream?.getTracks().forEach(t=>t.stop());stream=null;segmenter?.close();segmenter=null;audio?.close();if(resultUrl)URL.revokeObjectURL(resultUrl);source.removeAttribute('src');source.load();}
$('title').textContent=names[config.mode] || 'Remix';$('credit').textContent='Source: '+(config.creator ? '@'+config.creator+' · ' : '')+config.title;
$('hint').textContent=config.mode==='green-screen'?'Your background is removed live. Drag to move yourself; pinch or scroll to resize.':'Choose your source range and layout, then record your response.';
$('cutLabel').hidden=config.mode!=='cut';$('layoutLabel').hidden=config.mode==='sound'||config.mode==='cut';
for(const [value,label] of (config.mode==='collab'?[['side','Side by side'],['stacked','Stacked']]:[['full','Full screen'],['corner','Corner'],['square','Square']])){$('layout').add(new Option(label,value));}
$('layout').onchange=()=>{canvas.height=$('layout').value==='square'?720:1280;subject=$('layout').value==='corner'?{x:.73,y:.74,scale:.48}:{x:.5,y:.6,scale:.8};};
$('trim').oninput=()=>{$('trimValue').textContent=Number($('trim').value).toFixed(1)+'s';source.pause();samplePlaying=false;source.currentTime=Number($('trim').value);};
$('sourceVolume').oninput=()=>{if(sourceGain)sourceGain.gain.value=Number($('sourceVolume').value);};
$('sample').onclick=async()=>{try{await initAudio();await seek();monitor.gain.value=1;await source.play();samplePlaying=true;}catch(error){liveError(error);}};
$('camera').onclick=enableCamera;$('flip').onclick=()=>{facing=facing==='user'?'environment':'user';void enableCamera();};$('record').onclick=start;$('stop').onclick=()=>stop();
$('retake').onclick=()=>{if(resultUrl)URL.revokeObjectURL(resultUrl);resultUrl=null;result=null;$('review').pause();$('review').removeAttribute('src');$('review').hidden=true;$('stage').hidden=false;$('clock').textContent='';status('Ready for another take.');controls();};
$('use').onclick=async()=>{if(!result || busy)return;busy=true;controls();$('use').disabled=true;status('Preparing your video…');try{const reader=new FileReader();reader.onload=()=>{send('recorded',{dataUrl:reader.result,duration:measured,mime:result.type,width:canvas.width,height:canvas.height});};reader.onerror=()=>{busy=false;$('use').disabled=false;liveError(new Error('Could not prepare the take.'));controls();};reader.readAsDataURL(result);}catch(error){busy=false;liveError(error);controls();}};
function hostMessage(event){let data=event.data;try{if(typeof data==='string')data=JSON.parse(data);}catch{return;}if(data?.key!==config.bridgeKey)return;if(data.type==='save-failed'){busy=false;$('use').disabled=false;status(data.error||'Could not save. Your take is ready to retry.',true);controls();}if(data.type==='dispose')dispose();}
window.addEventListener('message',hostMessage);document.addEventListener('message',hostMessage);
$('close').onclick=()=>{dispose();send('cancel');};window.addEventListener('pagehide',dispose);
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(recording||counting)stop();stream?.getTracks().forEach(t=>t.stop());stream=null;source.pause();controls();status('Camera stopped while this screen was hidden. Enable it to continue.');}});
canvas.onpointerdown=event=>{if(config.mode!=='green-screen'||recording)return;canvas.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});};
canvas.onpointermove=event=>{if(!pointers.has(event.pointerId))return;const before=pointers.get(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});const box=canvas.getBoundingClientRect();if(pointers.size===1){subject.x=Math.max(0,Math.min(1,subject.x+(event.clientX-before.x)/box.width));subject.y=Math.max(0,Math.min(1,subject.y+(event.clientY-before.y)/box.height));}else{const [a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);if(pinch)subject.scale=Math.max(.2,Math.min(2,subject.scale*distance/pinch));pinch=distance;}};
canvas.onpointerup=canvas.onpointercancel=event=>{pointers.delete(event.pointerId);pinch=null;};canvas.onwheel=event=>{if(config.mode==='green-screen'&&!recording){event.preventDefault();subject.scale=Math.max(.2,Math.min(2,subject.scale-event.deltaY*.001));}};
source.addEventListener('error',()=>liveError(new Error('This video cannot be loaded for remixing. Try a different source.')));
source.addEventListener('waiting',()=>{if(recording && (config.mode!=='cut'||(performance.now()-started)/1000<range().cut))liveError(new Error('Source playback stalled. Please retry after it has loaded.'));});
try {
  if(!['green-screen','collab','sound','cut'].includes(config.mode)||!/^https:\/\//.test(config.videoUrl))throw new Error('Invalid remix source.');
  if(!navigator.mediaDevices?.getUserMedia || !canvas.captureStream || typeof MediaRecorder==='undefined')throw new Error('Live recording is unavailable in this browser. Use the latest Chrome or the DeHub app.');
  await waitMedia(source,'loadeddata',()=>{source.src=config.videoUrl;source.muted=true;});
  if(!Number.isFinite(source.duration)||source.duration<.25)throw new Error('Choose a finished video with a known duration.');
  $('trim').max=String(Math.max(0,source.duration-.5));ready=true;$('sample').disabled=false;controls();status('Choose a source range, then enable your camera.');send('ready');animation=requestAnimationFrame(draw);
}catch(error){liveError(error);}
`;
