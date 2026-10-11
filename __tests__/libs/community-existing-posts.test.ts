import { communityPostTarget, validCommunityPostId, resolveCommunityPosts, uniqueCommunityPosts } from '../../libs/community-posts-core';

describe('existing community posts', () => {
  it('accepts original and off-chain DeHub links, including top-level production URLs', () => {
    expect(communityPostTarget('https://dehub.io/post/6552')).toEqual({tokenId:'6552'});
    expect(communityPostTarget('https://dehub.io/app/post/6552?comment=4')).toEqual({tokenId:'6552'});
    expect(communityPostTarget('dehub.io/newpost/12')).toEqual({newPostId:'12'});
    expect(communityPostTarget('/posts/6552')).toEqual({tokenId:'6552'});
    expect(communityPostTarget('6552')).toEqual({tokenId:'6552'});
    expect(communityPostTarget('https://elsewhere.example/post/6552')).toBeNull();
    expect(communityPostTarget('https://dehub.io.evil.example/post/6552')).toBeNull();
    expect(validCommunityPostId('9007199254740992')).toBeNull();
    expect(validCommunityPostId('-1')).toBeNull();
  });
  it('keeps original engagement and identity when the same post is also category-tagged', async () => {
    const original={tokenId:'6552',likes:123,views:456};
    const posts=await resolveCommunityPosts(['6552','deleted'],async id => {
      if(id==='deleted') throw new Error('removed');
      return original;
    });
    const merged=uniqueCommunityPosts([...posts,{...original,likes:0}],post=>post.tokenId);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(original);
    expect(merged[0].likes).toBe(123);
    expect(merged[0].views).toBe(456);
  });
  it('bounds original-post requests and preserves order across batches', async () => {
    let active=0,peak=0;
    const ids=Array.from({length:11},(_,i)=>String(i+1));
    const posts=await resolveCommunityPosts(ids,async id => {
      active++; peak=Math.max(peak,active);
      await Promise.resolve();
      active--;
      return {id};
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(posts.map(post=>post.id)).toEqual(ids);
  });
});
