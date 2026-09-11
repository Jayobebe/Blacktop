export type TipCurrency = 'NIM' | 'USDT';

export interface Payee {
  id: string;
  label: string;
  /** Nimiq address, e.g. "NQ12 3456 ..." */
  nimAddress?: string;
  /** Polygon (EVM) address for USDT, e.g. "0x..." */
  usdtAddress?: string;
  /** Built-in developer payee cannot be deleted */
  builtIn?: boolean;
}
