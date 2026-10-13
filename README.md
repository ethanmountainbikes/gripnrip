# Grip 'N Rip

*(repo: gripnrip)*

A low-poly open-world mountain-bike game in the browser, inspired by Descenders / Mavrix. Built with Three.js (r160 from a CDN via an import map). It's plain static files with no build step.

**Play:** https://ethanmountainbikes.github.io/gripnrip/

## Controls (Descenders default Xbox layout)

| Action | Xbox controller | PlayStation | Keyboard |
|---|---|---|---|
| Steer (spin in the air) | Left stick ← → | Left stick | A / D or ← → |
| Lean forward / back (flip in the air) | Left stick ↑ ↓ | Left stick | I / K |
| Accelerate / pedal | RT | R2 | W or ↑ |
| Brake (with steering it slides) | LT | L2 | S or ↓ |
| Pump / attack mode (bend down, preload) | Right stick ↓ (hold) | Right stick ↓ | Space (hold) |
| Bunny hop | Right stick ↓ then ↑ | Right stick ↓ then ↑ | release Space |
| Counter-pump (stretch up, stay low over rollers) | Right stick ↑ | Right stick ↑ | Shift |
| Tweak / whip in the air (analog), scrub at takeoff | Right stick ← → | Right stick ← → | Q / E |
| Tricks: No Hander / No Footer / Superman / Can-Can | LB + right stick ↑ / ↓ / ← / → | L1 + right stick | C + I / K / J / L |
| Respawn | B | Circle | R |
| Switch camera | Y | Triangle | V |
| Reset camera | X | Square | X |
| Pause | Menu | Options | P / Esc |
| Help panel | View | Share | H |
| Teleport to previous / next spot | D-pad ← / → | D-pad ← / → | [ / ] (or , / .), 1–9 and 0 jump straight to spots 1–10 |
| Start / restart (menus) | A | Cross | Enter / Space |

This follows Descenders' published default controller bindings. The camera actions are simplified (there are 3 chase distances), and Descenders' song, UI and freeride respawn-marker combos aren't included.

Controller support has been checked against an Xbox One pad's layout in Chrome, Edge and Firefox, including Firefox's non-standard layout where the triggers are axes. Press any button after loading so the browser detects the pad.

## Riding physics
- **Weight and momentum:** speed comes from gravity, with pedalling, drag and grass rolling resistance on top. The rider shifts visibly fore and aft, and the suspension compresses on landings and when you preload.
- **Pumping:** compress (right stick ↓) on backsides and extend over faces to gain speed. Bad timing costs speed. Counter-pumping (right stick ↑) keeps you on the ground over rollers.
- **Carving and slides:** the lean angle comes from your actual cornering force. Braking while steering breaks rear traction, so the bike drifts (the heading leads the travel direction), throws dust and scrubs off speed.
- **Air:** the left stick spins and flips with rotational inertia. The right stick whips and tweaks the bike in proportion to how far you push it. Laying the bike over at takeoff (a scrub) flattens the trajectory and keeps your speed.
- **Landings:** your velocity is projected onto the real terrain surface, on or off the trail. Within the tolerance, the bike's orientation is damped smoothly to the ground and there's no rebound or bounce.

## Open world
- A 2.4 km × 2.4 km map (about 5.8 km²) with a 340 m mountain, rolling hills and a valley. Detailed terrain streams in around you in 100 m chunks, and a low-detail version covers the rest of the map out to the horizon.
- You can ride anywhere. Grass and hillsides are slower than dirt, and the trees are solid.
- **Trails** (marker poles in the trail colour; the START arch shows the difficulty icon and trail type, as do the minimap and the teleport toast). Difficulty uses the IMBA/Trailforks scale: ● green (easy), ■ blue (intermediate), ◆ black (difficult), ◆◆ double black (expert), PRO (orange, pro line).
  - Summit DH: ◆ Downhill. Kickers, rock gardens, drops.
  - Flow Line: ■ Flow. Rollers and tables.
  - Freeride Ridge: ◆◆ Freeride. Big drops and gap doubles.
  - North Face: ◆ Enduro. Rocks, ledges, kickers on a long steep descent.
  - Forest Singletrack: ● Cross-country. Gentle rollers.
  - Rock Garden: ◆ Technical singletrack. Rock gardens and small ledges.
  - Drop Zone: ◆◆ Freeride. A series of wooden drops.
  - Meadow Flow: ● Flow. Small rollers and tables.
  - Pump Line: ● Pump track. Back-to-back rollers.
  - Hilltop Jumps: ■ Jump line. Consecutive tables and doubles.
  - Dirt Jump Park: PRO Dirt jump. Four lines from mellow tables to big kickers. No trails cross.
- **Dirt Jump Park** in the valley, with four lines: Mellow Tables, Pro Tables, Doubles and Big Kickers.
- **Health and unlocks:** your 3 hearts only count during a trail run (START arch to FINISH arch) and refill when a run starts. Losing them all ends that run and puts you back at the trail's start. In free roam a crash just respawns you. Trail teleport spots unlock after you finish that trail once (saved in the browser). Flow Line (where you spawn), the Dirt Jump Park and Valley Meadow are always unlocked.
- **Teleport spots:** one at the top of each trail (1–10), then 11 Dirt Jump Park and 12 Valley Meadow. The minimap always shows every trail and spot; locked ones are dimmed/dashed with a lock. Use the D-pad ← → or [ ] to cycle (locked spots are skipped), or press 1–9 / 0. On the title screen the D-pad picks where you drop in.
- Riding through a trail's START arch starts its clock and the progress bar. Reaching its FINISH arch pays out DOLLAHS and records your best time. The minimap (top right) shows the trails, the numbered spots and you.
- Respawn (B / R) puts you back where you were riding safely about 1.5 s earlier.

## Gameplay
- Spin and flip in the air for DOLLAHS ($). Land straight and level for a clean landing. A sideways or nose-first landing, or hitting a tree, costs a life (you start with 3).
- Complete the objectives (top right): clean landings, top speed, a 360, a flip, finishing a trail, and landing jumps in the park.

Run it locally with `python3 -m http.server`, then open http://localhost:8000.

## DOLLAHS and the bike shop
- You earn **$ DOLLAHS** for clean jumps and tricks (about 15% of the old rep values) and for finishing trails. Your balance is saved in the browser.
- Open the **Bike Shop** with X / O on the title or pause screen, or ride up to the shop building in the valley (near Valley Meadow). Bikes you own and the one you ride are saved.

| Bike | Price | Speed (drag) | Grip | Pop | Landing stability |
|---|---|---|---|---|---|
| Starter Hardtail | free | 1.00 | 1.00 | 1.00 | 1.00 |
| Trail Bike | $800 | 0.94 | 1.06 | 1.03 | 1.05 |
| Dirt Jumper | $1,500 | 1.05 | 1.00 | 1.22 | 1.08 |
| Enduro Bike | $2,500 | 0.88 | 1.12 | 1.05 | 1.12 |
| DH Bike | $4,000 | 0.80 | 1.18 | 0.95 | 1.20 |

## Checkpoints, the Big Drop and climbing
- Every trail has yellow CHECKPOINT gates every ~170-250 m (shown as yellow triangles on the minimap). During a run, a crash, the respawn button or going out of bounds puts you back at the last checkpoint (or the start) with a little speed; the timer keeps running. In free roam you respawn at your last safe spot.
- The Dirt Jump Park pad is now level, with a tall roll-in hill. On its north side, a 5 m wooden **Big Drop** deck runs off the roll-in to a lip, a knuckle and a long transition landing.
- Pedalling now pushes up to 55 km/h on the flat (65 km/h uphill, shown 5 lower on the speedometer), and climbing is much easier.

## Chairlifts, connector paths and money
The mountain is laid out like a real bike park. Every trail starts near a lift top, fans out down the mountain, and finishes at a lift bottom station, with its finish gate just above the station. Each lift top has a wayfinding signpost with one arrow blade per trail, showing the trail name and difficulty symbol.
- **Base plaza** (valley): Summit Express (A), Send Tower Lift (G) and West Ridge Lift (B) bottoms, the bike shop and the dirt-jump park.
  - **A, Summit Express:** goes to Summit DH, Flow Line and Freeride Ridge. Summit DH finishes back at A.
  - **G, Send Tower Lift:** goes to MEGA SEND, which finishes back at G. Flow Line also finishes at G.
  - **B, West Ridge:** goes to Forest Singletrack and Meadow Flow, which both finish back at B.
- **C, East Hills:** goes to Pump Line and Hilltop Jumps, which both finish at C's bottom.
- **D, Boreal Chair:** goes to Boreal Enduro and Drop Zone, which both finish at D.
- **E, East Ridge Chair:** goes to Rock Garden and Eastern Traverse. Freeride Ridge also finishes at E.
- **F, North Face Chair:** goes to North Face, which finishes at F.
- **H, Ridgeback Chair:** goes to Ridgeback Flow, which finishes at H.
- **Rampage:** all lines finish in the corral, right next to the Summit Shuttle pickup.

Lifts are always open. Only short gravel paths are left: from a lift top to the trail starts, from a finish to the lift below it, and around the plaza. A layout audit (`liftcheck`) checks the following:
- Paths stay at least 6 m from any trail except where they join it.
- No trails cross.
- Nothing goes through the dirt-jump park.
- Stations and towers are at least 15 m clear.
- Every finish is near a lift bottom.

Each park roll-in has a 12% pedal-up ramp at its back.
## Bigger map, new trails, shop and flip landings
- The map is ~32% larger (2.76 km square); the new outer band has rolling forested hills. All original trails, the park, lifts and paths are unchanged.
- New trails: **Boreal Enduro** (Enduro, black), **Ridgeback Flow** (Flow, blue), **Eastern Traverse** (Cross-country, green), with speed-sized jumps, checkpoints, arches and unlock-on-finish teleports.
- New lifts: **Boreal Chair** (D: Boreal Enduro, Drop Zone) and **East Ridge Chair** (E: Ridgeback Flow, Rock Garden, Eastern Traverse), plus connector paths.
- Connector paths route around the Dirt Jump Park; an automated check fails if any path passes within 15 m of the park pad or a jump.
- The bike shop is a log cabin beside the valley path (spur path to the porch), >= 10 m clear of every path, trail and lift.
- Objectives were removed; DOLLAHS still come from tricks and finishes.
- Flip landings drop whole turns and settle by the shortest rotation, with a short quaternion blend.

## Full-screen map, waypoints and the Bike Shop spot
- View (controller) or M opens a full-screen map that pauses the game. It shows every trail with its name, difficulty, type and lock state, plus lifts and the trails they serve, paths, the park, the shop, checkpoints, teleport spots, waypoints, your position and heading, and a legend. Move the cursor with the stick, D-pad, arrows or mouse. A or Enter teleports to an unlocked spot, X, W or a click sets or removes a waypoint (up to 3), and B, M or View closes the map. On the controller, help is now Y in the pause menu; on the keyboard it is still H.
- Waypoints show as tall glowing beacons with an on-screen distance marker that sticks to the screen edge when off-screen, appear on the minimap, clear with a toast when you ride within 12 m, and are saved in localStorage.
- The Bike Shop is an always-open teleport spot (16, Shift+6). Number keys: 1-9 and 0 for spots 1-10, Shift+1-6 for spots 11-16.

## Rider, bike and trick animations
- **Models:** the bike and rider are built procedurally in `rider.js`; there are no third-party models to credit. Bike: hydroformed frame tubes, rear triangle with rocker link and coil shock, fork with gold stanchions, lowers and arch, 28-spoke wheels with knobby tyres, disc rotors and calipers, cassette, chainring, chain, derailleur, cranks, flat pedals with pins, dropper post and saddle, riser bar, stem, grips and levers. Rider: full-face helmet with peak and goggles, jersey, pants, knee pads, gloves and shoes. Static parts are merged into one mesh per material.
- **Skeleton and IK:** hips, spine, head, upper and lower arms, hands, thighs, shins and feet. A two-bone IK solver keeps the hands on the grips and the feet on the pedals; elbows point out and knees point forward. The cranks turn while you pedal, and the pedals stay level.
- **Tricks** (LB + right stick; keyboard C + I/J/K/L, diagonals with two keys, C+U for a barspin). How far you push the stick sets how strong the pose is, and poses blend in and out over about 0.1 s. Pose references: Red Bull "Slopestyle MTB tricks guide", the X Games BMX Tricktionary and riding.guide.
  - ↑ No-hander: arms thrown out wide, knees pinch the seat
  - ↖ Tuck no-hander: bars pulled into the lap, shoulders over the bars, arms swept back
  - ↓ No-footer: both feet kicked off wide and back
  - ← Superman: body stretched flat behind the bike, hands on the grips
  - → Can-can: one leg kicked over the top tube
  - ↙ Nac-nac: bars turned like a whip, one foot pushed out behind the rear wheel
  - ↗ X-up: bars turned about 180°, arms crossed
  - ↘ Tailwhip: feet off, the frame spins around the head tube while the bars and body stay put
  - RS click (C+U): Barspin: the bars, fork and front wheel spin a full turn; release to catch them
  - Whip, table and scrub come from the right stick (tweak), flips tuck the rider in, and in a 360 the rider looks over their shoulder.

## Realism pass, main menu & quality
- All textures (dirt, gravel, grass, rock, snow, bark, wood planks, needles + normal maps) are **generated procedurally** at load (`textures.js`), no third-party images.
- Terrain splatting by slope/height, conifers with bark and layered needles, instanced rocks/bushes, wind-swayed instanced grass, ACES tone mapping, sky with sun disc, atmospheric fog.
- Quality Low / Med / High (High adds SSAO + bloom) under Settings.
- Main menu with 3D flyover: Ride, Trails, Bike Shop, Settings, Credits; works with controller (D-pad/stick + A/B) and keyboard/mouse. Pause → Main Menu.

## Sound effects
All sound effects (chain clicks following pedal cadence, tyre roll by speed and surface, wind, landing thuds scaled by impact, skids, crashes, chairlift hum) are synthesized live with the Web Audio API in `sfx.js`. No sample files are used, so there is nothing to license. Adjust them with **Sound volume** in the settings menu (0% = mute).

## Music
NCS was considered, but its FAQ says: *"Q. Can I use NCS music in my game? … Please get in touch via our commercial licensing form"*, so CC0 tracks from OpenGameArt are used instead:
- "Action Track" and "Simple Action Beat": LushoGames (CC0)
- "Rock Theme 3": Umplix (CC0)
- "Fast Song": annandistance (CC0)

Tracks play shuffled once you first press a key or button. Settings has music on/off and volume, and Skip Song is in the pause menu.

## Cosmetic skins (Bike Shop)
The shop has tabs: Bikes, Paint, Jersey, Pants, Helmet and Goggles. Switch tabs with LB/RB, ←/→ or Q/E. The highlighted item shows live on a slowly orbiting 3D view of your rider.
- Paints ($100–$1,500): solid colours, two-tone, fade, woodland camo, race decals, raw carbon, mirror chrome.
- Gear: jersey patterns (stripes, hoops, chevrons, camo), pants colours, helmet designs (race stripe, checker, carbon, flames), goggle lenses.
- Skins are cosmetic only and are equipped per bike. Saved in `trailDescent.cosmetics` (owned) and `trailDescent.skins` (equipped per bike). Patterns are procedural shaders, so there are no image assets.

## Real 3D rock gardens
The rock gardens on Rock Garden, Forest Singletrack and the DH/enduro trails are now 3D boulders (17 gardens: 149 small rocks, 51 big ones). The shape you see is exactly the collision shape: each mesh is a lathe of the rock's height profile.
- Small rocks (0.12–0.45 m) are rideable. The wheels climb each rock's real shape, which gives a jolt and costs some speed. They never launch you.
- Big rocks (0.65–1.05 m) are solid. Hitting one head-on is a crash, a glancing hit deflects you with some speed lost, and a high enough hop clears it.
- Every garden keeps a clear lane at least 2 m wide down the middle.

## Rampage world
Pick **World: Rampage** in the main menu (the page reloads into the new world). It's a separate desert map inspired by the Red Bull Rampage 2025 venue in Virgin, Utah. Everything was built from research; it is not a survey of the real site.
- **Terrain:** a steep red-sandstone and clay amphitheatre about 215 m tall (the face is up to ~47% grade). Knife-edge ridgelines run down the fall line, with banded sandstone cliffs and stepped desert mesas on the horizon. Sparse desert scrub, no trees and no grass.
- **Five lines** run from wooden start platforms on the summit ridge to a fenced finish corral on the valley floor:
  - **Zink Chute** nods to Cam Zink's chute "through the heart of the mountain".
  - **Goblin Ridge** has the Goblin Drop, a monster step-down off the ridge.
  - **Canyon Gap Line** has a real canyon carved into the terrain.
  - **Stratos Drop** nods to the "44-footer".
  - **Formation Ridge** is a roomier line in the style of the women's venue.
  - **BONE CRUSHER** (◆◆◆ PRO, triple black) is the hardest line in the game. It unlocks once you finish any other Rampage line. Expect a knife-edge ridge roll-in, rock gardens with big crash rocks either side of a narrow clean lane, two cut 35–45° chutes, three tight exposed switchbacks, 2.2 / 3.4 / 4.8 m ledges, a mandatory rock-roll, an off-camber traverse, a step-down into the second chute and a 7.5 m cliff drop just above the finish corral.
- **Features:** big dirt drops with long steep landings, wooden deck drops, step-downs, gaps and canyon gaps. They're sized for the 45–65 km/h riders carry down the face, giving about 1.5 s of air.
- Same physics as the mountain, plus its own spawn, checkpoints, minimap, full map, Summit Shuttle lift and Bike Shop. Trail unlocks are saved separately.

Sources (venue research):
- Red Bull Rampage 2025 event page: https://www.redbull.com/int-en/events/red-bull-rampage-2025
- Red Bull, venues overview (men's 2016/17/21 site, women's 2014–15/Formation site; Zink chute; Goblin Drop): https://www.redbull.com/sg-en/red-bull-rampage-venues-overview
- Red Bull, dig days, first look at the lines ("natural amphitheatre", Zink's chute): https://www.redbull.com/in-en/red-bull-rampage-dig-days
- Pinkbike, Rampage 2025 returns to two historic venues: https://www.pinkbike.com/news/red-bull-rampage-2025-returns-to-two-historic-venues.html
- Red Bull, 2025 winner Hayden Zablotny's run (double-drop entrance, step-up): https://www.redbull.com/us-en/red-bull-rampage-winner
- Pinkbike, 2025 men's final results: https://www.pinkbike.com/news/red-bull-rampage-2025-mens-final-results.html
- Event-page photo captions (the 75 ft Canyon Gap) and replay commentary (Stratos 44-foot drop, ~50 ft canyon gap): https://www.cyclingeu.com/761397/the-biggest-competition-in-freeride-mtb-red-bull-rampage-2025-2/

## Graphics settings

Settings → **Graphics**: Low / Medium / High / Max. The setting is saved, and changing it reloads the page.

- **Low** is the classic look, exactly as before. The upgrade code (`gfx.js`) isn't even loaded.
- **Medium / High / Max** load `gfx.js` from the same three.js r160 CDN, plus the addons, and add:
  - a physical sky plus image-based lighting from a CC0 Poly Haven HDRI (alpine `pizzo_pernice_puresky` for the Mountain, `quarry_01_puresky` for Rampage)
  - ACES tone mapping and PBR materials everywhere
  - soft high-resolution sun shadows that follow the rider (2048 on Medium, 4096 on High and Max)
  - distance haze with aerial perspective
  - CC0 Poly Haven ground, rock, bark and gravel textures, with the rock layer projected triplanar on steep slopes and a detail normal on trails
  - denser wind-swayed grass
  - a glossy frame
  - drifting dust in Rampage
  - post effects: bloom, vignette, a light colour grade and SMAA. High adds SSAO, sun glare and depth of field on the cinematic cameras. Max adds GTAO and speed-based motion blur.
- `gfx2.js` (Medium and up) adds the showcase layer: alpha-tested card conifers with normal maps, wind sway and back-light translucency; billboard impostors for distant trees on Mountain; clump-card bushes and desert junipers on Rampage; smooth PBR rocks; ridged far ranges out to 7 km with snow caps (Mountain) or sandstone banding (Rampage), rim light and three silhouette layers; valley height fog with tinted aerial perspective; Rampage dust haze; trail edges blended with noise. High and Max add screen-space god rays.
- Settings → **Time of day**: Morning / Noon / Golden Hour (Medium and up; reloads the page).
- **Performance (laptop-friendly Max):** an adaptive quality governor measures real frame time each second and steps the render scale (1.5x down to 0.65x of CSS pixels, capped by the display) and then god rays, motion blur, bloom and shadow refresh rate down when under 45 FPS, and back up slowly when there is headroom. Max starts at 1.25x (not the full Retina 2x). GTAO/SSAO are off (they re-render the whole scene); god rays, speed blur, tone mapping, vignette and grade are one merged full-screen pass; the shadow map is 2048 with a tight frustum around the rider; no MSAA back buffer on Medium+ (SMAA instead).
- Settings → **FPS counter** shows FPS, frame time, the worst frame, and the current render scale.
- Physics and gameplay are identical on every setting.

## Multiplayer (private rooms)
Main menu (or pause menu) → **Multiplayer** → *Create room* gives a 6-character code; friends choose *Join with code* and type it.
Up to 8 riders see each other ride (smoothed), with their bikes/skins and preset name tags. Press **1–6** while riding for emotes.
There is no chat: names and emotes are presets, rooms are private by code, the host can lock the room or remove riders, and
nothing is stored. If the server can't be reached the game just stays single-player. The server lives in `server/` (see its README).

## Cloud save + leaderboards
- On first launch the game makes a private **save code** (`XXXX-XXXX-XXXX-XXXX`) and asks you to write it down. Settings → **Cloud Save** shows it again, syncs, restores with a code on another browser, or deletes your cloud data.
- Local first: progress stays in the browser and syncs (debounced, and after trail finishes) when online. Merging never loses owned bikes/skins or unlocks; best times keep the fastest; DOLLAHS/settings come from the newest copy (or the restored save).
- **Leaderboards** (main and pause menu; LB/RB or Q/E switch category, D-pad changes world/trail): fastest time per trail, trick combo per run per trail, most tricks in one jump, biggest airtime, longest jump, top speed, lifetime DOLLAHS, trails completed, dirt jump park best line. Top 20 + your rank; preset rider names only. "NEW BEST!" toasts on personal bests.
- Server checks (see `server/README.md`): trail times need every checkpoint in order and each split under the 30 m/s physics cap; airtime ≤ 4 s; jump distance ≤ 30 m/s × airtime; tricks bounded by airtime; top speed ≤ 108 km/h; combo/park scores bounded by duration; lifetime DOLLAHS growth bounded by time; rate limits. Save codes are stored only as salted SHA-256 hashes; no personal data.
