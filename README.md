# Devana Boys

A line-art mosquito-slapping game in plain HTML/CSS/JS.
Rendering: Canvas 2D. Animation: [GSAP](https://gsap.com) (bundled in `vendor/`, works offline).

**Mobile-only view:** the game is a portrait phone frame (centered on desktop).

**Run:** double-click `index.html` (or `npx serve .` / VS Code Live Server for phones on your Wi-Fi).

## How to play
- A dashed aim line runs from the sleeper's belly to your mouse/finger. **Click/tap to fire** the line.
- Any mosquito the line passes through dies. There is a short reload (red ring) and mosquitos dodge near-misses.
- Bites (and Modi's chai) cost a blood drop. Lose all 5 and he wakes up.
- Shooting your roommate's face = -1 point. `P` / `Esc` = pause.

## Faces: drop files in folders
```
assets/faces/sleeper/      the sleeping guy (first image is used)
assets/faces/mosquitos/    any number of mosquito faces
```
Best: pre-cut a new face to a transparent PNG (removes the black background, keeps the face exactly):
```bash
python3 scripts/cut-face.py "WhatsApp Image.jpeg" assets/faces/mosquitos/name.png 4
```
(the last number is the darkness cutoff; use 4 for very dark hair, 16 for lighter hair).
Black/white backgrounds are also removed in the browser when served over http(s).
Special characters are matched by **file name** (see `characters` in `js/config.js`):

| File in `assets/faces/mosquitos/` | Character |
|---|---|
| `sourav.png` / `.jpg` | 🏃 30K runner: headband, 30K bib, shoes, very fast, 3 pts |
| `amaluttan.png` / `.jpg` | ✈️ traveler with suitcase, **rare** visitor, 5 pts |
| `adhnan.png` / `.jpg` | 🎮 PES gamer: phone in hand with a live football match, slow & distracted, 2 pts |
| `modi.png` / `.jpg` | ☕ doesn't bite, pours hot chai on the sleeper, 3 pts |
| anything else | normal mosquito |

## Sounds: one folder per event, any file names
```
assets/sounds/hit/        shot a mosquito
assets/sounds/miss/       missed
assets/sounds/bite/       mosquito bit him
assets/sounds/tea/        Modi spilled chai on him
assets/sounds/selfslap/   you shot his face
assets/sounds/gfkilled/   killed the girlfriend mosquito
assets/sounds/gameover/   he woke up
assets/sounds/start/      game start
assets/sounds/snore/      sleeper snoring (loops)
assets/sounds/run/        side-to-side run (name a clip after a character, e.g. run/amaluttan.mp3)
```
A random clip from the folder plays each time (mp3/ogg/wav/m4a).

**After adding/removing files run** `node scripts/build-manifest.js` (Vercel runs it automatically on deploy).
Background removal needs http(s), so test locally with `npx serve .` instead of double-clicking.

Difficulty settings in `js/config.js`: `hitRadius`, `reload`, `maxMosquitos`, `bedScale`, `lives`.

## Deploy to Vercel
It's a static site — no build step.

**CLI**
```bash
npm i -g vercel
vercel login          # once
vercel --prod         # run inside this folder; accept defaults (Framework: Other)
```

**Or via GitHub:** push this folder to a repo → vercel.com → Add New Project → import it →
Framework Preset "Other", no build command, output dir `.` → Deploy. Every push redeploys.

To change faces/sounds later: replace files in `assets/`, then `vercel --prod` again (or push).
