jest.mock('expo-file-system/legacy',()=>({ documentDirectory:'file:///private/' }));
import { avatarRequestKey, matchingAvatarQuote } from '../../libs/creatorAvatar';
import { CREATOR_DEFAULTS, creatorInputIssue } from '../../libs/creatorStudio';
describe('native talking portrait',()=>{
  const input={imageDataUrl:'photo',audioDataUrl:'speech',rightsConfirmed:true};
  const quote={priceDhb:405,priceUsd:.405,inputDigest:'a'.repeat(64),durationSeconds:6};
  it('opens the dedicated input review without forcing a public reference upload',()=>{
    expect(creatorInputIssue({...CREATOR_DEFAULTS.video,model:'kling-avatar-v2'},false)).toBeNull();
  });
  it('invalidates preparation after owner, prompt or media changes',()=>{
    const key=avatarRequestKey('owner-a','Speak',input);
    expect(key).not.toBe(avatarRequestKey('owner-b','Speak',input));
    expect(key).not.toBe(avatarRequestKey('owner-a','Smile',input));
    expect(key).not.toBe(avatarRequestKey('owner-a','Speak',{...input,audioDataUrl:'changed'}));
  });
  it('refuses changed quote price, digest and duration before a wallet payment',()=>{
    expect(matchingAvatarQuote(quote,{...quote})).toBe(true);
    for(const patch of [{priceDhb:406},{inputDigest:'b'.repeat(64)},{durationSeconds:7}]) expect(matchingAvatarQuote(quote,{...quote,...patch})).toBe(false);
  });
});
