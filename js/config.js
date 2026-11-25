/* =========================================================
   GAME CONFIG
   ---------------------------------------------------------
   FACES  → drop images into folders (any file name):
            assets/faces/sleeper/     (first image is used)
            assets/faces/mosquitos/   (each mosquito gets a random one)
   SOUNDS → drop audio clips into folders (any file name):
            assets/sounds/fly/        a mosquito starts flying in (name a clip after
                                      a character for his own, e.g. fly/amaluttan.mp3)
            assets/sounds/hit/        shot hit a mosquito
            assets/sounds/miss/       shot missed
            assets/sounds/snore/      optional: sleeper snoring loop (built-in snore otherwise)
   Then run:  node scripts/build-manifest.js   (Vercel runs it on deploy)
   A random clip from the folder plays each time.
   ========================================================= */
window.GAME_CONFIG = {
  faceMode: "cutout", // "cutout" = draw the face exactly as the PNG (no circle/border) | "circle" | "auto"

  /* ---------- SPECIAL MOSQUITOS ----------
     Key = face file name (without extension) in assets/faces/mosquitos/
     e.g. assets/faces/mosquitos/sourav.png  ->  "sourav"
     outfit: "runner" | "traveler" | "tea" | "gamer" | null
             ("tea" = pours chai, doesn't bite; "gamer" = playing PES on a phone)
     points: score for killing him                                     */
  characters: {
    sourav: {
      name: "SOURAV", icon: "🏃", outfit: "runner", bib: "30K",
      speed: 1.75, aimMul: 0.75, points: 3,
      intro: "🏃 SOURAV 30K RUN!", killText: "30K RUNNER DOWN! 🏁",
    },
    amaluttan: {
      name: "AMALUTTAN", icon: "✈️", outfit: "traveler",
      speed: 1.0, points: 5,
      roam: true, // loops around the room while his fly clip (fly/amaluttan-*.mp3) plays, then leaves
      intro: "✈️ AMALUTTAN is visiting!", killText: "TRIP CANCELLED! 🧳",
    },
    adhnan: {
      name: "ADHNAN", icon: "🎮", outfit: "gamer",
      speed: 0.85, wanderMul: 1.6, aimMul: 1.3, points: 2,
      intro: "🎮 ADHNAN is playing PES!", killText: "FULL TIME! ⚽",
    },
    modi: {
      name: "MODI", icon: "☕", outfit: "tea",
      speed: 1.1, points: 3,
      intro: "☕ MODI is bringing CHAI!", killText: "CHAI SHOP CLOSED! ☕",
    },
  },

  /* ---------- ON-SCREEN TEXT ---------- */
  showNames: false,        // name tag above special mosquitos
  showFloatingText: false, // "+1", combo, level up, character banners

  voiceBoost: 2.5,         // loudness of your voice clips (1 = original)
  sleeperBoost: 1.0,       // extra loudness for the sleeper's (Irshad's) lines (files already normalized)

  /* ---------- GAMEPLAY ---------- */
  lives: 5,            // misses allowed (bad shot or a mosquito getting across) before he wakes up
  escapeCostsLife: true, // a mosquito that crosses without being shot counts as a miss
  killsPerLevel: 5,    // difficulty goes up every N kills
  maxMosquitos: 1,     // one at a time: the next comes after this one is killed / gone
  respawnDelay: 1.5,   // seconds after a kill before the next mosquito appears
  gfChance: 0.25,      // chance (from level 2) that a mosquito couple appears
  bedScale: 0.36,      // size of the bed + sleeper (1 = big)
  mosquitoScale: 0.65, // size of the mosquitos
  sleeperHeadScale: 1.35, // size of the sleeper's photo head

  hitRadius: 20,       // how close the shot line must pass (smaller = harder)
  reload: 0.45,        // seconds between shots
};
