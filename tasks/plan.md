# Plan: Gang City campaign
1. Levels.ts → 12 story missions as step scripts (data only). AC: tsc passes, menu lists 12.
2. Npc.ts → player weapon/health (rank-based), Suspect state machine (surrender/flee/fight+cover, boss), hostage, tracers, reticle, panic hook. AC: unit behaviour visible in headless run.
3. StreetPlay → mission runner (radio, goto, chase, suspects), radio UI, order/cuff buttons, gun in hand + recoil, ped avoidance+flee, traffic lights, realistic peds on low, threat meter, rank/XP on result. AC: missions 1–3 played headless with screenshots.
4. PR → merge → verify live bundle.
