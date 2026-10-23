# Credits

Everything below is CC0 / public domain unless marked otherwise. The only exceptions are the Dodge Challenger model (CC-BY 3.0, attribution below), the three.js `Water` shader (MIT) and the Clipper polygon library (Boost Software License 1.0).

## Kenney, audio and early models

- 3D models: Kenney — Car Kit, Mini Characters, City Kit Commercial (https://kenney.nl), CC0. Converted to self-contained .gltf.
- Sound effects: Kenney — Interface Sounds, Impact Sounds, Sci-Fi Sounds, Music Jingles (https://kenney.nl), CC0.
- Music: none of it is recorded. The old CC0 loops ("Fast Fight / Battle Music" and "Empty City" from OpenGameArt) were removed; see "Music" below.
- Siren: "Sirens and alarm noise" — OpenGameArt (https://opengameart.org/content/sirens-and-alarm-noise), CC0.
- Gunshot: "Gunshots" (22 Pistol) — OpenGameArt (https://opengameart.org/content/gunshots), CC0.

## Realistic models (v1.8)
- Police officer: "SWAT" by Quaternius — CC0 (https://poly.pizza/m/Btfn3G5Xv4)
- Pedestrian man: "Business Man" by Quaternius — CC0 (https://poly.pizza/m/JFrLIKqvCH)
- Pedestrian women: "Animated Woman" (https://poly.pizza/m/9kF7eTDbhO) and "Woman" (https://poly.pizza/m/AQsd9ngvKU) by Quaternius — CC0
- Patrol car: "Police Car" by Quaternius — CC0 (https://poly.pizza/m/BwwnUrWGmV)
- Traffic / suspect car: "2015 Dodge Challenger" by Grzybek — CC-BY 3.0 (https://poly.pizza/m/1jB8I4t5w4). Attribution required: model by Grzybek via Poly Pizza.
- All compressed with glTF-Transform (meshopt geometry, WebP textures ≤512px).
- `officer-female.gltf`: "Animated Woman" (Casual) by Quaternius, CC0 — https://poly.pizza/m/qJ2gsTUBHL (re-encoded with meshopt, recoloured at runtime)

## Realistic people (v2.0)
- Officers and pedestrians (`cop_m`, `cop_f`, `civ_m1-3`, `civ_f1-2`): generated with MakeHuman / MPFB 2 from the
  **MakeHuman system assets (CC0)** — body, skins, hair, eyebrows, eyelashes, eyes, `male_casualsuit01/03/06`,
  `male_elegantsuit01`, `female_casualsuit01`, `female_elegantsuit01`, shoes. https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html
  (MakeHuman output is CC0 when only CC0 assets are used.)
- Animations (idle, walk, sprint, pistol aim/shoot, hit, death, driving): **Universal Animation Library** by Quaternius, CC0 —
  https://quaternius.itch.io/universal-animation-library — retargeted onto the MakeHuman game-engine rig in Blender.
- Uniform shirt/trousers are the casual-suit textures desaturated and tinted at runtime; duty belt, holster, radio, badge
  and shoulder patches are simple meshes made in code.
- Cairo street clothes (galabeya, abaya, hijab, skull cap, long sleeves, school bags, canes, bread trays) and the
  skin / hair tone variety are procedural, made in code at runtime on the same MakeHuman bodies (no extra assets).
- Built with Blender 4.2 (GPL tool; output not covered) and glTF-Transform (meshopt, WebP textures 512 px).

## Realistic cars

- `car-sedan2.glb` (traffic sedan, taxi and patrol car) is based on "White four-door sedan" by Innerscene, CC0: https://www.innerscene.com/tools/library/3d-parts/white-four-door-sedan-1f271353
- `car-hatch.glb` is based on "Silver five-door compact hatchback" by Innerscene, CC0: https://www.innerscene.com/tools/library/3d-parts/silver-five-door-compact-hatchback-6bf4a878
- `car-van.glb` (microbus) is based on "Passenger van with side windows" by Innerscene, CC0: https://www.innerscene.com/tools/library/3d-parts/passenger-van-with-side-windows-474dd4a2
- The three cars above were re-oriented with interiors removed. Each wheel is regrouped into its own `wheel_*` node so it can spin. They were simplified and compressed with glTF-Transform (meshopt, WebP), and each also has a lighter `-lo.glb` version for low quality.
- `car-police.glb` (command-centre view) is based on "Police SUV with generic livery" by Innerscene, CC0: https://www.innerscene.com/tools/library/3d-parts/police-suv-with-generic-livery-76e4ca9b
- Re-oriented, materials renamed (paint tinted per car, emissive lamps), simplified and compressed with glTF-Transform.

## Tuk-tuk

- `public/models/tuktuk.glb`: a Bajaj RE-style Egyptian tuk-tuk, generated for this project with Higgsfield (Tripo text-to-3D) from a written description. It is not based on any third-party model. Reduced to about 13k triangles with 1024 px textures and meshopt compression (gltf-transform). If it fails to load, the game falls back to the hand-built procedural tuk-tuk.

## Building facades

- `public/textures/facade_brick.webp`, `facade_informal.webp`, `facade_khedival.webp`, `facade_modern.webp`: one-storey facade tiles (red brick with a concrete frame, beige plaster with balconies, laundry and AC units, ochre khedival with green shutters, 1970s ribbon windows with dishes). Generated for this project with Higgsfield (Z Image), then cropped to tile and compressed to WebP. The older hand-painted canvas facades (on Poly Haven CC0 wall photos) stay as the fallback.
- Roof tanks, satellite dishes and stair huts are built procedurally in code.

## Environment

- Kerbs and corniche wall `Concrete034` from ambientCG (https://ambientcg.com), CC0. Resized to 512 px WebP (`public/textures/`).
- Sky lighting: "Kloofendal 48d Partly Cloudy (Pure Sky)" HDRI from Poly Haven (https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky), CC0 (`sky_1k.hdr`).
- Egyptian street set (apartment blocks, road signs, striped kerbs, taxi roof sign, microbus roof rack, patrol door decals): drawn in code for this project (`src/game/world/Egypt.ts`), MIT like the rest of the code.
- The `Water` shader from the three.js examples (https://github.com/mrdoob/three.js), MIT.
- Clipper 6.4.2 by Angus Johnson, JavaScript port `clipper-lib` (https://sourceforge.net/projects/jsclipper/), Boost Software License 1.0 (http://www.boost.org/LICENSE_1_0.txt). Used for the pavement booleans and offsets (`src/game/world/pavement.ts`, baked by `npm run bake:pave`).
- Shop windows and their goods, street lamps, benches, bins, signs and the corniche railing are built in code.

## VIP escort (v1.6)
- No new downloaded assets. The VIP car reuses the existing CC0 sedan model (`car-sedan2`, tinted at runtime); the Egyptian pennants and the ⭐ marker are drawn procedurally on a canvas.

## Realistic districts
All CC0. Textures were cropped, made seamless where needed, resized (1k, plus a 512 px colour map for low quality) and re-encoded as WebP; the road/pavement/ground/pyramid sets also ship normal and roughness maps. Rob Tuytel, Rico Cilliers and the other Poly Haven authors dedicate their work to the public domain.
- Facade and wall photo textures (`wall_concrete`, `wall_rough`, `wall_stucco`, `wall_peel`, `wall_brick`): Poly Haven "Concrete Layers" (https://polyhaven.com/a/concrete_layers), "Rough Concrete" (https://polyhaven.com/a/rough_concrete), "Beige Wall 002" (https://polyhaven.com/a/beige_wall_002), "White Rough Plaster" (https://polyhaven.com/a/white_rough_plaster) and "Brick Wall 006" (https://polyhaven.com/a/brick_wall_006). Windows, shutters, balconies, stains and cornices are painted over them in code (`src/game/world/Facade.ts`).
- Road (`road_*`): Poly Haven "Asphalt 02" (https://polyhaven.com/a/asphalt_02). Pavement (`sidewalk_*`): Poly Haven "Concrete Pavement" (https://polyhaven.com/a/concrete_pavement).
- Pyramid stone (`pyramid_*`): Poly Haven "Sandstone Blocks 05" (https://polyhaven.com/a/sandstone_blocks_05). Desert ground (`desert_*`): Poly Haven "Sand 01" (https://polyhaven.com/a/sand_01).
- Street tree leaves (`leaves_frond.webp`, three frond scans with alpha) and bark (`bark.webp`): the texture scans of Poly Haven "Jacaranda Tree" (https://polyhaven.com/a/jacaranda_tree). The tree models themselves are built in code from leaf cards (`src/game/world/Trees.ts`).
- Date palm (`models/palm-date.glb`): "Mature date palm tree" by Innerscene, CC0 - https://www.innerscene.com/tools/library/3d-parts/mature-date-palm-tree-af8bdc6f. Simplified and compressed with glTF-Transform (meshopt, WebP 256 px).
- The Giza pyramids are modelled in code (`src/game/world/Pyramids.ts`) from published dimensions; see `docs/DISTRICT_REFERENCE.md`.
- Wikimedia Commons photographs listed in `docs/DISTRICT_REFERENCE.md` were studied as visual reference only; none of them ships with the game.

## Nile landmarks
- Embankment and pedestal stone (`stone_*`): Poly Haven "Granite Wall" (https://polyhaven.com/a/granite_wall), CC0. Island park ground (`park_*`): Poly Haven "Grass Path 2" (https://polyhaven.com/a/grass_path_2), CC0. Girder steel (`steel_*`): Poly Haven "Metal Plate" (https://polyhaven.com/a/metal_plate), CC0. Bridge and flyover concrete reuse `concrete_*` and the road / pavement sets above. Resized to 1k (512 px for low quality) WebP.
- River normal map (`river_normal.webp`): generated for this project from filtered noise (`CC0`, no third-party source).
- Qasr El Nil Bridge, the lions, the felucca boats, the 6th of October flyover, Gezira island and Cairo Tower are modelled in code (`src/game/world/Nile.ts`, `CairoTower.ts`) from the dimensions and photographs listed in `docs/DISTRICT_REFERENCE.md`. No model or photograph from those sources ships with the game.

## Cairo map
- The in-game map of Cairo (`src/game/logic/cairoMap.ts`) is hand-drawn for this project from approximate coordinates of well-known places. It uses no OpenStreetMap data, no map tiles and no traced third-party map, so no ODbL attribution applies. If OpenStreetMap-derived data is ever added, it needs "© OpenStreetMap contributors" (ODbL) here and on the map.
- Speech-bubble lines (`src/game/config/barks.ts`) are original writing for this game.

## Cairo street plan
- The open city's streets, Nile banks, islands, squares and bridges are our own hand-drawn longitude/latitude polylines (`src/game/logic/cairo.ts`). No OpenStreetMap or other map data is included, so no ODbL attribution applies. Sources used to place things are listed in `docs/DISTRICT_REFERENCE.md`.

## Music (v3, energetic)

All three tracks (menu, taxi / free driving, police missions) are **composed by the game's own code** and synthesised live with WebAudio. There are no samples, no recordings and no third-party tunes, so there is nothing to license:

- `src/game/logic/maqam.ts`: the maqamat (hijaz, rast, bayati, nahawand as semitone tables with quarter tones), the rhythms on a sixteenth grid (maqsum, saidi, baladi, ayyub, a mahraganat tresillo), the layered groove (dum, tak, ghost notes, clap, riq, dhol, fills), a driving bass, a two-bar hook with ornaments, the bar-by-bar energy curve and the layer thresholds. Tested in `tests/maqam.test.ts`.
- `src/game/systems/EgyptianMusic.ts`: the voices (oud, nay, mizmar, electro synth, bass, darbuka / tabla / dhol / riq / clap kit) and the look-ahead scheduler. `setIntensity` (chases, speed) opens more layers and raises the tempo up to 10%; `renderOffline` renders a track without a timer for level checks.
- Menu: rast on D, 112 BPM, maqsum with riq and dhol, oud hook with a nay answer. Taxi: nahawand on C, 124 BPM, mahraganat tresillo kick with claps, electro-synth riff. Police: hijaz on A, 140 BPM, saidi with a hammering dhol, mizmar hook with an oud echo.
- The scales and rhythms are traditional (public domain knowledge); the generated notes are original output of this code, released under the project licence.

## Music (recorded instruments)
The four background loops in `public/music/` (`menu-zuruni`, `taxi-salma`, `police-hijaz`, `free-saidi`, as `.m4a` and `.ogg`)
are our own arrangements, sequenced in maqam and Egyptian rhythms from real instrument recordings by
`tools/music/render.py`. Because some source recordings are CC BY-SA, **these music files are released under
CC BY-SA 4.0** (the rest of the game keeps its own licence).

Compositions (public domain):
- «سالمة يا سلامة» *Salma ya Salama* (1919) and «زوروني كل سنة مرة» *Zuruni kull sana marra* — melodies by
  **Sayed Darwish** (سيد درويش, 1892–1923, public domain: died over 100 years ago). Our arrangements follow the
  refrains as remembered by ear and simplified; no recording or modern score of these songs was used.
- The police (Hijaz, malfuf) and saidi (Bayati) themes are original to this game.

Instrument recordings (Wikimedia Commons; licence checked on each file page):
- Darbuka dum and tak: `Derbake Grave.ogg`, `Derbake Agudo.ogg` by ZappaMidiPF — CC BY-SA 4.0 —
  https://commons.wikimedia.org/wiki/File:Derbake_Grave.ogg , https://commons.wikimedia.org/wiki/File:Derbake_Agudo.ogg
- Riq hits: `Riq demo.ogg` by Derbake — CC BY-SA 4.0 — https://commons.wikimedia.org/wiki/File:Riq_demo.ogg
- Sagat (finger cymbals): `Finger cymbals.ogg` by Why? I Ask — CC BY-SA 4.0 — https://commons.wikimedia.org/wiki/File:Finger_cymbals.ogg
- Oud notes: `Oud open Strings.ogg` by User:Bottomline — CC BY-SA 3.0 — https://commons.wikimedia.org/wiki/File:Oud_open_Strings.ogg
- Accordion notes: `Plein jeu mélodéon.ogg`, `Registre orgue.ogg`, `Registre bandonéon.ogg` by Levieuxtoby — CC BY-SA 4.0 —
  https://commons.wikimedia.org/wiki/File:Plein_jeu_m%C3%A9lod%C3%A9on.ogg , https://commons.wikimedia.org/wiki/File:Registre_orgue.ogg ,
  https://commons.wikimedia.org/wiki/File:Registre_bandon%C3%A9on.ogg
The generated WebAudio music (EgyptianMusic) stays as the fallback when a file cannot be loaded.
