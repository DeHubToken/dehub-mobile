import { useEffect, useRef, useState } from "react";
import { cloudDraftController, type CloudDraftEditor, type CloudDraftControllerState } from "./cloudDraftController";
import type { cloudProjectSession } from "./cloudProjectSession";

type Factory=(wallet:string,check:()=>void)=>{session:ReturnType<typeof cloudProjectSession>};
export function useCloudDraftController(address:string|null|undefined,localId:string,factory:Factory,editor:CloudDraftEditor,
  presence:{status:string;revision:number;draftRevision?:number}){
  const wallet=address?.toLowerCase()||"",scope=useRef({wallet,localId,editor});scope.current={wallet,localId,editor};
  const controller=useRef<ReturnType<typeof cloudDraftController>|null>(null),mounted=useRef(true);
  const [state,setState]=useState<CloudDraftControllerState>({mode:null,status:"idle",error:""});
  const [copyError,setCopyError]=useState("");
  useEffect(()=>{
    mounted.current=true;
    setState({mode:null,status:"idle",error:""});setCopyError("");
    const check=()=>{if(!mounted.current||scope.current.wallet!==wallet||scope.current.localId!==localId)throw new Error("Live project account changed");};
    if(/^0x[a-f0-9]{40}$/.test(wallet))controller.current=cloudDraftController(wallet,localId,factory(wallet,check).session,
      {scope:()=>scope.current.editor.scope?.(),current:()=>scope.current.editor.current(),isEditing:()=>scope.current.editor.isEditing(),subscribe:run=>scope.current.editor.subscribe(run),receive:(snapshot,key)=>scope.current.editor.receive(snapshot,key)},
      {check,update:value=>{if(mounted.current&&scope.current.wallet===wallet&&scope.current.localId===localId)setState(value);}});
    return ()=>{mounted.current=false;controller.current?.stop();controller.current=null;};
  },[wallet,localId,factory]);
  const previous=useRef(presence.status);
  useEffect(()=>{
    if(presence.status==="connected"){
      if(previous.current==="disconnected")controller.current?.reconnect();
      controller.current?.remote(presence.revision,presence.draftRevision??0);
    }else if(presence.status!=="connecting")controller.current?.stop();
    previous.current=presence.status;
  },[presence.status,presence.revision,presence.draftRevision,wallet,localId]);
  return {...state,copyError,startReceiving:()=>controller.current?.start(false),startSharing:()=>controller.current?.start(true),stop:()=>controller.current?.stop(),retry:()=>controller.current?.retry(),
    async saveCopy(){
      controller.current?.stop();setCopyError("");
      const source=scope.current.editor.current();if(!source)return;
      const editorScope=scope.current.editor.scope?.();
      const check=()=>{if(!mounted.current||scope.current.wallet!==wallet||scope.current.localId!==localId||scope.current.editor.scope?.()!==editorScope)throw new Error("Live project account changed");};
      try{await factory(wallet,check).session.saveLiveProjectCopy(source,check);check();return true;}
      catch(cause){if(mounted.current&&scope.current.wallet===wallet&&scope.current.localId===localId&&scope.current.editor.scope?.()===editorScope)setCopyError(cause instanceof Error?cause.message:"Could not save the personal copy. Your draft was kept.");return false;}
    }};
}
