# Week sprint plan (Oct 13 → Oct 20, 2026): toward a publishable GTA-style police game

Process: spec first (docs/GAME_DESIGN.md), small vertical slices, each one PR → squash-merge → live check, headless 412×915 play-test, perf budget (phones on low quality: ≤ ~60 draw calls in street mode, no per-frame allocations in hot loops).

## P0: gameplay core (must ship)
1. ✅ (Oct 13) Procedural dispatch generator (Dispatch.ts): endless radio calls for free patrol, of 5 kinds (robbery, chase, gang, hostage, runner), placed on real roads, scaled by rank. "Free patrol" in the menu, and the story continues into patrol after mission 12.
2. ✅ (Oct 13) Road graph plus A* (City.ts): 25 intersections. The suspect car flees along the graph, fleeing suspects on foot path along it too, and the minimap draws the GPS route.
3. ✅ (Oct 13) Headless verification of story missions 4–12 (shootouts with cover, hostage, boss).
4. Driving feel: drift and handbrake, camera lag at speed, collisions with traffic (car push and damage), a siren button.
5. Suspect AI v2: flanking and changing cover, suspect cars ramming, PIT maneuver to stop a fleeing car.
6. Combat v2: manual aim drag on mobile, a headshot-free hit model, ammo pickups, armor vest pickups at the precinct.

## P1: content and presentation
7. Precinct hub: spawn point, armory (spend money on weapons: pistol → shotgun → rifle), garage (car upgrades).
8. More mission types: DUI stop, speed trap, drug-bust raid with entry, VIP escort, bank heist with several waves.
9. Story cutscenes: camera fly-ins plus letterbox dialogue at the start and end of missions.
10. Audio pass: radio chatter clips (CC0), per-district ambience, dynamic music intensity tied to threat.
11. Visual pass: day/night cycle in street mode, rain toggle, wet-road reflections on high quality, LOD for far blocks.
12. Pedestrian v2: crosswalk use, idle groups, reactions to sirens. Traffic v2: lane changes, pulling over for sirens.

## P2: publish readiness
13. Onboarding tutorial overlay and a controls remap screen, with full Arabic and English localisation.
14. Save and cloud sync of the new stats (weapons, cars, patrol stats); leaderboard of best mission times (Neon, protected by row-level security).
15. Performance: GPU timing on real phones, adaptive quality, asset compression audit (meshopt and KTX2).
16. Store packaging: PWA install prompt, icons and screenshots, privacy policy page, a crash and error beacon.
17. QA: scripted headless regression for all 12 missions plus 20 random patrol calls, run in CI on every PR.

## Risks
- The box gets overloaded with long headless runs: keep them under 5 minutes and run one browser at a time.
- Asset licences: use only CC0 or CC-BY, recorded in CREDITS.md.
