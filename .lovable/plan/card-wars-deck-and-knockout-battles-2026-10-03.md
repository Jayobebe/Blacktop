# Card Wars deck and knockout battles

## Deck page
- Show the selected five cards in the same two-over-three arrangement as battle, with three vault-style dog tags alongside.
- Tapping a slot opens a replacement list overlay. Cards keep their complete trading-card faces and show green up/red down arrows for each comparable stat against the current card; equal stats stay neutral and cars never show lean.
- Dog-tag replacements show the actual Spectre faces and their power, retaining one tag per power and preventing duplicate cards.
- Keep hidden-peak cards excluded and respect battle locks and riding restrictions.

## Starting a battle
- Replace the Deck/Computer/Players tabs with a Battle button at the top of the deck page.
- The button opens a choice overlay for computer battles or player invitations, codes and QR scanning.
- Active battles remain a separate view with only Forfeit at the top; results and rewards return to deck editing when finished.

## Battle ending
- Remove the five-round finish: surviving cards can be chosen again, and normal victory happens only when every opposing card reaches zero HP.
- Keep round numbers increasing and choose a valid hidden category every round, including beyond round five.
- Apply the same knockout rule to computer battles and authoritative player settlement; explicit forfeits and connection-expiry safeguards remain.

## Technical details and checks
- Reuse the existing card faces, proportional hand grid, dialog controls and singleton vault.
- Update client combat and the server battle function together, without moving online damage or point calculations onto the device.
- Verify slot replacement, comparison arrows, battle choice overlay and knockout combat beyond round five; inspect portrait/landscape layouts and app diagnostics.