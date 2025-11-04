import { ethers } from "ethers";
import { useWeb3Provider } from "./use-web3";
import { useMemo } from "react";

export function useSigner() {
  const { provider } = useWeb3Provider();

  return useMemo(() => {
    if (!provider) return null;
    const ethersProvider = new ethers.providers.Web3Provider(provider);
    return ethersProvider.getSigner();
  }, [provider]);
}
