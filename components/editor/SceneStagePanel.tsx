import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useTranslation } from 'react-i18next';
import { newSceneStage, sceneStageDocument, STAGE_COLORS, type SceneStage, type StageObject, type StageLight } from '../../libs/editor/sceneStage';

export function SceneStagePanel({ value, onChange, onFrame }: { value?: SceneStage; onChange(scene: SceneStage): void; onFrame(url: string, signal: AbortSignal): Promise<void> }) {
  const { t }=useTranslation(), web=useRef<WebView>(null), live=useRef(true), capture=useRef(false);
  const [open,setOpen]=useState(false),[selected,setSelected]=useState(0),[light,setLight]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(false),[ready,setReady]=useState('');
  const revision=JSON.stringify(value), latest=useRef(revision);latest.current=revision;
  const abort=useRef(new AbortController());
  const deadline=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>{live.current=true;abort.current=new AbortController();return()=>{live.current=false;abort.current.abort();clearTimeout(deadline.current);};},[]);
  const text=(key:string)=>t(`editor.stage.${key}`);
  const button=(label:string,action:()=>void,disabled=false)=><Pressable accessibilityRole="button" accessibilityState={{disabled:busy||disabled}} disabled={busy||disabled} onPress={action} className="min-h-11 justify-center rounded-lg border border-theme-neutrals-700 px-3 py-2" style={{opacity:busy||disabled?0.4:1}}><Text className="text-xs text-theme-neutrals-100">{label}</Text></Pressable>;
  if(!value)return <View className="mt-3">{button(text('create'),()=>{onChange(newSceneStage());setOpen(true);})}</View>;
  const object=value.objects[Math.min(selected,value.objects.length-1)];
  const changeObject=(patch:Partial<StageObject>)=>onChange({...value,objects:value.objects.map(o=>o===object?{...o,...patch}:o)});
  const changeLight=(patch:Partial<StageLight>)=>onChange({...value,lights:value.lights.map((l,i)=>i===light?{...l,...patch}:l)});
  const number=(key:string,n:number,min:number,max:number,step:number,change:(v:number)=>void)=><View key={key} className="my-1 flex-row items-center justify-between gap-2"><Text className="flex-1 text-xs text-theme-neutrals-100">{text(key)}: {n.toFixed(step<1?2:0)}</Text>{button('−',()=>change(Math.max(min,Number((n-step).toFixed(2)))),n<=min)}{button('+',()=>change(Math.min(max,Number((n+step).toFixed(2)))),n>=max)}</View>;
  const colors=(current:string,change:(color:string)=>void)=><View className="my-2 flex-row flex-wrap gap-2">{STAGE_COLORS.map(color=><Pressable key={color} accessibilityRole="button" accessibilityLabel={`${text('color')} ${color}`} accessibilityState={{selected:current===color}} disabled={busy} onPress={()=>change(color)} style={{backgroundColor:color,width:44,height:44,borderRadius:8,borderWidth:current===color?3:0,borderColor:current==='#ffffff'?'#333':'#fff'}}/>)}</View>;
  const receive=async(event:WebViewMessageEvent)=>{
    try{
      if(event.nativeEvent.data.length>500000)throw new Error('Invalid frame');
      const data=JSON.parse(event.nativeEvent.data);
      if(!live.current||data.revision!==latest.current)return;
      if(data.type==='ready'){setReady(data.revision);return;}
      if(data.type!=='frame'||!capture.current)return;
      capture.current=false;
      clearTimeout(deadline.current);
      if(data.width!==320||data.height!==180||typeof data.url!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data.url))throw new Error('Invalid frame');
      await onFrame(data.url,abort.current.signal);
    }catch{if(live.current)setError(true);}finally{if(live.current&&!capture.current)setBusy(false);}
  };
  return <View className="mt-3 rounded-xl border border-theme-neutrals-700 p-3">
    {button(text('title'),()=>setOpen(!open))}
    {open&&<>
      <Text className="my-2 text-xs text-theme-neutrals-400">{text('hint')}</Text>
      <WebView ref={web} source={{html:sceneStageDocument(value),baseUrl:'about:blank'}} originWhitelist={['about:blank']} onShouldStartLoadWithRequest={request=>request.url==='about:blank'}
        onMessage={event=>void receive(event)} onError={()=>{clearTimeout(deadline.current);setError(true);capture.current=false;setBusy(false);}} style={{height:180,backgroundColor:'#151a20'}}
        javaScriptEnabled domStorageEnabled={false} allowFileAccess={false} allowUniversalAccessFromFileURLs={false} mixedContentMode="never" scrollEnabled={false} setSupportMultipleWindows={false}/>
      {!!error&&<Text accessibilityRole="alert" className="text-theme-neutrals-100">{text('error')}</Text>}
      <Text className="mt-3 text-theme-neutrals-100">{text('camera')}</Text>
      {number('yaw',value.camera.yaw,-180,180,5,yaw=>onChange({...value,camera:{...value.camera,yaw}}))}
      {number('elevation',value.camera.elevation,5,75,1,elevation=>onChange({...value,camera:{...value.camera,elevation}}))}
      {number('distance',value.camera.distance,3,16,0.5,distance=>onChange({...value,camera:{...value.camera,distance}}))}
      {number('fov',value.camera.fov,25,80,1,fov=>onChange({...value,camera:{...value.camera,fov}}))}
      <View className="my-2 flex-row flex-wrap gap-2">{value.objects.map((_,i)=><View key={i}>{button(`${text('object')} ${i+1}`,()=>setSelected(i))}</View>)}{(['sphere','box'] as const).map(kind=><View key={kind}>{button(`${text('add')} ${text(kind)}`,()=>{setSelected(value.objects.length);onChange({...value,objects:[...value.objects,{kind,x:0,y:0.75,z:0,scale:1.5,yaw:0,color:'#70a66c'}]});},value.objects.length>=4)}</View>)}</View>
      {object&&<View><Text className="text-theme-neutrals-100">{text(object.kind)}</Text>{(['x','y','z'] as const).map(axis=>number(axis,object[axis],axis==='y'?0.25:-6,6,0.25,n=>changeObject({[axis]:n})))}
        {number('scale',object.scale,0.25,3,0.25,scale=>changeObject({scale}))}{number('yaw',object.yaw,-180,180,5,yaw=>changeObject({yaw}))}{colors(object.color,color=>changeObject({color}))}
        {button(text('remove'),()=>{onChange({...value,objects:value.objects.filter(o=>o!==object)});setSelected(0);})}</View>}
      <View className="my-2 flex-row gap-2">{value.lights.map((_,i)=><View key={i}>{button(`${text('light')} ${i+1}`,()=>setLight(i))}</View>)}</View>
      {(['x','y','z'] as const).map(axis=>number(axis,value.lights[light][axis],axis==='y'?0.5:-8,axis==='y'?10:8,0.5,n=>changeLight({[axis]:n})))}
      {number('intensity',value.lights[light].intensity,0,5,0.25,intensity=>changeLight({intensity}))}{number('diffusion',value.lights[light].radius,0,2,0.25,radius=>changeLight({radius}))}{colors(value.lights[light].color,color=>changeLight({color}))}
      {button(text(busy?'saving':'useFrame'),()=>{setError(false);capture.current=true;setBusy(true);deadline.current=setTimeout(()=>{capture.current=false;if(live.current){setBusy(false);setError(true);}},20000);web.current?.injectJavaScript('window.stageCapture();true;');},ready!==revision)}
      <Text className="mt-2 text-xs text-theme-neutrals-400">{text('frameHint')}</Text>
    </>}
  </View>;
}
