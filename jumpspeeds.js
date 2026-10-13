// coasting speed (km/h, capped at 60) at each trail feature, measured by a bot run down every trail
// (index = feature order on that trail). world.js sizes each jump to these speeds.
export const JUMP_SPEEDS = {"Summit DH": [54, 60, 60, 60, 60, 60, 60, 60, 44, 51], "Flow Line": [60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 12, 27, 38, 51, 60, 60, 60, 60, 60], "Freeride Ridge": [60, 60, 60, 60, 60, 60, 58, 60, 60, 60], "North Face": [60, 60, 60, null, null, null, null, null, null], "Forest Singletrack": [57, 60, 60, 60, 60, 57, 54, 36, 23, 27, 35], "Rock Garden": [60, 60, 60, null, 47, 60, 60, 60, 60, 60], "Drop Zone": [12, 30, 37, 40, 48, 60, 60], "Meadow Flow": [60, 60, 60], "Pump Line": [41, 45, 50, 56, 60, 60, 60, 57, 53, 49, 47, 46, 46, 48], "Hilltop Jumps": [48, 57, 60, 60, 60, 58, 57], "Boreal Enduro": [39, 48, 47, 47, 53, 60, 60, 60, 60], "Ridgeback Flow": [28, 39, 48], "Eastern Traverse": [60, 60, 60, 60, 60, 60, 60]};

// MEGA SEND: coasting speed (km/h) at each lip, measured by td-tests/mega.mjs; world.js solves each lip angle for it
export const MEGA_LIP = [59.0, 66.8, 59.7, 75.8, 66.2, 60.7];
export const MEGA_FIX = [10.38, 12.54, 7.36, 12.9, 14.34, 14.4];   // per-jump landing-distance trim (m), from the same bot
