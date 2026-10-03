import type { BattleCard, DogTag } from '../types';
// 0–100 game ratings, never manufacturer figures or recorded peaks.
const definitions: [string,string,'car'|'bike','factory'|'race',number[]][] = [
 ['mx5','Mazda MX-5','car','factory',[52,44,54,78,72]],
 ['gti','Volkswagen Golf GTI','car','factory',[62,38,58,80,62]],
 ['m3','BMW M3','car','factory',[82,35,78,58,62]],
 ['911','Porsche 911 GT3','car','factory',[88,32,82,48,65]],
 ['civic','Honda Civic Type R','car','factory',[70,40,72,64,72]],
 ['gr86','Toyota GR86 Cup','car','race',[62,42,82,42,88]],
 ['gt3r','Porsche 911 GT3 R','car','race',[94,28,94,32,68]],
 ['rally','Ford Fiesta Rally2','car','race',[72,40,90,42,90]],
 ['mt07','Yamaha MT-07','bike','factory',[62,78,48,72,70]],
 ['sv650','Suzuki SV650','bike','factory',[58,72,50,82,68]],
 ['ninja','Kawasaki Ninja 400','bike','factory',[54,84,48,68,86]],
 ['gs','BMW R 1250 GS','bike','factory',[64,58,55,94,58]],
 ['panigale','Ducati Panigale V4','bike','factory',[94,86,72,38,72]],
 ['r6','Yamaha YZF-R6 Cup','bike','race',[78,94,76,30,92]],
 ['s1000','BMW S 1000 RR race spec','bike','race',[96,88,84,24,78]],
 ['rs660','Aprilia RS 660 Trofeo','bike','race',[72,92,70,40,90]],
];
export const CATALOG: BattleCard[] = definitions.map(([id,fullName,vehicle,spec,v]) => {
 const [manufacturer, ...model] = fullName.split(' ');
 return {id,name:model.join(' '),manufacturer,vehicle,spec,archetype:id,ratings:{speed:v[0],lean:v[1],g:v[2],distance:v[3],corners:v[4]}};
});
/** Presentation metadata only: never replaces the catalog ratings used for battles. */
export function cardIdentity(name: string, makeModel?: string): Pick<BattleCard, 'manufacturer' | 'displayVehicle'> {
 const text = makeModel || name;
 const makes = ['Mercedes-Benz', 'Land Rover', 'Aston Martin', 'Harley-Davidson', 'Royal Enfield', 'Volkswagen', 'Kawasaki', 'Suzuki', 'Yamaha', 'Ducati', 'Aprilia', 'Triumph', 'KTM', 'Honda', 'BMW', 'Mazda', 'Porsche', 'Toyota', 'Ford', 'Audi', 'Tesla', 'Nissan', 'Peugeot', 'Renault', 'Volvo', 'Subaru', 'Hyundai', 'Kia', 'Lexus', 'Chevrolet', 'Ferrari', 'Lamborghini', 'McLaren', 'Mini'];
 const manufacturer = makes.find(make => new RegExp(`\\b${make}\\b`, 'i').test(text));
 const known = CATALOG.find(c => manufacturer === c.manufacturer && text.toLowerCase().includes(c.name.toLowerCase().replace(/ (cup|race spec|trofeo)$/, '')));
 const bikeMake = /^(Yamaha|Kawasaki|Suzuki|Ducati|Aprilia|Triumph|KTM|Harley-Davidson|Royal Enfield)$/;
 const carMake = /^(Mercedes-Benz|Land Rover|Aston Martin|Volkswagen|Mazda|Porsche|Toyota|Ford|Audi|Tesla|Nissan|Peugeot|Renault|Volvo|Subaru|Hyundai|Kia|Lexus|Chevrolet|Ferrari|Lamborghini|McLaren|Mini)$/;
 const displayVehicle = known?.vehicle || (manufacturer && bikeMake.test(manufacturer) ? 'bike' : manufacturer && carMake.test(manufacturer) ? 'car' : undefined);
 return {manufacturer, displayVehicle};
}
export const STARTERS = ['mx5','gti','mt07','sv650','ninja'];
export const STARTER_TAGS: DogTag[] = [
 {id:'tag-reroll',name:'Second chance',power:'reroll',vehicle:'bike'},
 {id:'tag-heal',name:'Pit medic',power:'heal',vehicle:'car'},
 {id:'tag-boost',name:'Overdrive',power:'boost',vehicle:'bike'},
];
export function archetypeFor(identity: string): BattleCard { let h=0; for(const c of identity) h=(h*31+c.charCodeAt(0))>>>0; return CATALOG[h%CATALOG.length]; }
export function unlockCard(id: 'demo'|'dev'): BattleCard { const base=CATALOG[id==='demo'?0:8]; return {...base,id,manufacturer:'Blacktop',name:id==='demo'?'Demo':'Dev',source:'unlock'}; }
