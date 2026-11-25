/* =========================================================
   AUDIO — your voice clips (assets/sounds/<event>/)
           + synthesized SFX (slap, squish, whoosh, buzz)
   ========================================================= */
window.Sound = (() => {
  let ctx = null, master = null, sfxGain = null;
  let buzz = null;
  let muted = localStorage.getItem("hm_muted") === "1";
  const clips = {};          // category -> [HTMLAudioElement]
  const lastIdx = {};

  /* ---------- voice lines ---------- */
  function preload(soundFiles) {
    for (const cat in soundFiles) {
      clips[cat] = soundFiles[cat].map((src) => {
        const a = new Audio();
        a.preload = "auto";
        a.src = src;
        a.load();
        return a;
      });
    }
  }

  const pickIdx = (n, last) => {
    let i = Math.floor(Math.random() * n);
    if (n > 1 && i === last) i = (i + 1) % n;
    return i;
  };

  /* two voice channels: the sleeper's lines never get cut by the shooter's */
  const SLEEPER_CATS = new Set(["start", "bite", "tea", "selfslap", "gameover"]);
  const channels = { player: { cur: null, busy: 0 }, sleeper: { cur: null, busy: 0 } };

  function stopVoice(chName) {
    for (const [name, ch] of Object.entries(channels)) {
      if (chName && name !== chName) continue;
      if (ch.cur) {
        ch.cur.pause();
        ch.cur = null;
      }
    }
  }

  /** Plays a random clip from assets/sounds/<cat>/ (nothing if the folder is empty).
   *  opts.force: interrupt whatever is playing on the same channel.
   *  Returns true if a clip started. */
  function playLine(cat, opts = {}) {
    const now = performance.now();
    const chName = SLEEPER_CATS.has(cat) ? "sleeper" : "player";
    const ch = channels[chName];
    const sleeperTalking = chName === "sleeper" && ch.cur && !ch.cur.paused && !ch.cur.ended;
    if (sleeperTalking && cat !== "gameover") return null; // let him finish his line
    if (!opts.force && now < ch.busy) return null;

    if (ch.cur) {
      ch.cur.pause();
      ch.cur = null;
    }
    ch.busy = now + (opts.cooldown ?? 900);
    const list = clips[cat] || [];
    if (muted || !list.length) return null;
    const i = pickIdx(list.length, lastIdx[cat]);
    lastIdx[cat] = i;
    const a = list[i];
    a.currentTime = 0;
    ch.cur = a;
    a.play().catch(() => {});
    return true;
  }

  /* ---------- Web Audio SFX ---------- */
  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.7;
      sfxGain.connect(master);
      initBuzz();
      initSnore();
      initVoiceBoost();
    }
    if (ctx.state === "suspended") ctx.resume();
  }

  let noiseBuf = null;
  function noise() {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    return s;
  }

  function env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  function slap(strength = 1) {
    if (!ctx) return;
    const t = ctx.currentTime;
    // crack
    const n = noise();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1400 + Math.random() * 600;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    env(g, t, 0.9 * strength, 0.002, 0.11);
    n.connect(bp).connect(g).connect(sfxGain);
    n.start(t);
    n.stop(t + 0.15);
    // thump
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    const g2 = ctx.createGain();
    env(g2, t, 0.6 * strength, 0.002, 0.13);
    o.connect(g2).connect(sfxGain);
    o.start(t);
    o.stop(t + 0.16);
  }

  function squish() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(700, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.14);
    const g = ctx.createGain();
    env(g, t, 0.35, 0.004, 0.14);
    o.connect(g).connect(sfxGain);
    o.start(t);
    o.stop(t + 0.2);
  }

  function whoosh() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = noise();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.18);
    const g = ctx.createGain();
    env(g, t, 0.25, 0.03, 0.17);
    n.connect(bp).connect(g).connect(sfxGain);
    n.start(t);
    n.stop(t + 0.25);
  }

  function zap() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(1500, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.12);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2400;
    const g = ctx.createGain();
    env(g, t, 0.22, 0.003, 0.12);
    o.connect(lp).connect(g).connect(sfxGain);
    o.start(t);
    o.stop(t + 0.16);
  }

  function chime() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [660, 880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = ctx.createGain();
      env(g, t + i * 0.08, 0.18, 0.01, 0.25);
      o.connect(g).connect(sfxGain);
      o.start(t + i * 0.08);
      o.stop(t + i * 0.08 + 0.3);
    });
  }

  /* continuous mosquito buzz, volume driven by the game */
  function initBuzz() {
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = "sawtooth";
    o2.type = "sawtooth";
    o1.frequency.value = 520;
    o2.frequency.value = 533;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 18;
    lfo.connect(lfoGain);
    lfoGain.connect(o1.frequency);
    lfoGain.connect(o2.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2200;
    const g = ctx.createGain();
    g.gain.value = 0;
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g).connect(master);
    o1.start();
    o2.start();
    lfo.start();
    buzz = { g, o1, o2 };
  }

  function setBuzz(level, pitch = 1) {
    if (!buzz) return;
    const t = ctx.currentTime;
    buzz.g.gain.setTargetAtTime(Math.min(0.07, level), t, 0.15);
    buzz.o1.frequency.setTargetAtTime(520 * pitch, t, 0.2);
    buzz.o2.frequency.setTargetAtTime(533 * pitch, t, 0.2);
  }

  /* ---------- louder voice clips ----------
     HTML audio can't go above volume 1, so route every clip through a
     gain + compressor. Only on http(s): on file:// browsers would mute it. */
  let voiceBus = null;
  function initVoiceBoost() {
    if (!/^https?:/.test(location.protocol)) return;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 10;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    voiceBus = ctx.createGain();
    voiceBus.gain.value = window.GAME_CONFIG.voiceBoost ?? 2.5;
    voiceBus.connect(comp).connect(master);
    const sleeperBus = ctx.createGain();
    sleeperBus.gain.value = window.GAME_CONFIG.sleeperBoost ?? 1.8;
    sleeperBus.connect(voiceBus);
    for (const cat in clips) {
      for (const a of clips[cat]) {
        try {
          ctx.createMediaElementSource(a).connect(SLEEPER_CATS.has(cat) ? sleeperBus : voiceBus);
        } catch (e) { /* already routed */ }
      }
    }
  }

  function sleeperTalking() {
    const sc = channels.sleeper.cur;
    return !!(sc && !sc.paused && !sc.ended);
  }

  /* ---------- snoring ----------
     assets/sounds/snore/ clips loop; otherwise a synthesized snore
     follows the sleeper's breathing (phase = same sine as the blanket). */
  let snoreGain = null, snoreClip = null;
  function initSnore() {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const n = ctx.createBufferSource();
    n.buffer = buf;
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 380;
    bp.Q.value = 1.2;
    const rumble = ctx.createOscillator();
    rumble.type = "sawtooth";
    rumble.frequency.value = 72;
    const rlp = ctx.createBiquadFilter();
    rlp.type = "lowpass";
    rlp.frequency.value = 260;
    const rg = ctx.createGain();
    rg.gain.value = 0.5;
    snoreGain = ctx.createGain();
    snoreGain.gain.value = 0;
    n.connect(bp).connect(snoreGain);
    rumble.connect(rlp).connect(rg).connect(snoreGain);
    snoreGain.connect(master);
    n.start();
    rumble.start();
  }

  function snoreTick(phase, on) {
    if (!ctx) return;
    const sc = channels.sleeper.cur;
    if (sc && !sc.paused && !sc.ended) on = false; // quiet while he's talking
    const list = clips.snore || [];
    if (list.length) {
      if (on && !muted) {
        if (!snoreClip) {
          snoreClip = list[Math.floor(Math.random() * list.length)];
          snoreClip.loop = true;
          snoreClip.volume = 0.5;
        }
        if (snoreClip.paused) snoreClip.play().catch(() => {});
      } else if (snoreClip && !snoreClip.paused) {
        snoreClip.pause();
      }
      return;
    }
    const v = on ? Math.max(0, Math.sin(phase) - 0.25) : 0;
    snoreGain.gain.setTargetAtTime(v * 0.3, ctx.currentTime, 0.08);
  }

  /* ---------- run event clips (assets/sounds/run/) ----------
     a clip whose file name contains the character key (e.g. run/sourav.mp3)
     is preferred, otherwise a random clip. Returns the playing element. */
  function playRun(key, cat = "run") {
    const list = clips[cat] || [];
    if (!list.length || muted) return null;
    let pool = key ? list.filter((a) => decodeURIComponent(a.src).toLowerCase().includes(key)) : [];
    if (!pool.length) pool = list.filter((a) => {
      const f = decodeURIComponent(a.src).toLowerCase();
      return !Object.keys(window.GAME_CONFIG.characters || {}).some((k) => f.includes(k));
    });
    if (!pool.length) return null;
    const a = pool[Math.floor(Math.random() * pool.length)];
    a.currentTime = 0;
    a.loop = false;
    a.play().catch(() => {});
    return a;
  }

  function setMuted(m) {
    muted = m;
    localStorage.setItem("hm_muted", m ? "1" : "0");
    if (master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02);
    if (m) {
      stopVoice();
      if (snoreClip) snoreClip.pause();
    }
  }

  return {
    preload, unlock, playLine, zap, slap, snoreTick, playRun, sleeperTalking,
    playFly: (key) => playRun(key, "fly"), squish, whoosh, chime, setBuzz,
    setMuted, isMuted: () => muted, stopVoice,
  };
})();
