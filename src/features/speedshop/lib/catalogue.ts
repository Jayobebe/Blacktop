/**
 * Speedshop line-up. Nothing is on sale yet: each item is shown so riders can
 * say whether they'd buy it and what they'd pay (see surveyStore).
 * Ids are stored with votes, so don't rename them.
 */

export type PreviewKind = 'card' | 'receipt' | 'poster' | 'logbook' | 'hoodie' | 'tee' | 'keychain' | 'stickers';

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
    id: 'poster',
    name: 'Route Poster',
    blurb: 'A ride you love drawn as line art with its stats underneath. A3, matte.',
    preview: 'poster',
    prices: ['£10', '£20', '£30', '£40+'],
  },
  {
    id: 'hoodie',
    name: 'Crew Hoodie',
    blurb: 'Heavyweight hoodie with your crew code on the chest and your card on the back.',
    preview: 'hoodie',
    prices: ['£30', '£40', '£50', '£60+'],
  },
  {
    id: 'tee',
    name: 'Blacktop Tee',
    blurb: 'Soft black tee with the Blacktop mark and your tier badge.',
    preview: 'tee',
    prices: ['£15', '£20', '£25', '£30+'],
  },
  {
    id: 'keychain',
    name: 'Card Keychain',
    blurb: 'A mini metal version of your vehicle card to hang off the keys.',
    preview: 'keychain',
    prices: ['£5', '£10', '£15', '£20+'],
  },
  {
    id: 'stickers',
    name: 'Sticker Pack',
    blurb: 'Tier badges, your crew code and the Blacktop mark, for helmet, tank or toolbox.',
    preview: 'stickers',
    prices: ['£3', '£5', '£8', '£10+'],
  },
  {
    id: 'logbook',
    name: 'Printed Logbook',
    blurb: 'Your vehicle’s logbook, bound: rides, services and keepers, with a QR to the digital copy.',
    preview: 'logbook',
    prices: ['£15', '£25', '£35', '£50+'],
  },
];
