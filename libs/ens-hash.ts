/** Loaded only when an ENS profile is shared. */
export async function ensNamehash(name: string): Promise<string> {
  const { utils } = await import('ethers');
  return utils.namehash(name);
}
