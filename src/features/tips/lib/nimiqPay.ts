import type { Payee, TipCurrency } from '../types';

/**
 * Developer payee. Replace these with the real Blacktop wallet addresses.
 * NIM  -> Nimiq address from the Nimiq Pay / Wallet app
 * USDT -> Polygon (EVM) address used by Nimiq Pay for stablecoins
 */
export const DEVELOPER_PAYEE: Payee = {
  id: 'developer',
  label: 'Blacktop developer',
  nimAddress: 'NQ73 3KC3 MGUD 6F04 MV5E AXF1 SL7F ACRS AM91',
  usdtAddress: '',
  builtIn: true,
};

/** USDT contract on Polygon PoS (6 decimals) — the chain Nimiq Pay uses for stablecoins. */
export const USDT_POLYGON_CONTRACT = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';
const USDT_DECIMALS = 6;

const NIM_RE = /^NQ[0-9]{2}(?:\s?[A-Z0-9]{4}){8}$/i;
const EVM_RE = /^0x[a-fA-F0-9]{40}$/;

export function normalizeNimAddress(raw: string): string {
  const compact = raw.replace(/\s+/g, '').toUpperCase();
  return compact.replace(/(.{4})/g, '$1 ').trim();
}

export function isValidNimAddress(raw: string): boolean {
  return NIM_RE.test(raw.trim());
}

export function isValidUsdtAddress(raw: string): boolean {
  return EVM_RE.test(raw.trim());
}

export function payeeSupports(payee: Payee, currency: TipCurrency): boolean {
  return currency === 'NIM'
    ? isValidNimAddress(payee.nimAddress ?? '')
    : isValidUsdtAddress(payee.usdtAddress ?? '');
}

export function payeeAddress(payee: Payee, currency: TipCurrency): string {
  return (currency === 'NIM' ? payee.nimAddress : payee.usdtAddress)?.trim() ?? '';
}

/**
 * Builds a payment URI that the Nimiq Pay app can open or scan.
 * - NIM  : the `nimiq:` URI scheme
 * - USDT : EIP-681 token transfer on Polygon
 */
export function buildPaymentUri(payee: Payee, currency: TipCurrency, amount: number): string | null {
  if (!(amount > 0) || !payeeSupports(payee, currency)) return null;

  if (currency === 'NIM') {
    const address = normalizeNimAddress(payee.nimAddress!).replace(/\s/g, '');
    return `nimiq:${address}?amount=${amount}`;
  }

  const units = BigInt(Math.round(amount * 10 ** USDT_DECIMALS));
  return `ethereum:${USDT_POLYGON_CONTRACT}@137/transfer?address=${payee.usdtAddress!.trim()}&uint256=${units.toString()}`;
}

export function formatAmount(amount: number, currency: TipCurrency): string {
  return currency === 'NIM' ? `${amount} NIM` : `${amount.toFixed(2)} USDT`;
}
