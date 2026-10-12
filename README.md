# Trail Descent

A low-poly open-world mountain-bike game in the browser, inspired by Descenders / Mavrix. Built with Three.js (r160 from a CDN via an import map). It's plain static files with no build step.

**Play:** https://ethanmountainbikes.github.io/trail-descent/

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
| Teleport to previous / next spot | D-pad ← / → | D-pad ← / → | [ / ] (or , / .), 1–8 jumps straight to a spot |
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
- **Trails** (colour-coded marker poles and a START/FINISH arch on each): Summit DH (red), Flow Line (blue), Freeride Ridge (black, big kickers and drops), North Face (purple, freeride), Forest Singletrack (green) and Hilltop Jumps (orange, dirt tables).
- **Dirt Jump Park** in the valley, with four lines: Mellow Tables, Pro Tables, Doubles and Big Kickers.
- **Teleport spots:** 1 Summit, 2 Flow Line, 3 Freeride Ridge, 4 North Face, 5 Forest Singletrack, 6 Hilltop Jumps, 7 Dirt Jump Park, 8 Valley Meadow. Use the D-pad ← → or [ ] to cycle, or press 1–8. On the title screen the D-pad picks where you drop in.
- Riding through a trail's START arch starts its clock and the progress bar. Reaching its FINISH arch gives you rep and records your best time. The minimap (top right) shows the trails, the numbered spots and you.
- Respawn (B / R) puts you back where you were riding safely about 1.5 s earlier.

## Gameplay
- Spin and flip in the air for rep. Land straight and level for a clean landing. A sideways or nose-first landing, or hitting a tree, costs a life (you start with 3).
- Complete the objectives (top right): clean landings, top speed, a 360, a flip, finishing a trail, and landing jumps in the park.

Run it locally with `python3 -m http.server`, then open http://localhost:8000.
