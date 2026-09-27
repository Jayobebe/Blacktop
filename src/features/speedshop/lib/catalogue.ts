/**
 * Speedshop line-up. Nothing is on sale yet: each item is shown so riders can
 * say whether they'd buy it and what they'd pay (see surveyStore).
 * Ids are stored with votes, so don't rename them.
 */

export type PreviewKind = 'card' | 'receipt' | 'logbook' | 'hoodie' | 'keychain';

export interface ShopItem {
  id: string;
  name: string;
  blurb: string;
  preview: PreviewKind;
  /** Price bands riders pick from (the last is open-ended). */
  prices: string[];
}

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: 'card',
    name: 'Printed Vehicle Card',
    blurb: 'Your vehicle card on thick, foil-edged stock: tier, stats and photo as they are the day you order.',
    preview: 'card',
    prices: ['£5', '£10', '£15', '£20+'],
  },
  {
    id: 'receipt',
    name: 'Ride Receipt Print',
    blurb: 'Any ride’s receipt printed on real till roll, or framed for the garage wall.',
    preview: 'receipt',
    prices: ['£5', '£10', '£20', '£30+'],
  },
  {
    id: 'hoodie',
    name: 'Crew Hoodie',
    blurb: 'Heavyweight hoodie with your crew code on the chest and your card on the back.',
    preview: 'hoodie',
    prices: ['£30', '£40', '£50', '£60+'],
  },
  {
    id: 'keychain',
    name: 'Card Keychain',
    blurb: 'A mini metal version of your vehicle card to hang off the keys.',
    preview: 'keychain',
    prices: ['£5', '£10', '£15', '£20+'],
  },
  {
    id: 'logbook',
    name: 'Printed Logbook',
    blurb: 'Your vehicle’s logbook, bound: rides, services and keepers, with a QR to the digital copy.',
    preview: 'logbook',
    prices: ['£15', '£25', '£35', '£50+'],
  },
];
