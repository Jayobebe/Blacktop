# Pay Up: QR-first rewrite

Drop the in-app payment attempts entirely. Pay Up becomes a simple two-sided QR card: show your own code so people can pay you, or scan someone else's code to pay them in Nimiq Pay.

## What the user sees

**Receive tab (your code)**
- First time: a short prompt to add your own wallet address (NIM `NQ…` and/or Polygon USDT `0x…`), typed in or scanned from your own wallet app. Saved on the device only.
- After that: your QR code, your address in text underneath, a copy button, and an "Edit my wallet" link.
- If both currencies are saved, a small NIM / USDT switch decides which code is shown.

**Send tab (pay someone)**
- Dropdown above the box: **Developer** (already saved) or **New payee** (opens the camera scanner) plus any payees saved earlier.
- Picking a payee shows their address, an amount field, and a "Open in Nimiq Pay" button that hands the payment off to the Nimiq Pay app.
- Scanning a code fills in the payee straight away and offers to save it under a name.
- If Nimiq Pay isn't installed, the payee's QR stays on screen so it can be scanned from another device.

A Send / Receive toggle sits at the top of the Pay Up box and swaps between the two.

## Technical notes

- `src/features/tips/hooks/useMyWallet.ts` (new): localStorage-backed store for the user's own NIM/USDT addresses, same module-singleton + `useSyncExternalStore` pattern as `usePayees`. Cleared by the burn button alongside `burnPayees`.
- `NimiqTipCard.tsx` rewritten around a `mode: 'send' | 'receive'` state; reuses existing `QRCodeSVG`, `Html5Qrcode` scanner, `parsePayeeQr`, address validators and `buildPaymentUri`.
- Receive QR encodes the plain payment URI (`nimiq:<addr>` / EIP-681 USDT) with no amount, so any wallet can read it.
- Send hand-off keeps the existing `openNimiqPayCheckout` deep link with the HTTPS fallback; the in-page wallet-signing paths (`sendNimViaMiniApp`, `sendUsdtViaWallet`, resume-from-query-params effect) are removed from the card. `walletBridge.ts` keeps those helpers for the `/pay` mini-app route, which stays as is.
- Scanner extracted to a small `QrScanner` component so Send and the wallet setup both use it.
- Demo showcase Pay Up slide updated to describe the send/receive QR flow.
