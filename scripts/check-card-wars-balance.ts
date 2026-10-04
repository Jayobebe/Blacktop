import { strict as assert } from 'node:assert';
import { BRAND_CARDS } from '../src/features/card-wars/lib/catalog';
import { createComputerDeck, createRun, estimatePlayerWins, playRound, shuffle } from '../src/features/card-wars/lib/engine';

// Run with bun scripts/check-card-wars-balance.ts; independent seeds evaluate
// the selected decks, rather than reusing matchmaking's own random samples.
function rng(seed: number) {
 return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
const random = rng(2414);
const power = (c: typeof BRAND_CARDS[number]) => Object.values(c.ratings).reduce((a, b) => a + b, 0);
const sorted = BRAND_CARDS.slice().sort((a, b) => power(a) - power(b));
const cases = [
 { name: 'mixed', player: shuffle(BRAND_CARDS, rng(18)).slice(0, 5) },
 { name: 'low', player: sorted.slice(0, 5) },
 { name: 'high', player: sorted.slice(-5) },
];
for (const { name, player } of cases) {
 let wins = 0;
 for (let i = 0; i < 30; i++) {
  const deck = createComputerDeck(player, random);
  assert.equal(new Set(deck.map(c => c.id)).size, 5);
  assert.ok(deck.every(c => BRAND_CARDS.includes(c)), 'Original earnable catalog cards only');
  wins += estimatePlayerWins(player, deck, 1024, 5000 + i);
 }
 const rate = wins / 30;
 assert.ok(Math.abs(rate - .51) < .045, `${name}: ${rate} outside balance tolerance`);
 console.log(`${name}: ${(rate * 100).toFixed(1)}% neutral player wins`);
}
const player = shuffle(BRAND_CARDS, random).slice(0, 5);
let run = createRun(player, random);
const initial = JSON.stringify(run.opponent);
for (let i = 0; i < 400 && !run.result; i++) {
 const alive = run.hp[0].map((v, index) => v > 0 ? index : -1).filter(index => index >= 0);
 run = playRound(run, alive[Math.floor(random() * alive.length)], undefined, random);
}
assert.ok(run.result && run.hp.some(hand => hand.every(hp => hp === 0)), 'Full-deck knockout ends battle');
assert.equal(JSON.stringify(run.opponent), initial, 'Computer deck and ratings stay fixed throughout battle');
assert.deepEqual(JSON.parse(JSON.stringify(run)).opponent, run.opponent, 'Deck survives persistence');
assert.throws(() => createRun(player.slice(0, 4)), /five unique cards/);
console.log('Catalog integrity, persistence, deck validation and knockout checks passed.');