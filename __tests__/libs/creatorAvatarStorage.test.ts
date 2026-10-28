import { loadPreparedAvatar, savePreparedAvatar, clearPreparedAvatar } from '../../libs/creatorAvatar';
const mockFiles=new Map<string,string>();
let mockFailWrite='',mockFailMove='';
jest.mock('expo-file-system/legacy',()=>({
  documentDirectory:'file:///documents/',
  getInfoAsync:async(path:string)=>({exists:mockFiles.has(path),isDirectory:false,size:mockFiles.get(path)?.length??0}),
  readAsStringAsync:async(path:string)=>{if(!mockFiles.has(path))throw new Error('missing');return mockFiles.get(path)!;},
  writeAsStringAsync:async(path:string,value:string)=>{if(path===mockFailWrite){mockFiles.set(path,value.slice(0,8));throw new Error('disk full');}mockFiles.set(path,value);},
  copyAsync:async({from,to}:{from:string;to:string})=>{if(!mockFiles.has(from))throw new Error('missing');mockFiles.set(to,mockFiles.get(from)!);},
  moveAsync:async({from,to}:{from:string;to:string})=>{mockFiles.delete(to);if(to===mockFailMove)throw new Error('move interrupted');if(!mockFiles.has(from))throw new Error('missing');mockFiles.set(to,mockFiles.get(from)!);mockFiles.delete(from);},
  deleteAsync:async(path:string)=>{mockFiles.delete(path);},
}));
const old={clientJobId:'11111111-1111-4111-8111-111111111111',txHash:'paid-receipt',inputDigest:'a'.repeat(64),acceptedPriceDhb:405,imageDataUrl:'portrait',audioDataUrl:'speech',rightsConfirmed:true};
beforeEach(()=>{mockFiles.clear();mockFailWrite='';mockFailMove='';});
it('loads an existing paid owner file and upgrades it without losing its receipt or media',async()=>{
  mockFiles.set('file:///documents/creator-avatar-owner-a.json',JSON.stringify(old));
  expect(await loadPreparedAvatar('OWNER-A')).toEqual(old);
  await savePreparedAvatar('owner-a',{...old,phase:'signed'});
  expect(await loadPreparedAvatar('owner-a')).toEqual({...old,phase:'signed'});
  for(const patch of [{imageDataUrl:'edited'},{audioDataUrl:'edited'},{acceptedPriceDhb:1},{txHash:'other'},{clientJobId:'22222222-2222-4222-8222-222222222222'}]) {
    await expect(savePreparedAvatar('owner-a',{...old,phase:'signed',...patch})).rejects.toThrow('recoveryPending');
  }
  const media=[...mockFiles.keys()].find(path=>path.endsWith('.media'))!;
  expect(JSON.parse(mockFiles.get(media)!)).toEqual({imageDataUrl:'portrait',audioDataUrl:'speech'});
  await clearPreparedAvatar('owner-a',old.clientJobId);expect(await loadPreparedAvatar('owner-a')).toBeNull();
  expect(mockFiles.has(media)).toBe(true);
});
it('never clears another owner or accepts a broken paid input pointer as an empty draft',async()=>{
  await savePreparedAvatar('owner-a',{...old,phase:'signed'});
  await clearPreparedAvatar('owner-b',old.clientJobId);
  expect((await loadPreparedAvatar('owner-a'))?.txHash).toBe('paid-receipt');
  mockFiles.set('file:///documents/creator-avatar-owner-a.json','broken');
  await expect(loadPreparedAvatar('owner-a')).rejects.toThrow('recoveryPending');
});
it('retains the last prepared or paying record if a temporary metadata write is truncated',async()=>{
  const root='file:///documents/creator-avatar-owner-a.json';
  const prepared={...old,txHash:undefined,phase:'prepared' as const};
  await savePreparedAvatar('owner-a',prepared);
  mockFailWrite=`${root}.${old.clientJobId}.meta.next`;
  await expect(savePreparedAvatar('owner-a',{...prepared,phase:'paying'})).rejects.toThrow('disk full');
  expect(await loadPreparedAvatar('owner-a')).toEqual(prepared);
  mockFailWrite='';await savePreparedAvatar('owner-a',{...prepared,phase:'paying'});
  mockFailWrite=`${root}.${old.clientJobId}.meta.next`;
  await expect(savePreparedAvatar('owner-a',{...old,phase:'signed'})).rejects.toThrow('disk full');
  expect(await loadPreparedAvatar('owner-a')).toEqual({...prepared,phase:'paying'});
});
it('recovers the previous paying metadata across an iOS remove-then-move interruption',async()=>{
  const paying={...old,txHash:undefined,phase:'paying' as const};
  await savePreparedAvatar('owner-a',paying);
  mockFailMove=`file:///documents/creator-avatar-owner-a.json.${old.clientJobId}.meta`;
  await expect(savePreparedAvatar('owner-a',{...old,phase:'signed'})).rejects.toThrow('move interrupted');
  expect(await loadPreparedAvatar('owner-a')).toEqual(paying);
  mockFailMove='';await savePreparedAvatar('owner-a',{...old,phase:'signed'});
  expect((await loadPreparedAvatar('owner-a'))?.txHash).toBe('paid-receipt');
});
it('retains a paid legacy owner record when converting its root pointer is interrupted',async()=>{
  const root='file:///documents/creator-avatar-owner-a.json';
  mockFiles.set(root,JSON.stringify(old));mockFailWrite=`${root}.next`;
  await expect(savePreparedAvatar('owner-a',{...old,phase:'signed'})).rejects.toThrow('disk full');
  expect(await loadPreparedAvatar('owner-a')).toEqual(old);
  mockFailWrite='';mockFailMove=root;
  await expect(savePreparedAvatar('owner-a',{...old,phase:'signed'})).rejects.toThrow('move interrupted');
  expect(await loadPreparedAvatar('owner-a')).toEqual(old);
  mockFailMove='';await savePreparedAvatar('owner-a',{...old,phase:'signed'});
  expect((await loadPreparedAvatar('owner-a'))?.txHash).toBe('paid-receipt');
});
