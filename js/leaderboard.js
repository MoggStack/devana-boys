import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-analytics.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBxbLhaN3qoaK83ndIiuCGDB2ASTj9bDHI",
  authDomain: "devna-boys.firebaseapp.com",
  projectId: "devna-boys",
  storageBucket: "devna-boys.firebasestorage.app",
  messagingSenderId: "98361227744",
  appId: "1:98361227744:web:48104c1dc79f81389d9385",
  measurementId: "G-K4T6NMSDER",
};

const app = initializeApp(firebaseConfig);
try {
  getAnalytics(app);
} catch (_) {
  // Analytics may be blocked by browser privacy settings or offline mode
}
const db = getFirestore(app);
const SCORES_COL = "scores";

const $ = (id) => document.getElementById(id);

function getAvatars() {
  const list = (window.ASSET_MANIFEST && window.ASSET_MANIFEST.faces && window.ASSET_MANIFEST.faces.mosquitos) || [];
  return list.length ? list : ["assets/faces/sleeper/sleeper.png"];
}

function getOrCreatePlayerId() {
  let id = localStorage.getItem("hm_player_id");
  if (!id) {
    id = (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : "p_" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
    localStorage.setItem("hm_player_id", id);
  }
  return id;
}

const playerId = getOrCreatePlayerId();
const avatars = getAvatars();
let playerName = localStorage.getItem("hm_player_name") || "";
let playerAvatar = localStorage.getItem("hm_player_avatar");
if (!playerAvatar || !avatars.includes(playerAvatar)) {
  playerAvatar = avatars[0];
  localStorage.setItem("hm_player_avatar", playerAvatar);
}

let returnScreenId = "startScreen";
let profileSyncTimer = null;

function displayName() {
  const trimmed = (playerName || "").trim();
  return trimmed || "Anonymous Mosquito";
}

function renderAvatarPicker() {
  const container = $("avatarPicker");
  if (!container) return;
  container.innerHTML = "";
  for (const src of avatars) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "avatar-opt" + (src === playerAvatar ? " selected" : "");
    const label = decodeURIComponent(src.split("/").pop().replace(/\.[^.]+$/, ""));
    btn.title = label;
    btn.setAttribute("aria-label", `Select ${label} avatar`);

    const img = document.createElement("img");
    img.src = src;
    img.alt = label;
    btn.appendChild(img);

    btn.onclick = () => {
      playerAvatar = src;
      localStorage.setItem("hm_player_avatar", playerAvatar);
      renderAvatarPicker();
      scheduleProfileSync();
    };
    container.appendChild(btn);
  }
}

function scheduleProfileSync() {
  clearTimeout(profileSyncTimer);
  profileSyncTimer = setTimeout(async () => {
    const best = Number(localStorage.getItem("hm_best") || 0);
    if (best <= 0) return;
    try {
      const ref = doc(db, SCORES_COL, playerId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await setDoc(
          ref,
          {
            name: displayName(),
            avatar: playerAvatar,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch (_) {
      // Ignore background sync failures when offline
    }
  }, 500);
}

function initProfileUI() {
  const input = $("playerNameInput");
  if (input) {
    input.value = playerName;
    input.addEventListener("input", () => {
      playerName = input.value;
      localStorage.setItem("hm_player_name", playerName);
      scheduleProfileSync();
    });
  }
  renderAvatarPicker();
}

async function fetchTopScores(maxRows = 50) {
  const q = query(collection(db, SCORES_COL), orderBy("score", "desc"), limit(maxRows));
  const snap = await getDocs(q);
  const rows = [];
  snap.forEach((d) => {
    const data = d.data();
    rows.push({
      id: d.id,
      name: data.name || "Anonymous Mosquito",
      avatar: data.avatar || avatars[0],
      score: Number(data.score) || 0,
    });
  });
  return rows;
}

function medalForRank(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

function renderLeaderboardRows(rows) {
  const listEl = $("lbList");
  const statusEl = $("lbStatus");
  const mySummaryEl = $("lbMyRow");
  if (!listEl || !statusEl) return;

  listEl.innerHTML = "";
  if (!rows.length) {
    statusEl.textContent = "No scores yet. Play a round to claim #1! 🦟";
    statusEl.style.display = "block";
    if (mySummaryEl) mySummaryEl.style.display = "none";
    return;
  }

  statusEl.style.display = "none";
  let myRank = -1;

  rows.forEach((entry, idx) => {
    const rank = idx + 1;
    const isMe = entry.id === playerId;
    if (isMe) myRank = rank;

    const row = document.createElement("div");
    row.className = "lb-row" + (rank <= 3 ? ` rank-${rank}` : "") + (isMe ? " is-me" : "");

    const badge = document.createElement("div");
    badge.className = "lb-rank-badge";
    badge.textContent = medalForRank(rank);

    const img = document.createElement("img");
    img.className = "lb-avatar";
    img.src = entry.avatar || avatars[0];
    img.alt = entry.name;
    img.onerror = () => {
      img.src = avatars[0];
    };

    const nameWrap = document.createElement("div");
    nameWrap.className = "lb-name-wrap";
    const nameEl = document.createElement("div");
    nameEl.className = "lb-name";
    nameEl.textContent = entry.name;
    nameWrap.appendChild(nameEl);
    if (isMe) {
      const tag = document.createElement("span");
      tag.className = "lb-you-tag";
      tag.textContent = "YOU";
      nameWrap.appendChild(tag);
    }

    const scorePill = document.createElement("div");
    scorePill.className = "lb-score-pill";
    scorePill.textContent = entry.score;

    row.append(badge, img, nameWrap, scorePill);
    listEl.appendChild(row);
  });

  if (mySummaryEl) {
    const localBest = Number(localStorage.getItem("hm_best") || 0);
    if (myRank > 0) {
      mySummaryEl.textContent = `Your Worldwide Rank: #${myRank} (${displayName()})`;
      mySummaryEl.style.display = "block";
    } else if (localBest > 0) {
      mySummaryEl.textContent = `Your Best: ${localBest} · Outside Top ${rows.length}`;
      mySummaryEl.style.display = "block";
    } else {
      mySummaryEl.style.display = "none";
    }
  }
}

async function openLeaderboard(fromScreenId) {
  if (fromScreenId) returnScreenId = fromScreenId;
  for (const el of document.querySelectorAll(".overlay")) {
    el.classList.toggle("show", el.id === "leaderboardScreen");
  }
  await refreshLeaderboard();
}

function closeLeaderboard() {
  for (const el of document.querySelectorAll(".overlay")) {
    el.classList.toggle("show", el.id === returnScreenId);
  }
}

async function refreshLeaderboard() {
  const statusEl = $("lbStatus");
  const listEl = $("lbList");
  if (statusEl) {
    statusEl.textContent = "Loading worldwide rankings...";
    statusEl.style.display = "block";
  }
  if (listEl) listEl.innerHTML = "";
  try {
    const rows = await fetchTopScores(50);
    renderLeaderboardRows(rows);
  } catch (err) {
    console.error("Failed to load Firestore leaderboard:", err);
    if (statusEl) {
      statusEl.textContent = "Could not load rankings. Check connection or Firestore rules.";
      statusEl.style.display = "block";
    }
  }
}

async function submitScore(score) {
  const overAvatar = $("overAvatar");
  const overName = $("overName");
  const overRank = $("overRank");

  if (overAvatar) overAvatar.src = playerAvatar;
  if (overName) overName.textContent = displayName();

  if (score <= 0) {
    if (overRank) overRank.textContent = "Score > 0 to enter worldwide rankings";
    return;
  }

  if (overRank) overRank.textContent = "🌍 Saving to worldwide board...";

  try {
    const ref = doc(db, SCORES_COL, playerId);
    const existing = await getDoc(ref);
    const prevScore = existing.exists() ? Number(existing.data().score) || 0 : 0;
    const bestToSave = Math.max(score, prevScore);

    await setDoc(
      ref,
      {
        playerId,
        name: displayName(),
        avatar: playerAvatar,
        score: bestToSave,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    const rows = await fetchTopScores(50);
    const idx = rows.findIndex((r) => r.id === playerId);
    if (overRank) {
      if (idx >= 0) {
        const rank = idx + 1;
        overRank.textContent = `🌍 Worldwide Rank #${rank} ${rank <= 3 ? medalForRank(rank) : ""}`;
      } else {
        overRank.textContent = "🌍 Ranked outside Top 50";
      }
    }
  } catch (err) {
    console.error("Failed to submit score to Firestore:", err);
    if (overRank) overRank.textContent = "⚠️ Offline (saved locally)";
  }
}

function wireEvents() {
  $("openLeaderboardBtn")?.addEventListener("click", () => openLeaderboard("startScreen"));
  $("overLeaderboardBtn")?.addEventListener("click", () => openLeaderboard("overScreen"));
  $("closeLbBtn")?.addEventListener("click", closeLeaderboard);
  $("refreshLbBtn")?.addEventListener("click", refreshLeaderboard);
}

initProfileUI();
wireEvents();

window.Leaderboard = {
  submitScore,
  openLeaderboard,
  refreshLeaderboard,
};
