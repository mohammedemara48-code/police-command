# District reference

What the four districts of the game are modelled on, and what each statement rests on. Where a look is our own interpretation rather than something a source states, it says so.

## Haram / Faisal / Ring Road (`suburb`)

Sourced:
- Haram Street is about 1.5 km long and 40 m wide (Giza governorate, http://www.giza.gov.eg/areas/El-Haram/Parking1.aspx). It has a landscaped central median (https://www.elwatannews.com/news/details/3796863). Faisal Street is a dense commercial street with 1,806 recorded establishments (https://doi.org/10.21608/jarts.2021.62972.1078); the Faisal corridor and its access problems are documented in the Cairo BRT audit (https://www.mobiliseyourcity.net/sites/default/files/2021-01/Cairo-BRT-corridor-access-audit-%282%29.pdf).
- The pyramids are no longer visible from the street entrance (https://makeheritagefun.com/haram-street-preserve/); the street runs towards the Giza plateau (https://egyptfuntours.com/el-haram-street/, https://en.thingsincairo.com/cairo/el-haram/). That is why they only show beyond the open end of the road in the game, hazed and far away.
- Informal housing in Greater Cairo is reinforced-concrete frame with brick infill, mostly 6-8 floors with some above 12 (https://isdsnet.com/ijds-v6n10-16.pdf); rooftops are left unfinished with rebar sticking out for later floors (https://architexturez.net/pst/az-cf-238144-1703133066, https://doi.org/10.3929/ethz-a-010817175).
- Photographs on Wikimedia Commons ("Giza - Al-Haram street.jpg", "Giza pyramids from al-Haram st.jpg", "Cairo Ring Road in Giza, Egypt.jpg") show painted and weathered concrete blocks in grey, beige and cream with shopfront signage along a wide road, not a red-brick street.

Used in the game: cream / sand / grey plastered concrete blocks as the default; bare brick infill on only about 6% of blocks (the frame-and-infill construction is real, but the street itself reads grey/beige, so it is the exception); rebar and unfinished roofs on part of the informal blocks; 7-13 floors.
Interpretation: block heights and shop mix are ours.

## Downtown (`downtown`)

Sourced:
- Khedive Ismail's 19th-century quarter was laid out as a European-style grid of broad streets in French neoclassical / Belle Epoque architecture; today the upper floors are dusty with battered shutters while the ground floors are redone as modern shopfronts (https://en.wikipedia.org/wiki/Talaat_Harb_Street, https://fount.aucegypt.edu/cgi/viewcontent.cgi?article=1089&context=etds, https://www.artforum.com/features/circling-the-square-architecture-and-revolution-in-cairo-197121/, https://www.tandfonline.com/doi/full/10.1080/16874048.2020.1779474, https://www.archimuse.com/publishing/ichim01_vol1/wahba.pdf).
- Photographs on Commons ("Cairo - Downtown - Talaat Harb St.JPG", "...Golden Hotel.JPG") show tall stone-and-stucco facades with tall arched French windows, iron balcony rails, shutters and cornices.

Used in the game: about 75% of blocks use the "khedival" facade (arched windows, shutters, iron rails, cornice and crown), 5-9 floors, almost no bare brick.

## Shubra (`port` in code)

Sourced:
- Shubra was a garden suburb of palaces along Shubra Street (from 1808) and became a working-class and middle-class quarter after the 1902 tram line; streets such as El-Gesr are almost entirely covered with trees (https://en.wikipedia.org/wiki/Shubra, https://www.cairo.gov.eg/ar/culture/cairo-history/cairo-neighborhoods/shubra/, https://www.egypttoday.com/Article/4/2951/Shubra-s-Forgotten-Architectural-Heritage, https://english.ahram.org.eg/News/478128.aspx).
- Commons photos ("Flickr - Bakar 88 - Shubra, Cairo.jpg", "A Morning in Shubra") show a mix of older plastered apartment buildings with balconies and newer concrete-frame blocks.

Used in the game: a mix of khedival-era plaster blocks (35%) and informal blocks, 5-10 floors, trees on every slot of both pavements, a dense crowd. There is no tram in the game.

## Dokki (`corniche` in code; Mesaha, Nile side)

Sourced:
- Dokki was farmland and a royal estate until the early 20th century, subdivided from the 1930s (Finney's company) and in 1948 (Madinat al-Awqaf), and today is a dense residential and commercial district with embassies and schools (https://en.wikipedia.org/wiki/Dokki, http://dokki-bits-and-pieces.blogspot.com/2012/12/the-district-of-dokki.html, https://3altool.com/blog/mohandessin-dokki-agouza-guide, https://clustercairo.org/2017/05/03/misaha_garden/).
- The Commons photo "Cairo, Gameat El-Dowal El-Arabiya (Arab League Street) in Mohandessin" shows the neighbouring mid-century concrete blocks.

Used in the game: about 70% "modern" blocks (ribbon windows, flat parapets) in light plaster and concrete tones, 6-10 floors, street trees plus date palms toward the Nile. Interpretation: the "modern" style is our reading of that planned mid-century development, not a photo-for-photo match.

## Giza pyramids (`src/game/world/Pyramids.ts`)

Dimensions from https://en.wikipedia.org/wiki/Giza_pyramid_complex, https://en.wikipedia.org/wiki/Great_Pyramid_of_Giza, https://en.wikipedia.org/wiki/Pyramid_of_Khafre and https://en.wikipedia.org/wiki/Pyramid_of_Menkaure: Khufu about 230 m base and 139 m high (slope about 51.8 degrees), Khafre about 215 m and 136 m (53.1 degrees) with the remaining limestone casing at the top, Menkaure about 103 m and 62 m (51.3 degrees) with granite at the foot. The outer casing of Khufu is gone, which leaves the stepped core courses we model. In the game they are drawn at 0.6 scale so the group fits the view, and exist only while the player is in Haram.

## The Nile, Qasr El Nil Bridge, the 6th of October flyover and Cairo Tower (`src/game/world/Nile.ts`, `CairoTower.ts`, `src/game/logic/nile.ts`)

Sourced:
- **Cairo Tower** (https://en.wikipedia.org/wiki/Cairo_Tower): free-standing concrete tower on Gezira Island, built 1956-1961, architect Naoum Shebib, 187 m to the tip, roof at 160 m, observation deck at 143 m, 16 floors. Its partly open lattice evokes a pharaonic lotus plant, crowned by a circular observation deck with a revolving restaurant. Photos on Commons ("Cairo Tower in 2025", CC0, https://commons.wikimedia.org/wiki/File:Cairo_Tower_in_2025.jpg; "Cairo, Tower of Cairo, Egypt, Oct 2004", CC BY-SA 2.5, https://commons.wikimedia.org/wiki/File:Cairo,_Tower_of_Cairo,_Egypt,_Oct_2004.jpg) show a sand-coloured diamond lattice shaft of nearly constant width, a flared crown, a glazed drum and a thin mast. The shaft width and the drum / crown heights in the game are read off those photos, not from a published drawing.
- **Qasr El Nil Bridge** (https://en.wikipedia.org/wiki/Qasr_El_Nil_Bridge): steel bridge by Dorman Long (designer Ralph Freeman), built 1931-1933 to replace the 1871 Gezira bridge, connecting Tahrir Square in Downtown to the southern end of Gezira Island; four large bronze lions by Henri Alfred Jacquemart stand at its approaches. The Commons photo "Qasr El Nil Bridge.jpg" (CC BY-SA 4.0) shows a dark bronze lion seated on a pedestal of large ashlar stone blocks, and a 1900s postcard ("Cairo - Kasr-El-Nil Bridge.jpg") shows two lions on tall stone pedestals flanking the approach with ornate lamp posts and a railing.
- **6th of October Bridge** (https://en.wikipedia.org/wiki/6th_October_Bridge): elevated concrete girder highway, 20.5 km, starts in Dokki (Ministry of Agriculture Street), meets the western Corniche, then crosses the Nile onto Gezira Island and on to Downtown. Commons photos ("6th of October Bridge and Cairo Tower on the left", CC BY 2.0; "Downtown cairo - The 15 May and 6 October bridges...", CC BY 2.0) show a wide concrete deck with a metal railing and tall lamp posts, and the Cairo Tower near it on the island.
- **The Nile at Cairo**: photos ("Feluccas on the Nile in Cairo.jpg", CC BY-SA 4.0) show a calm, grey-green to khaki river, white-hulled feluccas under large pale triangular lateen sails, high stone-faced embankments and the Zamalek towers on the far bank.

Used in the game: the avenue ends at the Corniche and continues as Qasr El Nil Bridge (five arched steel girder spans on four stone piers, level with the avenue, stone parapet with a steel baluster rail, ornate lamps, four bronze lions on stone pedestals, two at each bridgehead) across a 120 m river of khaki-green water with feluccas, to Gezira island with a road across the bridge end, a spur to the tower plaza, a quay lined with trees and palms, and a Zamalek skyline of modern blocks. Cairo Tower is modelled at the sourced 187 / 160 / 143 m. The 6th of October flyover runs on a concrete viaduct east of the avenue (starting on the Dokki bank and crossing onto the island), as scenery only.
Interpretation: the river is narrowed (about 120 m) and the island shortened so the far bank is in view; the tower sits 90 m beyond the bridge end instead of on the island's southern tip; the lion shape is a simplified seated lion, not a scan; the flyover deck height, width and the pier spacing are ours.

## Trees

Date palm, ficus / acacia type and jacaranda street trees are common in Cairo streets and gardens (https://www.csbe.org/illustrated-list-of-trees, http://aun.aun.edu.eg/Environmental-Researches/aubfer/res5_mar_2015.pdf, https://doi.org/10.21608/zjar.2024.403407). The game uses a broadleaf tree with leaf cards from a real leaf scan and the CC0 date palm model listed in `CREDITS.md`.
