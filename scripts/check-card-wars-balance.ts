import { strict as assert } from 'node:assert';
import { BRAND_CARDS, CATALOG } from '../src/features/card-wars/lib/catalog';
import { COMPUTER_WIN_TARGET, createComputerDeck, createRun, deadlocked, estimatePlayerWins, playRound, prizesFor, shuffle } from '../src/features/card-wars/lib/engine';
import { setEventsEnabled } from '../src/features/card-wars/lib/events';
import { BUILDS, PRIZE_DECK, PRIZE_REACH, RULES, V2, WEAR_BY_ROUND, repairCost, wearLoss } from '../src/features/card-wars/lib/rules';
import { fieldStrength } from '../src/features/card-wars/lib/strength';
import { flipCategory, slotRef, tagStrength, vehicleTag } from '../src/features/card-wars/lib/tagRules';
import type { BattleCard, DogTag } from '../src/features/card-wars/types';

// npm run cardwars:check (first rule set), or with CW_RULES=2 for the second.
// Independent seeds judge the decks the computer picks, rather than reusing
// matchmaking's own random samples.
function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const random = rng(2414);
console.log(`Card Wars, rule set ${V2 ? 2 : 1}`);

// ── The computer's deck: a fair fight at every level ──
const pool = V2 ? CATALOG : BRAND_CARDS;
const sorted = pool.slice().sort((a, b) => fieldStrength(a, CATALOG) - fieldStrength(b, CATALOG));
const cases: { name: string; player: BattleCard[]; tolerance: number }[] = [
  // The first rule set's catalogue is half the size: its decks land a little further off.
  { name: 'mixed', player: shuffle(BRAND_CARDS, rng(18)).slice(0, 5), tolerance: V2 ? 0.045 : 0.07 },
  { name: 'middling', player: sorted.slice(Math.floor(sorted.length / 2) - 2, Math.floor(sorted.length / 2) + 3), tolerance: 0.045 },
  // The five weakest and the five strongest cards have nothing below or above them to meet:
  // the computer gets as near as the catalogue allows.
  { name: 'weakest', player: sorted.slice(0, 5), tolerance: 0.2 },
  { name: 'strongest', player: sorted.slice(-5), tolerance: 0.2 },
];
for (const { name, player, tolerance } of cases) {
  let wins = 0;
  let shared = 0;
  for (let i = 0; i < 30; i++) {
    const deck = createComputerDeck(player, random);
    assert.equal(new Set(deck.map((c) => c.id)).size, 5);
    assert.ok(deck.every((c) => pool.includes(c)), 'Only cards the computer may field');
    const copies = deck.filter((c) => player.some((p) => p.id === c.id)).length;
    assert.ok(copies < 5, "Never the player's own deck");
    shared += copies;
    wins += estimatePlayerWins(player, deck, 1024, 5000 + i);
  }
  const rate = wins / 30;
  assert.ok(Math.abs(rate - COMPUTER_WIN_TARGET) < tolerance, `${name}: ${rate} outside balance tolerance`);
  // Copies of the player's own cards only tie with them: there should be few, and none for an ordinary deck.
  if (tolerance < 0.1) assert.ok(shared / 30 < 0.5, `${name}: ${shared / 30} of the player's own cards per deck`);
  console.log(`${name}: ${(rate * 100).toFixed(1)}% neutral player wins, ${(shared / 30).toFixed(1)} of their own cards per computer deck`);
}

// ── A battle, start to knockout ──
const player = shuffle(BRAND_CARDS, random).slice(0, 5);
let run = createRun(player, random);
const initial = JSON.stringify(run.opponent);
const prizes = run.prizes ?? run.opponent;
assert.equal(new Set(prizes.map((c) => c.id)).size, 5, 'Five different prizes');
if (PRIZE_DECK) {
  // The prize table is the computer's deck: a shop-only card stays when it's within reach of the deck that won.
  const dear = sorted.slice(-5);
  const bank = dear.filter((c) => c.bank);
  assert.ok(bank.length > 0, 'The strongest cards include shop-only ones');
  assert.deepEqual(prizesFor(dear, dear, random).map((c) => c.id), dear.map((c) => c.id), "A deck as dear as the computer's wins the computer's own cards");
  const cheap = sorted.slice(0, 5);
  const swappedOut = prizesFor(dear, cheap, random);
  const limit = PRIZE_REACH * Math.max(...cheap.map((c) => c.price ?? 0));
  assert.ok(swappedOut.length === 5 && swappedOut.every((c) => !c.bank || (c.price ?? 0) <= limit), 'A shop-only card out of reach is swapped for a Road or Race one');
  assert.ok(prizes.every((c) => run.opponent.some((o) => o.id === c.id) || !c.bank), "Prizes are the computer's own cards");
} else {
  assert.ok(prizes.every((c) => !c.bank), 'Prizes are Road and Race cards only');
}
assert.deepEqual([...run.rewardOrder].sort(), prizes.map((c) => c.id).sort(), 'The shuffle holds exactly the prizes');
for (let i = 0; i < 400 && !run.result; i++) {
  const alive = run.hp[0].map((v, index) => (v > 0 ? index : -1)).filter((index) => index >= 0);
  run = playRound(run, alive[Math.floor(random() * alive.length)], undefined, random);
}
assert.ok(run.result && run.hp.some((hand) => hand.every((hp) => hp === 0)), 'Full-deck knockout ends battle');
assert.equal(JSON.stringify(run.opponent), initial, 'Computer deck and ratings stay fixed throughout battle');
assert.deepEqual(JSON.parse(JSON.stringify(run)).opponent, run.opponent, 'Deck survives persistence');
assert.ok(run.log.every((l) => l.event === 'rapture' ? !l.values : l.values && (l.event === 'redflag' || l.event === 'photo' || (l.winner === null) === (l.values[0] === l.values[1]))), 'Every round logs what was compared');
// The checks below test the plain rules, without round events.
setEventsEnabled(false);
assert.throws(() => createRun(player.slice(0, 4)), /five unique cards/);

// ── Wear: by the rounds a card fought, so leaning on the best card costs it ──
if (WEAR_BY_ROUND) {
  assert.deepEqual([0, 1, 7, 10, 18, 60].map((n) => wearLoss(false, n)), [0, 1, 7, 10, 26, 45], 'Road cards: 1 a round, 1 more past the tenth, 45 at most');
  assert.deepEqual([7, 12, 30].map((n) => wearLoss(true, n)), [14, 26, 45], 'Race builds: 2 a round');
  console.log(`Wear: 7 rounds ${wearLoss(false, 7)}%, 18 rounds ${wearLoss(false, 18)}% (race builds ${wearLoss(true, 7)}% and ${wearLoss(true, 18)}%)`);
} else {
  assert.equal(wearLoss(false, 20), RULES.wear.road, 'The flat rule charges the same however often a card is played');
  assert.equal(wearLoss(true, 1), RULES.wear.race);
}

// ── Builds: any three tags (even the same power three times), Spectre tags, cheaper upkeep ──
if (BUILDS) {
  const fresh2 = createRun(shuffle(BRAND_CARDS, rng(7)).slice(0, 5), rng(8));
  const a: DogTag = { id: 'tag-boost', name: 'Overdrive', power: 'boost' };
  const b: DogTag = { id: 'spectre:x', name: 'Rico', power: 'boost', vehicle: 'any' };
  const one = playRound(fresh2, 0, a, rng(9));
  const alive = one.hp[0].findIndex((v) => v > 0);
  const two = one.result ? one : playRound(one, alive, b, rng(10));
  assert.ok(one.usedTags.includes(a.id) || one.log[0].event === 'gremlin', 'The first Overdrive is spent');
  assert.ok(two.result || two.usedTags.includes(b.id) || two.log[1].event === 'gremlin', 'A second Overdrive in the same deck can still be armed');
  assert.equal(tagStrength(b, { vehicle: 'car' }), tagStrength(b, { vehicle: 'bike' }), 'A Spectre tag is as strong with a car as with a bike');
  assert.ok(tagStrength(b) > tagStrength(a), 'and stronger than the plain tag');
  assert.deepEqual([slotRef(a), slotRef(b), slotRef(undefined)], ['boost:', 'boost:~all', '-'], 'Slots as the server takes them');
  assert.equal(repairCost(400, 50), 50, 'A repair costs a quarter of the price for a full one');
  assert.equal(RULES.wear.rest, 15);
}

// ── Dog tags ──
const plain = (power: DogTag['power']): DogTag => ({ id: `tag-${power}`, name: power, power });
const fresh = () => createRun(player, rng(7));
const trials = 400;
// Overdrive: the rating that's compared is the card's times the tag's strength.
{
  const tag = V2 ? vehicleTag('boost', 'gp23')! : { ...plain('boost'), vehicle: 'bike' as const };
  const next = playRound(fresh(), 0, tag, rng(3));
  const last = next.log[0];
  const card = next.player[0];
  assert.equal(last.values![0], Math.round(card.ratings[last.category] * (tagStrength(tag, card) / 100) * 10) / 10, 'Overdrive multiplies the rating');
  assert.deepEqual(next.usedTags, [tag.id]);
  assert.equal(playRound(next, 1, tag, rng(4)), next, 'A used tag can\'t be armed again');
}
// Pit medic: HP back before the round, never past 100.
{
  const tag = V2 ? vehicleTag('heal', 'gs')! : { ...plain('heal'), vehicle: 'car' as const };
  const hurt = fresh();
  hurt.hp[0][0] = 30;
  const next = playRound(hurt, 0, tag, rng(5));
  const last = next.log[0];
  const healed = Math.min(100, 30 + tagStrength(tag, hurt.player[0]));
  assert.equal(next.hp[0][0], last.winner === 1 ? Math.max(0, healed - last.damage) : healed, 'Pit medic heals first');
}
// Second chance: only ever replays a round that was lost, and wins more rounds than playing without it.
{
  const tag = V2 ? vehicleTag('reroll', 'gt3r')! : plain('reroll');
  let withTag = 0;
  let without = 0;
  let replays = 0;
  for (let i = 0; i < trials; i++) {
    const a = playRound(fresh(), i % 5, tag, rng(100 + i)).log[0];
    const b = playRound(fresh(), i % 5, undefined, rng(100 + i)).log[0];
    if (a.winner === 0) withTag++;
    if (b.winner === 0) without++;
    if (a.first) {
      replays++;
      assert.notEqual(a.first, a.category, 'The replay is in another category');
      assert.equal(b.winner, 1, 'Only a lost round is replayed');
    }
  }
  if (V2) {
    assert.ok(replays > 0 && withTag > without, `Second chance should win more rounds (${withTag} against ${without})`);
    console.log(`Second chance: ${withTag} rounds won of ${trials} against ${without} without it (${replays} replays)`);
  } else {
    assert.equal(replays, 0);
  }
}
// Coin flip: the category is the card's best rating on heads and its worst on tails, about as often as the tag says.
{
  const tag = V2 ? vehicleTag('flip', 'f2004')! : plain('flip');
  let heads = 0;
  for (let i = 0; i < trials; i++) {
    const next = playRound(fresh(), i % 5, tag, rng(900 + i));
    const last = next.log[0];
    const card = next.player[i % 5];
    const flip = last.flips?.[0];
    assert.ok(flip, 'A Coin flip is logged');
    assert.equal(last.category, flip.category, 'The round is fought in the category the coin picked');
    const faced = next.opponent.find((c) => c.id === last.opponent)!;
    if (last.event !== 'tyres') assert.equal(flip.category, flipCategory(card.ratings, faced.ratings, flip.heads), 'Heads is the best category against the card faced, tails the worst');
    assert.notEqual(flip.category, 'lean', 'Never Lean');
    if (flip.heads) heads++;
  }
  const expected = tagStrength(tag, fresh().player[0]) / 100;
  assert.ok(Math.abs(heads / trials - expected) < 0.09, `Coin flip landed heads ${heads} of ${trials}, expected about ${expected}`);
  console.log(`Coin flip: heads ${heads} of ${trials} (the tag says ${Math.round(expected * 100)}%)`);
}
// ── Stalemate: the same card left on both sides can never land a hit ──
{
  const twin = fresh();
  twin.opponent = twin.player.map((c) => ({ ...c }));
  twin.hp = [[100, 0, 0, 0, 0], [100, 0, 0, 0, 0]];
  assert.ok(deadlocked(twin), 'Two copies of one card are a stalemate');
  twin.hp[1] = [0, 100, 0, 0, 0];
  assert.ok(!deadlocked(twin), 'Different cards are not');
}
console.log('Matchmaking, prizes, persistence, knockout, dog tag and stalemate checks passed.');
