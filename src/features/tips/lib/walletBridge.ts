import { init, getHostLanguage } from '@nimiq/mini-app-sdk';
import type { NimiqProvider } from '@nimiq/mini-app-sdk';
import { USDT_POLYGON_CONTRACT } from './nimiqPay';

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isNimiqPay?: boolean;
};

const POLYGON_CHAIN_ID = '0x89';
const USDT_DECIMALS = 6;
const NIM_DECIMALS = 5; // 1 NIM = 1e5 lunas

let nimiqProviderPromise: Promise<NimiqProvider | null> | null = null;

export function getEvmProvider(): Eip1193Provider | null {
  const injected = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  return injected && typeof injected.request === 'function' ? injected : null;
}

/** True when the app is running inside the Nimiq Pay mini-app browser. */
export function isNimiqPayHost(): boolean {
  return getHostLanguage() !== undefined || Boolean((window as unknown as { nimiq?: unknown }).nimiq);
}

/** Returns the injected Nimiq provider, or null if not running inside Nimiq Pay / timeout. */
export async function getNimiqProvider(): Promise<NimiqProvider | null> {
  if (typeof window === 'undefined') return null;

  if (nimiqProviderPromise) return nimiqProviderPromise;

  nimiqProviderPromise = init({ timeout: 3_000 })
    .then((provider) => provider)
    .catch(() => null);

  return nimiqProviderPromise;
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
 * Sends NIM through the Nimiq Pay mini-app provider.
 * Returns the serialized transaction string, or throws on error / cancellation.
 */
export async function sendNimViaMiniApp(to: string, amount: number): Promise<string> {
  const provider = await getNimiqProvider();
  if (!provider) throw new Error('NO_PROVIDER');

  const value = Math.round(amount * 10 ** NIM_DECIMALS);
  const result = await provider.sendBasicTransaction({
    recipient: to.replace(/\s+/g, ''),
    value,
  });

  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error((result as { error: { message?: string } }).error?.message ?? 'NIM payment failed');
  }

  return result as string;
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

/** Deep link that opens the Nimiq Pay app and loads the given URL as a mini app. */
export function nimiqPayMiniAppLink(returnUrl?: string): string {
  const url = returnUrl ?? (typeof window !== 'undefined' ? window.location.href : '');
  return `nimiqpay://miniapp?url=${encodeURIComponent(url)}`;
}

export type PayCurrency = 'NIM' | 'USDT';

/**
 * Opens a payment outside the mini app using the standard wallet URI schemes,
 * which Nimiq Pay and other wallets register with the OS:
 *  - NIM  → `nimiq:<address>?amount=<nim>`
 *  - USDT → EIP-681 `ethereum:<token>@137/transfer?address=…&uint256=…`
 * Falls back to the Nimiq Wallet web link (NIM) or the Nimiq Pay landing page.
 */
export function openNimiqPayPayment(
  currency: PayCurrency,
  address: string,
  amount: number,
  uri?: string | null
): void {
  if (typeof window === 'undefined') return;

  const primary = uri ?? (currency === 'NIM' ? `nimiq:${address.replace(/\s+/g, '')}?amount=${amount}` : '');
  const fallback = currency === 'NIM' ? nimiqWalletLink(address, amount) : 'https://nimpay.app/';

  let launched = false;
  const clear = () => {
    launched = true;
  };
  window.addEventListener('blur', clear, { once: true });
  window.addEventListener('pagehide', clear, { once: true });

  if (primary) window.location.href = primary;

  window.setTimeout(() => {
    if (launched) return;
    window.location.href = fallback;
  }, 1500);
}

/** Web-facing universal link equivalent of {@link nimiqPayMiniAppLink}. */
export function nimiqPayUniversalLink(returnUrl?: string): string {
  const url = returnUrl ?? (typeof window !== 'undefined' ? window.location.href : '');
  return `https://nimpay.app/miniapps/open/${encodeURIComponent(url)}`;
}

/**
 * Opens the Nimiq Pay app if installed. Falls back to the Nimiq Pay landing page
 * if the custom scheme cannot be handled (desktop or app not installed).
 */
export function openNimiqPayApp(returnUrl?: string): void {
  if (typeof window === 'undefined') return;

  const scheme = nimiqPayMiniAppLink(returnUrl);
  const fallback = nimiqPayUniversalLink(returnUrl);
  const landing = 'https://nimpay.app/';

  let launched = false;
  const clear = () => {
    launched = true;
  };

  window.addEventListener('blur', clear, { once: true });
  window.addEventListener('pagehide', clear, { once: true });

  // Try the custom scheme first. On mobile this hands off to the OS.
  window.location.href = scheme;

  // If the app opened, the page is paused and this timeout is cancelled on return.
  // If not, fall back to the universal link, then the landing page.
  window.setTimeout(() => {
    if (launched) return;
    window.removeEventListener('blur', clear);
    window.removeEventListener('pagehide', clear);
    window.location.href = fallback;

    window.setTimeout(() => {
      if (!launched) window.location.href = landing;
    }, 2500);
  }, 1500);
}

export function polygonscanTxUrl(hash: string): string {
  return `https://polygonscan.com/tx/${hash}`;
}
