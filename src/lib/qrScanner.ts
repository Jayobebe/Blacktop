/**
 * The QR scanner library (html5-qrcode, ~350 kB with its ZXing decoder), loaded
 * the moment a scan starts. Import its type with `import type`, never the
 * class: a static import pulled it into every launch through the eager screens.
 */
export const loadQrScanner = () => import('html5-qrcode').then((m) => m.Html5Qrcode);
