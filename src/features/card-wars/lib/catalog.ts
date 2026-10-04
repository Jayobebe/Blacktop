import type { BattleCard, CardBank, DogTag } from '../types';
import type { CardTier } from '@/features/cards/types';

/**
 * Card Wars catalog. Each card carries real published figures (year, power,
 * weight, top speed and, for bikes, max lean); Speed, G-force and Lean ratings
 * are worked out from those figures, Distance (endurance) and Corners
 * (handling) are game judgements. Ratings drive battles; figures are display.
 * `npm`-free mirror on the server: `cw_catalog` (keep ids and ratings in step).
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
 ['striplett','Triumph','Street Triple 765 TT Supersport','bike','race','tt',2023,140,167,285,57,58,86],
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

const clamp = (v: number) => Math.round(Math.max(10, Math.min(99, v)));
/** Top speed: 150 km/h → 20, 370 km/h → 99. */
const speedRating = (kmh: number) => clamp(20 + (kmh - 150) / 220 * 79);
/** Power-to-weight, log scale: 150 hp/t → 20, doubling adds 25 (cars and bikes share it). */
const gRating = (hp: number, kg: number) => clamp(20 + 25 * Math.log2((hp / kg * 1000) / 150));
/** Max lean: 40° → 20, 64° → 99; cars never use it. */
const leanRating = (deg: number | null) => deg == null ? 30 : clamp(20 + (deg - 40) / 24 * 79);

export const BANK_INFO: Record<CardBank, { label: string; price: number; tier: CardTier; vehicle: 'car' | 'bike' }> = {
 gtlm: { label: 'GTLM', price: 180, tier: 'diamond', vehicle: 'car' },
 f1: { label: 'F1', price: 400, tier: 'obsidian', vehicle: 'car' },
 tt: { label: 'Isle of Man TT', price: 180, tier: 'diamond', vehicle: 'bike' },
 motogp: { label: 'MotoGP', price: 400, tier: 'obsidian', vehicle: 'bike' },
};

export const SPECS: Record<string, CardSpecs> = {};
export const CATALOG: BattleCard[] = rows.map(([id, manufacturer, name, vehicle, spec, bank, year, hp, kg, vmaxKmh, leanDeg, distance, corners]) => {
 SPECS[id] = { year, hp, kg, vmaxKmh, ...(leanDeg != null ? { leanDeg } : {}) };
 return {
  id, name, manufacturer, vehicle, spec, archetype: id,
  ...(bank ? { bank, tier: BANK_INFO[bank].tier, price: BANK_INFO[bank].price } : {}),
  ratings: { speed: speedRating(vmaxKmh), lean: leanRating(leanDeg), g: gRating(hp, kg), distance, corners },
 };
});
/** Brand cards: the computer's decks and the cards a win can earn. */
export const BRAND_CARDS = CATALOG.filter(c => !c.bank);
export const BANK_CARDS = CATALOG.filter(c => !!c.bank);

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
export const STARTERS = ['mx5','gti','mt07','sv650','ninja'];
export const STARTER_TAGS: DogTag[] = [
 {id:'tag-reroll',name:'Second chance',power:'reroll',vehicle:'bike'},
 {id:'tag-heal',name:'Pit medic',power:'heal',vehicle:'car'},
 {id:'tag-boost',name:'Overdrive',power:'boost',vehicle:'bike'},
];
/** Rider cards borrow a brand card's ratings (never an RPM bank card). */
export function archetypeFor(identity: string): BattleCard { let h=0; for(const c of identity) h=(h*31+c.charCodeAt(0))>>>0; return BRAND_CARDS[h%BRAND_CARDS.length]; }
export function unlockCard(id: 'demo'|'dev'): BattleCard { const base=CATALOG.find(c=>c.id===(id==='demo'?'mx5':'mt07'))!; return {...base,id,manufacturer:'Blacktop',name:id==='demo'?'Demo':'Dev',source:'unlock'}; }

/** Shop categories; prices mirror `cw_cat_cost` on the server (a spin is a sixth of a card). */
export type ShopCategory = 'road' | 'race' | CardBank;
export const SHOP_CATEGORIES: { id: ShopCategory; label: string; price: number; odds: string }[] = [
 { id: 'road', label: 'Road', price: 60, odds: '50%' },
 { id: 'race', label: 'Race', price: 100, odds: '30%' },
 { id: 'gtlm', label: 'GTLM', price: 180, odds: '8%' },
 { id: 'tt', label: 'Isle of Man TT', price: 180, odds: '8%' },
 { id: 'f1', label: 'F1', price: 400, odds: '2%' },
 { id: 'motogp', label: 'MotoGP', price: 400, odds: '2%' },
];
export const spinCost = (price: number) => Math.floor(price / 6);
export const categoryOf = (c: BattleCard): ShopCategory => c.bank ?? (c.spec === 'race' ? 'race' : 'road');
