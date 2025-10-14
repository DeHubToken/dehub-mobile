import { AuthAdapter } from './authAdapter';
import { getWeb3AuthProvider, web3AuthService } from '../web3auth.service';

export class Web3AuthAdapter implements AuthAdapter {
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    // getWeb3AuthProvider internally ensures readiness; just call once.
    await getWeb3AuthProvider();
    this.initialized = true;
  }

  async getProvider(): Promise<any | null> {
    await this.init();
    try {
      return await getWeb3AuthProvider();
    } catch (e) {
      console.warn('[Web3AuthAdapter] getProvider failed', e);
      return null;
    }
  }

  async getAccounts(): Promise<string[]> {
    try {
      return await web3AuthService.getAccounts();
    } catch (e) {
      return [];
    }
  }

  async getChainId(): Promise<number | undefined> {
    try {
      return await web3AuthService.getChainId();
    } catch (e) {
      return undefined;
    }
  }

  async getPrivateKey(): Promise<string | undefined> {
    try {
      const prov: any = await this.getProvider();
      if (!prov?.request) return undefined;
      const pk = await prov.request({ method: 'private_key' });
      if (pk && typeof pk === 'string') return pk;
      return undefined;
    } catch (e) {
      console.warn('[Web3AuthAdapter] getPrivateKey unavailable', e);
      return undefined;
    }
  }
}
