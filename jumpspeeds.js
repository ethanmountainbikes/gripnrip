// coasting speed (km/h, capped at 60) at each trail feature, measured by a bot run down every trail
// (index = feature order on that trail). world.js sizes each jump to these speeds.
export const JUMP_SPEEDS = {"Summit DH":[58,60,60,60,35,60,60,60,60,60,60,60,60,60,60,28,48],"Flow Line":[60,60,60,60,60,null,51,53,53,54,53,54,57,52,51,46],"Freeride Ridge":[60,60,60,60,null,null],"North Face":[60,60,60,12,60,60,60,60,60],"Forest Singletrack":[18,50,60,60,60,60,60,60,60,60],"Rock Garden":[55,60,60,60,60,60,null,null,null,null,null,null],"Drop Zone":[12,35,60,60],"Meadow Flow":[60,60,60,60,52,46],"Pump Line":[41,45,50,56,60,60,60,60,60,60,60,60],"Hilltop Jumps":[49,57,59,60,60,60,60,60],"Boreal Enduro":[46,55,52,54,60,71,70,65,63],"Ridgeback Flow":[13,23,33,45],"Eastern Traverse":[17,34,26,12,12,41,47,50,51]};

// MEGA SEND: coasting speed (km/h) at each lip, measured by td-tests/mega.mjs; world.js solves each lip angle for it
export const MEGA_LIP = [59.0, 66.8, 59.7, 75.8, 66.2, 60.7];
export const MEGA_FIX = [10.38, 12.54, 7.36, 12.9, 14.34, 14.4];   // per-jump landing-distance trim (m), from the same bot
