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
    blurb: 'Your own vehicle card, exactly as it looks in your vault: tier finish, photo and stats as they stand the day you order, printed on thick foil-edged stock.',
    preview: 'card',
    prices: ['£5', '£10', '£15', '£20+'],
  },
  {
    id: 'receipt',
    name: 'Ride Receipt Print',
    blurb: 'Any ride’s receipt, exactly as the app prints it: date, stats, bike photo, G-force trace and badges, on real till roll or framed for the garage wall. Time-attack and track-day receipts keep their coloured paper.',
    preview: 'receipt',
    prices: ['£5', '£10', '£20', '£30+'],
  },
  {
    id: 'hoodie',
    name: 'Crew Hoodie',
    blurb: 'Heavyweight hoodie in near-black with BLACKTOP woven faintly through the fabric. Your Blacktop name and “Burn it all” embroidered small on the left chest; a big embroidered globe in your accent colour on the back under “Blacktop World”.',
    preview: 'hoodie',
    prices: ['£30', '£40', '£50', '£60+'],
  },
  {
    id: 'keychain',
    name: 'Crew Keychain',
    blurb: 'A chunky rubber tag in your accent colour with a pressed-in BT logo and your crew code, on a steel split ring.',
    preview: 'keychain',
    prices: ['£5', '£10', '£15', '£20+'],
  },
  {
    id: 'logbook',
    name: 'Printed Logbook',
    blurb: 'Your garage logbook as a real leather-bound book with gold lettering and your vehicle’s name on the cover. Inside: rides, services and keepers, with a QR to the digital copy.',
    preview: 'logbook',
    prices: ['£15', '£25', '£35', '£50+'],
  },
];
