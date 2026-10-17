# POLICE COMMAND — Game Design (v2 "Gang City" campaign)

## 1. Premise
You are **Officer Yasser**, a rookie who has just joined the force in a coastal city. A gang called **Al-Aqrab (the Scorpion)** has bought off half the precinct and controls the port, the downtown shops and the suburb drug houses. Sergeant **Mona** (radio dispatch) and Captain **Hamed** guide you through 12 story missions. Each mission strips away one piece of the gang until the final mission: arresting the boss, **Al-Zaeem**, at his suburb villa.

Tone: a game about arresting people. Non-gory. Suspects drop their weapon and fall over. They surrender when you get control of the scene. Shooting a suspect who has surrendered, or a civilian, is a failure.

## 2. Core loop
0. **Intro cutscene** (story missions only, see §2b): sets the scene before the mission clock starts.
1. **Radio dispatch:** dialogue lines, with who is speaking and portrait colour, set the situation.
2. **Drive with GPS:** the objective names a destination. The yellow beacon, the edge arrow plus distance and the minimap route all point to it. The step finishes on arrival (within a radius, measured in 2D, on foot or in the car).
3. **Scripted scenario** (one or more steps):
   - **Arrest:** aim at a suspect, press **«استسلم!»** to order him to surrender, walk up, press **«كلبش»** to handcuff (1.2 s).
   - **Foot flee:** the suspect runs away. Catch him (within 2.5 m) and he gives up.
   - **Car chase:** catch the car before it escapes, then the driver gets out and is arrested. Stay on its bumper to box it in, or nudge its rear quarter while running alongside (PIT) to spin it out and finish sooner.
   - **Shootout:** armed gang members take **cover** behind crates and cars, peek out and shoot. Hits on someone hiding are blocked by the cover.
   - **Hostage:** the captors are hostile and the hostage must not be hit.
4. **Outro + resolve:** after a win a short outro cutscene plays, then a summary with stars based on time, plus money, reputation and XP.
5. **Rank and unlocks:** XP raises your rank. Rank upgrades the pistol (magazine, damage) and the car (top speed). The next mission unlocks.

## 2b. Story cutscenes
Every campaign mission has an **intro** (before the clock starts, after «ابدأ المهمة») and a short **outro** (after a win, before the result card). Patrol calls have none.
- **Look:** black letterbox bars slide in, the HUD, pause button and toasts are hidden, and the camera runs on rails over the live city (traffic and pedestrians keep moving). Shots are framed around the mission spot (`scene`), the officer or the car he's driving (`hero`), or the patrol car (`car`), in a local frame so a script works wherever the mission is. Shots cut or glide (`blend`) from the previous camera; low shots that would end up inside a block are lifted over the roofs.
- **Dialogue:** speaker name and a round badge in the speaker's colour (same colours as the radio), a typewriter line in Egyptian Arabic (RTL; English text is kept next to each line for when the page is switched to English), and a narrator caption style for place/time cards.
- **Controls:** tap / click / Space / Enter finishes the line, again goes to the next one; lines also move on by themselves. «تخطي» (top bar, safe-area aware) skips the whole scene. Game input is blocked while it runs; held keys, stick and fire are cleared so nothing carries over.
- **Flow:** an intro plays once per session per mission (retries go straight in). Progress is saved before the outro, so skipping or closing the tab never loses a result. Leaving street mode or changing level stops a running cutscene.
- **Data:** scripts live in `src/story/cutscenes.ts` (shot presets + lines per mission), speakers in `src/story/speakers.ts`; the rail maths and dialogue timing are pure functions in `src/game/logic/cutscene.ts` (unit-tested, `tests/cutscene.test.ts`), the overlay is `src/game/ui/Cutscene.ts`.

## 3. Suspect AI (state machine)
`idle → (alerted by player within 18 m) → behaviour`

| behaviour | when ordered to surrender | when shot | other |
|---|---|---|---|
| `surrender` | hands up (stays put) | down (penalty: excessive force) | — |
| `flee` | 50%: hands up, else runs | stops and surrenders after 1 hit | caught within 2.5 m → surrenders; escapes beyond 90 m → mission failed |
| `fight` | ignores | 3 HP (boss 8). At ≤2 HP the boss surrenders | uses cover (see below). Hit chance 30% when peeking (12% if you are in the car), about half that while sidestepping, none while running between crates |

**Hit model** (`src/game/logic/combat.ts`): shots resolve as **torso** or **limb** only (roughly 70% / 30%). Limbs take ~55% damage. There is **no headshot / insta-kill** zone. The officer's vest absorbs most of each hit until empty; a full vest is 100 on the HUD ring. Ground **ammo packs** near shootouts (and one by the precinct parking) refill the magazine and add reserve. The armory locker can put on a full vest once per visit and restock ammo.

**Gunmen and cover** (`src/game/logic/cover.ts`): `advance → move → hide ↔ peek`, plus `flank`.
- A crate only protects a gunman when it is between him and you. Work round the side of it and your shots land.
- The officer can use the same crates: when you crouch behind a crate relative to a shooter, most of their round is blocked.
- He hides 1.6–2.4 s, then peeks and shoots for 1.3 s. After two peeks he may run to another free crate (never one you're standing next to) or sidestep round you (flank). If you get round his crate, he runs to its other side or to another one.
- Each shootout gets two spare crates at the sides of the group. Running and flanking gunmen are out in the open.
- How often they move or flank grows through the story (mission 4 → 12) and with your rank on patrol. Hostage takers never leave their crate.

**Suspect cars** (`src/game/logic/suspectCar.ts`): `flee → evade → ram → spun / boxed → surrender`.
- `evade`: with you on its tail it weaves a little in its lane.
- `ram`: when you're level with its doors it swipes sideways into you, and when you tailgate it brake-checks you. There is one ram at a time and a cooldown of 13 s on the first chase, down to 7 s on the fastest. Nothing happens in the first 6 s of a chase. A swipe costs a few % damage and shoves you.
- No rams while it's spun out by a PIT, once the box-in meter is past half, or while you're on foot.

Hostage: stands next to the captors. When all captors are down or cuffed, the hostage runs to safety. Hitting the hostage fails the mission.

## 4. Feedback
- **Threat meter** (★ to ★★★★★): rises with the number of armed hostiles and shots fired, falls when the scene is safe.
- **Reticle:** sits on the locked target. White means out of range, red means in range, a green ✓ means it can be cuffed.
- **Aim:** on desktop, click the 3D view to aim and fire. On a phone, drag a second finger on the canvas (not the HUD) to aim while holding **اضرب**; a light auto-aim assist gently pulls toward a nearby hostile in a small cone when you are not dragging.
- **Gun:** a pistol is visible in the officer's hand. Firing adds camera recoil, a muzzle flash, a tracer and the gunshot sound. Hit targets flinch and flash red. Body-zone hits (torso / limbs) set the damage; there are no headshot kills.
- **Pedestrians:** run away from gunfire (30 m radius, 6 s) and step around each other and the player.
- **Traffic:** cars stop at red lights at the three avenue intersections. Cross traffic runs on the opposite phase.

## 5. Ranks and upgrades
| Rank | XP | Pistol mag / dmg | Car top speed |
|---|---|---|---|
| مستجد (Rookie) | 0 | 12 / 1 | 12 (18 in chase) |
| شرطي (Officer) | 300 | 13 / 1 | +1 |
| رقيب (Sergeant) | 800 | 15 / 1.5 | +2 |
| ملازم (Lieutenant) | 1600 | 15 / 1.5 | +3 |
| نقيب (Captain) | 2800 | 17 / 2 | +4 |
| رائد (Major) | 4200 | 17 / 2 | +5 |

XP per mission = 100 + 50 × stars.

## 6. Fail conditions
The officer's health reaches 0. A suspect escapes (out of range or time limit). The hostage is hit. A suspect is shot after surrendering. Three or more civilians are hit.

## 7. Missions
1. **أول يوم (First Day):** Mona briefs you. Get in the car and drive to downtown. A shoplifter is there; order him to surrender and cuff him. *(tutorial: driving, GPS, arrest)*
2. **سرقة جارية (Robbery in Progress):** at a corniche shop. Robber A surrenders; robber B runs on foot.
3. **مطاردة الميناء (Port Chase):** a stolen car leaves the port. Chase it, then arrest the driver.
4. **شحنة مهربة (Smuggled Cargo):** a gunfight at the port containers against 3 armed members with cover.
5. **اضرب واهرب (Hit and Run):** a downtown chase. The driver gets out and runs on foot.
6. **رهينة (Hostage):** at the downtown bank. 2 captors and 1 hostage.
7. **ليلة الكورنيش (Corniche Night):** a fast chase followed by 2 armed passengers.
8. **مخزن العقرب (Scorpion Warehouse):** a warehouse on the east avenue. 4 armed members, one of whom runs.
9. **الواشي (The Informant):** an informant gives you the location of a suburb drug house: 3 armed plus 1 who surrenders.
10. **طريق الهروب (Escape Road):** the gang's driver, the fastest chase in the game.
11. **هجوم على القسم (Precinct Attack):** 5 armed attackers downtown.
12. **الزعيم (The Boss):** the suburb villa. 3 guards, then Al-Zaeem himself (8 HP), who surrenders at low health. You arrest him, and the ending cutscene plays.

## 7b. Patrol calls
Free patrol (and the precinct mission board) hands out random calls placed on a real avenue 60–200 m away. Pay = base + 400 × rank level + a per-suspect amount, times a risk multiplier (`src/game/logic/calls.ts`).
- **Robbery / runner / gang / hostage / chase:** the story scenarios on a random street.
- **Speeder:** siren on its bumper for 3 s, it pulls over, walk up and write the ticket.
- **Checkpoint route:** drive through 4 intersections.
- **DUI stop (سواق سكران):** the car weaves across its lane and the drunk driver reacts slower to the siren (meter fills at 60%, drains faster). Once stopped, walk up: the driver gets out on the kerb side and either gives up (order + cuff) or staggers off on foot (15% as a rookie, up to 50%).
- **Speed trap (كمين رادار):** park inside the yellow radar ring. After 2.5 s stopped the radar clocks a speeder (well over the 60 km/h limit) who pulls away ahead of you; siren on and pull it over like a speeder. 1 speeder as a rookie, 2 from sergeant, 3 from captain.
- **Drug-house raid (مداهمة وكر):** 2 waves (3 from sergeant) of 2–3 people come out of the house one after another, each wave a little deeper from the door and with its own crates. Wave 1 is all gunmen; later waves can include a runner or someone who gives up. At most 8 in total.

## 8. Tech constraints
- One ~250×340 m city, built from instanced blocks, culled per block.
- Phones default to low quality, but always use the realistic (Quaternius) character set, with fewer pedestrians on low.
- The pedestrian and NPC logic must not allocate memory per frame. The HUD only updates at 8 Hz.
- MakeHuman people use soft skin clearcoat/sheen and ~0.3 s locomotion cross-fades; the character creator preview runs the same idle mixer.

## 9. Acceptance (verification)
In a 412×915 mobile test run on low quality, missions 1–3 must be playable start to finish: radio dialogue appears, objectives advance at the right moments, the arrest works (order, then cuff), and the chase can be caught. Screenshots are saved for each mission.
