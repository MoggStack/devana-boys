/* =========================================================
   HOSTEL MOSQUITOS — main game
   Canvas 2D rendering + GSAP for all tweened animation
   ========================================================= */
(() => {
  const CFG = window.GAME_CONFIG;
  const TAU = Math.PI * 2;
  const INK = "#1c1c1c";

  /* ---------- helpers ---------- */
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const $ = (id) => document.getElementById(id);

  /* ---------- canvas & layout ---------- */
  const app = $("app");
  const canvas = $("game");
  const ctx = canvas.getContext("2d");
  const fx = $("fx"); // DOM layer for bubbles / floating text
  let W, H, DPR, S, BS, MS, bedX, bedY, floorY;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = app.clientWidth;
    H = app.clientHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    S = clamp(Math.min(W / 400, H / 700), 0.6, 1.3);
    BS = S * (CFG.bedScale || 0.72); // bed + sleeper scale
    MS = Math.max(0.5, S * (CFG.mosquitoScale || 0.65)); // mosquito scale
    bedX = W * 0.5 + 6 * BS;
    bedY = H * 0.72;
    floorY = bedY + 92 * BS;
  }
  window.addEventListener("resize", resize);
  resize();

  /* local (bed space) -> screen */
  const toScreen = (lx, ly) => ({ x: bedX + lx * BS, y: bedY + ly * BS });

  /* ---------- faces ---------- */
  const faces = { sleeper: null, mosquitos: [] };

  function detectCutout(img) {
    if (CFG.faceMode === "circle") return false;
    if (CFG.faceMode === "cutout") return true;
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 16;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0, 16, 16);
      const d = g.getImageData(0, 0, 16, 16).data;
      const a = (x, y) => d[(y * 16 + x) * 4 + 3];
      return a(0, 0) + a(15, 0) + a(0, 15) + a(15, 15) < 200;
    } catch (e) {
      return false; // tainted canvas (file://) -> default circle
    }
  }

  /* Removes a plain black / white / transparent background (flood fill
     from the edges) and trims empty margins -> cut-out face canvas.
     Needs http(s) (Vercel / local server); on file:// it is skipped. */
  function processFace(img) {
    if (CFG.faceMode === "circle") return img;
    try {
      const w = img.naturalWidth, h = img.naturalHeight;
      const sc = Math.min(1, 512 / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc));
      const c = document.createElement("canvas");
      c.width = cw;
      c.height = ch;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0, cw, ch);
      const id = g.getImageData(0, 0, cw, ch);
      const d = id.data;
      const kind = (i) => {
        if (d[i * 4 + 3] < 20) return "t";
        const mx = Math.max(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
        const mn = Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
        if (mx < 24) return "k";
        if (mn > 235) return "w";
        return null;
      };
      const ks = [0, cw - 1, (ch - 1) * cw, ch * cw - 1].map(kind);
      if (!ks[0] || ks.some((k) => k !== ks[0])) return img; // no plain background
      const bg = ks[0];
      const isBg = (i) => {
        if (d[i * 4 + 3] < 20) return true;
        const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
        if (bg === "k") return Math.max(r, gg, b) < 12;
        if (bg === "w") return Math.min(r, gg, b) > 238;
        return false;
      };
      const seen = new Uint8Array(cw * ch);
      const stack = [];
      for (let x = 0; x < cw; x++) stack.push(x, (ch - 1) * cw + x);
      for (let y = 0; y < ch; y++) stack.push(y * cw, y * cw + cw - 1);
      while (stack.length) {
        const i = stack.pop();
        if (seen[i] || !isBg(i)) continue;
        seen[i] = 1;
        const x = i % cw;
        if (x > 0) stack.push(i - 1);
        if (x < cw - 1) stack.push(i + 1);
        if (i >= cw) stack.push(i - cw);
        if (i < cw * (ch - 1)) stack.push(i + cw);
      }
      let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
      for (let i = 0; i < cw * ch; i++) {
        if (seen[i]) {
          d[i * 4 + 3] = 0;
          continue;
        }
        const x = i % cw, y = (i / cw) | 0;
        if ((x > 0 && seen[i - 1]) || (x < cw - 1 && seen[i + 1]) || (y > 0 && seen[i - cw]) || (y < ch - 1 && seen[i + cw])) {
          d[i * 4 + 3] = Math.min(d[i * 4 + 3], 150); // soften edge
        }
        if (d[i * 4 + 3] > 20) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
      if (x1 <= x0 || y1 <= y0) return img;
      g.putImageData(id, 0, 0);
      const out = document.createElement("canvas");
      out.width = x1 - x0 + 1;
      out.height = y1 - y0 + 1;
      out.getContext("2d").drawImage(c, -x0, -y0);
      out._cutout = true;
      return out;
    } catch (e) {
      return img; // tainted (file://) -> use as-is
    }
  }

  function loadImg(src) {
    return new Promise((res) => {
      if (!src) return res(null);
      const i = new Image();
      i.onload = () => {
        const out = processFace(i);
        if (out === i) i._cutout = detectCutout(i);
        res(out);
      };
      i.onerror = () => res(null);
      i.src = src;
    });
  }

  async function loadFaces() {
    const M = window.ASSET_MANIFEST || { faces: { sleeper: [], mosquitos: [] } };
    faces.sleeper = await loadImg(M.faces.sleeper[0]);
    const chars = CFG.characters || {};
    faces.mosquitos = (
      await Promise.all(
        M.faces.mosquitos.map(async (src) => {
          const img = await loadImg(src);
          if (!img) return null;
          const key = decodeURIComponent(src.split("/").pop()).replace(/\.[^.]+$/, "").toLowerCase();
          const ck = Object.keys(chars).find((k) => key === k.toLowerCase() || key.includes(k.toLowerCase()));
          img._char = ck ? chars[ck] : null;
          return img;
        })
      )
    ).filter(Boolean);
  }

  /* shuffle bag: every face comes once per round in a random order,
     so nobody is left out and the same face never comes twice in a row */
  let faceBag = [];
  let lastFace = null;
  function pickFace() {
    const fs = faces.mosquitos;
    if (!fs.length) return null;
    if (!faceBag.length) {
      faceBag = fs.slice();
      for (let i = faceBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [faceBag[i], faceBag[j]] = [faceBag[j], faceBag[i]];
      }
      if (faceBag.length > 1 && faceBag[faceBag.length - 1] === lastFace) {
        [faceBag[0], faceBag[faceBag.length - 1]] = [faceBag[faceBag.length - 1], faceBag[0]];
      }
    }
    lastFace = faceBag.pop();
    return lastFace;
  }

  /** draw a face image inside a circle of radius r (or as cut-out) */
  function drawFaceImg(img, x, y, r, rot = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (img._cutout) {
      const k = (2.3 * r) / Math.max(iw, ih);
      ctx.drawImage(img, (-iw * k) / 2, (-ih * k) / 2, iw * k, ih * k);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.save();
      ctx.clip();
      const side = Math.min(iw, ih);
      const sx = (iw - side) / 2;
      const sy = ((ih - side) / 2) * 0.5; // bias towards top of portraits
      ctx.drawImage(img, sx, sy, side, side, -r, -r, r * 2, r * 2);
      ctx.restore();
      ctx.lineWidth = Math.max(2, r * 0.08);
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- game state ---------- */
  let state = "menu"; // menu | playing | paused | over
  let score = 0, best = +localStorage.getItem("hm_best") || 0;
  let lives = CFG.lives, level = 1, combo = 0;
  let mosquitos = [], splats = [], particles = [], zzz = [];
  let spawnTimer = 1, zzzTimer = 0, time = 0;
  let runLock = null;          // mosquito currently doing the side-to-side run
  let runAudio = null;
  const seenChars = new Set(); // characters that already did their intro run this round
  const shake = { amt: 0 };
  const shot = { x1: 0, y1: 0, x2: 0, y2: 0, len: 0, a: 0 };
  const impact = { x: 0, y: 0, hit: 0 };
  const pointer = { x: -999, y: -999, mouse: false };
  const sleeper = { twitch: 0, scratch: 0, sx: 0, sy: 0, awake: 0, bumps: [], headShake: 0 };

  /* only one mosquito may aim / dive / bite at a time */
  const attackBusy = (self) =>
    mosquitos.some((o) => o !== self && !o.dead && (o.state === "aim" || o.state === "dive" || o.state === "bite"));

  /* ---------- sleeper geometry (bed-local units) ---------- */
  const HEAD = { x: -158, y: -62, r: 42 };
  const BITE_SPOTS = [
    { x: -132, y: -44, name: "face" },
    { x: -168, y: -76, name: "head" },
    { x: 14, y: -40, name: "hand" },
    { x: -48, y: -36, name: "arm" },
    { x: 186, y: -44, name: "feet" },
    { x: 70, y: -50, name: "belly" },
  ];

  /* =========================================================
     MOSQUITO
     ========================================================= */
  let nextId = 1;
  class Mosquito {
    constructor(opt = {}) {
      this.id = nextId++;
      const fromLeft = opt.fromLeft ?? Math.random() < 0.5;
      this.x = opt.x ?? (fromLeft ? -70 : W + 70);
      this.y = opt.y ?? rand(H * 0.08, H * 0.5);
      this.vx = 0;
      this.vy = 0;
      this.face = pickFace();
      this.look = Math.floor(Math.random() * 3);
      this.state = "wander";
      this.t = 0;
      this.speed = rand(185, 250) * (1 + (level - 1) * 0.09) * Math.max(0.8, S);
      this.wanderTime = rand(1.8, 3.6) * Math.max(0.45, 1 - (level - 1) * 0.07);
      this.aimTime = Math.max(0.7, 1.7 - (level - 1) * 0.08);
      this.biteTime = 1.7;
      this.goal = this.wanderPoint();
      this.flap = Math.random() * 10;
      this.wob = Math.random() * 100;
      this.facing = fromLeft ? 1 : -1;
      this.sx = 1;
      this.sy = 1;
      this.rot = 0;
      this.alpha = 1;
      this.belly = 0;
      this.pour = 0;
      this.trail = [];
      this.trailT = 0;
      this.target = null;
      this.isGf = !!opt.isGf;
      this.partner = null;
      this.angry = false;
      this.dead = false;
      this.remove = false;
      this.char = (this.face && this.face._char) || null;
      this.outfit = this.char ? this.char.outfit : null;
      if (this.char) {
        this.speed *= this.char.speed || 1;
        this.aimTime *= this.char.aimMul || 1;
        this.wanderTime *= this.char.wanderMul || 1;
      }
      this.celebrate = 0;
      if (this.outfit === "gamer") this.initPes();
      this.initCross(fromLeft);
      this.pop = 0; // spawn pop-in
      gsap.fromTo(this, { pop: 0 }, { pop: 1, duration: 0.5, ease: "back.out(2)" });
    }

    /* fly across the room from one side to the other (wavy line).
       "roam" characters loop around the room until their fly clip ends, then leave. */
    initCross(fromLeft) {
      this.state = "cross";
      this.t = 0;
      this.tStraight = 0;
      this.dir = fromLeft ? 1 : -1;
      this.x = fromLeft ? -50 : W + 50;
      this.lane = rand(H * 0.14, Math.min(H * 0.55, bedY - 110 * BS));
      this.y = this.lane;
      this.waveAmp = rand(8, 40) * MS;
      this.waveFreq = rand(1.2, 2.8);
      this.crossSpeed = W * rand(0.26, 0.38) * (1 + (level - 1) * 0.07) * ((this.char && this.char.speed) || 1);
      this.facing = this.dir;
      this.roam = !!(this.char && this.char.roam);
      this.roamDone = !this.roam;
      this.roamPhase = rand(0, TAU);
      const key = this.char ? Object.keys(CFG.characters).find((k) => CFG.characters[k] === this.char) : null;
      this.flyAudio = Sound.playFly(key);
      this.flyDone = !this.flyAudio;
      if (this.flyAudio) this.flyAudio.addEventListener("ended", () => (this.flyDone = true), { once: true });
    }

    stopFly() {
      if (this.flyAudio) this.flyAudio.pause();
      this.flyAudio = null;
    }

    wanderPoint() {
      const m = 60 * MS;
      return {
        x: rand(m, W - m),
        y: rand(Math.max(70, H * 0.12), Math.min(bedY - 40 * S, H * 0.62)),
      };
    }

    steer(tx, ty, spd, agility, dt) {
      const dx = tx - this.x, dy = ty - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / (90 * MS));
      const dvx = (dx / d) * spd * k, dvy = (dy / d) * spd * k;
      const a = Math.min(1, agility * dt);
      this.vx += (dvx - this.vx) * a;
      this.vy += (dvy - this.vy) * a;
      return d;
    }

    /* proboscis tip offset relative to body origin */
    tipOffset(facing = this.facing) {
      if (this.outfit === "tea") return { x: facing * 18 * MS, y: 125 * MS };
      return { x: facing * 54 * MS, y: 24 * MS };
    }

    targetScreen() {
      return toScreen(this.target.x, this.target.y);
    }

    update(dt) {
      if (this.dead) return;
      this.t += dt;
      this.flap += dt * (this.outfit === "runner" ? 95 : 60);
      if (this.pes) this.updatePes(dt);
      this.wob += dt;

      // safety: a run can never last forever
      if (this.state === "run" && !this.roam && this.t > (CFG.runMaxSeconds || 12) + 4) this.endRun();
      // safety: a mosquito that got lost far outside the room is brought back
      if (!isFinite(this.x) || !isFinite(this.y) || this.x < -W || this.x > W * 2 || this.y < -H || this.y > H * 2) {
        if (this.state === "flee" || this.state === "cross") {
          if (this.stopFly) this.stopFly();
          this.remove = true;
          return;
        }
        if (this.state === "run") this.endRun();
        this.x = this.x < W / 2 ? -40 : W + 40;
        this.y = H * 0.3;
        this.vx = this.vy = 0;
        if (this.state !== "wander") {
          this.state = "wander";
          this.t = 0;
        }
        this.goal = this.wanderPoint();
      }

      // no attacking while the sleeper is saying his line
      if (Sound.sleeperTalking()) {
        if (this.state === "dive") {
          this.state = "aim";
          this.hover = { x: this.x, y: Math.min(this.y, bedY - 120 * BS) };
        }
        if (this.state === "aim" || this.state === "bite") this.t = Math.max(0, this.t - dt);
      }

      switch (this.state) {
        case "cross": {
          if (!this.roamDone) {
            const ph = this.roamPhase + this.t;
            const tx = W / 2 + Math.sin(ph * 0.85) * W * 0.36;
            const ty = H * 0.3 + Math.sin(ph * 1.6) * H * 0.13;
            this.steer(tx, ty, this.speed * 1.2, 2.5, dt);
            if (Math.abs(this.vx) > 20) this.facing = this.vx < 0 ? -1 : 1;
            const clipLen = this.flyAudio && isFinite(this.flyAudio.duration) ? this.flyAudio.duration : 0;
            const limit = this.flyAudio ? Math.max(clipLen + 0.5, 3) : 4;
            if (this.flyDone || this.t > limit) {
              this.roamDone = true;
              this.dir = this.x < W / 2 ? -1 : 1; // leave by the nearest side
              this.lane = this.y;
              this.tStraight = 0;
            }
            break;
          }
          this.vx = this.vy = 0;
          this.tStraight += dt;
          this.x += this.dir * this.crossSpeed * dt;
          this.y = this.lane + Math.sin(this.tStraight * this.waveFreq) * this.waveAmp;
          this.facing = this.dir;
          if ((this.dir > 0 && this.x > W + 60) || (this.dir < 0 && this.x < -60)) {
            this.stopFly();
            this.remove = true;
            Game.onEscape(this);
          }
          break;
        }
        case "run": {
          if (this.roam) {
            // looping flight path that stays on screen
            const ph = this.roamPhase + this.t;
            const tx = W / 2 + Math.sin(ph * 0.85) * W * 0.36;
            const ty = H * 0.32 + Math.sin(ph * 1.6) * H * 0.15;
            this.steer(tx, ty, this.speed * 1.3, 2.5, dt);
            if (Math.abs(this.vx) > 20) this.facing = this.vx < 0 ? -1 : 1;
            const clipLen = runAudio && isFinite(runAudio.duration) ? runAudio.duration : 0;
            const limit = runAudio ? Math.max(clipLen + 1.5, 4) : 5;
            if (this.runAudioDone || this.t > limit) this.endRun();
            break;
          }
          this.vx = this.vy = 0;
          this.x += this.dir * this.runSpeed * dt;
          this.y = this.lane + Math.sin(this.t * 9) * 12 * MS;
          this.facing = this.dir;
          const out = this.dir > 0 ? this.x > W + 50 : this.x < -50;
          if (out) {
            this.passes++;
            const minPasses = CFG.runPasses || 2;
            if (this.passes >= minPasses && (this.runAudioDone || this.t > (CFG.runMaxSeconds || 12))) {
              this.endRun();
            } else {
              this.dir *= -1;
              this.lane = clamp(this.lane + rand(-60, 60), H * 0.15, H * 0.5);
            }
          }
          break;
        }
        case "wander": {
          let g = this.goal;
          if (this.isGf && this.partner && !this.partner.dead && this.partner.state === "wander") {
            g = { x: this.partner.x - this.partner.facing * 55 * MS, y: this.partner.y - 18 * MS };
          }
          const d = this.steer(g.x, g.y, this.speed, 2.2, dt);
          if (d < 30) this.goal = this.wanderPoint();
          const onScreen = this.x > 20 && this.x < W - 20;
          if (this.t > this.wanderTime && onScreen && !attackBusy(this) && !Sound.sleeperTalking()) this.startAim();
          break;
        }
        case "aim": {
          // hover in place, jittery
          this.steer(this.hover.x + Math.sin(this.t * 5) * 14 * MS, this.hover.y + Math.cos(this.t * 4) * 10 * MS, this.speed * 0.6, 3, dt);
          const tp = this.targetScreen();
          this.facing = tp.x < this.x ? -1 : 1;
          if (this.t >= this.aimTime) {
            this.state = "dive";
            this.t = 0;
          }
          break;
        }
        case "dive": {
          const tp = this.targetScreen();
          const off = this.tipOffset();
          const d = this.steer(tp.x - off.x, tp.y - off.y, this.speed * 2.7, 6, dt);
          if (d < 6 * MS) {
            this.state = "bite";
            this.t = 0;
            this.vx = this.vy = 0;
          }
          break;
        }
        case "bite": {
          const tp = this.targetScreen();
          const off = this.tipOffset();
          this.x = tp.x - off.x;
          this.y = tp.y - off.y;
          if (this.outfit === "tea") this.pour = clamp(this.t / this.biteTime, 0, 1);
          else this.belly = clamp(this.t / this.biteTime, 0, 1);
          if (this.t >= this.biteTime) {
            Game.onBite(this);
            this.state = "flee";
            this.t = 0;
            this.goal = { x: Math.random() < 0.5 ? -120 : W + 120, y: rand(-60, H * 0.3) };
          }
          break;
        }
        case "flee": {
          this.steer(this.goal.x, this.goal.y, this.speed * 0.75, 1.5, dt);
          if (this.x < -100 || this.x > W + 100 || this.y < -100) this.remove = true;
          break;
        }
      }

      if (this.state !== "bite") {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if (this.state === "wander" || this.state === "flee") {
          if (Math.abs(this.vx) > 25) this.facing = this.vx < 0 ? -1 : 1;
        }
      }

      // dashed flight trail
      this.trailT += dt;
      if (this.trailT > 0.04) {
        this.trailT = 0;
        const p = this.drawPos();
        this.trail.push({ x: p.x, y: p.y });
        if (this.trail.length > 26) this.trail.shift();
      }
    }

    startRun() {
      const fromLeft = Math.random() < 0.5;
      this.state = "run";
      this.t = 0;
      this.dir = fromLeft ? 1 : -1;
      this.x = fromLeft ? -60 : W + 60;
      this.lane = rand(H * 0.2, H * 0.42);
      this.y = this.lane;
      this.vx = this.vy = 0;
      this.passes = 0;
      this.runSpeed = W * 0.8 * (this.outfit === "runner" ? 1.35 : 1);
      // "roam" characters fly loops around the room for the whole clip instead of zipping across
      this.roam = !!(this.char && this.char.roam);
      this.roamPhase = rand(0, TAU);
      runLock = this;
      const key = this.char ? Object.keys(CFG.characters).find((k) => CFG.characters[k] === this.char) : null;
      runAudio = Sound.playRun(key);
      this.runAudioDone = !runAudio;
      if (runAudio) runAudio.addEventListener("ended", () => (this.runAudioDone = true), { once: true });
      const label = this.char ? `${this.char.icon || ""} ${this.char.name} RUNNING!` : "🦟 RUN!";
      floatText(label, W / 2, H * 0.14, "intro");
    }

    endRun() {
      this.state = "wander";
      this.t = 0;
      this.goal = this.wanderPoint();
      if (runLock === this) runLock = null;
      if (runAudio) runAudio.pause();
      runAudio = null;
    }

    /* ---------- tiny PES match on Adhnan's phone ----------
       pitch coords: x -16..16 (red attacks right, blue attacks left), y -7..7 */
    initPes() {
      const mk = (pts) => pts.map(([x, y]) => ({ x, y, bx: x, by: y }));
      this.pes = {
        bx: 0, by: 0, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, p: 1.2,
        team: Math.random() < 0.5 ? 0 : 1, shot: false, a: 0, b: 0, goalT: 0,
        thumbL: 0, thumbR: 0,
        red: mk([[-11, 0], [-5, -4], [-5, 4], [1, 0]]),
        blue: mk([[11, 0], [5, -4], [5, 4], [-1, 0]]),
      };
    }

    updatePes(dt) {
      const g = this.pes;
      g.thumbL += dt * 7;
      if (g.goalT > 0) {
        g.goalT -= dt;
        return;
      }
      g.p += dt * (g.shot ? 3.2 : 2.1);
      const e = (1 - Math.cos(Math.PI * Math.min(1, g.p))) / 2;
      g.bx = g.from.x + (g.to.x - g.from.x) * e;
      g.by = g.from.y + (g.to.y - g.from.y) * e;
      const atk = g.team === 0 ? 1 : -1;

      if (g.shot && g.p >= 1) {
        // GOAL
        g.shot = false;
        if (g.team === 0) g.a++;
        else g.b++;
        g.goalT = 1.3;
        g.team ^= 1;
        g.from = { x: 0, y: 0 };
        g.to = { x: 0, y: 0 };
        g.bx = g.by = 0;
        g.p = 1.2;
        gsap.fromTo(this, { celebrate: 0 }, { celebrate: 1, duration: 0.7, ease: "power1.inOut" });
        for (const pl of [...g.red, ...g.blue]) {
          pl.x = pl.bx;
          pl.y = pl.by;
        }
        return;
      }
      if (g.p >= 1.15) {
        // next action: pass forward, tackle, or shoot
        g.from = { x: g.bx, y: g.by };
        g.p = 0;
        g.thumbR = 1; // button press
        if (g.bx * atk > 6 && Math.random() < 0.5) {
          g.shot = true;
          g.to = { x: 16.5 * atk, y: rand(-1.8, 1.8) };
        } else if (Math.random() < 0.22) {
          g.team ^= 1; // tackled
          g.to = { x: clamp(g.bx + rand(-3, 3), -13, 13), y: clamp(g.by + rand(-4, 4), -6, 6) };
        } else {
          g.to = { x: clamp(g.bx + atk * rand(2.5, 6), -14, 14), y: clamp(g.by + rand(-5, 5), -6, 6) };
        }
      }
      g.thumbR = Math.max(0, g.thumbR - dt * 5);
      // players: shape follows the ball, nearest attacker chases it
      const attackers = g.team === 0 ? g.red : g.blue;
      let chaser = attackers[0], best = 1e9;
      for (const pl of attackers) {
        const d = Math.hypot(pl.x - g.to.x, pl.y - g.to.y);
        if (d < best) { best = d; chaser = pl; }
      }
      for (const pl of [...g.red, ...g.blue]) {
        let tx = pl.bx + (g.bx - pl.bx) * 0.35, ty = pl.by + (g.by - pl.by) * 0.3;
        if (pl === chaser) { tx = g.to.x - atk * 1.2; ty = g.to.y; }
        pl.x += (tx - pl.x) * Math.min(1, dt * 3.5);
        pl.y += (ty - pl.y) * Math.min(1, dt * 3.5);
      }
    }

    startAim() {
      this.state = "aim";
      this.t = 0;
      this.hover = { x: this.x, y: this.y };
      this.target = pick(BITE_SPOTS);
    }

    drawPos() {
      if (this.dead || this.state === "bite") {
        const j = this.state === "bite" ? Math.sin(this.wob * 40) * 0.8 : 0;
        return { x: this.x + j, y: this.y };
      }
      const w = this.wob + this.id * 3.7;
      const amp = this.state === "dive" ? 2 : 9;
      const hop = Math.sin(this.celebrate * Math.PI * 2) * 9 * MS * (this.celebrate > 0 && this.celebrate < 1 ? 1 : 0);
      return {
        x: this.x + (Math.sin(w * 7.3) * amp + Math.sin(w * 13.1) * 2) * MS,
        y: this.y + (Math.cos(w * 6.1) * amp + Math.sin(w * 17.3) * 1.5) * MS - Math.abs(hop),
      };
    }

    /* centre used for hit testing (between head & thorax) */
    hitCenter() {
      const p = this.drawPos();
      return { x: p.x + this.facing * 6 * MS, y: p.y + 2 * MS };
    }

    kill() {
      this.stopFly();
      if (runLock === this) {
        runLock = null;
        if (runAudio) runAudio.pause();
        runAudio = null;
      }
      this.dead = true;
      this.state = "dead";
      const spin = (Math.random() < 0.5 ? -1 : 1) * rand(2, 3.5);
      const landY = floorY + rand(-4, 16) * BS;
      const tl = gsap.timeline({ onComplete: () => (this.remove = true) });
      tl.to(this, { sx: 1.35, sy: 0.45, duration: 0.07, ease: "power2.out" })
        .to(this, { sx: 1, sy: 1, duration: 0.2, ease: "elastic.out(1,0.4)" })
        .to(this, { y: landY, rot: spin, x: this.x + rand(-40, 40), duration: 0.9, ease: "bounce.out" }, "<")
        .to(this, { alpha: 0, duration: 1, delay: 1.6 });
    }

    /* ---------- drawing ---------- */
    drawGuides() {
      if (this.dead) return;
      // trail
      if (this.trail.length > 2) {
        ctx.save();
        ctx.setLineDash([4 * MS, 7 * MS]);
        ctx.lineWidth = 1.3;
        ctx.strokeStyle = "rgba(0,0,0,0.22)";
        ctx.beginPath();
        ctx.moveTo(this.trail[0].x, this.trail[0].y);
        for (const p of this.trail) ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.restore();
      }
      // attack line + countdown ring
      if (this.state === "aim" || this.state === "dive") {
        const p = this.drawPos();
        const tip = this.tipOffset();
        const tp = this.targetScreen();
        const sx = p.x + tip.x, sy = p.y + tip.y;
        const prog = this.state === "aim" ? this.t / this.aimTime : 1;
        ctx.save();
        ctx.setLineDash([7, 7]);
        ctx.lineDashOffset = -time * 40;
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = this.angry ? "rgba(200,30,40,0.75)" : "rgba(0,0,0,0.55)";
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tp.x, tp.y);
        ctx.stroke();
        ctx.setLineDash([]);
        // target cross
        const r = 7 + Math.sin(time * 10) * 1.5;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, r, 0, TAU);
        ctx.stroke();
        if (this.state === "aim") {
          const mx = (sx + tp.x) / 2, my = (sy + tp.y) / 2;
          const R = 10 * Math.max(1, S);
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(mx, my, R, 0, TAU);
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = "#d0202b";
          ctx.beginPath();
          ctx.arc(mx, my, R + 3, -Math.PI / 2, -Math.PI / 2 + TAU * prog);
          ctx.stroke();
          ctx.fillStyle = INK;
          ctx.font = `bold ${Math.round(R * 1.2)}px "Patrick Hand", sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(Math.max(1, Math.ceil(this.aimTime - this.t)), mx, my + 1);
        }
        ctx.restore();
      }
    }

    draw() {
      const p = this.drawPos();
      if (this.outfit === "tea" && this.state === "bite" && this.target) {
        const tp = this.targetScreen();
        const sx = p.x + this.facing * 26 * MS, sy = p.y + 48 * MS;
        ctx.save();
        ctx.strokeStyle = "rgba(139,90,43,0.9)";
        ctx.lineCap = "round";
        ctx.lineWidth = 4.5 * MS;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        const wig = Math.sin(time * 30) * 3;
        ctx.quadraticCurveTo(sx + (tp.x - sx) * 0.2 + wig, (sy + tp.y) / 2, tp.x, tp.y);
        ctx.stroke();
        ctx.fillStyle = "rgba(139,90,43,0.85)";
        for (let k = 0; k < 5; k++) {
          const a = time * 9 + k * 1.3;
          ctx.beginPath();
          ctx.arc(tp.x + Math.cos(a) * 12 * MS, tp.y - Math.abs(Math.sin(a)) * 10 * MS, 2.2 * MS, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
      const sc = MS * this.pop;
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(this.rot);
      ctx.scale(sc * this.sx, sc * this.sy);

      // ---- body (drawn facing left, flipped if facing right)
      ctx.save();
      if (this.facing > 0) ctx.scale(-1, 1);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = INK;

      // legs
      const runner = this.outfit === "runner";
      const sway = this.dead ? 0 : runner ? Math.sin(this.wob * 24) * 7 : Math.sin(this.wob * 6) * 3;
      ctx.lineWidth = 1.7;
      for (let i = 0; i < 6; i++) {
        const bx = -2 + i * 3.2, by = 7;
        const kx = bx - 14 + i * 7 + sway * (i % 2 ? 1 : -1), ky = by + 13;
        const fx2 = kx - 5 + i * 3, fy = ky + 17 + sway * 0.6;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(kx, ky);
        ctx.lineTo(fx2, fy);
        ctx.stroke();
        if (runner) {
          // running shoes
          ctx.beginPath();
          ctx.ellipse(fx2 - 2.5, fy + 1, 5, 2.8, 0, 0, TAU);
          ctx.fillStyle = i % 2 ? "#e63946" : "#ffffff";
          ctx.fill();
          ctx.lineWidth = 1.1;
          ctx.stroke();
          ctx.lineWidth = 1.7;
        }
      }

      if (runner && !this.dead) {
        // speed lines
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        for (const [ly, l] of [[-4, 26], [6, 34], [16, 22]]) {
          const o = (time * 300 + ly * 7) % 14;
          ctx.beginPath();
          ctx.moveTo(66 + o, ly);
          ctx.lineTo(66 + o + l, ly);
          ctx.stroke();
        }
        ctx.restore();
      }

      if (this.outfit === "gamer" && this.pes) drawPhoneGame(this);

      if (this.outfit === "tea") {
        // tea kettle held by the legs; tips over while pouring
        const pouring = this.state === "bite";
        ctx.save();
        ctx.translate(8, 34);
        ctx.rotate(this.dead ? 0.6 : pouring ? -0.75 : Math.sin(this.wob * 3) * 0.12);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(-6, -4);
        ctx.lineTo(-4, 8);
        ctx.moveTo(10, -4);
        ctx.lineTo(8, 8);
        ctx.stroke();
        // spout
        ctx.beginPath();
        ctx.moveTo(-10, 18);
        ctx.quadraticCurveTo(-20, 16, -26, 6);
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.lineWidth = 2;
        // body
        ctx.beginPath();
        ctx.moveTo(-12, 10);
        ctx.lineTo(14, 10);
        ctx.quadraticCurveTo(20, 30, 12, 34);
        ctx.lineTo(-10, 34);
        ctx.quadraticCurveTo(-18, 30, -12, 10);
        ctx.closePath();
        ctx.fillStyle = "#d7d7d7";
        ctx.fill();
        ctx.stroke();
        // lid + handle
        ctx.beginPath();
        ctx.ellipse(1, 9, 11, 3, 0, 0, TAU);
        ctx.fillStyle = "#bdbdbd";
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(19, 21, 7, -1.2, 1.2);
        ctx.stroke();
        ctx.fillStyle = "#8b5a2b";
        ctx.fillRect(-9, 24, 20, 3);
        ctx.restore();
        if (!pouring && !this.dead) {
          // steam
          ctx.save();
          ctx.strokeStyle = "rgba(0,0,0,0.35)";
          ctx.lineWidth = 1.4;
          for (let k = 0; k < 2; k++) {
            const sx2 = -22 + k * 6, ph = time * 4 + k * 2;
            ctx.beginPath();
            ctx.moveTo(sx2, 36);
            ctx.bezierCurveTo(sx2 - 5, 30 + Math.sin(ph) * 2, sx2 + 5, 26, sx2, 20 + Math.sin(ph) * 2);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      if (this.outfit === "traveler") {
        // suitcase hanging from the legs
        ctx.save();
        ctx.translate(8, 36);
        ctx.rotate(this.dead ? 0.4 : Math.sin(this.wob * 3.5) * 0.18);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(-8, -4);
        ctx.lineTo(-6, 10);
        ctx.moveTo(12, -4);
        ctx.lineTo(10, 10);
        ctx.stroke();
        roundRect(-14, 10, 30, 24, 4);
        ctx.fillStyle = "#9a6232";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-14, 17);
        ctx.lineTo(16, 17);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        roundRect(-4, 6, 10, 5, 2); // handle
        ctx.stroke();
        ctx.fillStyle = "#4cc9f0";
        ctx.fillRect(-10, 21, 7, 5); // stickers
        ctx.fillStyle = "#ffd60a";
        ctx.fillRect(4, 23, 8, 6);
        ctx.fillStyle = "#e63946";
        ctx.beginPath();
        ctx.arc(-1, 29, 2.5, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      // abdomen
      ctx.save();
      ctx.translate(36, 6);
      ctx.rotate(0.28);
      const rx = 27 + this.belly * 4, ry = 8 + this.belly * 7;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
      ctx.fillStyle = runner ? "#ff7a1a" : "#fafafa";
      ctx.fill();
      if (this.belly > 0) {
        ctx.fillStyle = `rgba(205,25,35,${0.25 + this.belly * 0.65})`;
        ctx.fill();
      }
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1.3;
      for (let k = -2; k <= 2; k++) {
        const xx = k * 8.5;
        const yy = ry * Math.sqrt(Math.max(0, 1 - (xx / rx) ** 2));
        ctx.beginPath();
        ctx.moveTo(xx, -yy);
        ctx.lineTo(xx + 2, yy);
        ctx.stroke();
      }
      ctx.restore();

      // thorax
      ctx.beginPath();
      ctx.ellipse(6, 1, 13, 10, 0.1, 0, TAU);
      ctx.fillStyle = "#efefef";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();

      // wings
      const fa = this.dead ? 0.3 : Math.sin(this.flap) * 0.75;
      for (const [base, alpha] of [[-1.15, 0.5], [-0.8, 0.35]]) {
        ctx.save();
        ctx.translate(10, -6);
        ctx.rotate(base + fa);
        ctx.beginPath();
        ctx.ellipse(22, 0, 24, 7.5, 0, 0, TAU);
        ctx.fillStyle = `rgba(185,212,255,${alpha})`;
        ctx.fill();
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(2, 0);
        ctx.lineTo(40, 0);
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.restore();
      }

      // proboscis + antennae
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-26, 8);
      ctx.quadraticCurveTo(-42, 16, -54, 24);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-22, -15);
      ctx.quadraticCurveTo(-30, -30, -40, -34);
      ctx.moveTo(-14, -17);
      ctx.quadraticCurveTo(-16, -34, -26, -40);
      ctx.stroke();
      ctx.restore(); // un-flip

      // head (never mirrored so photos stay correct)
      const hx = this.facing * 20, hy = -5, hr = 24;
      if (this.face) {
        if (!this.face._cutout) {
          ctx.beginPath();
          ctx.arc(hx, hy, hr, 0, TAU);
          ctx.fillStyle = "#fff";
          ctx.fill();
        }
        const tilt = this.outfit === "gamer" && !this.dead ? this.facing * (0.2 + Math.sin(this.wob * 2) * 0.04) : 0;
        drawFaceImg(this.face, hx, hy + (tilt ? 3 : 0), hr, tilt);
      } else {
        drawCartoonMosquitoFace(hx, hy, hr, this.look, this.facing, this.dead, this.angry);
      }

      if (this.isGf) drawBow(hx - this.facing * 2, hy - hr - 2);
      if (this.outfit === "runner") {
        // headband
        ctx.save();
        ctx.beginPath();
        ctx.arc(hx, hy, hr * 1.08, 0, TAU);
        ctx.clip();
        ctx.fillStyle = "#e63946";
        ctx.fillRect(hx - hr * 1.2, hy - hr * 0.62, hr * 2.4, hr * 0.3);
        ctx.fillStyle = "#fff";
        ctx.fillRect(hx - hr * 1.2, hy - hr * 0.5, hr * 2.4, hr * 0.06);
        ctx.restore();
        // race bib on the singlet (abdomen)
        const bx = -this.facing * 34, by = 4;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(-this.facing * 0.28);
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.2;
        ctx.fillRect(-9, -6, 18, 12);
        ctx.strokeRect(-9, -6, 18, 12);
        ctx.fillStyle = INK;
        ctx.font = "bold 8px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.char.bib || "30K", 0, 0.5);
        ctx.restore();
      }
      if (CFG.showNames && this.char && this.char.name && !this.dead) {
        ctx.save();
        ctx.font = `bold 12px "Patrick Hand", sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#fff";
        const label = (this.char.icon ? this.char.icon + " " : "") + this.char.name;
        ctx.strokeText(label, hx, hy - hr - 8);
        ctx.fillStyle = INK;
        ctx.fillText(label, hx, hy - hr - 8);
        ctx.restore();
      }
      if (this.angry && !this.dead) {
        ctx.font = "bold 16px sans-serif";
        ctx.fillStyle = "#d0202b";
        ctx.textAlign = "center";
        ctx.fillText("💢", hx + 18, hy - 18);
      }
      if (this.dead) {
        // X eyes overlay
        ctx.strokeStyle = "#d0202b";
        ctx.lineWidth = 2.5;
        for (const ex of [-6, 6]) {
          ctx.beginPath();
          ctx.moveTo(hx + ex - 3.5, hy - 6);
          ctx.lineTo(hx + ex + 3.5, hy + 1);
          ctx.moveTo(hx + ex + 3.5, hy - 6);
          ctx.lineTo(hx + ex - 3.5, hy + 1);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  /* Adhnan's phone: landscape, both thumbs on it, live PES match.
     Drawn inside the mosquito's (possibly mirrored) body space. */
  function drawPhoneGame(m) {
    const g = m.pes;
    const mirrored = m.facing > 0; // body space is flipped: un-mirror the screen
    ctx.save();
    ctx.translate(-36, 40);
    ctx.rotate(-0.12 + (m.dead ? 0.9 : Math.sin(m.wob * 4) * 0.04 + (g.goalT > 0 ? Math.sin(time * 40) * 0.05 : 0)));
    ctx.scale(1.45, 1.45);

    // arms from the body to each side of the phone
    ctx.strokeStyle = INK;
    ctx.lineCap = "round";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(29, -27);
    ctx.quadraticCurveTo(28, -8, 19.5, 2);
    ctx.moveTo(31, -25);
    ctx.quadraticCurveTo(14, 20, -19.5, 4);
    ctx.stroke();

    // glow
    ctx.save();
    ctx.globalAlpha = 0.16 + Math.sin(time * 5) * 0.04 + (g.goalT > 0 ? 0.15 : 0);
    ctx.fillStyle = g.goalT > 0 ? "#fff59d" : "#a5ffb0";
    ctx.beginPath();
    ctx.ellipse(0, 0, 27, 17, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // phone body
    roundRect(-20, -11, 40, 22, 5);
    ctx.fillStyle = "#1d1f22";
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(mirrored ? 18.3 : -18.3, 0, 0.9, 0, TAU); // camera
    ctx.fill();

    // ---- screen (clip) ----
    ctx.save();
    roundRect(-17, -8.5, 34, 17, 2);
    ctx.clip();
    if (mirrored) ctx.scale(-1, 1);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? "#2f9e44" : "#37b24d";
      ctx.fillRect(-17 + i * 4.25, -8.5, 4.25, 17);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 0.45;
    ctx.strokeRect(-16, -7, 32, 14);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(0, 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 2.6, 0, TAU);
    ctx.stroke();
    ctx.strokeRect(-16, -3.5, 3.5, 7);
    ctx.strokeRect(12.5, -3.5, 3.5, 7);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(-17, -1.8, 1, 3.6);
    ctx.fillRect(16, -1.8, 1, 3.6);

    // players
    const drawP = (pl, col) => {
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(pl.x + 0.3, pl.y + 0.9, 1, 0.45, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(pl.x, pl.y, 0.95, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 0.3;
      ctx.stroke();
    };
    g.blue.forEach((pl) => drawP(pl, "#1c7ed6"));
    g.red.forEach((pl) => drawP(pl, "#e03131"));
    // ball (with a little bounce while moving)
    const lift = g.p < 1 ? Math.sin(Math.PI * g.p) * (g.shot ? 1.4 : 0.8) : 0;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(g.bx, g.by + 0.5, 0.7, 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(g.bx, g.by - lift, 0.65, 0, TAU);
    ctx.fill();

    // scoreboard: [red] 1-0 [blue]
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(-16.5, -8.3, 10, 3.4);
    ctx.fillStyle = "#e03131";
    ctx.fillRect(-16, -7.6, 1.6, 2);
    ctx.fillStyle = "#1c7ed6";
    ctx.fillRect(-8.6, -7.6, 1.6, 2);
    ctx.font = "bold 2.6px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.fillText(`${g.a} - ${g.b}`, -11.5, -6.5);

    if (g.goalT > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.5, g.goalT * 0.5)})`;
      ctx.fillRect(-17, -8.5, 34, 17);
      ctx.font = "bold 6px sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#000";
      const sc = 1 + Math.sin(time * 18) * 0.06;
      ctx.save();
      ctx.scale(sc, sc);
      ctx.strokeText("GOAL!", 0, 0.5);
      ctx.fillStyle = "#ffd43b";
      ctx.fillText("GOAL!", 0, 0.5);
      ctx.restore();
    }
    ctx.restore(); // end screen clip

    // thumbs: left circles on the joystick, right taps the buttons
    const tlx = -15 + Math.cos(g.thumbL) * 1.2, tly = 4 + Math.sin(g.thumbL * 1.3) * 1;
    const trx = 14.5, try_ = 3.2 - g.thumbR * 1.5;
    for (const [tx, ty, press] of [[tlx, tly, 0], [trx, try_, g.thumbR]]) {
      ctx.beginPath();
      ctx.ellipse(tx, ty, 2.6 - press * 0.4, 1.9, -0.5, 0, TAU);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCartoonMosquitoFace(x, y, r, look, facing, dead, angry) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = ["#f3d5b5", "#e8c39e", "#d9a878"][look];
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (!dead) {
      for (const ex of [-6, 6]) {
        ctx.beginPath();
        ctx.arc(ex, -3, 4, 0, TAU);
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ex + facing * 1.3, -2.5, 1.8, 0, TAU);
        ctx.fillStyle = INK;
        ctx.fill();
      }
      // brows
      ctx.lineWidth = 2;
      ctx.beginPath();
      const tilt = angry ? 4 : 2;
      ctx.moveTo(-10, -10 - tilt);
      ctx.lineTo(-3, -9 + tilt * 0.3);
      ctx.moveTo(10, -10 - tilt);
      ctx.lineTo(3, -9 + tilt * 0.3);
      ctx.stroke();
    }
    // grin with fangs
    ctx.beginPath();
    ctx.moveTo(-7, 6);
    ctx.quadraticCurveTo(0, 12, 7, 6);
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-4, 7.5);
    ctx.lineTo(-3, 11);
    ctx.lineTo(-2, 8.3);
    ctx.moveTo(4, 7.5);
    ctx.lineTo(3, 11);
    ctx.lineTo(2, 8.3);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawBow(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#ff5fa2";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-10, -7);
    ctx.lineTo(-10, 7);
    ctx.closePath();
    ctx.moveTo(0, 0);
    ctx.lineTo(10, -7);
    ctx.lineTo(10, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /* =========================================================
     ROOM + BED + SLEEPER (line art)
     ========================================================= */
  function drawRoom() {
    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.lineCap = "round";
    // floor
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, floorY);
    ctx.lineTo(W, floorY);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.moveTo(0, floorY + 8);
    ctx.lineTo(W, floorY + 8);
    ctx.stroke();

    // window with moon
    const wx = bedX - 250 * S, wy = bedY - 330 * S, ww = 120 * S, wh = 100 * S;
    if (wx > -ww * 0.5) {
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 2;
      ctx.fillStyle = "#f4f6fb";
      ctx.fillRect(wx, wy, ww, wh);
      ctx.strokeRect(wx, wy, ww, wh);
      ctx.beginPath();
      ctx.moveTo(wx + ww / 2, wy);
      ctx.lineTo(wx + ww / 2, wy + wh);
      ctx.moveTo(wx, wy + wh / 2);
      ctx.lineTo(wx + ww, wy + wh / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(wx + ww * 0.26, wy + wh * 0.26, 11 * S, 0.6, 0.6 + Math.PI * 1.45);
      ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      for (const [sx, sy] of [[0.72, 0.18], [0.85, 0.35], [0.62, 0.72], [0.2, 0.8]]) {
        ctx.fillRect(wx + ww * sx, wy + wh * sy, 2, 2);
      }
    }

    // hostel ceiling fan
    const fxp = bedX + 150 * S, fyp = Math.max(40, bedY - 420 * S);
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fxp, 0);
    ctx.lineTo(fxp, fyp);
    ctx.stroke();
    ctx.save();
    ctx.translate(fxp, fyp);
    ctx.scale(1, 0.22);
    const spin = time * 7;
    for (let i = 0; i < 3; i++) {
      const a = spin + (i * TAU) / 3;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(55 * S, 0, 50 * S, 11 * S, 0, 0, TAU);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(fxp, fyp, 14 * S, 7 * S, 0, 0, TAU);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawBedAndSleeper() {
    ctx.save();
    ctx.translate(bedX, bedY);
    ctx.scale(BS, BS);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;

    const breath = Math.sin(time * 1.7) * 3 * (1 - sleeper.awake);

    // back legs
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(214, 30);
    ctx.lineTo(214, 72);
    ctx.stroke();

    // headboard
    ctx.lineWidth = 4;
    roundRect(-238, -128, 46, 186, 7);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.stroke();
    roundRect(-231, -118, 32, 150, 4);
    ctx.fillStyle = "#3d3f42";
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-232, 56);
    ctx.lineTo(-232, 88);
    ctx.stroke();

    // mattress top + front
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-200, -18);
    ctx.lineTo(214, -18);
    ctx.lineTo(250, 18);
    ctx.lineTo(-168, 18);
    ctx.closePath();
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(-168, 18, 418, 38);
    ctx.fillStyle = "#e9eaec";
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-200, -18);
    ctx.lineTo(-200, 22);
    ctx.lineTo(-168, 56);
    ctx.stroke();
    // front legs
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-160, 56);
    ctx.lineTo(-160, 92);
    ctx.moveTo(242, 56);
    ctx.lineTo(242, 92);
    ctx.stroke();

    // pillow
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(-158, -22, 52, 20, -0.08, 0, TAU);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.stroke();

    // blanket
    const b = breath;
    const lift = sleeper.awake * 14;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-118, -34 - lift);
    ctx.bezierCurveTo(-70, -64 - b - lift, 40, -62 - b, 110, -44);
    ctx.quadraticCurveTo(150, -36, 172, -48);
    ctx.quadraticCurveTo(196, -62, 212, -36);
    ctx.lineTo(228, 30);
    ctx.quadraticCurveTo(60, 38, -112, 30);
    ctx.closePath();
    ctx.fillStyle = "#9da3a8";
    ctx.fill();
    ctx.stroke();
    // blanket top band near neck
    ctx.beginPath();
    ctx.moveTo(-118, -34 - lift);
    ctx.bezierCurveTo(-110, -10, -112, 10, -112, 30);
    ctx.lineTo(-84, 32);
    ctx.bezierCurveTo(-86, 0, -88, -30, -86, -52 - b * 0.6 - lift);
    ctx.closePath();
    ctx.fillStyle = "#4f6b62";
    ctx.fill();
    ctx.stroke();
    // folds
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.moveTo(-20, 22);
    ctx.quadraticCurveTo(10, -10, 60, -30);
    ctx.moveTo(120, 26);
    ctx.quadraticCurveTo(140, -6, 168, -26);
    ctx.moveTo(30, 28);
    ctx.quadraticCurveTo(60, 10, 90, 4);
    ctx.stroke();
    ctx.strokeStyle = INK;

    // arms (stick style, crossed on chest) — one scratches when bitten
    const restHand = { x: 14, y: -40 - b * 0.8 };
    const scr = sleeper.scratch;
    const scratchJitter = scr > 0 ? Math.sin(time * 38) * 6 * scr : 0;
    const hand1 = {
      x: restHand.x + (sleeper.sx - restHand.x) * scr + scratchJitter,
      y: restHand.y + (sleeper.sy - restHand.y) * scr,
    };
    const sh1 = { x: -92, y: -46 - b * 0.5 - lift };
    const el1 = { x: (sh1.x + hand1.x) / 2 + 6, y: Math.max(sh1.y, hand1.y) + 16 - scr * 30 };
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(sh1.x, sh1.y);
    ctx.lineTo(el1.x, el1.y);
    ctx.lineTo(hand1.x, hand1.y);
    ctx.stroke();
    // second arm
    const sh2 = { x: -80, y: -52 - b * 0.6 - lift };
    ctx.beginPath();
    ctx.moveTo(sh2.x, sh2.y);
    ctx.lineTo(-24, -30 - b * 0.7);
    ctx.lineTo(28, -50 - b);
    ctx.stroke();
    for (const h of [hand1, { x: 28, y: -50 - b }]) {
      ctx.beginPath();
      ctx.arc(h.x, h.y, 5, 0, TAU);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }

    // head — drawn on top of the blanket so the face is never covered
    const hx = HEAD.x + sleeper.awake * 18 + Math.sin(time * 40) * sleeper.headShake * 4;
    const hy = HEAD.y - sleeper.awake * 34;
    const hrot = -0.28 + sleeper.awake * 0.28 + sleeper.twitch * 0.15 * Math.sin(time * 30);
    if (faces.sleeper) {
      if (!faces.sleeper._cutout) {
        ctx.beginPath();
        ctx.arc(hx, hy, HEAD.r, 0, TAU);
        ctx.fillStyle = "#fff";
        ctx.fill();
      }
      ctx.restore();
      ctx.save();
      const hp = toScreen(hx, hy);
      drawFaceImg(faces.sleeper, hp.x, hp.y, HEAD.r * BS * (faces.sleeper._cutout ? CFG.sleeperHeadScale || 1.4 : 1), faces.sleeper._cutout ? hrot + 0.28 : hrot);
      ctx.restore();
      ctx.save();
      ctx.translate(bedX, bedY);
      ctx.scale(BS, BS);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = INK;
    } else {
      drawCartoonSleeperFace(hx, hy, HEAD.r, hrot);
    }

    // itchy bumps
    for (const bump of sleeper.bumps) {
      ctx.beginPath();
      ctx.arc(bump.x, bump.y, bump.r, 0, TAU);
      ctx.fillStyle = bump.tea ? "rgba(139,90,43,0.55)" : "rgba(230,70,80,0.75)";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = bump.tea ? "#5a3a1a" : "#8b1a22";
      ctx.stroke();
    }

    // awake anger marks
    if (sleeper.awake > 0.5) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#d0202b";
      ctx.beginPath();
      ctx.moveTo(hx + 30, hy - 52);
      ctx.lineTo(hx + 36, hy - 40);
      ctx.moveTo(hx + 44, hy - 50);
      ctx.lineTo(hx + 42, hy - 38);
      ctx.moveTo(hx + 54, hy - 44);
      ctx.lineTo(hx + 46, hy - 34);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCartoonSleeperFace(x, y, r, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = "#f2d2b2";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.stroke();
    // hair
    ctx.beginPath();
    ctx.arc(0, 0, r, Math.PI * 1.05, Math.PI * 1.95);
    ctx.quadraticCurveTo(10, -r * 0.55, -r * 0.98, -r * 0.2);
    ctx.fillStyle = "#222";
    ctx.fill();
    ctx.lineWidth = 2.4;
    if (sleeper.awake > 0.5) {
      for (const ex of [-14, 14]) {
        ctx.beginPath();
        ctx.arc(ex, 2, 6, 0, TAU);
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ex, 3, 2.5, 0, TAU);
        ctx.fillStyle = INK;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(-10, 22);
      ctx.lineTo(10, 20);
      ctx.stroke();
    } else {
      for (const ex of [-14, 14]) {
        ctx.beginPath();
        ctx.arc(ex, 2, 6, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
      }
      const m = 3 + Math.sin(time * 1.7) * 1.5;
      ctx.beginPath();
      ctx.ellipse(2, 21, 5, m, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawShooting() {
    if (state !== "playing" && shot.a <= 0) return;
    const o = shooterOrigin();
    ctx.save();
    ctx.lineCap = "round";
    // dashed aim line from the belly to the pointer
    if (state === "playing" && pointer.x > -999) {
      ctx.setLineDash([6, 8]);
      ctx.lineDashOffset = -time * 30;
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(pointer.x, pointer.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, 9, 0, TAU);
      ctx.moveTo(pointer.x - 14, pointer.y);
      ctx.lineTo(pointer.x - 5, pointer.y);
      ctx.moveTo(pointer.x + 5, pointer.y);
      ctx.lineTo(pointer.x + 14, pointer.y);
      ctx.moveTo(pointer.x, pointer.y - 14);
      ctx.lineTo(pointer.x, pointer.y - 5);
      ctx.moveTo(pointer.x, pointer.y + 5);
      ctx.lineTo(pointer.x, pointer.y + 14);
      ctx.stroke();
    }
    // the shot line
    if (shot.a > 0) {
      const tx = shot.x1 + (shot.x2 - shot.x1) * shot.len;
      const ty = shot.y1 + (shot.y2 - shot.y1) * shot.len;
      ctx.globalAlpha = shot.a;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(shot.x1, shot.y1);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // reload ring
    const rl = clamp((nextShotAt - time) / (CFG.reload ?? 0.45), 0, 1);
    if (rl > 0) {
      ctx.strokeStyle = "#d0202b";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(o.x, o.y, 9, -Math.PI / 2, -Math.PI / 2 + TAU * rl);
      ctx.stroke();
    }
    // origin dot
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(o.x, o.y, 3.5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawImpact(x, y, k) {
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = k;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      const r1 = (30 + (1 - k) * 30) * MS, r2 = r1 + 16 * MS * k;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      ctx.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* =========================================================
     EFFECTS (GSAP)
     ========================================================= */
  function addSplat(x, y, big) {
    const blobs = [];
    const n = big ? 9 : 6;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), d = rand(0, big ? 22 : 12) * MS;
      blobs.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: rand(3, big ? 10 : 7) * MS });
    }
    const s = { x, y, blobs, alpha: 0.9, k: 0.3 };
    splats.push(s);
    gsap.to(s, { k: 1, duration: 0.15, ease: "back.out(3)" });
    gsap.to(s, {
      alpha: 0, duration: 1.4, delay: 2.2,
      onComplete: () => splats.splice(splats.indexOf(s), 1),
    });
    for (let i = 0; i < (big ? 14 : 9); i++) {
      const p = { x, y, r: rand(1.5, 3.5) * MS, a: 1, c: Math.random() < 0.6 ? "#c8202c" : INK };
      particles.push(p);
      const ang = rand(0, TAU), d = rand(25, 75) * MS;
      gsap.to(p, {
        x: x + Math.cos(ang) * d, y: y + Math.sin(ang) * d + 20 * MS,
        a: 0, duration: rand(0.4, 0.8), ease: "power2.out",
        onComplete: () => particles.splice(particles.indexOf(p), 1),
      });
    }
  }

  function doShake(amt) {
    shake.amt = Math.max(shake.amt, amt);
    gsap.to(shake, { amt: 0, duration: 0.35, ease: "power2.out", overwrite: true });
  }

  function bubble(text, x, y, kind = "") {
    if (!text || !CFG.showBubbles) return;
    const el = document.createElement("div");
    el.className = "bubble " + kind;
    el.textContent = text;
    fx.appendChild(el);
    const bw = el.offsetWidth;
    const bx = clamp(x - bw / 2, 8, W - bw - 8);
    const by = clamp(y - el.offsetHeight - 30, 70, H - 60);
    el.style.left = bx + "px";
    el.style.top = by + "px";
    el.style.setProperty("--tail", clamp(x - bx, 18, bw - 18) + "px");
    gsap.timeline({ onComplete: () => el.remove() })
      .fromTo(el, { scale: 0, rotation: rand(-8, 8), transformOrigin: "50% 100%" }, { scale: 1, rotation: 0, duration: 0.35, ease: "back.out(2.4)" })
      .to(el, { y: -26, opacity: 0, duration: 0.5, delay: 1.1, ease: "power1.in" });
  }

  function floatText(text, x, y, cls = "") {
    if (!CFG.showFloatingText) return;
    const el = document.createElement("div");
    el.className = "float " + cls;
    el.textContent = text;
    fx.appendChild(el);
    el.style.left = x + "px";
    el.style.top = y + "px";
    gsap.timeline({ onComplete: () => el.remove() })
      .fromTo(el, { xPercent: -50, yPercent: -50, scale: 0.3, opacity: 1 }, { scale: 1.15, duration: 0.25, ease: "back.out(3)" })
      .to(el, { y: -50, opacity: 0, duration: 0.7, ease: "power1.in" }, "+=0.25");
  }

  function spawnZ() {
    const hp = toScreen(HEAD.x + 30, HEAD.y - 50);
    const z = { x: hp.x, y: hp.y, a: 0, s: rand(0.8, 1.3) };
    zzz.push(z);
    gsap.timeline({ onComplete: () => zzz.splice(zzz.indexOf(z), 1) })
      .to(z, { a: 1, duration: 0.4 })
      .to(z, { x: hp.x + 50 * S, y: hp.y - 80 * S, duration: 2.4, ease: "sine.inOut" }, 0)
      .to(z, { a: 0, duration: 0.6 }, 1.8);
  }

  /* =========================================================
     HUD
     ========================================================= */
  const scoreEl = $("score"), bestEl = $("best"), livesEl = $("lives"), levelEl = $("level");

  function updateHud(bumpScore) {
    scoreEl.textContent = score;
    bestEl.textContent = "BEST " + Math.max(best, score);
    levelEl.textContent = "LEVEL " + level;
    livesEl.innerHTML = "";
    for (let i = 0; i < CFG.lives; i++) {
      const d = document.createElement("span");
      d.className = "drop" + (i < lives ? "" : " empty");
      livesEl.appendChild(d);
    }
    if (bumpScore) {
      gsap.fromTo(scoreEl, { scale: 1.6 }, { scale: 1, duration: 0.4, ease: "elastic.out(1,0.4)" });
    }
  }

  /* =========================================================
     GAME FLOW
     ========================================================= */
  /* a miss (bad shot / mosquito escaped / shot his own face) costs one drop */
  function loseLife(soundCat = "miss") {
    if (state !== "playing") return;
    lives--;
    combo = 0;
    if (soundCat) Sound.playLine(soundCat, { force: true, cooldown: 500 });
    gsap.fromTo(sleeper, { twitch: 1 }, { twitch: 0, duration: 0.6 });
    doShake(6);
    livesEl.classList.remove("hurt");
    void livesEl.offsetWidth;
    livesEl.classList.add("hurt");
    updateHud();
    if (lives <= 0) gameOver();
  }

  const Game = {
    onEscape() {
      if (state !== "playing") return;
      spawnTimer = (CFG.respawnDelay ?? 1.2) * 0.6;
      if (CFG.escapeCostsLife !== false) loseLife(null); // silent: no sound when one flies away
    },
    onBite(m) {
      if (state !== "playing") return;
      lives--;
      combo = 0;
      const sp = m.target;
      const tea = m.outfit === "tea";
      sleeper.bumps.push({ x: sp.x + rand(-4, 4), y: sp.y + rand(-3, 3), r: 0, tea });
      gsap.to(sleeper.bumps[sleeper.bumps.length - 1], { r: tea ? 13 : 6, duration: 0.4, ease: "back.out(3)" });
      sleeper.sx = sp.x;
      sleeper.sy = sp.y;
      gsap.timeline()
        .to(sleeper, { scratch: 1, duration: 0.25, ease: "power2.out" })
        .to(sleeper, { scratch: 0, duration: 0.4, ease: "power2.in" }, "+=0.9");
      gsap.fromTo(sleeper, { twitch: 1 }, { twitch: 0, duration: 0.8 });
      doShake(10);
      const hp = toScreen(HEAD.x, HEAD.y - HEAD.r);
      bubble(Sound.playLine(tea ? "tea" : "bite", { force: true, cooldown: 1200 }), hp.x, hp.y, "ouch");
      livesEl.classList.remove("hurt");
      void livesEl.offsetWidth;
      livesEl.classList.add("hurt");
      updateHud();
      if (lives <= 0) gameOver();
    },
  };

  function spawnLogic(dt) {
    spawnTimer -= dt;
    const alive = mosquitos.filter((m) => !m.dead).length;
    if (spawnTimer <= 0 && alive < (CFG.maxMosquitos || 1)) {
      mosquitos.push(new Mosquito());
      spawnTimer = 0;
    }
  }

  function update(dt) {
    spawnLogic(dt);
    for (const m of mosquitos) m.update(dt);
    mosquitos = mosquitos.filter((m) => !m.remove);

    // buzz loudness: more & closer-to-sleeper mosquitos = louder
    let lvl = 0, diving = false;
    const head = toScreen(HEAD.x, HEAD.y);
    for (const m of mosquitos) {
      if (m.dead) continue;
      const d = dist(m.x, m.y, head.x, head.y);
      lvl += 0.012 * clamp(1 - d / (W * 0.9), 0.25, 1);
      if (m.state === "dive" || m.state === "bite") diving = true;
    }
    Sound.setBuzz(lvl + (diving ? 0.015 : 0), diving ? 1.12 : 1);
  }

  /* the shooting line starts just below the sleeper's stomach */
  const SHOOT = { x: 64, y: -53 };
  function shooterOrigin() {
    const b = Math.sin(time * 1.7) * 3 * (1 - sleeper.awake);
    return toScreen(SHOOT.x, SHOOT.y - b - sleeper.awake * 14);
  }

  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }

  let nextShotAt = 0;
  function shootAt(x, y) {
    if (state !== "playing") return;
    Sound.unlock();
    if (time < nextShotAt) return; // reloading
    nextShotAt = time + (CFG.reload ?? 0.45);

    const o = shooterOrigin();
    let dx = x - o.x, dy = y - o.y;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const L = Math.hypot(W, H) * 1.2;
    const ex = o.x + dx * L, ey = o.y + dy * L;
    gsap.killTweensOf(shot);
    Object.assign(shot, { x1: o.x, y1: o.y, x2: ex, y2: ey, len: 0, a: 1 });
    gsap.to(shot, { len: 1, duration: 0.09, ease: "power2.out" });
    gsap.to(shot, { a: 0, duration: 0.3, delay: 0.12 });
    Sound.zap();

    const R = (CFG.hitRadius ?? 20) * MS;
    const hits = mosquitos.filter((m) => {
      if (m.dead || m.pop < 0.5) return false;
      const c = m.hitCenter();
      return segDist(c.x, c.y, o.x, o.y, ex, ey) < R;
    });

    if (hits.length) {
      Sound.slap(0.6);
      setTimeout(() => Sound.squish(), 30);
      const c0 = hits[0].hitCenter();
      x = c0.x;
      y = c0.y;
      impact.x = x;
      impact.y = y;
      gsap.fromTo(impact, { hit: 1 }, { hit: 0, duration: 0.35 });
      doShake(hits.length > 1 ? 12 : 6);
      combo++;
      let gfDied = false, gained = 0, special = null;
      spawnTimer = Math.max(spawnTimer, CFG.respawnDelay ?? 1.5); // short breather before the next one
      for (const m of hits) {
        const c = m.hitCenter();
        addSplat(c.x, c.y, m.belly > 0.3);
        m.kill();
        const pts = (m.char && m.char.points) || 1;
        score += pts;
        gained += pts;
        if (m.char && m.char.killText) special = m.char.killText;
        if (m.isGf) gfDied = true;
        const p = m.partner;
        if (p && !p.dead) {
          p.angry = true;
          p.speed *= 1.35;
          p.aimTime *= 0.6;
          if (p.state === "wander" && !attackBusy(p)) p.startAim();
          floatText("💔", p.x, p.y - 30 * MS, "heart");
        }
      }
      floatText(hits.length > 1 ? `+${gained}  DOUBLE!` : `+${gained}`, x, y - 40 * MS, hits.length > 1 || gained > 1 ? "big" : "");
      if (special) floatText(special, W / 2, H * 0.36, "intro");
      if (combo >= 3 && combo % 3 === 0) floatText(`COMBO x${combo}`, W / 2, H * 0.28, "combo");

      const lineCat = gfDied ? "gfkilled" : "hit";
      bubble(Sound.playLine(lineCat, { force: true, cooldown: 700 }), x, y - 30 * MS, gfDied ? "gf" : "good");

      const newLevel = 1 + Math.floor(score / CFG.killsPerLevel);
      if (newLevel > level) {
        level = newLevel;
        Sound.chime();
        floatText(`LEVEL ${level}`, W / 2, H * 0.2, "level");
      }
      updateHud(true);
      return;
    }

    // shot at the sleeper's own face?
    const hp = toScreen(HEAD.x, HEAD.y);
    combo = 0;
    if (dist(x, y, hp.x, hp.y) < HEAD.r * BS * 1.15) {
      Sound.slap(1.3);
      doShake(14);
      sleeper.headShake = 1;
      gsap.to(sleeper, { headShake: 0, duration: 0.6 });
      loseLife("miss");
      return;
    }

    // plain miss
    Sound.whoosh();
    loseLife("miss");
  }

  function resetRound() {
    gsap.killTweensOf(sleeper);
    for (const m of mosquitos) if (m.stopFly) m.stopFly();
    score = 0;
    lives = CFG.lives;
    level = 1;
    combo = 0;
    mosquitos = [];
    if (runAudio) runAudio.pause();
    runAudio = null;
    runLock = null;
    seenChars.clear();
    splats = [];
    particles = [];
    spawnTimer = 1.2;
    Object.assign(sleeper, { twitch: 0, scratch: 0, awake: 0, bumps: [], headShake: 0 });
    fx.innerHTML = "";
  }

  function startGame() {
    Sound.unlock();
    resetRound();
    state = "playing";
    showOverlay(null);
    $("hud").classList.add("show");
    updateHud();
    gsap.globalTimeline.resume();
    const hp = toScreen(HEAD.x, HEAD.y - HEAD.r);
    spawnTimer = 0.6; // first mosquito flies in while he says his line
  }

  function gameOver() {
    state = "over";
    Sound.setBuzz(0);
    if (runLock) runLock.endRun();
    gsap.to(sleeper, { awake: 1, duration: 0.6, ease: "back.out(2)" });
    doShake(18);
    const hp = toScreen(HEAD.x, HEAD.y - HEAD.r - 30);
    const newBest = score > best;
    if (newBest) {
      best = score;
      localStorage.setItem("hm_best", best);
    }
    // surviving mosquitos fly away happy
    for (const m of mosquitos) {
      if (m.stopFly) m.stopFly();
      if (!m.dead) {
        m.state = "flee";
        m.goal = { x: m.x < W / 2 ? -150 : W + 150, y: -80 };
      }
    }
    setTimeout(() => {
      $("finalScore").textContent = score;
      $("finalBest").textContent = best;
      $("newBest").style.display = newBest ? "block" : "none";
      showOverlay("overScreen");
    }, 1600);
    updateHud();
  }

  function pauseGame() {
    if (state !== "playing") return;
    state = "paused";
    gsap.globalTimeline.pause();
    Sound.setBuzz(0);
    if (runAudio) runAudio.pause();
    for (const m of mosquitos) if (m.flyAudio) m.flyAudio.pause();
    Sound.stopVoice();
    showOverlay("pauseScreen");
  }

  function resumeGame() {
    if (state !== "paused") return;
    state = "playing";
    gsap.globalTimeline.resume();
    if (runAudio) runAudio.play().catch(() => {});
    for (const m of mosquitos) if (m.flyAudio && !m.flyDone) m.flyAudio.play().catch(() => {});
    showOverlay(null);
  }

  function toMenu() {
    resetRound();
    state = "menu";
    gsap.globalTimeline.resume();
    Sound.setBuzz(0);
    $("hud").classList.remove("show");
    $("menuBest").textContent = best;
    showOverlay("startScreen");
  }

  function showOverlay(id) {
    for (const el of document.querySelectorAll(".overlay")) {
      el.classList.toggle("show", el.id === id);
    }
    canvas.classList.toggle("playing", id === null);
  }

  /* =========================================================
     RENDER LOOP (driven by GSAP's ticker = one rAF for everything)
     ========================================================= */
  let lastT = performance.now();
  function frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    if (state !== "paused") {
      time += dt;
      if (state === "playing") update(dt);
      else if (state === "over") {
        for (const m of mosquitos) m.update(dt);
        mosquitos = mosquitos.filter((m) => !m.remove);
      }
      zzzTimer -= dt;
      if (zzzTimer <= 0 && sleeper.awake < 0.1) {
        zzzTimer = 1.3;
        spawnZ();
      }
    }
    Sound.snoreTick(time * 1.7, (state === "playing" || state === "menu") && sleeper.awake < 0.3);
    render();
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shake.amt > 0.2) ctx.translate(rand(-1, 1) * shake.amt, rand(-1, 1) * shake.amt);

    drawRoom();

    // splats are "on the wall" behind everything else
    for (const s of splats) {
      ctx.save();
      ctx.globalAlpha = s.alpha;
      ctx.fillStyle = "#b5141f";
      ctx.translate(s.x, s.y);
      ctx.scale(s.k, s.k);
      for (const b of s.blobs) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    drawBedAndSleeper();

    // Zzz
    ctx.save();
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    for (const z of zzz) {
      ctx.globalAlpha = z.a;
      ctx.font = `bold ${Math.round(20 * S * z.s)}px "Patrick Hand", sans-serif`;
      ctx.fillText("z", z.x, z.y);
    }
    ctx.restore();

    for (const m of mosquitos) m.drawGuides();
    for (const m of mosquitos) m.draw();

    for (const p of particles) {
      ctx.globalAlpha = p.a;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    drawShooting();
    if (impact.hit > 0) drawImpact(impact.x, impact.y, impact.hit);

    ctx.restore();
  }

  /* =========================================================
     INPUT
     ========================================================= */
  canvas.addEventListener("pointerdown", (e) => {
    pointer.mouse = e.pointerType === "mouse";
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    shootAt(pointer.x, pointer.y);
  });
  canvas.addEventListener("pointermove", (e) => {
    pointer.mouse = e.pointerType === "mouse";
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
  });
  canvas.addEventListener("pointerleave", () => (pointer.x = pointer.y = -999));
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key === "p" || e.key === "P") {
      state === "playing" ? pauseGame() : resumeGame();
    }
    if (e.key === " " || e.key === "Enter") {
      if (state === "menu" || state === "over") startGame();
      else if (state === "paused") resumeGame();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseGame();
  });

  $("playBtn").onclick = startGame;
  $("againBtn").onclick = startGame;
  $("resumeBtn").onclick = resumeGame;
  $("restartBtn").onclick = startGame;
  $("menuBtn").onclick = toMenu;
  $("menuBtn2").onclick = toMenu;
  $("pauseBtn").onclick = () => (state === "playing" ? pauseGame() : resumeGame());
  const muteBtn = $("muteBtn");
  const syncMute = () => (muteBtn.textContent = Sound.isMuted() ? "🔇" : "🔊");
  muteBtn.onclick = () => {
    Sound.unlock();
    Sound.setMuted(!Sound.isMuted());
    syncMute();
  };
  syncMute();

  /* =========================================================
     BOOT
     ========================================================= */
  Sound.preload((window.ASSET_MANIFEST || {}).sounds || {});
  bestEl.textContent = "BEST " + best;
  $("menuBest").textContent = best;
  loadFaces();
  gsap.ticker.add(frame);
  window.__hm = { get mosquitos() { return mosquitos; }, get score() { return score; }, shootAt, faces };
  showOverlay("startScreen");
})();
