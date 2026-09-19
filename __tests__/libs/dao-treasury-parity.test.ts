import { DAO_TREASURY_ADDRESS } from '../../libs/dao-treasury';

describe('DAO treasury parity', () => {
  it('uses the shared web treasury address', () => {
    expect(DAO_TREASURY_ADDRESS.toLowerCase()).toBe('0xb6fcacda06676b775188dfc9c4d7c4aeb564d3c4');
  });
});
