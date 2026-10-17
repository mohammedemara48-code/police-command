# Backlog — Police Command

Week target: publishable GTA-style police game by Tue 20 Oct 2026 20:30 Asia/Riyadh.

## Done

- P0.1 Procedural dispatch + free patrol
- P0.2 Road graph + A* GPS (#9 era)
- P0.3 Story missions 4–12 headless checks
- P0.4 Driving feel — steering, handbrake, traffic box hits, siren, PIT (#46 / #47 / #51)
- P0.5 Suspect AI v2 — cover/flank, suspect-car rams (#48)
- P0.6 Combat v2 — mobile aim, body-zone hits, ammo packs, officer crate cover, armor 0–100 (#52 / #53)
- P0.7 Foot collision + compact HUD — officer stops at cars, cover crates and avenue building fronts; health/armor as circular rings; landscape layout keeps rings and action buttons apart (#54)
- P0.8 Realistic characters polish — MakeHuman skin/face materials (soft sheen), shinier hair and clearer eyes, longer idle↔walk↔sprint blends, animated character-creator preview
- P1 Precinct hub (#56) — armory purchases (priced revolver/SMG), garage upgrades (engine/armor/brakes) with real driving effects, mission board lock/reward hints; street purse on progress save
- P1.1 More mission types (#57) — DUI stop (swerving car, slow siren response, driver arrest), speed trap (park on the radar spot, pull over 1–3 clocked speeders), drug-house raid (2–3 gunman waves); in random patrol and on the mission board, pay scales with rank
- P1.2 Story cutscenes — letterbox intro before and outro after each of the 12 campaign missions: camera rails over the live city, speaker badge + typewriter Egyptian Arabic lines, tap/Space to advance, Skip, HUD hidden and input locked; scripts in `src/story/cutscenes.ts`
- P1.3 VIP escort call — VIP sedan follows the road graph to a destination, waits for the escort, 1–2 ambushes (gunmen with crates) that also shoot the car, gold ⭐ VIP health ring, fail if it's destroyed; in random patrol and on the mission board (`src/game/logic/escort.ts`)

## Next

1. Audio pass (radio chatter, district ambience, threat music).
2. Visual pass (day/night in street mode, rain, LODs).
3. Pedestrian / traffic v2 (crosswalks, siren pull-over lanes; traffic yielding to the VIP convoy).
4. Story hook for the escort: a campaign beat that escorts the Scorpion case's state witness (reuse the `escort` step + a cutscene).

## Later (publish)

- Onboarding + AR/EN localisation
- Cloud save of weapons/cars; mission-time leaderboard
- Phone perf audit (GPU timing, meshopt/KTX2)
- Store packaging (PWA prompt, privacy page)
- CI headless regression for all 12 missions + random patrol calls

## Notes

- Leave Dependabot three.js major (#43) alone until verified.
- Disconnect leftover Cloudflare "Workers Builds" check if it still fails PRs (Vercel is the only host).
