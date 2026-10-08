import { strict as assert } from 'node:assert';
import { BRAND_CARDS, CATALOG } from '../src/features/card-wars/lib/catalog';
import { COMPUTER_WIN_TARGET, createComputerDeck, createRun, deadlocked, estimatePlayerWins, playRound, prizesFor, shuffle } from '../src/features/card-wars/lib/engine';
import { setEventsEnabled } from '../src/features/card-wars/lib/events';
import { DAMAGE, LEVEL, PRIZE_REACH, QUICK, RULES, levelPay, levelRounds, repairCost, tierOdds, tierOfPrice, wearLoss } from '../src/features/card-wars/lib/rules';
import { fieldStrength, ratingFromStrength } from '../src/features/card-wars/lib/strength';
import { flipCategory, slotRef, tagStrength, vehicleTag } from '../src/features/card-wars/lib/tagRules';
import { REDLINE, REDLINES, WILD_TAG } from '../src/features/card-wars/lib/redline';
import type { BattleCard, DogTag } from '../src/features/card-wars/types';

// npm run cardwars:check
// Independent seeds judge the decks the computer picks, rather than reusing
// matchmaking's own random samples.
function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const random = rng(2414);

// ── The computer's deck: a fair fight at every level ──
const pool = CATALOG;
const sorted = pool.slice().sort((a, b) => fieldStrength(a, CATALOG) - fieldStrength(b, CATALOG));
const cases: { name: string; player: BattleCard[]; tolerance: number }[] = [
  { name: 'mixed', player: shuffle(BRAND_CARDS, rng(18)).slice(0, 5), tolerance: 0.045 },
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
assert.deepEqual([0, 1, 7, 10, 18, 60].map((n) => wearLoss(false, n)), [0, 1, 7, 10, 26, 45], 'Road cards: 1 a round, 1 more past the tenth, 45 at most');
assert.deepEqual([7, 12, 30].map((n) => wearLoss(true, n)), [14, 26, 45], 'Race builds: 2 a round');
console.log(`Wear: 7 rounds ${wearLoss(false, 7)}%, 18 rounds ${wearLoss(false, 18)}% (race builds ${wearLoss(true, 7)}% and ${wearLoss(true, 18)}%)`);

// ── Builds: any three tags (even the same power three times), Spectre tags, cheaper upkeep ──
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

// ── Levels and quick play ──
assert.deepEqual([levelPay('easy', 'win'), levelPay('medium', 'win'), levelPay('medium', 'draw'), levelPay('medium', 'loss'), levelPay('hard', 'win')], [0, 8, 4, 3, 15], 'Easy pays nothing, medium half, hard all of it');
assert.deepEqual([levelRounds('easy', 9), levelRounds('medium', 9), levelRounds('hard', 9), levelRounds('easy', 1), levelRounds(undefined, 9), levelRounds('easy', 0)], [3, 6, 9, 1, 9, 0], 'Easy and medium count fewer rounds towards wear');
const five = shuffle(BRAND_CARDS, rng(41)).slice(0, 5);
// Hard: the computer arms dog tags (three at most, each once); easy never does.
let armed = 0;
for (let g = 0; g < 12; g++) {
  const r = rng(600 + g);
  let hard = createRun(five, r, { level: 'hard' });
  for (let i = 0; i < 400 && !hard.result; i++) hard = playRound(hard, hard.hp[0].findIndex((v) => v > 0), undefined, r);
  const used = hard.log.flatMap((l) => (l.rivalTag ? [l.rivalTag] : []));
  assert.ok(used.length <= 3 + hard.log.filter((l) => l.event === 'redflag').length, 'The computer has three dog tags');
  armed += used.length;
}
assert.ok(armed > 6, `On hard the computer uses its dog tags (${armed} in 12 battles)`);
let easy = createRun(five, rng(7), { level: 'easy' });
for (let i = 0; i < 400 && !easy.result; i++) easy = playRound(easy, easy.hp[0].findIndex((v) => v > 0), undefined, random);
assert.ok(easy.log.every((l) => !l.rivalTag), 'On easy it has none');
// Quick play: the theme comes up most, sudden death starts low, bare knuckle has no tags.
let themed = createRun(five, rng(8), { level: 'hard', mode: 'themed', theme: 'corners' });
let rounds = 0;
let onTheme = 0;
for (let g = 0; g < 8; g++) {
  themed = createRun(five, rng(80 + g), { level: 'hard', mode: 'themed', theme: 'corners' });
  for (let i = 0; i < 400 && !themed.result; i++) themed = playRound(themed, themed.hp[0].findIndex((v) => v > 0), undefined, random);
  rounds += themed.log.filter((l) => !l.flips && !l.first && l.event !== 'rapture').length;
  onTheme += themed.log.filter((l) => !l.flips && !l.first && l.event !== 'rapture' && l.category === 'corners').length;
}
assert.ok(onTheme / rounds > 0.5 && onTheme / rounds < 0.75, `The theme takes about ${Math.round((QUICK.themeShare + (1 - QUICK.themeShare) / 4) * 100)}% of rounds (${Math.round((onTheme / rounds) * 100)}%)`);
assert.ok(createRun(five, rng(9), { level: 'hard', mode: 'sudden', theme: 'speed' }).hp.flat().every((v) => v === QUICK.suddenHp), 'Sudden death starts every card low');
const tagB: DogTag = { id: 'tag-boost', name: 'Overdrive', power: 'boost' };
let bare = createRun(five, rng(10), { level: 'hard', mode: 'bare', theme: 'speed' });
for (let i = 0; i < 400 && !bare.result; i++) bare = playRound(bare, bare.hp[0].findIndex((v) => v > 0), tagB, random);
assert.ok(bare.usedTags.length === 0 && bare.log.every((l) => !l.tag && !l.rivalTag), 'Bare knuckle: no dog tags on either side');
console.log(`Levels: neutral targets easy ${LEVEL.easy.target}, medium ${LEVEL.medium.target}, hard ${LEVEL.hard.target} (and hard picks its cards and arms ${armed} dog tags in 12 battles)`);

// ── Dog tags ──
const fresh = () => createRun(player, rng(7));
const trials = 400;
// Overdrive: the rating that's compared is the card's times the tag's strength.
{
  const tag = vehicleTag('boost', 'gp23')!;
  const next = playRound(fresh(), 0, tag, rng(3));
  const last = next.log[0];
  const card = next.player[0];
  assert.equal(last.values![0], Math.round(card.ratings[last.category] * (tagStrength(tag, card) / 100) * 10) / 10, 'Overdrive multiplies the rating');
  assert.deepEqual(next.usedTags, [tag.id]);
  assert.equal(playRound(next, 1, tag, rng(4)), next, 'A used tag can\'t be armed again');
}
// Pit medic: HP back before the round, never past 100.
{
  const tag = vehicleTag('heal', 'gs')!;
  const hurt = fresh();
  hurt.hp[0][0] = 30;
  const next = playRound(hurt, 0, tag, rng(5));
  const last = next.log[0];
  const healed = Math.min(100, 30 + tagStrength(tag, hurt.player[0]));
  assert.equal(next.hp[0][0], last.winner === 1 ? Math.max(0, healed - last.damage) : healed, 'Pit medic heals first');
}
// Second chance: only ever replays a round that was lost, and wins more rounds than playing without it.
{
  const tag = vehicleTag('reroll', 'gt3r')!;
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
  assert.ok(replays > 0 && withTag > without, `Second chance should win more rounds (${withTag} against ${without})`);
  console.log(`Second chance: ${withTag} rounds won of ${trials} against ${without} without it (${replays} replays)`);
}
// Coin flip: the category is the card's best rating on heads and its worst on tails, about as often as the tag says.
{
  const tag = vehicleTag('flip', 'f2004')!;
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
// ── Spins by tier: the server reads a card's tier from its price, the app's frames from its rating ──
{
  const frame = (r: number) => (r >= 90 ? 6 : r >= 80 ? 5 : r >= 70 ? 4 : r >= 60 ? 3 : r >= 50 ? 2 : 1);
  for (const c of CATALOG) {
    const rating = ratingFromStrength(fieldStrength(c, CATALOG));
    assert.equal(tierOfPrice(c.price ?? 0), frame(rating), `${c.id} (rating ${rating}, ${c.price} RPM): its price puts it in another tier than its frame. Move the lines in rules.ts SPIN_TIERS and in cw_card_tier together.`);
  }
  const f1 = tierOdds(CATALOG.filter((c) => c.bank === 'f1').map((c) => c.price ?? 0));
  assert.deepEqual(f1.map((x) => [x.tier, Math.round(x.share * 100)]), [[2, 40], [4, 30], [5, 20], [6, 10]], 'F1: Silver 40, Platinum 30, Diamond 20, Obsidian 10');
  for (let i = 1; i < f1.length; i++) assert.ok(f1[i].share < f1[i - 1].share, 'The higher the tier, the rarer');
  console.log(`Spin tiers: F1 ${f1.map((x) => Math.round(x.share * 100) + '%').join(' / ')} from the lowest tier up`);
}
// ── Redline cards and the Wildcard ──
{
  assert.equal(REDLINES.length, 10);
  assert.equal(new Set(REDLINES.map((c) => c.id)).size, REDLINES.length, 'Redline ids are unique');
  for (const c of REDLINES) {
    const main = [c.ratings.speed, c.ratings.g, c.ratings.distance, c.ratings.corners];
    assert.equal(main.reduce((a, b) => a + b, 0), REDLINE.budget, `${c.id}: the four main ratings add up to ${REDLINE.budget}`);
    assert.ok(main.includes(100) && main.includes(0), `${c.id}: a 100 and a 0`);
    assert.ok(!CATALOG.some((k) => k.id === c.id), `${c.id} isn't a catalogue card: it can't be put in a deck`);
  }
  const wheel = REDLINES.slice(0, REDLINE.wheel);
  const withWheel = () => createRun(player, rng(7), { wheel });
  const landed = new Set<string>();
  let rounds = 0;
  for (let i = 0; i < trials; i++) {
    const before = withWheel();
    const next = playRound(before, i % 5, WILD_TAG, rng(4000 + i));
    const last = next.log[0];
    if (last.event === 'gremlin' || last.event === 'rapture') {
      assert.ok(!last.wild, 'A jammed Wildcard lands on nothing');
      continue;
    }
    rounds++;
    const red = wheel.find((c) => c.id === last.wild);
    assert.ok(red, 'The Wildcard lands on a card from the wheel');
    landed.add(red.id);
    assert.notEqual(last.category, 'lean', 'A Redline never fights in Lean');
    assert.equal(last.player, before.player[i % 5].id, "The round is still logged against the player's own card (it takes the hit and the wear)");
    if (!last.event && !last.first) assert.equal(last.values![0], red.ratings[last.category], "The Redline's rating is what's compared");
    assert.ok(red.ratings[last.first ?? last.category] > 0, 'The rev counter never stops on a 0');
    if (last.winner === 1 && last.event !== 'photo') assert.equal(next.hp[0][i % 5], before.hp[0][i % 5], "A Redline that loses takes the loss itself: the player's card isn't touched");
    if (last.winner === 0 && !last.event) assert.equal(last.damage, DAMAGE.cap, 'A Redline that wins hits at full strength');
    if (last.event !== 'redflag') assert.deepEqual(next.usedTags, [WILD_TAG.id], 'One use a battle');
  }
  assert.equal(landed.size, wheel.length, 'Every card on the wheel comes up');
  // Builds are back to one of each power: the slots a server would refuse are never offered (Garage), so only the
  // rule's own numbers are checked here.
  // Without a wheel the tag does nothing but get spent.
  const bare = playRound(fresh(), 0, WILD_TAG, rng(11)).log[0];
  assert.ok(!bare.wild);
  assert.equal(slotRef(WILD_TAG), 'wild:', 'The slot as the server takes it');
  console.log(`Wildcard: ${rounds} rounds, landed on all ${landed.size} of the wheel, never in Lean`);
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
