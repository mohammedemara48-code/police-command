# Backlog — Police Command

Week target: publishable GTA-style police game by Tue 20 Oct 2026 20:30 Asia/Riyadh.

## Done

- P0.1 Procedural dispatch + free patrol
- P0.2 Road graph + A* GPS (#9 era)
- P0.3 Story missions 4–12 headless checks
- P0.4 Driving feel — steering, handbrake, traffic box hits, siren, PIT (#46 / #47 / #51)
- P0.5 Suspect AI v2 — cover/flank, suspect-car rams (#48)
- P0.6 Combat v2 — mobile aim, body-zone hits, ammo packs, officer crate cover, armor 0–100 (#52 / #53)
- P0.7 Foot collision + compact HUD — officer stops at cars, cover crates and avenue building fronts; health/armor as circular rings; landscape layout keeps rings and action buttons apart (this branch)

## Next

1. **Realistic characters** — natural faces and proportions (free/CC0 models), smoother walk; top visual priority after collision/HUD.
2. **P1 precinct hub** — armory spend, garage upgrades, mission board polish (hub shell already opens at the door).
3. More mission types (DUI, speed trap, raid waves, VIP escort).
4. Story cutscenes + letterbox dialogue.
5. Audio pass (radio chatter, district ambience, threat music).
6. Visual pass (day/night in street mode, rain, LODs).
7. Pedestrian / traffic v2 (crosswalks, siren pull-over lanes).

## Later (publish)

- Onboarding + AR/EN localisation
- Cloud save of weapons/cars; mission-time leaderboard
- Phone perf audit (GPU timing, meshopt/KTX2)
- Store packaging (PWA prompt, privacy page)
- CI headless regression for all 12 missions + random patrol calls

## Notes

- Leave Dependabot three.js major (#43) alone until verified.
- Disconnect leftover Cloudflare "Workers Builds" check if it still fails PRs (Vercel is the only host).
