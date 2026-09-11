import { encodeFunctionData, encodePacked, getContractAddress, keccak256, parseAbi, zeroAddress, type Address } from 'viem';

// DeHub's Safe 1.4.1 / EntryPoint 0.7 defaults, shared with web and mobile.
// Pin the factory's immutable proxyCreationCode so profile selection needs no RPC.
const FACTORY = '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67';
const SINGLETON = '0x41675C099F32341bf84BFc5382aF534df5C7461a';
const MODULE_SETUP = '0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47';
const MODULE = '0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226';
const MULTISEND = '0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526';
const PROXY_CODE = '0x608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806101c46022913960400191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505060ab806101196000396000f3fe608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441364736f6c63430007060033496e76616c69642073696e676c65746f6e20616464726573732070726f7669646564';


/** Derive the profile address locally; no RPC, private key, or wallet unlock. */
export async function predictSafeAddress(ownerEoa: string | null | undefined): Promise<string | null> {
  const owner = (ownerEoa ?? '').trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(owner)) return null;
  try {
    const enable = encodeFunctionData({ abi: parseAbi(['function enableModules(address[])']), functionName: 'enableModules', args: [[MODULE]] });
    const transaction = encodePacked(['uint8', 'address', 'uint256', 'uint256', 'bytes'], [1, MODULE_SETUP, 0n, BigInt((enable.length - 2) / 2), enable]);
    const multiSend = encodeFunctionData({ abi: parseAbi(['function multiSend(bytes)']), functionName: 'multiSend', args: [transaction] });
    const initializer = encodeFunctionData({ abi: parseAbi(['function setup(address[],uint256,address,bytes,address,address,uint256,address)']), functionName: 'setup', args: [[owner as Address], 1n, MULTISEND, multiSend, MODULE, zeroAddress, 0n, zeroAddress] });
    const salt = keccak256(encodePacked(['bytes32', 'uint256'], [keccak256(initializer), 0n]));
    const bytecode = encodePacked(['bytes', 'uint256'], [PROXY_CODE, BigInt(SINGLETON)]);
    return getContractAddress({ from: FACTORY, opcode: 'CREATE2', salt, bytecode }).toLowerCase();
  } catch {
    return null;
  }
}
