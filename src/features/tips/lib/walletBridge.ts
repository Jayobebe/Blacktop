import { USDT_POLYGON_CONTRACT } from './nimiqPay';

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isNimiqPay?: boolean;
};

const POLYGON_CHAIN_ID = '0x89';
const USDT_DECIMALS = 6;

export function getEvmProvider(): Eip1193Provider | null {
  const injected = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  return injected && typeof injected.request === 'function' ? injected : null;
}

/** True when the app is running inside the Nimiq Pay mini-app browser. */
export function isNimiqPayHost(): boolean {
  const w = window as unknown as { nimiq?: unknown; ethereum?: Eip1193Provider };
  return Boolean(w.nimiq) || Boolean(w.ethereum?.isNimiqPay);
}

function pad32(hex: string): string {
  return hex.replace(/^0x/, '').padStart(64, '0');
}

/** ERC-20 `transfer(address,uint256)` calldata. */
export function encodeUsdtTransfer(to: string, amount: number): string {
  const units = BigInt(Math.round(amount * 10 ** USDT_DECIMALS));
  return `0xa9059cbb${pad32(to.toLowerCase())}${pad32(units.toString(16))}`;
}

async function ensurePolygon(provider: Eip1193Provider) {
  const current = (await provider.request({ method: 'eth_chainId' })) as string;
  if (current?.toLowerCase() === POLYGON_CHAIN_ID) return;
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: POLYGON_CHAIN_ID }],
    });
  } catch {
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: POLYGON_CHAIN_ID,
          chainName: 'Polygon',
          nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
          rpcUrls: ['https://polygon-rpc.com'],
          blockExplorerUrls: ['https://polygonscan.com'],
        },
      ],
    });
  }
}

/**
 * Sends USDT on Polygon through an injected wallet (Nimiq Pay mini-app or any
 * EIP-1193 wallet). Returns the transaction hash.
 */
export async function sendUsdtViaWallet(to: string, amount: number): Promise<string> {
  const provider = getEvmProvider();
  if (!provider) throw new Error('NO_PROVIDER');

  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
  const from = accounts?.[0];
  if (!from) throw new Error('NO_ACCOUNT');

  await ensurePolygon(provider);

  return (await provider.request({
    method: 'eth_sendTransaction',
    params: [
      {
        from,
        to: USDT_POLYGON_CONTRACT,
        data: encodeUsdtTransfer(to, amount),
        value: '0x0',
      },
    ],
  })) as string;
}

/** Web link that opens the Nimiq Wallet / Nimiq Pay send screen prefilled. */
export function nimiqWalletLink(address: string, amount: number): string {
  const compact = address.replace(/\s/g, '');
  return `https://wallet.nimiq.com/nimiq:${compact}?amount=${amount}`;
}

export function polygonscanTxUrl(hash: string): string {
  return `https://polygonscan.com/tx/${hash}`;
}
