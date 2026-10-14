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

- `car-sedan.glb` is based on "Sedan car" by Innerscene, CC0: https://www.innerscene.com/tools/library/3d-parts/sedan-car-42109739
- `car-police.glb` is based on "Police SUV with generic livery" by Innerscene, CC0: https://www.innerscene.com/tools/library/3d-parts/police-suv-with-generic-livery-76e4ca9b
- Re-oriented, materials renamed (paint tinted per car, emissive lamps), simplified and compressed with glTF-Transform.

## Environment

- Road asphalt `Asphalt025C`, sidewalk paving `PavingStones092`, kerbs/sea wall `Concrete034`, beach sand `Ground054` and breakwater rocks `Rock030` from ambientCG (https://ambientcg.com), CC0. Resized to 512 px WebP (`public/textures/`).
- Sky lighting: "Venice Sunset" HDRI from Poly Haven (https://polyhaven.com/a/venice_sunset), CC0 (`sky_1k.hdr`).
- Water normal map `waternormals.jpg` and the `Water` shader from the three.js examples (https://github.com/mrdoob/three.js), MIT.
- Shop windows and their goods, street lamps, palms, trees, benches, bins, signs and the corniche railing are built in code.
