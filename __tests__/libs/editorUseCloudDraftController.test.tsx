jest.mock("react-native-css-interop",()=>({createInteropElement:require("react").createElement}));
import { act, cleanup, renderHook } from "@testing-library/react-native";
import { useCloudDraftController } from "../../libs/editor/useCloudDraftController";
import type { cloudProjectSession } from "../../libs/editor/cloudProjectSession";
import type { ProjectSnapshot } from "../../libs/editor/types";

const wallet="0x"+"a".repeat(40),other="0x"+"b".repeat(40);
const fixture=():ProjectSnapshot=>({id:"device",title:"Film",updatedAt:1,settings:{width:1920,height:1080,fps:30,aspectPreset:"16:9",background:"#000"},tracks:[],clips:[]});
const settle=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
beforeEach(()=>jest.useFakeTimers());afterEach(()=>{cleanup();jest.useRealTimers();});
function setup(){
  let current=fixture(),scope=0;
  const observers=new Set<()=>void>(),accepted:ProjectSnapshot[]=[];
  const recover=jest.fn(async(_id:string,check:()=>void)=>{check();}),receive=jest.fn(async(_snapshot:ProjectSnapshot,_accept:(snapshot:ProjectSnapshot)=>void,check:()=>void)=>{check();}),publish=jest.fn(async(_snapshot:ProjectSnapshot,check:()=>void)=>{check();return true;}),saveCopy=jest.fn(async(_snapshot:ProjectSnapshot,check:()=>void)=>{check();});
  const factory=jest.fn((_wallet:string,_check:()=>void)=>({session:{recoverLiveProject:recover,receiveLiveProject:receive,publishLiveProject:publish,saveLiveProjectCopy:saveCopy} as unknown as ReturnType<typeof cloudProjectSession>}));
  const editor={scope:()=>scope,current:()=>current,isEditing:()=>false,subscribe:(run:()=>void)=>{observers.add(run);return ()=>{observers.delete(run);};},receive:(next:ProjectSnapshot)=>{current=next;accepted.push(next);}};
  const props={wallet,project:"device",status:"connected",revision:1,draft:0};
  const hook=renderHook((value:typeof props)=>useCloudDraftController(value.wallet,value.project,factory,editor,{status:value.status,revision:value.revision,draftRevision:value.draft}),{initialProps:props});
  return {hook,props,factory,recover,receive,publish,saveCopy,accepted,observers,
    async tick(ms=0){await act(async()=>{jest.advanceTimersByTime(ms);await settle();});},
    reset:()=>{scope++;current=fixture();for(const observer of [...observers])observer();}};
}
describe("live controller hook lifecycle",()=>{
  it("does not transmit edits merely because presence connects",async()=>{const e=setup();await e.tick(5000);expect(e.recover).not.toHaveBeenCalled();expect(e.receive).not.toHaveBeenCalled();expect(e.publish).not.toHaveBeenCalled();});
  it("starts receiving only after its explicit action",async()=>{const e=setup();act(()=>e.hook.result.current.startReceiving());await e.tick();expect(e.receive).toHaveBeenCalledTimes(1);expect(e.publish).not.toHaveBeenCalled();expect(e.hook.result.current.mode).toBe("receiving");});
  it("leaves on disconnect and does not re-enable outgoing consent on reconnect",async()=>{const e=setup();act(()=>e.hook.result.current.startSharing());await e.tick();e.hook.rerender({...e.props,status:"disconnected"});e.hook.rerender({...e.props,status:"connected",draft:2});await e.tick(5000);expect(e.publish).toHaveBeenCalledTimes(1);expect(e.hook.result.current.mode).toBeNull();expect(e.observers.size).toBe(0);});
  it.each(["wallet","project"])("rejects waiting transfers after the %s scope changes",async key=>{const e=setup();let finish!:()=>void;e.receive.mockImplementationOnce(async(value,accept,check)=>{await new Promise<void>(resolve=>{finish=resolve;});check();accept(value);});act(()=>e.hook.result.current.startSharing());await e.tick();e.hook.rerender({...e.props,[key]:key==="wallet"?other:"different"});await act(async()=>{finish();await settle();});expect(e.accepted).toEqual([]);expect(e.publish).not.toHaveBeenCalled();expect(e.hook.result.current.mode).toBeNull();});
  it("invalidates a same-ID reset through the real scope callback",async()=>{const e=setup();act(()=>e.hook.result.current.startSharing());act(e.reset);await e.tick();expect(e.receive).not.toHaveBeenCalled();expect(e.hook.result.current.mode).toBeNull();});
  it("rejects a transfer after the editor unmounts",async()=>{const e=setup();let finish!:()=>void;e.receive.mockImplementationOnce(async(value,accept,check)=>{await new Promise<void>(resolve=>{finish=resolve;});check();accept(value);});act(()=>e.hook.result.current.startSharing());await e.tick();e.hook.unmount();finish();await settle();expect(e.accepted).toEqual([]);expect(e.publish).not.toHaveBeenCalled();expect(e.observers.size).toBe(0);});
  it("stops live work before making a separate personal copy",async()=>{const e=setup();act(()=>e.hook.result.current.startSharing());let saved:boolean|undefined;await act(async()=>{saved=await e.hook.result.current.saveCopy();});await e.tick();expect(saved).toBe(true);expect(e.saveCopy).toHaveBeenCalledTimes(1);expect(e.receive).not.toHaveBeenCalled();expect(e.hook.result.current.mode).toBeNull();});
  it("keeps a copy failure visible after live sharing stops",async()=>{const e=setup();e.saveCopy.mockRejectedValueOnce(new Error("Private copy upload failed"));await act(async()=>{expect(await e.hook.result.current.saveCopy()).toBe(false);});expect(e.hook.result.current.copyError).toBe("Private copy upload failed");expect(e.hook.result.current.mode).toBeNull();});
  it("does not show an old copy error in another project's workspace",async()=>{const e=setup();let finish!:()=>void,pending!:Promise<boolean|undefined>;e.saveCopy.mockImplementationOnce(async(_snapshot,check)=>{await new Promise<void>(resolve=>{finish=resolve;});check();});act(()=>{pending=e.hook.result.current.saveCopy();});e.hook.rerender({...e.props,project:"other"});await act(async()=>{finish();await pending;});expect(e.hook.result.current.copyError).toBe("");});
});
