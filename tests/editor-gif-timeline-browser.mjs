import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const platform = process.env.EDITOR_PLATFORM;
assert(['web', 'mobile'].includes(platform));
assert(process.env.EDITOR_BROWSER_ROOT);
const dependencyRoot = resolve(process.env.EDITOR_BROWSER_ROOT, 'node_modules');
const { chromium } = await import(pathToFileURL(resolve(dependencyRoot, 'playwright/index.mjs')).href);
const { build } = await import(pathToFileURL(resolve(dependencyRoot, 'esbuild/lib/main.js')).href);
const directory = resolve('gif-timeline-browser-results');
await mkdir(directory, { recursive: true });
const fixturePath = platform === 'web' ? 'src/lib/editor/fixtures/gifTimeline.json' : '__tests__/libs/fixtures/gifTimeline.json';
const fixture = JSON.parse(await readFile(fixturePath, 'utf8')).fixtures[0];
const sourceRoot = resolve(platform === 'web' ? 'src/lib/editor' : 'libs/editor');
const runtime = await readFile(resolve(sourceRoot, 'gifTimelineRuntime.ts'), 'utf8');
const entry = platform === 'web'
  ? `import {drawClip} from ${JSON.stringify(resolve(sourceRoot, 'render.ts'))};
     import {prepareGifImage} from ${JSON.stringify(resolve(sourceRoot, 'gifImage.ts'))};
     import {exportProject} from ${JSON.stringify(resolve(sourceRoot, 'exporter.ts'))};
     window.editor={drawClip,prepareGifImage,exportProject};`
  : `import {EDITOR_CANVAS_HTML} from ${JSON.stringify(resolve(sourceRoot, 'canvasHtml.ts'))};
     window.canvasHTML=EDITOR_CANVAS_HTML;`;
const bundled = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'iife', platform: 'browser', nodePaths: [dependencyRoot], write: false });
const moduleSource = bundled.outputFiles[0].text;
const muxerBundle = await build({ entryPoints: [resolve(dependencyRoot, 'mp4-muxer/build/mp4-muxer.mjs')], bundle: true, format: 'esm', platform: 'browser', write: false });
const muxerSource = muxerBundle.outputFiles[0].text;
const html = '<!doctype html><meta charset="utf-8"><script src="/editor.js"></script>';
const server = createServer((request, response) => {
  if (request.url === '/editor.js') { response.setHeader('content-type', 'text/javascript'); response.end(moduleSource); }
  else if (request.url === '/muxer.js') { response.setHeader('content-type', 'text/javascript'); response.end(muxerSource); }
  else { response.setHeader('content-type', 'text/html'); response.end(html); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 160, height: 160 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(origin);
  if (platform === 'mobile') {
    const canvasHTML = await page.evaluate(() => window.canvasHTML);
    assert(!canvasHTML.includes('__GIF_TIMELINE_RUNTIME__'));
    assert(canvasHTML.includes(runtime.match(/function createGifTimeline[\s\S]*?(?=\n`;)/)[0]));
    await page.route('https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/+esm', route => route.fulfill({ contentType: 'text/javascript', body: muxerSource, headers: { 'access-control-allow-origin': '*' } }));
    await page.route(origin + '/native', route => route.fulfill({ contentType: 'text/html', body: canvasHTML.replace('<script>', '<script>window.messages=[];window.ReactNativeWebView={postMessage(value){const message=JSON.parse(value);window.messages.push(message);if(message.type==="videoChunk")setTimeout(()=>window.dispatchEvent(new MessageEvent("message",{data:JSON.stringify({type:"videoAck",reqId:message.reqId})})),0)}};') }));
    await page.goto(origin + '/native');
    await page.waitForFunction(() => window.messages.some(message => message.type === 'ready'));
  }
  await page.evaluate(async ({ platform, fixture }) => {
    const bytes = Uint8Array.from(atob(fixture.base64), value => value.charCodeAt(0));
    window.reference = new ImageDecoder({ data: bytes, type: 'image/gif' });
    await window.reference.tracks.ready;
    window.referenceDelays = [12, 17, 23, 31];
    window.referenceIndex = seconds => { let tick = Math.floor(Math.max(0, seconds) * 100 + 1e-7) % 83; for (let index=0;index<4;index++){if(tick<window.referenceDelays[index])return index;tick-=window.referenceDelays[index]}return 3 };
    window.referencePixels = async (seconds, size) => {
      const { image } = await window.reference.decode({ frameIndex: window.referenceIndex(seconds) });
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
      const context = canvas.getContext('2d'); context.fillStyle='black';context.fillRect(0,0,size,size);
      context.drawImage(image,0,0,size,size); image.close();
      return context.getImageData(0,0,size,size).data;
    };
    const clip = { id:'gif-clip',trackId:'visual',mediaId:'fixture',kind:'image',start:.4,duration:1.1,trimIn:.12,speed:2,fit:'contain' };
    window.snapshot = { id:'gif-timeline',title:'GIF timeline',tracks:[{id:'visual',kind:'video',name:'Video'}],clips:[clip],settings:{width:160,height:160,fps:25,background:'#000000'} };
    window.send = message => window.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(message)}));
    if (platform === 'web') {
      const url = URL.createObjectURL(new Blob([bytes],{type:'image/gif'})), image = new Image();
      await window.editor.prepareGifImage(image,url);
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url});
      window.media = [{id:'fixture',kind:'image',name:'Fixture.gif',mimeType:'image/gif',width:16,height:16,duration:0,url}];
      window.sources={images:new Map([['fixture',image]]),videos:new Map()};
      const canvas=document.createElement('canvas');canvas.id='c';canvas.width=canvas.height=160;document.body.append(canvas);
    } else {
      window.send({type:'imagePrune',ids:['fixture']});
      window.send({type:'media',id:'fixture',src:'data:image/gif;base64,'+fixture.base64});
      window.send({type:'render',snapshot:window.snapshot,time:.4});
    }
  }, { platform, fixture });
  if (platform === 'mobile') await page.waitForFunction(() => window.messages.some(message => message.type === 'frame' && message.missing?.length === 0));
  const samples = [.4, .46, .53, .67, 1.1, .48, .9, .4];
  const preview = [];
  for (const time of samples) {
    if (platform === 'mobile') {
      await page.evaluate(async time => {
        window.send({type:'seek',time});
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      }, time);
    }
    const sample = await page.evaluate(async ({ platform,time }) => {
      const canvas=document.querySelector('#c'), context=canvas.getContext('2d');
      if(platform==='web'){context.fillStyle='black';context.fillRect(0,0,160,160);window.editor.drawClip(context,160,160,window.snapshot.clips[0],time,window.sources)}
      const actual=context.getImageData(0,0,160,160).data, expected=await window.referencePixels(.12+(time-.4)*2,160);
      let differences=0,max=0;for(let i=0;i<actual.length;i++){const delta=Math.abs(actual[i]-expected[i]);if(delta)differences++;max=Math.max(max,delta)}
      return {time,sourceTime:.12+(time-.4)*2,differences,max};
    }, { platform,time });
    preview.push(sample); assert.equal(sample.differences,0,JSON.stringify(sample));
  }
  await page.screenshot({path:resolve(directory,`${platform}-gif-preview.png`)});
  let output;
  if (platform === 'web') output = await page.evaluate(async () => {
    const result=await window.editor.exportProject({snapshot:window.snapshot,media:window.media,format:'mp4',scale:1,videoBitrate:4000000,username:'gif-test',range:{start:.4,end:1.5}});
    const bytes=new Uint8Array(await result.blob.arrayBuffer());let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return {base64:btoa(text),ext:'mp4'};
  });
  else {
    await page.evaluate(() => window.send({type:'exportVideo',reqId:'gif-proof',snapshot:window.snapshot,width:160,height:160,bitrate:4000000,username:'gif-test',range:{start:.4,end:1.5}}));
    await page.waitForFunction(() => window.messages.some(m => (m.type==='videoChunk'&&m.last)||m.type==='videoFailed'),null,{timeout:120000});
    output = await page.evaluate(() => {
      const failure=window.messages.find(m=>m.type==='videoFailed');if(failure)throw new Error(failure.error);
      const chunks=window.messages.filter(m=>m.type==='videoChunk');return {chunks:chunks.map(m=>m.b64),ext:chunks[0].ext};
    });
  }
  assert.equal(output.ext,'mp4');
  const filename=resolve(directory,`${platform}-gif-timeline.mp4`);
  await writeFile(filename,output.chunks ? Buffer.concat(output.chunks.map(chunk=>Buffer.from(chunk,'base64'))) : Buffer.from(output.base64,'base64'));
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',filename],{encoding:'utf8'}));
  const video=probe.streams.find(stream=>stream.codec_type==='video'), audio=probe.streams.find(stream=>stream.codec_type==='audio');
  assert.equal(video.codec_name,'h264');assert.equal(audio.codec_name,'aac');assert.equal(video.width,160);assert.equal(video.height,160);
  assert(Number(probe.format.duration)>=3.3 && Number(probe.format.duration)<3.5);
  const raw=execFileSync('ffmpeg',['-v','error','-i',filename,'-f','rawvideo','-pix_fmt','rgb24','-'],{maxBuffer:30*1024*1024});
  const frames=raw.length/(160*160*3);assert(Number.isInteger(frames)&&frames>=83);
  const encoded=[];
  for(let index=0;index<28;index++){
    const actual=raw.subarray(index*160*160*3,(index+1)*160*160*3);
    const expected=await page.evaluate(async time=>Array.from(await window.referencePixels(.12+time*2,160)),index/25);
    let squared=0;for(let pixel=0;pixel<160*160;pixel++)for(let channel=0;channel<3;channel++){const delta=actual[pixel*3+channel]-expected[pixel*4+channel];squared+=delta*delta}
    const mse=squared/(160*160*3),psnr=mse===0?100:10*Math.log10(255*255/mse);
    encoded.push({index,sourceTime:.12+index/25*2,psnr});assert(psnr>28,JSON.stringify(encoded.at(-1)));
  }
  const ending=raw.subarray(55*160*160*3,56*160*160*3);assert(ending.some(value=>value>200),'The approved ending must be visible');
  const pcm=execFileSync('ffmpeg',['-v','error','-i',filename,'-map','0:a:0','-f','f32le','-'],{maxBuffer:4*1024*1024});
  let peak=0;for(let at=0;at+4<=pcm.length;at+=4)peak=Math.max(peak,Math.abs(pcm.readFloatLE(at)));assert(peak>.001,'The ending sound must be audible');
  assert.deepEqual(errors,[]);
  const report={platform,sourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),preview,encoded,frames,duration:Number(probe.format.duration),endingVisible:true,endingSoundPeak:peak,videoCodec:video.codec_name,audioCodec:audio.codec_name,physicalDeviceVerified:false};
  await writeFile(resolve(directory,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({platform,sourceSha:report.sourceSha,previewFrames:preview.length,encodedFrames:encoded.length,minimumPSNR:Math.min(...encoded.map(f=>f.psnr)),frames,duration:report.duration,endingSoundPeak:peak}));
} finally { await browser?.close(); await new Promise(done=>server.close(done)); }
