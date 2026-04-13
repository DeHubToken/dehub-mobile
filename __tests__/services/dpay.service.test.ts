import { dpayCreateOrder, getDpayTnx, getDpayPrice, getSupply, getSuccessTotal } from '../../services/dpay.service';
import { apiClient } from '../../libs/api.client';

jest.mock('../../libs/api.client', () => ({
  apiClient: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

const mockPost = apiClient.post as jest.Mock;
const mockGet = apiClient.get as jest.Mock;

describe('services/dpay.service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('dpayCreateOrder', () => {
    it('returns result on success', async () => {
      mockPost.mockResolvedValueOnce({ result: { orderId: '123' } });
      const res = await dpayCreateOrder({ amount: 100, currency: 'DHB' });
      expect(res.result.orderId).toBe('123');
      expect(mockPost).toHaveBeenCalledWith('/dpay/checkout', expect.anything(), { isAuthRequired: true });
    });

    it('normalizes 400 error', async () => {
      mockPost.mockRejectedValueOnce(new Error('400 Bad Request'));
      await expect(dpayCreateOrder({})).rejects.toThrow('Invalid data provided');
    });

    it('normalizes 401 error', async () => {
      mockPost.mockRejectedValueOnce(new Error('401 Authentication needed'));
      await expect(dpayCreateOrder({})).rejects.toThrow('Unauthorized');
    });

    it('normalizes 500 error', async () => {
      mockPost.mockRejectedValueOnce(new Error('500 Server error'));
      await expect(dpayCreateOrder({})).rejects.toThrow('Server error');
    });

    it('passes through unknown errors', async () => {
      mockPost.mockRejectedValueOnce(new Error('Unknown problem'));
      await expect(dpayCreateOrder({})).rejects.toThrow('Unknown problem');
    });
  });

  describe('getDpayTnx', () => {
    it('passes filter as query params', async () => {
      mockGet.mockResolvedValueOnce({ result: [] });
      await getDpayTnx({ status: 'success', page: 1 });

      const url = mockGet.mock.calls[0][0];
      expect(url).toContain('status=success');
      expect(url).toContain('page=1');
    });

    it('normalizes 404 error', async () => {
      mockGet.mockRejectedValueOnce(new Error('404'));
      await expect(getDpayTnx({})).rejects.toThrow('Transaction not found');
    });
  });

  describe('getDpayPrice', () => {
    it('passes filter params', async () => {
      mockGet.mockResolvedValueOnce({ price: 1.5 });
      const res = await getDpayPrice({ currency: 'USD', amount: 100, tokenSymbol: 'DHB', chainId: 1 });
      expect(res.price).toBe(1.5);

      const url = mockGet.mock.calls[0][0];
      expect(url).toContain('currency=USD');
      expect(url).toContain('tokenSymbol=DHB');
    });

    it('normalizes errors', async () => {
      mockGet.mockRejectedValueOnce(new Error('400 bad'));
      await expect(getDpayPrice({ currency: 'USD', amount: 1, tokenSymbol: 'X', chainId: 1 }))
        .rejects.toThrow('Invalid request');
    });
  });

  describe('getSupply', () => {
    it('fetches without auth', async () => {
      mockGet.mockResolvedValueOnce({ supply: 1000000 });
      const res = await getSupply();
      expect(res.supply).toBe(1000000);
      expect(mockGet).toHaveBeenCalledWith('/dpay/available/tokens', { isAuthRequired: false });
    });
  });

  describe('getSuccessTotal', () => {
    it('fetches total with success type', async () => {
      mockGet.mockResolvedValueOnce({ total: 500 });
      const res = await getSuccessTotal();
      expect(res.total).toBe(500);

      const url = mockGet.mock.calls[0][0];
      expect(url).toContain('type=success');
    });
  });
});
