# Credits

Everything below is CC0 / public domain unless marked otherwise. The only exceptions are the Dodge Challenger model (CC-BY 3.0, attribution below) and the three.js `Water` shader and its normal map (MIT).

## Kenney, audio and early models

- 3D models: Kenney — Car Kit, Mini Characters, City Kit Commercial (https://kenney.nl), CC0. Converted to self-contained .gltf.
- Sound effects: Kenney — Interface Sounds, Impact Sounds, Sci-Fi Sounds, Music Jingles (https://kenney.nl), CC0.
- Music: "Fast Fight / Battle Music (looped)" from OpenGameArt (https://opengameart.org/content/fast-fight-battle-music-looped), CC0.
- Calm music: "Empty City" — OpenGameArt (https://opengameart.org/content/emptycity-background-music), CC0.
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
- Built with Blender 4.2 (GPL tool; output not covered) and glTF-Transform (meshopt, WebP textures 512 px).

## Realistic cars

- `car-sedan2.glb` (traffic sedan, taxi and patrol car) is based on "White four-door sedan" by Innerscene, CC0: https://www.innerscene.com/tools/library/3d-parts/white-four-door-sedan-1f271353
- `car-hatch.glb` is based on "Silver five-door compact hatchback" by Innerscene, CC0: https://www.innerscene.com/tools/library/3d-parts/silver-five-door-compact-hatchback-6bf4a878
- `car-van.glb` (microbus) is based on "Passenger van with side windows" by Innerscene, CC0: https://www.innerscene.com/tools/library/3d-parts/passenger-van-with-side-windows-474dd4a2
- The three cars above were re-oriented with interiors removed. Each wheel is regrouped into its own `wheel_*` node so it can spin. They were simplified and compressed with glTF-Transform (meshopt, WebP), and each also has a lighter `-lo.glb` version for low quality.
- `car-police.glb` (command-centre view) is based on "Police SUV with generic livery" by Innerscene, CC0: https://www.innerscene.com/tools/library/3d-parts/police-suv-with-generic-livery-76e4ca9b
- Re-oriented, materials renamed (paint tinted per car, emissive lamps), simplified and compressed with glTF-Transform.

## Environment

- Kerbs/sea wall `Concrete034`, beach sand `Ground054` and breakwater rocks `Rock030` from ambientCG (https://ambientcg.com), CC0. Resized to 512 px WebP (`public/textures/`).
- Sky lighting: "Kloofendal 48d Partly Cloudy (Pure Sky)" HDRI from Poly Haven (https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky), CC0 (`sky_1k.hdr`).
- Egyptian street set (apartment blocks, road signs, striped kerbs, taxi roof sign, microbus roof rack, patrol door decals): drawn in code for this project (`src/game/world/Egypt.ts`), MIT like the rest of the code.
- Water normal map `waternormals.jpg` and the `Water` shader from the three.js examples (https://github.com/mrdoob/three.js), MIT.
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
