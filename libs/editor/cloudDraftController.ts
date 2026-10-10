import { CloudProjectConflict } from "./cloudProjectFormat";
import { projectReviewSnapshotKey } from "./cloudProjectReview";
import { CloudProjectTransferBusy, isCloudProjectTransferBusy, onCloudProjectTransferSettled } from "./cloudProjectTransfer";
import type { ProjectSnapshot } from "./types";

export class CloudDraftDeferred extends Error {}
export interface CloudDraftEditor {
  scope?(): unknown;
  current(): ProjectSnapshot | null;
  isEditing(): boolean;
  subscribe(changed: () => void): () => void;
  receive(snapshot: ProjectSnapshot, key: string): number | void;
}
export interface CloudLiveSession {
  recoverLiveProject(id: string, check: () => void): Promise<void>;
  receiveLiveProject(snapshot: ProjectSnapshot, accept: (snapshot: ProjectSnapshot) => void, check: () => void): Promise<unknown>;
  publishLiveProject(snapshot: ProjectSnapshot, check: () => void): Promise<boolean>;
}
export interface CloudDraftControllerState {
  mode: "receiving" | "sharing" | null;
  status: "idle" | "waiting" | "syncing" | "live" | "recovery" | "conflict" | "error";
  error: string;
}
export function cloudDraftController(wallet: string, localId: string, session: CloudLiveSession, editor: CloudDraftEditor,
  deps: { check(): void; update(state: CloudDraftControllerState): void; delay?(run: () => void, ms: number): () => void }) {
  let generation=0, mode: CloudDraftControllerState["mode"]=null, paused=false, busy=false, dirty=false, incoming=false, recovering=false, applying=false, waitingTransfer=false;
  let timer: (()=>void)|null=null, offEditor: (()=>void)|null=null, offTransfer: (()=>void)|null=null, lastKey="", remoteKey="";
  let editorScope:unknown;
  const delay=deps.delay||((run,ms)=>{const id=setTimeout(run,ms);return ()=>clearTimeout(id);});
  const update=(status:CloudDraftControllerState["status"],error="")=>deps.update({mode,status,error});
  const cleanup=()=>{timer?.();timer=null;offEditor?.();offEditor=null;offTransfer?.();offTransfer=null;};
  function guard(epoch:number,key?:string) {
    deps.check();
    if(epoch!==generation||!mode||editor.current()?.id!==localId||editor.scope?.()!==editorScope)throw new Error("Live project sharing stopped");
    if(editor.isEditing()||(key!==undefined&&projectReviewSnapshotKey(editor.current()!)!==key))throw new CloudDraftDeferred("Finish the current edit before transferring live changes");
  }
  function schedule(ms=700) {
    if(!mode||paused||busy||(!dirty&&!incoming&&!recovering))return;
    if(waitingTransfer&&isCloudProjectTransferBusy(wallet))return;
    waitingTransfer=false;
    if(editor.current()?.id!==localId){stop();return;}
    if(editor.isEditing()){timer?.();timer=null;update("waiting");return;}
    timer?.();timer=delay(()=>{timer=null;void pump();},ms);
  }
  async function pump() {
    if(!mode||paused||busy)return;
    const epoch=generation;
    try{guard(epoch);}catch(cause){if(cause instanceof CloudDraftDeferred){update("waiting");return;}stop();return;}
    busy=true;dirty=false;incoming=false;update("syncing");
    try {
      if(recovering){await session.recoverLiveProject(localId,()=>guard(epoch));guard(epoch);recovering=false;}
      const captured=editor.current()!,key=projectReviewSnapshotKey(captured);
      let applied=false;
      const receiveGuard=()=>guard(epoch,applied?undefined:key);
      await session.receiveLiveProject(captured,snapshot=>{
        receiveGuard();applying=true;
        try{editor.receive(snapshot,key);applied=true;lastKey=projectReviewSnapshotKey(editor.current()!);}finally{applying=false;}
      },receiveGuard);
      guard(epoch);
      if(mode==="sharing"){
        const source=editor.current()!,sourceKey=projectReviewSnapshotKey(source);
        await session.publishLiveProject(source,()=>guard(epoch,sourceKey));guard(epoch);
      }
      lastKey=projectReviewSnapshotKey(editor.current()!);update("live");
    }catch(cause){
      if(epoch!==generation||!mode)return;
      if(cause instanceof CloudDraftDeferred||cause instanceof CloudProjectTransferBusy){dirty=mode==="sharing";incoming=true;recovering=true;waitingTransfer=cause instanceof CloudProjectTransferBusy;update("waiting");}
      else{paused=true;recovering=true;update(cause instanceof CloudProjectConflict?"conflict":/receipt|outcome|expired|recover/i.test(cause instanceof Error?cause.message:"")?"recovery":"error",cause instanceof Error?cause.message:"Live edits could not transfer. Your local draft was kept.");}
    }finally{
      busy=false;
      if(mode&&!paused)schedule();
    }
  }
  function stop(){generation++;mode=null;paused=false;dirty=incoming=recovering=waitingTransfer=false;cleanup();update("idle");}
  function start(share:boolean){
    stop();editorScope=editor.scope?.();mode=share?"sharing":"receiving";recovering=true;incoming=true;dirty=share;
    lastKey=editor.current()?projectReviewSnapshotKey(editor.current()!):"";
    offEditor=editor.subscribe(()=>{
      if(!mode)return;
      if(editor.current()?.id!==localId||editor.scope?.()!==editorScope){stop();return;}
      if(paused||applying)return;
      const key=projectReviewSnapshotKey(editor.current()!);
      if(key!==lastKey){lastKey=key;if(mode==="sharing")dirty=true;}
      schedule();
    });
    offTransfer=onCloudProjectTransferSettled(wallet,()=>{if(!busy&&!paused)schedule();});
    schedule(0);
  }
  return {start,stop,retry:()=>{if(mode)start(mode==="sharing");},
    remote(head:number,draft:number){const key=`${head}:${draft}`;if(key===remoteKey)return;remoteKey=key;if(mode&&!paused){incoming=true;schedule();}},
    reconnect(){if(mode){recovering=true;paused=false;incoming=true;schedule(0);}},
  };
}
