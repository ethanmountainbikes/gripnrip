# Trail Descent

A low-poly downhill mountain-bike game in the browser, inspired by Descenders / Mavrix. Built with Three.js (r160 from a CDN via an import map). It's plain static files with no build step.

**Play:** https://ethanmountainbikes.github.io/trail-descent/

## Controls

| Action | Controller (Xbox / PlayStation) | Keyboard |
|---|---|---|
| Steer / lean | Left stick | A / D or ← → |
| Pedal | RT / R2 | W or ↑ |
| Brake | LT / L2 | S or ↓ |
| Jump / pump (hold to preload, release to pop) | A / Cross | Space |
| Tricks in air (spin / flip) | Right stick | J / L spin, I / K flip (A/D also spin) |
| Respawn on trail | Y / Triangle | R |
| Pause | Start / Options | P / Esc |
| Toggle help | Back / Share | H |
| Start / restart | A / Cross | Enter / Space |

## Gameplay
- Gravity sets your speed on a 2 km procedurally shaped downhill trail with wooden kickers and rollers.
- Grass slows you down, so stay on the dirt between the caution tape.
- Spin and flip in the air for rep. Land straight and level to get a clean landing. A sideways or nose-first landing, or hitting a tree, costs a life (you start with 3).
- Controller (Xbox One tested layout): works in Chrome, Edge and Firefox, including Firefox's non-standard layout where triggers are axes. Press any button after loading so the browser exposes the pad.
- Complete the objectives (top right) and reach the finish line.

Run it locally with `python3 -m http.server`, then open http://localhost:8000.
