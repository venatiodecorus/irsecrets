# TODO

Planning document for finishing the game.

## Characters
- [x] Trust/mood evaluation - characters should react to appropriate player messages and update their trust/mood levels accordingly.
- [x] Irritation tuning - Probably the most important gamifying mechanic, if you irritate the characters too much you should enter a fail state (game over/kick).
- [ ] Win state - Define explicit win state, specific secret that should be uncovered.
- [ ] Tune secrets - Explicitly lay out progression of secrets, with perhaps multiple paths
- [ ] Characters should be aware of other characters' interests/boundaries and can tell you

## UI
- [x] Tab completion of character names
- [ ] Player stats display (messages sent, trust/irritation history)
- [ ] Game reset option after game over
- [ ] Monospace font for IRC look
- [ ] Activity notification on tabs
- [ ] Highlight specific secrets, interests, boundaries, etc when mentioned by a character? Makes things easier but gamifies it a bit more than just randomly chatting at bots

## Story
- [ ] Add right-wing hacker group story (simple for now, potentially will develop the narrative)

## System
- [ ] Rate limit user messages, don't allow anyone to spam the system
- [ ] Secure the API routes, only our app should be able to hit them
