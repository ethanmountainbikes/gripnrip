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
- Pedalling now pushes up to 55 km/h on the flat (65 km/h uphill, shown 10 lower on the speedometer), and climbing is much easier.

## Chairlifts, connector paths and money
- Three chairlifts. Ride into a bottom station to sit on a chair and ride up (A / Enter skips the ride):
  - **Lift A, Summit Express:** from the valley by the shop to Summit DH, Flow Line, Freeride Ridge and North Face.
  - **Lift B, West Ridge:** from the park to Forest Singletrack and Meadow Flow.
  - **Lift C, East Hills:** to Pump Line and Hilltop Jumps.
  Lifts are always open, including for trails you haven't unlocked for teleport yet.
- Narrow gravel connector paths link the lifts, trail starts and ends, the park and the shop. They show as thin lines on the minimap.
- Grass no longer slows you down; it only has less grip than dirt.
- Trail jumps are sized to the speed you carry at each one. Jumps on faster sections are bigger, and those on slower sections are smaller, within the trail's difficulty.
- DOLLAHS: tricks and landings pay about 15% of the old REP values, and finishing a trail pays (1000 + trail length ÷ 2) × 0.15.
