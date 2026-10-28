import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { transformSync } from '@babel/core';

it('runs the actual Expo/Babel-transformed serialized renderer in an isolated WebView-like script scope',()=>{
  const root=path.resolve(__dirname,'../..'), filename=path.join(root,'libs/editor/sceneStage.ts');
  const transformed=transformSync(fs.readFileSync(filename,'utf8'),{filename,configFile:path.join(root,'babel.config.js'),sourceMaps:false,
    caller:{name:'metro',platform:'android',isDev:false,supportsStaticESM:false}});
  const compiled={exports:{} as Record<string,any>};
  vm.runInNewContext(transformed!.code!,{exports:compiled.exports,module:compiled,require});
  const html=compiled.exports.sceneStageDocument(compiled.exports.newSceneStage()),script=/<script>([\s\S]+)<\/script>/.exec(html)![1];
  const frames:Array<{width:number;height:number;data:Uint8ClampedArray}>=[],messages:any[]=[];
  const canvas=()=>({width:160,height:90,getContext:()=>({putImageData:(image:{width:number;height:number;data:Uint8ClampedArray})=>frames.push(image)}),toDataURL:()=> 'data:image/png;base64,aGVsbG8='});
  const context=vm.createContext({document:{querySelector:()=>canvas(),createElement:()=>canvas()},ImageData:class {constructor(public data:Uint8ClampedArray,public width:number,public height:number){}},window:{ReactNativeWebView:{postMessage:(message:string)=>messages.push(JSON.parse(message))}}});
  vm.runInContext(script,context,{timeout:20000});vm.runInContext('window.stageCapture()',context,{timeout:20000});
  expect(messages.map(message=>message.type)).toEqual(['ready','frame']);
  expect(frames.map(frame=>[frame.width,frame.height,frame.data.length])).toEqual([[160,90,160*90*4],[320,180,320*180*4]]);
  expect(new Set(frames[0].data).size).toBeGreaterThan(20);
  expect(messages[1]).toMatchObject({width:320,height:180,url:'data:image/png;base64,aGVsbG8='});
});
