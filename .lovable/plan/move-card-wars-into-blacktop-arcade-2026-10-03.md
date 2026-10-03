# Move Card Wars into Blacktop Arcade

- Add Card Wars alongside the other Arcade games and remove its separate World button.
- Keep deck building inside Card Wars and won cards in the World vault.
- Return to Arcade when leaving Card Wars; keep existing opt-in requirements.

## Technical details
- Use `/arcade/card-wars` for new navigation and QR invitations.
- Redirect old `/world/card-wars` links while preserving battle codes.
- Verify placement and navigation without changing battle rules.