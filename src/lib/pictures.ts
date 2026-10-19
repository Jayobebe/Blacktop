/**
 * Pictures the app draws in many places. They live in the app's own files
 * (`public/img`), not on the host's asset store: the address of a hosted asset
 * only exists on the website, so in the Android and iOS apps (whose files are
 * bundled in) and offline they simply weren't there.
 */
/** The workshop behind every vehicle: the garage, cards, Card Wars, the Speed Shop, a card drop. */
export const GARAGE_SHOP = '/img/garage-shop.png';
/** The demo bike: demo mode's vehicle, and the stand-in for a rider's own in the tour and the Enterprise scenes. */
export const DEMO_BIKE = '/img/demo-bike.png';
/** Mecha-Nick as pixel art, 96 pixels across (scripts/make-mecha-nick.py): the garage, and his silhouette in the tour and the Enterprise workshop. */
export const MECHA_NICK = '/garage/mecha-nick.png';
