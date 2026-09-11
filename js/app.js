/* ============================================================
   Pulse — Social & Chat (Firebase Auth + Firestore, real-time)
   ============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, getDocs, addDoc, updateDoc,
  collection, query, where, limit, onSnapshot, serverTimestamp,
  arrayUnion, arrayRemove, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------- tiny DOM helpers ---------- */
const $ = (s) => document.querySelector(s);
const SCREENS = ["setup-screen", "auth-screen", "feed-screen", "chats-screen", "chat-screen", "profile-screen"];
const show = (id) => SCREENS.forEach((s) => $("#" + s).classList.toggle("hidden", s !== id));
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const timeAgo = (ts) => {
  const ms = ts?.seconds ? ts.seconds * 1000 : 0;
  if (!ms) return "now";
  const d = (Date.now() - ms) / 1000;
  if (d < 60) return "now";
  if (d < 3600) return Math.floor(d / 60) + "m";
  if (d < 86400) return Math.floor(d / 3600) + "h";
  if (d < 604800) return Math.floor(d / 86400) + "d";
  return new Date(ms).toLocaleDateString();
};

const AVATAR_COLORS = ["#7c5cff", "#00b8d4", "#ff5c7a", "#ffab40", "#69f0ae", "#40c4ff", "#e040fb", "#ffd740"];
const colorFor = (uid = "") => AVATAR_COLORS[[...uid].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
function avatarEl(user, cls = "") {
  const name = user?.name || "?";
  const d = el("div", "avatar " + cls, esc(name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase()));
  d.style.background = colorFor(user?.id || user?.uid || name);
  return d;
}

/* ---------- state ---------- */
let auth, db, me = null, meDoc = null;
const usersCache = {};   // uid -> {id,name,username,bio}
const unsub = {};        // active listeners
let currentChat = null;  // {chatId, peerUid}
const err = (id, e) => { $("#" + id).textContent = e?.code ? e.code.replace(/-/g, " ") : (e?.message || String(e)); };

/* ================= Firebase setup screen ================= */
const CONFIG_KEY = "pulse_fb_config";
function parseConfig(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Couldn't find a { … } object — paste the whole firebaseConfig snippet.");
  const cfg = new Function("return (" + m[0] + ")")();
  if (!cfg.apiKey || !cfg.projectId) throw new Error("Config needs at least apiKey and projectId.");
  return cfg;
}
$("#save-config-btn").addEventListener("click", () => {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(parseConfig($("#fb-config-input").value)));
    location.reload();
  } catch (e) { $("#setup-error").textContent = e.message; }
});

/* ================= Boot ================= */
let savedCfg = null;
try { savedCfg = JSON.parse(localStorage.getItem(CONFIG_KEY) || "null"); } catch { /* ignore */ }
if (!savedCfg) {
  show("setup-screen");
} else {
  const app = initializeApp(savedCfg);
  auth = getAuth(app);
  db = getFirestore(app);

  onAuthStateChanged(auth, async (user) => {
    if (!user) { show("auth-screen"); return; }
    me = user;
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) meDoc = { id: user.uid, ...snap.data() };
    else {
      const fallback = {
        name: user.displayName || "New user",
        username: "user" + user.uid.slice(0, 6).toLowerCase(),
        bio: "", createdAt: serverTimestamp()
      };
      await setDoc(ref, fallback);
      meDoc = { id: user.uid, ...fallback };
    }
    usersCache[me.uid] = meDoc;
    await refreshUsers();
    enterApp();
  });
}
/* ================= Auth forms ================= */
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
  const signup = t.dataset.tab === "signup";
  $("#login-form").classList.toggle("hidden", signup);
  $("#signup-form").classList.toggle("hidden", !signup);
  $("#auth-error").textContent = "";
}));

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await signInWithEmailAndPassword(auth, $("#login-email").value.trim(), $("#login-pass").value);
  } catch (ex) { err("auth-error", ex); }
});

$("#signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#su-name").value.trim();
  const username = $("#su-username").value.trim().toLowerCase();
  const email = $("#su-email").value.trim();
  const pass = $("#su-pass").value;
  try {
    const taken = await getDocs(query(collection(db, "users"), where("username", "==", username), limit(1)));
    if (!taken.empty) throw new Error("That username is already taken.");
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, "users", cred.user.uid), {
      name, username, bio: "", createdAt: serverTimestamp()
    });
  } catch (ex) { err("auth-error", ex); }
});

/* ================= User directory cache ================= */
async function refreshUsers() {
  const snap = await getDocs(collection(db, "users"));
  snap.forEach((d) => { usersCache[d.id] = { id: d.id, ...d.data() }; });
}

/* ================= Enter the app ================= */
function enterApp() {
  show("feed-screen");
  $("#composer-avatar").replaceWith(Object.assign(avatarEl(meDoc), { id: "composer-avatar" }));
  renderProfile();
  subscribePosts();
  subscribeChats();

  // bottom navigation
  document.querySelectorAll(".nav-btn").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((x) => x.classList.toggle("active", x === b));
    if (unsub.messages) { unsub.messages(); delete unsub.messages; }
    show(b.dataset.screen);
    if (b.dataset.screen === "chats-screen") refreshUsers().then(() => { renderChatList(lastChats); searchUsers($("#user-search").value.trim()); });
    if (b.dataset.screen === "profile-screen") renderProfile();
  }));
}

/* ================= Profile ================= */
function renderProfile() {
  const v = $("#profile-view");
  v.innerHTML = "";
  const card = el("div", "card profile-card");
  card.append(
    avatarEl(meDoc, "big"),
    el("div", "pname", esc(meDoc.name)),
    el("div", "pusername", "@" + esc(meDoc.username)),
    el("div", "pbio", esc(meDoc.bio || "No bio yet — tell the world about yourself!")),
    el("div", "pstats", `<div><b>${postsCount}</b><span>Posts</span></div>
                          <div><b>–</b><span>Following</span></div>
                          <div><b>–</b><span>Followers</span></div>`)
  );
  const form = el("form", "edit-form card");
  form.innerHTML = `
    <input id="edit-name" placeholder="Name" maxlength="40" value="${esc(meDoc.name)}" required>
    <textarea id="edit-bio" placeholder="Your bio" maxlength="200" rows="3">${esc(meDoc.bio || "")}</textarea>
    <button class="btn primary" type="submit">Save profile</button>`;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = { name: $("#edit-name").value.trim(), bio: $("#edit-bio").value.trim() };
    await setDoc(doc(db, "users", me.uid), data, { merge: true });
    meDoc = { ...meDoc, ...data };
    usersCache[me.uid] = meDoc;
    renderProfile();
  });
  const logout = el("button", "btn", "Log out");
  logout.style.marginTop = "12px";
  logout.addEventListener("click", () => { Object.values(unsub).forEach((u) => u()); signOut(auth); });
  v.append(card, form, logout);
}
/* ================= Feed ================= */
let postsCount = 0;

function subscribePosts() {
  unsub.posts?.();
  unsub.posts = onSnapshot(collection(db, "posts"), (snap) => {
    const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .slice(0, 50);
    postsCount = posts.filter((p) => p.uid === me.uid).length;
    renderPosts(posts);
    if (!$("#profile-screen").classList.contains("hidden")) renderProfile();
  });
}

function renderPosts(posts) {
  const list = $("#posts-list");
  list.innerHTML = "";
  if (!posts.length) {
    list.append(el("div", "empty", "No posts yet.<br>Be the first to share something! ✨"));
    return;
  }
  posts.forEach((p) => list.append(postCard(p)));
}

function postCard(p) {
  const author = usersCache[p.uid] || { id: p.uid, name: p.authorName || "User" };
  const card = el("div", "card post");
  const head = el("div", "post-head");
  head.append(avatarEl(author));
  head.append(el("div", "who",
    `<div class="name">${esc(author.name)}</div>
     <div class="time">${timeAgo(p.createdAt)}${author.username ? " · @" + esc(author.username) : ""}</div>`));
  card.append(head, el("div", "post-text", esc(p.text)));

  const liked = (p.likes || []).includes(me.uid);
  const actions = el("div", "post-actions");
  const likeBtn = el("button", "action" + (liked ? " liked" : ""),
    `<span class="ic">${liked ? "❤️" : "🤍"}</span><span>${(p.likes || []).length || ""}</span>`);
  likeBtn.addEventListener("click", () =>
    updateDoc(doc(db, "posts", p.id), { likes: liked ? arrayRemove(me.uid) : arrayUnion(me.uid) }));
  const cBtn = el("button", "action", `💬<span>${p.commentCount || ""}</span>`);
  actions.append(likeBtn, cBtn);
  card.append(actions);

  const cArea = el("div", "comments hidden");
  let cUnsub = null;
  cBtn.addEventListener("click", () => {
    cArea.classList.toggle("hidden");
    if (cArea.classList.contains("hidden")) { cUnsub?.(); cUnsub = null; return; }
    if (!cUnsub) cUnsub = subscribeComments(p.id, cArea);
  });
  card.append(cArea);
  return card;
}

function subscribeComments(postId, area) {
  area.innerHTML = "";
  const form = el("form", "comment-form");
  const inp = el("input"); inp.placeholder = "Write a comment…"; inp.maxLength = 300;
  const send = el("button", "btn small primary", "Send");
  form.append(inp, send);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = inp.value.trim();
    if (!text) return;
    inp.value = "";
    await addDoc(collection(db, "posts", postId, "comments"),
      { uid: me.uid, name: meDoc.name, text, createdAt: serverTimestamp() });
    await updateDoc(doc(db, "posts", postId), { commentCount: increment(1) });
  });
  area.append(form);
  return onSnapshot(collection(db, "posts", postId, "comments"), (snap) => {
    const list = snap.docs.map((d) => d.data())
      .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    area.querySelectorAll(".comment").forEach((n) => n.remove());
    if (!list.length) area.prepend(el("div", "empty", "No comments yet."));
    list.forEach((c) => {
      const row = el("div", "comment");
      row.append(avatarEl(usersCache[c.uid] || { id: c.uid, name: c.name }));
      row.append(el("div", "bubble", `<div class="cname">${esc(c.name)}</div>${esc(c.text)}`));
      area.insertBefore(row, form);
    });
  });
}

/* ================= Composer ================= */
$("#post-btn").addEventListener("click", async () => {
  const text = $("#post-input").value.trim();
  if (!text || !me) return;
  $("#post-input").value = "";
  await addDoc(collection(db, "posts"), {
    uid: me.uid, authorName: meDoc.name, text, likes: [], commentCount: 0,
    createdAt: serverTimestamp()
  });
});
/* ================= Chats ================= */
let lastChats = [];

function subscribeChats() {
  unsub.chats?.();
  unsub.chats = onSnapshot(
    query(collection(db, "chats"), where("members", "array-contains", me.uid)),
    (snap) => {
      lastChats = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.lastAt?.seconds || 0) - (a.lastAt?.seconds || 0));
      renderChatList(lastChats);
    });
}

function renderChatList(chats) {
  const list = $("#chat-list");
  list.innerHTML = "";
  if (!chats.length) {
    list.append(el("div", "empty", "No conversations yet.<br>Search a username above to start chatting 💬"));
    return;
  }
  chats.forEach((c) => {
    const peerUid = (c.members || []).find((m) => m !== me.uid);
    const peer = usersCache[peerUid] || { id: peerUid, name: "User" };
    const row = el("button", "chat-row");
    row.append(avatarEl(peer));
    row.append(el("div", "who",
      `<div class="row-head"><span class="name">${esc(peer.name)}</span>
        <span class="time">${timeAgo(c.lastAt)}</span></div>
       <div class="last">${esc(c.lastMsg || "Say hi 👋")}</div>`));
    row.addEventListener("click", () => openChat(peerUid));
    list.append(row);
  });
}

/* Search people */
let searchTimer = null;
$("#user-search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => searchUsers(e.target.value.trim()), 250);
});

async function searchUsers(q) {
  const box = $("#user-results");
  if (!q) { box.innerHTML = ""; return; }
  const snap = await getDocs(query(
    collection(db, "users"),
    where("username", ">=", q.toLowerCase()),
    where("username", "<=", q.toLowerCase() + "\uf8ff"),
    limit(8)));
  box.innerHTML = "";
  snap.forEach((d) => {
    if (d.id === me.uid) return;
    const u = { id: d.id, ...d.data() };
    const row = el("button", "chat-row");
    row.append(avatarEl(u));
    row.append(el("div", "who",
      `<div class="name">${esc(u.name)}</div><div class="last">@${esc(u.username)}</div>`));
    row.addEventListener("click", () => openChat(u.id));
    box.append(row);
  });
}

/* ================= Conversation ================= */
function openChat(peerUid) {
  const peer = usersCache[peerUid] || { id: peerUid, name: "User" };
  const chatId = [me.uid, peerUid].sort().join("__");
  currentChat = { chatId, peerUid };
  setDoc(doc(db, "chats", chatId),
    { members: [me.uid, peerUid], lastAt: serverTimestamp() }, { merge: true });

  $("#chat-peer-name").textContent = peer.name;
  const avSlot = $("#chat-peer-avatar");
  avSlot.replaceWith(Object.assign(avatarEl(peer, "small"), { id: "chat-peer-avatar" }));
  show("chat-screen");
  $("#messages").innerHTML = "";

  unsub.messages?.();
  unsub.messages = onSnapshot(collection(db, "chats", chatId, "messages"), (snap) => {
    const msgs = snap.docs.map((d) => d.data())
      .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    const box = $("#messages");
    box.innerHTML = "";
    if (!msgs.length) box.append(el("div", "empty", "Start the conversation 💬"));
    msgs.forEach((m) => {
      const mine = m.uid === me.uid;
      box.append(el("div", "msg " + (mine ? "mine" : "theirs"),
        `${esc(m.text)}<span class="t">${timeAgo(m.createdAt)}</span>`));
    });
    window.scrollTo(0, document.body.scrollHeight);
  });
}

$("#msg-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("#msg-input").value.trim();
  if (!text || !currentChat) return;
  $("#msg-input").value = "";
  await addDoc(collection(db, "chats", currentChat.chatId, "messages"),
    { uid: me.uid, text, createdAt: serverTimestamp() });
  await updateDoc(doc(db, "chats", currentChat.chatId),
    { lastMsg: text, lastAt: serverTimestamp() });
});

$("#chat-back").addEventListener("click", () => {
  unsub.messages?.(); delete unsub.messages;
  show("chats-screen");
});

/* ================= PWA ================= */
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => { });
}



