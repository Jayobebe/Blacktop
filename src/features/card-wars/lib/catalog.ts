import type { BattleCard, CardBank, DogTag } from '../types';
/**
 * Brand card artwork: public/card-wars/<cars|bikes>/<id>.png, made by
 * scripts/make-card-wars-art.py (cars cleaned of their chroma key: smoked
 * glass, no colour fringe, no baked shadow; bikes trimmed). Plain URLs, and
 * nothing here imports the app, so the balance scripts can load this file in
 * Node. The shop-only cards (GTLM, TT, F1, MotoGP) have no artwork yet.
 */
const CAR_ART = [
 '911', 'gt3r', 'm3', 'm4gt3', '296gtb', '296gt3', '750s', '720sgt3', 'amggtbs', 'amggt3',
 'gryaris', 'suprag4', 'civic', 'nsxgt3', 'mustangdh', 'rally', 'mx5', 'mx5cup', 'gti', 'gtitcr',
 // shop-only shelves, as their artwork arrives
 'c8r', 'c7r', 'rsr19', 'rsr17', '488gte', 'm8gte', 'm6gtlm', 'fordgt', 'vantagegte', 'lexusrcf',
 'rb19', 'w11', 'f2004', 'mp44', 'fw14b', 'w07', 'rb9', 'lotus79', 'mcl38', 'bgp001',
];
const BIKE_ART = [
 'mt07', 'r6', 'ninja', 'zx10rr', 'sv650', 'gsxr', 'fireblade', 'firebladesbk', 'panigale', 'v4rsbk',
 'gs', 's1000', 'rs660f', 'rs660', '890duke', 'rc8c', 'striple', 'moto2', 'f3rr', 'f3ss',
 'm1_15', 'gp23', 'rc213v', 'gsxrr', 'rc16', 'rsgp', 'rc211v', 'gp7', 'm1_04', 'nsr500',
 'm1000tt', 'firebladett', 'zx10tt', 'gsxrtt', 'r1tt', 'norton', 'shinden', 'rc30', 'ow01', 'striplett',
];
const ARTWORK: Record<string, string> = Object.fromEntries([
 ...CAR_ART.map(id => [id, `/card-wars/cars/${id}.png`]),
 ...BIKE_ART.map(id => [id, `/card-wars/bikes/${id}.png`]),
]);

/**
 * Card Wars catalog. Each card carries real published figures (year, power,
 * weight, top speed and, for bikes, max lean), shown on the card. Ratings
 * drive battles and come from the BALANCE table below (the last two columns
 * here are the Distance and Corners judgements the balance script starts
 * from). The server holds the same numbers in `cw_catalog`: keep ids and
 * ratings in step.
 */
export interface CardSpecs { year: number; hp: number; kg: number; vmaxKmh: number; leanDeg?: number }

type Row = [id: string, make: string, model: string, vehicle: 'car' | 'bike', spec: 'factory' | 'race', bank: CardBank | null, year: number, hp: number, kg: number, vmaxKmh: number, leanDeg: number | null, distance: number, corners: number];

const rows: Row[] = [
 // ── Car brands: one road, one race ──
 ['911','Porsche','911 GT3','car','factory',null,2021,510,1435,318,null,62,86],
 ['gt3r','Porsche','911 GT3 R','car','race',null,2023,565,1250,300,null,58,92],
 ['m3','BMW','M3 Competition','car','factory',null,2021,510,1730,290,null,80,72],
 ['m4gt3','BMW','M4 GT3','car','race',null,2022,590,1300,300,null,56,88],
 ['296gtb','Ferrari','296 GTB','car','factory',null,2022,830,1470,330,null,58,86],
 ['296gt3','Ferrari','296 GT3','car','race',null,2023,600,1250,300,null,55,91],
 ['750s','McLaren','750S','car','factory',null,2023,750,1389,332,null,55,85],
 ['720sgt3','McLaren','720S GT3 Evo','car','race',null,2023,550,1250,300,null,55,89],
 ['amggtbs','Mercedes-AMG','GT Black Series','car','factory',null,2020,730,1520,325,null,57,84],
 ['amggt3','Mercedes-AMG','GT3 Evo','car','race',null,2020,550,1285,300,null,58,88],
 ['gryaris','Toyota','GR Yaris','car','factory',null,2020,261,1280,230,null,72,82],
 ['suprag4','Toyota','GR Supra GT4','car','race',null,2020,430,1350,260,null,62,80],
 ['civic','Honda','Civic Type R','car','factory',null,2022,329,1429,275,null,76,80],
 ['nsxgt3','Honda','NSX GT3 Evo22','car','race',null,2022,550,1285,290,null,56,87],
 ['mustangdh','Ford','Mustang Dark Horse','car','factory',null,2024,500,1745,270,null,74,66],
 ['rally','Ford','Fiesta Rally2','car','race',null,2019,290,1230,200,null,60,90],
 ['mx5','Mazda','MX-5','car','factory',null,2016,184,1060,219,null,82,78],
 ['mx5cup','Mazda','MX-5 Cup','car','race',null,2016,181,1043,210,null,64,84],
 ['gti','Volkswagen','Golf GTI','car','factory',null,2020,245,1430,250,null,84,70],
 ['gtitcr','Volkswagen','Golf GTI TCR','car','race',null,2019,350,1265,250,null,62,82],
 // ── Bike brands: one road, one race ──
 ['mt07','Yamaha','MT-07','bike','factory',null,2021,73,184,210,49,72,70],
 ['r6','Yamaha','YZF-R6 Cup','bike','race',null,2020,128,175,265,58,40,90],
 ['ninja','Kawasaki','Ninja 400','bike','factory',null,2018,45,168,190,50,70,80],
 ['zx10rr','Kawasaki','Ninja ZX-10RR WorldSBK','bike','race',null,2021,235,168,320,62,34,90],
 ['sv650','Suzuki','SV650','bike','factory',null,2016,76,199,210,48,78,68],
 ['gsxr','Suzuki','GSX-R1000R race spec','bike','race',null,2017,210,175,305,60,36,86],
 ['fireblade','Honda','CBR1000RR-R Fireblade SP','bike','factory',null,2020,215,201,299,56,46,84],
 ['firebladesbk','Honda','CBR1000RR-R WorldSBK','bike','race',null,2023,230,168,320,62,34,90],
 ['panigale','Ducati','Panigale V4 S','bike','factory',null,2022,215,195,299,56,44,86],
 ['v4rsbk','Ducati','Panigale V4 R WorldSBK','bike','race',null,2023,240,168,325,63,34,93],
 ['gs','BMW','R 1250 GS','bike','factory',null,2019,136,249,220,45,96,58],
 ['s1000','BMW','M 1000 RR race spec','bike','race',null,2023,230,170,320,62,36,90],
 ['rs660f','Aprilia','RS 660','bike','factory',null,2021,100,183,230,53,64,82],
 ['rs660','Aprilia','RS 660 Trofeo','bike','race',null,2021,105,166,240,58,42,90],
 ['890duke','KTM','890 Duke R','bike','factory',null,2020,121,187,240,52,62,82],
 ['rc8c','KTM','RC 8C','bike','race',null,2022,128,142,260,59,38,92],
 ['striple','Triumph','Street Triple 765 RS','bike','factory',null,2023,128,188,250,52,64,84],
 ['moto2','Triumph','765 Moto2 race spec','bike','race',null,2019,140,165,295,61,36,90],
 ['f3rr','MV Agusta','F3 RR','bike','factory',null,2022,147,173,270,54,52,84],
 ['f3ss','MV Agusta','F3 Supersport race spec','bike','race',null,2022,150,165,285,59,38,88],
 // ── RPM bank: GTLM ──
 ['c8r','Chevrolet','Corvette C8.R','car','race','gtlm',2020,500,1245,300,null,82,88],
 ['c7r','Chevrolet','Corvette C7.R','car','race','gtlm',2014,491,1245,298,null,82,86],
 ['rsr19','Porsche','911 RSR-19','car','race','gtlm',2019,515,1245,300,null,80,92],
 ['rsr17','Porsche','911 RSR','car','race','gtlm',2017,510,1243,298,null,80,90],
 ['488gte','Ferrari','488 GTE Evo','car','race','gtlm',2017,505,1245,300,null,80,90],
 ['m8gte','BMW','M8 GTE','car','race','gtlm',2018,500,1220,300,null,78,86],
 ['m6gtlm','BMW','M6 GTLM','car','race','gtlm',2016,490,1220,298,null,76,84],
 ['fordgt','Ford','GT GTLM','car','race','gtlm',2016,500,1250,305,null,82,90],
 ['vantagegte','Aston Martin','Vantage AMR GTE','car','race','gtlm',2018,510,1245,300,null,80,88],
 ['lexusrcf','Lexus','RC F GT3','car','race','gtlm',2017,500,1300,295,null,76,84],
 // ── RPM bank: F1 ──
 ['rb19','Red Bull','RB19','car','race','f1',2023,1000,798,350,null,40,99],
 ['w11','Mercedes','W11 EQ Performance','car','race','f1',2020,1000,746,350,null,40,99],
 ['f2004','Ferrari','F2004','car','race','f1',2004,900,605,370,null,38,96],
 ['mp44','McLaren','MP4/4','car','race','f1',1988,650,540,330,null,34,88],
 ['fw14b','Williams','FW14B','car','race','f1',1992,780,505,340,null,36,94],
 ['w07','Mercedes','W07 Hybrid','car','race','f1',2016,950,702,355,null,40,95],
 ['rb9','Red Bull','RB9','car','race','f1',2013,750,642,330,null,38,95],
 ['lotus79','Lotus','79','car','race','f1',1978,480,575,290,null,32,86],
 ['mcl38','McLaren','MCL38','car','race','f1',2024,1000,798,350,null,40,98],
 ['bgp001','Brawn','BGP 001','car','race','f1',2009,750,605,330,null,38,93],
 // ── RPM bank: Isle of Man TT ──
 ['m1000tt','BMW','M 1000 RR TT Superbike','bike','race','tt',2023,230,175,330,58,64,86],
 ['firebladett','Honda','CBR1000RR-R TT Superbike','bike','race','tt',2022,225,175,325,57,62,85],
 ['zx10tt','Kawasaki','Ninja ZX-10RR TT Superbike','bike','race','tt',2019,225,175,320,57,62,84],
 ['gsxrtt','Suzuki','GSX-R1000 TT Superbike','bike','race','tt',2018,215,175,315,57,62,84],
 ['r1tt','Yamaha','YZF-R1 TT Superbike','bike','race','tt',2017,215,177,315,57,62,84],
 ['norton','Norton','SG7 TT','bike','race','tt',2019,215,170,320,56,60,82],
 ['shinden','Mugen','Shinden Hachi','bike','race','tt',2019,160,248,270,54,24,76],
 ['rc30','Honda','VFR750R RC30','bike','race','tt',1988,112,185,250,52,58,78],
 ['ow01','Yamaha','FZR750R OW01','bike','race','tt',1989,121,187,255,52,58,78],
 // The id is from the Triumph Street Triple this card used to be: kept, so everyone who owns it still does.
 ['striplett','Suter','MMX 500','bike','race','tt',2017,195,127,310,62,30,92],
 // ── RPM bank: MotoGP ──
 ['gp23','Ducati','Desmosedici GP23','bike','race','motogp',2023,300,157,366,64,30,96],
 ['rc213v','Honda','RC213V','bike','race','motogp',2014,260,157,350,64,30,97],
 ['m1_15','Yamaha','YZR-M1','bike','race','motogp',2015,240,157,350,64,32,98],
 ['gsxrr','Suzuki','GSX-RR','bike','race','motogp',2020,240,157,345,64,32,97],
 ['rc16','KTM','RC16','bike','race','motogp',2023,280,157,360,64,30,95],
 ['rsgp','Aprilia','RS-GP','bike','race','motogp',2023,280,157,360,64,30,96],
 ['rc211v','Honda','RC211V','bike','race','motogp',2002,240,148,335,62,30,94],
 ['gp7','Ducati','Desmosedici GP7','bike','race','motogp',2007,230,148,330,62,30,90],
 ['m1_04','Yamaha','YZR-M1 (2004)','bike','race','motogp',2004,240,148,330,62,30,95],
 ['nsr500','Honda','NSR500','bike','race','motogp',2001,190,131,320,60,28,93],
];

/**
 * Ratings and prices:
 * [speed, lean, g-force, distance, corners, price in RPM]. Written by
 * `npm run cardwars:balance` (scripts/make-card-wars-balance.ts), which
 * prints the same rows for `cw_catalog`; never edit one side alone. A card's
 * price follows how often it wins a round against the rest of the catalogue.
 */
export const BALANCE: Record<string, readonly [number, number, number, number, number, number]> = {
 '911': [80, 30, 45, 62, 76, 75], gt3r: [74, 30, 52, 70, 92, 190], m3: [70, 30, 39, 80, 62, 60], m4gt3: [74, 30, 52, 68, 88, 140],
 '296gtb': [85, 30, 58, 58, 76, 120], '296gt3': [74, 30, 54, 68, 91, 180], '750s': [85, 30, 57, 55, 75, 105], '720sgt3': [74, 30, 51, 67, 89, 145],
 amggtbs: [83, 30, 54, 57, 74, 95], amggt3: [74, 30, 50, 70, 88, 140], gryaris: [49, 30, 29, 72, 72, 40], suprag4: [60, 30, 42, 66, 80, 55],
 civic: [65, 30, 32, 76, 70, 50], nsxgt3: [70, 30, 50, 68, 87, 105], mustangdh: [63, 30, 39, 74, 56, 45], rally: [38, 30, 33, 64, 90, 60],
 mx5: [45, 30, 24, 82, 68, 45], mx5cup: [42, 30, 24, 60, 84, 35], gti: [56, 30, 24, 84, 60, 50], gtitcr: [56, 30, 38, 58, 82, 40],
 mt07: [42, 50, 48, 72, 60, 35], r6: [61, 79, 66, 40, 90, 100], ninja: [34, 53, 37, 70, 70, 30], zx10rr: [81, 92, 84, 36, 89, 205],
 sv650: [42, 46, 47, 78, 58, 40], gsxr: [76, 86, 80, 36, 86, 120], fireblade: [74, 73, 77, 46, 74, 80], firebladesbk: [81, 92, 84, 34, 91, 220],
 panigale: [74, 73, 78, 44, 76, 90], v4rsbk: [83, 96, 85, 34, 93, 275], gs: [45, 36, 57, 92, 48, 60], s1000: [81, 92, 83, 38, 88, 195],
 rs660f: [49, 63, 57, 64, 72, 50], rs660: [52, 79, 62, 42, 90, 90], '890duke': [52, 60, 62, 62, 72, 50], rc8c: [60, 83, 72, 38, 92, 110],
 striple: [56, 60, 64, 64, 74, 60], moto2: [72, 89, 70, 36, 90, 110], f3rr: [63, 66, 70, 52, 74, 60], f3ss: [68, 83, 72, 38, 88, 95],
 c8r: [74, 30, 48, 84, 88, 165], c7r: [73, 30, 48, 82, 86, 125], rsr19: [74, 30, 49, 78, 93, 210], rsr17: [73, 30, 49, 80, 90, 165],
 '488gte': [74, 30, 49, 78, 91, 190], m8gte: [74, 30, 49, 80, 85, 140], m6gtlm: [73, 30, 48, 76, 84, 100], fordgt: [76, 30, 48, 80, 90, 190],
 vantagegte: [74, 30, 49, 82, 88, 170], lexusrcf: [72, 30, 47, 76, 84, 90], rb19: [92, 30, 81, 40, 99, 415], w11: [92, 30, 83, 40, 99, 465],
 f2004: [99, 30, 86, 38, 96, 475], mp44: [85, 30, 80, 34, 88, 155], fw14b: [88, 30, 87, 36, 94, 350], w07: [94, 30, 83, 40, 95, 415],
 rb9: [85, 30, 79, 38, 95, 260], lotus79: [70, 30, 70, 32, 86, 65], mcl38: [92, 30, 81, 40, 98, 405], bgp001: [85, 30, 81, 38, 93, 260],
 m1000tt: [85, 79, 83, 64, 86, 265], firebladett: [83, 76, 82, 62, 85, 200], zx10tt: [81, 76, 82, 62, 84, 180], gsxrtt: [79, 76, 81, 63, 83, 160],
 r1tt: [79, 76, 80, 60, 85, 155], norton: [81, 73, 82, 60, 82, 155], shinden: [63, 66, 62, 24, 76, 40], rc30: [56, 60, 60, 58, 78, 55],
 ow01: [58, 60, 62, 58, 78, 60], striplett: [77, 92, 87, 30, 92, 205], gp23: [98, 99, 93, 30, 96, 465], rc213v: [92, 99, 89, 30, 97, 420],
 m1_15: [92, 99, 87, 32, 98, 435], gsxrr: [90, 99, 87, 32, 97, 410], rc16: [95, 99, 91, 29, 95, 410], rsgp: [95, 99, 91, 32, 96, 475],
 rc211v: [86, 92, 89, 30, 94, 315], gp7: [85, 92, 87, 30, 90, 230], m1_04: [85, 92, 89, 30, 95, 310], nsr500: [81, 86, 85, 28, 93, 195],
};

/** The four series whose cards are only ever bought or spun for, never won. */
export const BANK_INFO: Record<CardBank, { label: string; vehicle: 'car' | 'bike' }> = {
 gtlm: { label: 'GTLM', vehicle: 'car' },
 f1: { label: 'F1', vehicle: 'car' },
 tt: { label: 'Isle of Man TT', vehicle: 'bike' },
 motogp: { label: 'MotoGP', vehicle: 'bike' },
};

/** The shop's shelves. A spin on a shelf can land one of its cards. */
export type ShopCategory = 'road' | 'race' | CardBank;
export const categoryOf = (c: Pick<BattleCard, 'bank' | 'spec'>): ShopCategory => c.bank ?? (c.spec === 'race' ? 'race' : 'road');
/** RPM for one spin on each shelf: about a fifth of what its cards cost (`cw_spin_cost` on the server). */
export const SPIN_COST: Record<ShopCategory, number> = { road: 10, race: 25, gtlm: 30, tt: 30, f1: 65, motogp: 75 };
export const SHELVES: ShopCategory[] = ['road', 'race', 'gtlm', 'tt', 'f1', 'motogp'];

export const SPECS: Record<string, CardSpecs> = {};
export const CATALOG: BattleCard[] = rows.map(([id, manufacturer, name, vehicle, spec, bank, year, hp, kg, vmaxKmh, leanDeg, distance, corners]) => {
 SPECS[id] = { year, hp, kg, vmaxKmh, ...(leanDeg != null ? { leanDeg } : {}) };
 const b = BALANCE[id];
 if (!b) throw new Error(`Card Wars: ${id} has no BALANCE row (npm run cardwars:balance)`);
 return {
  id, name, manufacturer, vehicle, spec, archetype: id,
  ...(ARTWORK[id] ? { image: ARTWORK[id] } : {}),
  ...(bank ? { bank } : {}),
  price: b[5],
  ratings: { speed: b[0], lean: b[1], g: b[2], distance: b[3], corners: b[4] },
 };
});
/** Brand cards (the Road and Race shelves): the ones a win against the computer can earn. */
export const BRAND_CARDS = CATALOG.filter(c => !c.bank);
export const BANK_CARDS = CATALOG.filter(c => !!c.bank);
export const cardById = (id: string | null | undefined): BattleCard | undefined => (id ? CATALOG.find(c => c.id === id) : undefined);

/** Presentation metadata only: never replaces the catalog ratings used for battles. */
export function cardIdentity(name: string, makeModel?: string): Pick<BattleCard, 'manufacturer' | 'displayVehicle'> {
 const text = makeModel || name;
 const makes = ['Mercedes-AMG', 'Mercedes-Benz', 'Land Rover', 'Aston Martin', 'Harley-Davidson', 'Royal Enfield', 'MV Agusta', 'Volkswagen', 'Kawasaki', 'Suzuki', 'Yamaha', 'Ducati', 'Aprilia', 'Triumph', 'KTM', 'Honda', 'BMW', 'Mazda', 'Porsche', 'Toyota', 'Ford', 'Audi', 'Tesla', 'Nissan', 'Peugeot', 'Renault', 'Volvo', 'Subaru', 'Hyundai', 'Kia', 'Lexus', 'Chevrolet', 'Ferrari', 'Lamborghini', 'McLaren', 'Mini'];
 const manufacturer = makes.find(make => new RegExp(`\\b${make}\\b`, 'i').test(text));
 const known = CATALOG.find(c => manufacturer === c.manufacturer && text.toLowerCase().includes((c.name).toLowerCase().replace(/ (cup|race spec|trofeo)$/, '')));
 const bikeMake = /^(Yamaha|Kawasaki|Suzuki|Ducati|Aprilia|Triumph|KTM|Harley-Davidson|Royal Enfield|MV Agusta)$/;
 const carMake = /^(Mercedes-AMG|Mercedes-Benz|Land Rover|Aston Martin|Volkswagen|Mazda|Porsche|Toyota|Ford|Audi|Tesla|Nissan|Peugeot|Renault|Volvo|Subaru|Hyundai|Kia|Lexus|Chevrolet|Ferrari|Lamborghini|McLaren|Mini)$/;
 const displayVehicle = known?.vehicle || (manufacturer && bikeMake.test(manufacturer) ? 'bike' : manufacturer && carMake.test(manufacturer) ? 'car' : undefined);
 return {manufacturer, displayVehicle};
}
/** The deck demo mode plays with. */
export const STARTERS = ['mx5','gti','mt07','sv650','ninja'];
/**
 * The four dog tags everyone has, one per power: the plain ones. The tags
 * worth having are won on spins (lib/tagRules.ts).
 */
/** Demo mode's sample collection (lib/shop.ts shows it; the vault's full list reads the same). */
export const DEMO_OWNED = [...STARTERS, '911', 'civic', 'panigale', 'gs', 'striple', 'gt3r', 'r6', 'rsr19'];
export const DEMO_TAGS = ['boost:panigale', 'heal:gs', 'reroll:gt3r', 'boost:rsr19'];
export const STARTER_TAGS: DogTag[] = [
 {id:'tag-reroll',name:'Second chance',power:'reroll'},
 {id:'tag-heal',name:'Pit medic',power:'heal'},
 {id:'tag-boost',name:'Overdrive',power:'boost'},
 {id:'tag-flip',name:'Coin flip',power:'flip'},
];
export function unlockCard(id: 'demo'|'dev'): BattleCard { const base=CATALOG.find(c=>c.id===(id==='demo'?'mx5':'mt07'))!; return {...base,id,manufacturer:'Blacktop',name:id==='demo'?'Demo':'Dev',source:'unlock'}; }
