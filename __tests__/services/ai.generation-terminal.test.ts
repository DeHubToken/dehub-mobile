jest.mock('../../libs/token-refresh', () => ({ tokenRefreshManager: { ensureFreshToken: jest.fn().mockResolvedValue(undefined) } }));
import { generateImage, pollVideoGeneration } from '../../services/ai.service';
afterEach(() => jest.restoreAllMocks());

it('uses the recorded success returned for a stale failure poll without submitting another paid render', async () => {
  const recorded = { status: 'succeeded' as const, predictionId: 'ticket', videoUrl: 'https://media.test/result.mp4', libraryId: 'owned-result' };
  const fetcher = jest.spyOn(global,'fetch').mockResolvedValue({ok:true,status:200,json:async()=>recorded} as Response);
  await expect(pollVideoGeneration('ticket',{provider:'fal',falAppId:'model'})).resolves.toEqual(recorded);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({predictionId:'ticket',provider:'fal',falAppId:'model'});
});
it('preserves pending versus completed refund flags without inventing a local credit restoration', async () => {
  const pending = {status:'failed' as const,predictionId:'ticket',error:'Recovery pending',paymentRestored:false};
  const restored = {...pending,paymentRestored:true};
  const fetcher=jest.spyOn(global,'fetch').mockResolvedValueOnce({ok:true,status:200,json:async()=>pending} as Response)
    .mockResolvedValueOnce({ok:true,status:200,json:async()=>restored} as Response);
  await expect(pollVideoGeneration('ticket')).resolves.toMatchObject({paymentRestored:false});
  await expect(pollVideoGeneration('ticket')).resolves.toMatchObject({paymentRestored:true});
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('retains successful immediate image output when a terminal result is replayed for the same job id', async () => {
  const recorded={status:'succeeded',success:true,imageUrl:'https://media.test/image.png',text:'',savePending:true};
  const fetcher=jest.spyOn(global,'fetch').mockResolvedValue({ok:true,status:200,json:async()=>recorded} as Response);
  await expect(generateImage({clientJobId:'00000000-0000-4000-8000-000000000001',prompt:'A cup',model:'gemini-3.1-flash-image'})).resolves.toEqual(recorded);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
