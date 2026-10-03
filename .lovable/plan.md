# Card Wars deck and vault separation

## Changes
- Keep the five-card, three-dog-tag deck builder inside Card Wars, labelled **Deck**, not Vault.
- Choose cards from the collection there; removing a card from the deck does not remove it from the vault.
- Arrange the vault into three lists: **Scanned cards**, **Won cards** (battle cards), and **Dog tags**. Preserve your own vehicle cards alongside scanned cards.
- Show computer-battle rewards in Won cards immediately after choosing one. They remain available to add to your deck inside Card Wars.
- Keep existing scanning, card sharing and dog-tag results intact; no deck-editing controls in the vault.

## Technical details
- Reuse the existing local reward store, exposed through a lightweight feature export, without importing the battle screen into the collection.
- Keep rewards Burn-cleared, preserve existing saved decks and avoid database changes.
- Check reward-list updates and deck removal without manually running builds.