import { loadPreparedAvatar, savePreparedAvatar, clearPreparedAvatar } from '../../libs/creatorAvatar';
const mockFiles=new Map<string,string>();
jest.mock('expo-file-system/legacy',()=>({
  documentDirectory:'file:///documents/',
  getInfoAsync:async(path:string)=>({exists:mockFiles.has(path),isDirectory:false,size:mockFiles.get(path)?.length??0}),
  readAsStringAsync:async(path:string)=>{if(!mockFiles.has(path))throw new Error('missing');return mockFiles.get(path)!;},
  writeAsStringAsync:async(path:string,value:string)=>{mockFiles.set(path,value);},
  deleteAsync:async(path:string)=>{mockFiles.delete(path);},
}));
const old={clientJobId:'11111111-1111-4111-8111-111111111111',txHash:'paid-receipt',inputDigest:'a'.repeat(64),acceptedPriceDhb:405,imageDataUrl:'portrait',audioDataUrl:'speech',rightsConfirmed:true};
beforeEach(()=>mockFiles.clear());
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
