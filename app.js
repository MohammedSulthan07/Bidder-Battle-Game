import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import {
  getDatabase, ref, get, set, update, push, remove, onValue, onChildAdded,
  onDisconnect, serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = (selector, root = document) => root.querySelector(selector);
const appRoot = $("#app");
const homeScreen = $("#home-screen");
const entryPanel = $("#entry-panel");
const roomScreen = $("#room-screen");
const toastNode = $("#toast");
const connectionNode = $(".connection");
const connectionLabel = $("#connection-label");

const THEME_KEY = "bb_theme";
function applyTheme(theme) {
  const nextTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = nextTheme;
  const toggle = $("#theme-toggle");
  if (toggle) {
    const toLight = nextTheme === "dark";
    toggle.innerHTML = `${toLight ? "☀" : "☾"} <span class="theme-toggle-label">${toLight ? "Light mode" : "Dark mode"}</span>`;
    toggle.setAttribute("aria-label", `Switch to ${toLight ? "light" : "dark"} mode`);
    toggle.title = `Switch to ${toLight ? "light" : "dark"} mode`;
  }
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = nextTheme === "dark" ? "#0a111b" : "#fbf5e9";
}
function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, nextTheme);
  applyTheme(nextTheme);
}
applyTheme(localStorage.getItem(THEME_KEY) || "dark");

let auth;
let db;
let me = null;
let mode = "create";
let currentRoomCode = null;
let roomMeta = null;
let roomPlayers = {};
let roomState = null;
let myPeek = null;
let myAssets = { items: [], itemValue: 0 };
let myProfile = null;
let listeners = [];
let actionBusy = false;
let hostActionQueue = Promise.resolve();
let toastTimer;

const MAX_PLAYERS = 7;
const STARTING_CASH = 5000;
const BUY_IN = 100;
const MIN_BID = 100;
const FINE = 1000;

const UNITS = [
  { name: "The Side Locker", size: "LOCKER", emoji: "🗄️", items: 2, flip: false, peek: "before" },
  { name: "The Back-Room Stack", size: "SMALL", emoji: "📦", items: 3, flip: true, peek: "after" },
  { name: "The Workshop Unit", size: "MEDIUM", emoji: "🛠️", items: 3, flip: false, peek: "before" },
  { name: "The Warehouse Bay", size: "LARGE", emoji: "🏭", items: 4, flip: true, peek: "after" },
  { name: "The Deep Storage", size: "JUMBO", emoji: "🚪", items: 5, flip: false, peek: "after" },
  { name: "The Attic Unit", size: "MEDIUM", emoji: "🧳", items: 4, flip: true, peek: "before" },
  { name: "The Loading Dock", size: "LARGE", emoji: "🚚", items: 5, flip: false, peek: "before" },
  { name: "The Mystery Locker", size: "LOCKER", emoji: "🔐", items: 2, flip: true, peek: "after" }
];

// Original sample items and effects for this unofficial digital edition.
const ITEM_DECK = [
  { name: "Retro Record Player", value: 2200, icon: "📻", type: "ITEM" },
  { name: "Collector Toy Box", value: 2800, icon: "🧸", type: "ITEM" },
  { name: "Vintage Camera Kit", value: 1800, icon: "📷", type: "ITEM" },
  { name: "Arcade Game Console", value: 3600, icon: "🕹️", type: "ITEM" },
  { name: "Silver Serving Set", value: 1500, icon: "🍽️", type: "ITEM" },
  { name: "Designer Lamp Pair", value: 1100, icon: "💡", type: "ITEM" },
  { name: "Comic Book Bundle", value: 3200, icon: "📚", type: "ITEM" },
  { name: "Old Tool Chest", value: 1700, icon: "🧰", type: "ITEM" },
  { name: "Classic Bike Frame", value: 900, icon: "🚲", type: "ITEM" },
  { name: "Brass Telescope", value: 2400, icon: "🔭", type: "ITEM" },
  { name: "Record Collection", value: 1300, icon: "💿", type: "ITEM" },
  { name: "Antique Clock", value: 2000, icon: "🕰️", type: "ITEM" },
  { name: "Camera Tripod", value: 500, icon: "📸", type: "ITEM" },
  { name: "Vintage Typewriter", value: 1900, icon: "⌨️", type: "ITEM" },
  { name: "Handmade Quilt", value: 700, icon: "🧵", type: "ITEM" },
  { name: "Gold-Tone Frame", value: 800, icon: "🖼️", type: "ITEM" },
  { name: "Crystal Vase", value: 1200, icon: "🏺", type: "ITEM" },
  { name: "Camping Gear Set", value: 1000, icon: "⛺", type: "ITEM" },
  { name: "Mini Keyboard", value: 400, icon: "🎹", type: "ITEM" },
  { name: "Sealed Mystery Box", value: 2600, icon: "🎁", type: "ITEM" },
  { name: "Rare Board Game", value: 1400, icon: "🎲", type: "ITEM" },
  { name: "Old Film Projector", value: 2100, icon: "📽️", type: "ITEM" },
  { name: "Sports Memorabilia", value: 2300, icon: "🏆", type: "ITEM" },
  { name: "Copper Cookware", value: 900, icon: "🍳", type: "ITEM" },
  { name: "Garden Statue", value: 600, icon: "🗿", type: "ITEM" },
  { name: "Leather Travel Case", value: 750, icon: "🧳", type: "ITEM" },
  { name: "Old Speaker Pair", value: 1600, icon: "🔊", type: "ITEM" },
  { name: "Collector Sneakers", value: 2500, icon: "👟", type: "ITEM" },
  { name: "Retro Desk Fan", value: 450, icon: "🪭", type: "ITEM" },
  { name: "Porcelain Tea Set", value: 1250, icon: "🫖", type: "ITEM" },
  { name: "Box of Cables", value: 100, icon: "🔌", type: "ITEM" },
  { name: "Packing Peanuts", value: 0, icon: "🫧", type: "ITEM" },
  { name: "Empty Suitcase", value: 100, icon: "🧳", type: "ITEM" },
  { name: "Cracked Wall Mirror", value: 0, icon: "🪞", type: "ITEM" },
  { name: "Flash Sale", value: 0, icon: "⚡", type: "EVENT", effect: { kind: "cash", amount: 500, text: "Collect $500 from the auctioneer." } },
  { name: "Storage Fee", value: 0, icon: "🧾", type: "EVENT", effect: { kind: "pay", amount: 300, text: "Pay the auctioneer $300." } },
  { name: "Bonus Shelf", value: 0, icon: "🎯", type: "EVENT", effect: { kind: "asset", amount: 700, text: "Add $700 to your item value." } },
  { name: "Marketplace Rush", value: 0, icon: "📈", type: "EVENT", effect: { kind: "cash", amount: 800, text: "Collect $800 from the auctioneer." } },
  { name: "Damaged Goods", value: 0, icon: "📦", type: "EVENT", effect: { kind: "pay", amount: 500, text: "Pay the auctioneer $500." } },
  { name: "Hidden Compartment", value: 0, icon: "🗝️", type: "EVENT", effect: { kind: "asset", amount: 1000, text: "Add $1,000 to your item value." } }
];

function showToast(message) {
  toastNode.textContent = message;
  toastNode.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastNode.classList.remove("show"), 2800);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function money(value) {
  const amount = Number(value || 0);
  return "$" + amount.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function cleanName(value) {
  return String(value || "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 18);
}

function roomRef() { return ref(db, `rooms/${currentRoomCode}`); }
function metaRef() { return ref(db, `rooms/${currentRoomCode}/meta`); }
function playersRef() { return ref(db, `rooms/${currentRoomCode}/players`); }
function stateRef() { return ref(db, `rooms/${currentRoomCode}/state`); }
function secretRef() { return ref(db, `rooms/${currentRoomCode}/private/lotItems`); }
function assetsRootRef() { return ref(db, `rooms/${currentRoomCode}/private/playerAssets`); }
function assetsRef(uid) { return ref(db, `rooms/${currentRoomCode}/private/playerAssets/${uid}`); }
function peeksRef() { return ref(db, `rooms/${currentRoomCode}/private/peeks/${me.uid}`); }
function actionsRef() { return ref(db, `rooms/${currentRoomCode}/actions`); }

function showHome() {
  homeScreen.classList.remove("hidden");
  entryPanel.classList.add("hidden");
  roomScreen.classList.add("hidden");
}

function showEntry(nextMode) {
  mode = nextMode;
  homeScreen.classList.add("hidden");
  roomScreen.classList.add("hidden");
  entryPanel.classList.remove("hidden");
  const isJoin = nextMode === "join";
  $("#entry-eyebrow").textContent = isJoin ? "JOIN THE SHOWDOWN" : "START A SHOWDOWN";
  $("#entry-title").textContent = isJoin ? "Join a room" : "Create your room";
  $("#entry-description").textContent = isJoin ? "Enter the room code your host shared with you." : "Set up a room, invite your crew, and take the auctioneer seat.";
  $("#join-code-wrap").classList.toggle("hidden", !isJoin);
  $("#entry-submit").innerHTML = isJoin ? "Join the battle <span>↗</span>" : "Create room <span>↗</span>";
  const queryCode = new URLSearchParams(location.search).get("room");
  if (isJoin && queryCode) $("#room-code").value = queryCode.toUpperCase().slice(0, 5);
  $("#player-name").focus();
}

function openHow() { $("#how-modal").classList.remove("hidden"); }
function closeHow() { $("#how-modal").classList.add("hidden"); }

function resetRoomListeners() {
  for (const unsubscribe of listeners) {
    try { unsubscribe(); } catch (_) { /* listener already removed */ }
  }
  listeners = [];
}

function setConnection(status, label) {
  connectionNode.classList.remove("online", "offline");
  if (status) connectionNode.classList.add(status);
  connectionLabel.textContent = label;
}

async function ensureSignedIn() {
  const user = auth.currentUser || (await signInAnonymously(auth)).user;
  // The auth-state observer also updates this, but set it here so room creation
  // never races that asynchronous callback.
  me = user;
  return user;
}

async function createRoom(name) {
  if (!db || !me) throw new Error("Firebase is not connected yet. Complete the Firebase setup in README.md first.");
  let code = randomCode();
  let existing = await get(ref(db, `rooms/${code}/meta`));
  while (existing.exists()) {
    code = randomCode();
    existing = await get(ref(db, `rooms/${code}/meta`));
  }

  const initialState = {
    phase: "lobby",
    players: {},
    turnOrder: [],
    auctioneerSchedule: [],
    auctionIndex: 0,
    auctionNo: 0,
    round: 1,
    auctioneerUid: null,
    unit: null,
    revealedItems: [],
    phaseNote: "Waiting for the host to start the game.",
    buyInOrder: [],
    buyInIndex: 0,
    bidders: [],
    passed: [],
    currentBid: 0,
    highBidderUid: null,
    turnUid: null,
    history: [],
    log: [{ text: `${name} created the room. Invite 2–6 more players to begin.`, at: Date.now() }],
    winnerUid: null
  };

  const roomData = {
    meta: { hostUid: me.uid, hostName: name, status: "lobby", createdAt: serverTimestamp(), maxPlayers: MAX_PLAYERS },
    players: { [me.uid]: { name, connected: true, joinedAt: serverTimestamp() } },
    state: initialState,
    private: { lotItems: [], peeks: {}, playerAssets: {} },
    actions: {}
  };
  await set(ref(db, `rooms/${code}`), roomData);
  await enterRoom(code, name, true);
}

async function joinRoom(code, name) {
  if (!db || !me) throw new Error("Firebase is not connected yet. Complete the Firebase setup in README.md first.");
  code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  if (code.length !== 5) throw new Error("Enter the 5-character room code.");
  const root = `rooms/${code}`;
  const [metaSnap, playersSnap] = await Promise.all([
    get(ref(db, `${root}/meta`)),
    get(ref(db, `${root}/players`))
  ]);
  if (!metaSnap.exists()) throw new Error("Room not found. Check the code and try again.");
  const meta = metaSnap.val();
  const players = playersSnap.val() || {};
  if (!players[me.uid] && meta.status !== "lobby") throw new Error("This game has already started. New players cannot join now.");
  if (!players[me.uid] && Object.keys(players).length >= MAX_PLAYERS) throw new Error("This room is full (7 players maximum).");
  if (players[me.uid]) {
    await update(ref(db, `${root}/players/${me.uid}`), { name, connected: true });
  } else {
    await set(ref(db, `${root}/players/${me.uid}`), { name, connected: true, joinedAt: serverTimestamp() });
  }
  await enterRoom(code, name, false);
}

async function enterRoom(code, name, isHost) {
  resetRoomListeners();
  currentRoomCode = code;
  roomMeta = null;
  roomPlayers = {};
  roomState = null;
  myPeek = null;
  myAssets = { items: [], itemValue: 0 };
  hostActionQueue = Promise.resolve();
  myProfile = { name };
  localStorage.setItem("bb_room", code);
  localStorage.setItem("bb_name", name);
  const playerPresenceRef = ref(db, `rooms/${code}/players/${me.uid}`);
  try { await onDisconnect(playerPresenceRef).update({ connected: false }); } catch (error) { console.warn("Presence setup skipped", error); }
  await update(playerPresenceRef, { connected: true, name });

  let hostActionListenerAttached = false;
  listeners.push(onValue(metaRef(), snap => {
    roomMeta = snap.val();
    if (!roomMeta) return;
    if (roomMeta.hostUid === me.uid && !hostActionListenerAttached) {
      hostActionListenerAttached = true;
      listeners.push(onChildAdded(actionsRef(), actionSnap => {
        hostActionQueue = hostActionQueue.then(() => processHostAction(actionSnap.key, actionSnap.val())).catch(error => {
          console.error(error);
          showToast("A game action could not be processed. The host can retry.");
        });
      }));
    }
    renderRoom();
  }));
  listeners.push(onValue(playersRef(), snap => {
    roomPlayers = snap.val() || {};
    renderRoom();
  }));
  listeners.push(onValue(stateRef(), snap => {
    roomState = snap.val();
    renderRoom();
  }));
  listeners.push(onValue(peeksRef(), snap => {
    myPeek = snap.val();
    renderRoom();
  }));
  listeners.push(onValue(assetsRef(me.uid), snap => {
    myAssets = snap.val() || { items: [], itemValue: 0 };
    renderRoom();
  }));


  homeScreen.classList.add("hidden");
  entryPanel.classList.add("hidden");
  roomScreen.classList.remove("hidden");
  roomState = roomState || null;
  renderRoom();
  history.replaceState({}, "", `${location.pathname}?room=${code}`);
  showToast(isHost ? `Room ${code} is ready. Invite your players.` : `Joined room ${code}.`);
}

async function submitAction(type, payload = {}) {
  if (actionBusy) return;
  actionBusy = true;
  try {
    const action = push(actionsRef());
    await set(action, { uid: me.uid, type, ...payload, at: Date.now() });
  } catch (error) {
    console.error(error);
    showToast(error.message || "Could not send that action.");
  } finally {
    setTimeout(() => { actionBusy = false; }, 400);
  }
}

function currentPlayer(state, uid) {
  return state?.players?.[uid];
}
function isHost() { return !!(me && roomMeta && roomMeta.hostUid === me.uid); }
function myGamePlayer() { return currentPlayer(roomState, me?.uid); }
function displayName(uid) { return roomPlayers?.[uid]?.name || "Player"; }
function addLog(state, text) {
  state.log = Array.isArray(state.log) ? state.log : [];
  state.log.unshift({ text, at: Date.now() });
  state.log = state.log.slice(0, 28);
}

function playerOrder(state) {
  return Array.isArray(state.turnOrder) ? state.turnOrder : Object.keys(state.players || {});
}

function nextActiveAfter(state, uid, candidates) {
  const order = playerOrder(state);
  if (!order.length || !candidates.length) return null;
  const currentIndex = Math.max(0, order.indexOf(uid));
  for (let step = 1; step <= order.length; step++) {
    const candidate = order[(currentIndex + step) % order.length];
    if (candidates.includes(candidate)) return candidate;
  }
  return candidates[0] || null;
}

function syncAuctionResult(state, items, winnerUid, winningBid, assets) {
  const auctioneerUid = state.auctioneerUid;
  const winner = state.players[winnerUid];
  const auctioneer = state.players[auctioneerUid];
  const winnerAssets = assets[winnerUid] || { items: [], itemValue: 0 };
  winnerAssets.items = Array.isArray(winnerAssets.items) ? winnerAssets.items : [];
  winnerAssets.itemValue = Number(winnerAssets.itemValue || 0);
  const totalPrintedValue = items.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  winner.cash -= winningBid;
  auctioneer.cash += winningBid;
  winnerAssets.items.push(...items);
  winnerAssets.itemValue += totalPrintedValue;

  for (const item of items) {
    if (item.type !== "EVENT" || !item.effect) continue;
    const amount = Number(item.effect.amount || 0);
    if (item.effect.kind === "cash") {
      winner.cash += amount;
      auctioneer.cash -= amount;
    } else if (item.effect.kind === "pay") {
      const paid = Math.min(winner.cash, amount);
      winner.cash -= paid;
      auctioneer.cash += paid;
    } else if (item.effect.kind === "asset") {
      winnerAssets.itemValue += amount;
    }
  }

  assets[winnerUid] = winnerAssets;
  state.phase = "result";
  state.turnUid = null;
  // Hidden winnings stay in the winner's private stash. Only the face-up card remains public.
  state.lastResult = { winnerUid, winningBid, auctioneerUid };
  addLog(state, `${displayName(winnerUid)} won ${state.unit.name} for ${money(winningBid)}. Their haul is private.`);
}

async function resolveAuction(state, profiles, assets) {
  const itemsSnap = await get(secretRef());
  const items = itemsSnap.val() || [];
  const winnerUid = state.highBidderUid;
  const amount = Number(state.currentBid || 0);
  if (!winnerUid || amount < MIN_BID) {
    state.phase = "result";
    state.turnUid = null;
    state.lastResult = { winnerUid: null, winningBid: 0, auctioneerUid: state.auctioneerUid, note: "No sale. The storage unit was passed over." };
    addLog(state, "No sale. The storage unit was passed over.");
    await set(stateRef(), state);
    return;
  }

  const winner = state.players[winnerUid];
  const auctioneer = state.players[state.auctioneerUid];
  if (winner.cash < amount) {
    const canPayFine = winner.cash >= FINE;
    if (canPayFine) {
      winner.cash -= FINE;
      auctioneer.cash += FINE;
      addLog(state, `${displayName(winnerUid)} could not pay ${money(amount)} and paid the ${money(FINE)} in-game fine.`);
    } else {
      winner.eliminated = true;
      addLog(state, `${displayName(winnerUid)} could not pay the bid or fine and was eliminated.`);
    }

    const retryBidders = (state.bidders || []).filter(uid => uid !== winnerUid && !state.players[uid]?.eliminated);
    state.bidders = retryBidders;
    state.passed = [];
    state.currentBid = 0;
    state.highBidderUid = null;
    state.turnUid = null;
    if (!retryBidders.length) {
      state.phase = "result";
      state.lastResult = { winnerUid: null, winningBid: 0, auctioneerUid: state.auctioneerUid, note: "The auction ended after the top bidder defaulted." };
      addLog(state, "No eligible bidders remain. The unit is closed without a sale.");
    } else {
      // Restart the same lot without the defaulting bidder. The remaining buy-ins stay paid.
      const opener = retryBidders[0];
      if (state.players[opener].cash < MIN_BID) {
        state.phase = "result";
        state.lastResult = { winnerUid: null, winningBid: 0, auctioneerUid: state.auctioneerUid, note: "No remaining bidder can cover the opening bid." };
      } else {
        state.currentBid = MIN_BID;
        state.highBidderUid = opener;
        state.turnUid = retryBidders.length > 1 ? retryBidders[1] : null;
        addLog(state, `The auction restarts at ${money(MIN_BID)} without ${displayName(winnerUid)}.`);
        if (retryBidders.length === 1) syncAuctionResult(state, items, opener, MIN_BID, assets);
      }
    }
    await Promise.all([set(stateRef(), state), set(assetsRootRef(), assets)]);
    return;
  }

  syncAuctionResult(state, items, winnerUid, amount, assets);
  await Promise.all([set(stateRef(), state), set(assetsRootRef(), assets)]);
}

async function finishBuyInStage(state, profiles, assets) {
  const bidders = state.buyInOrder.filter(uid => state.players[uid]?.buyIn && !state.players[uid]?.eliminated);
  state.bidders = bidders;
  state.passed = [];
  if (!bidders.length) {
    state.phase = "result";
    state.turnUid = null;
    state.lastResult = { winnerUid: null, winningBid: 0, auctioneerUid: state.auctioneerUid, note: "No one bought in, so this unit was skipped." };
    addLog(state, "Nobody bought in. The unit was skipped.");
    return;
  }
  const opener = bidders[0];
  if (state.players[opener].cash < MIN_BID) {
    state.phase = "result";
    state.lastResult = { winnerUid: null, winningBid: 0, auctioneerUid: state.auctioneerUid, note: "No player can make the opening bid." };
    addLog(state, "No active bidder can make the opening bid. The unit was skipped.");
    return;
  }
  state.phase = "bidding";
  state.currentBid = MIN_BID;
  state.highBidderUid = opener;
  state.turnUid = bidders.length > 1 ? bidders[1] : null;
  addLog(state, `${displayName(opener)} opens the auction at ${money(MIN_BID)}.`);
  if (bidders.length === 1) {
    const itemsSnap = await get(secretRef());
    syncAuctionResult(state, itemsSnap.val() || [], opener, MIN_BID, assets);
  }
}

async function processHostAction(actionId, action) {
  if (!actionId || !action) return;
  try {
    const actionRef = ref(db, `rooms/${currentRoomCode}/actions/${actionId}`);
    const uid = action.uid;
    const stateSnap = await get(stateRef());
    const playersSnap = await get(playersRef());
    const state = stateSnap.val();
    const profiles = playersSnap.val() || {};
    const assetsSnap = await get(assetsRootRef());
    const assets = assetsSnap.val() || {};
    if (!state || !state.players?.[uid] || state.players[uid].eliminated) {
      await remove(actionRef);
      return;
    }

    if (action.type === "peek") {
      const peeksSnap = await get(ref(db, `rooms/${currentRoomCode}/private/peeks/${uid}`));
      const alreadyPeeked = state.peekedBy?.[uid] !== undefined;
      const phase = state.phase;
      const isAuctioneer = uid === state.auctioneerUid;
      const canPeekBefore = state.unit?.peek === "before" && phase === "preview";
      const canPeekAfter = state.unit?.peek === "after" && phase === "bidding" && state.players[uid].buyIn;
      if (!alreadyPeeked && !peeksSnap.exists() && (isAuctioneer || canPeekBefore || canPeekAfter)) {
        const itemsSnap = await get(secretRef());
        const items = itemsSnap.val() || [];
        const index = Number(action.index);
        const faceUpIndex = state.unit?.faceUpIndex;
        if (Number.isInteger(index) && index >= 0 && index < items.length && index !== faceUpIndex) {
          await set(ref(db, `rooms/${currentRoomCode}/private/peeks/${uid}`), { index, item: items[index], at: Date.now() });
          state.peekedBy = state.peekedBy || {};
          state.peekedBy[uid] = index;
          addLog(state, `${displayName(uid)} took a private peek at one item.`);
          await set(stateRef(), state);
        }
      }
    }

    if (action.type === "buyin" || action.type === "sitout") {
      if (state.phase === "buyin" && state.buyInOrder[state.buyInIndex] === uid) {
        const player = state.players[uid];
        const auctioneer = state.players[state.auctioneerUid];
        if (action.type === "buyin" && player.cash >= BUY_IN) {
          player.cash -= BUY_IN;
          auctioneer.cash += BUY_IN;
          player.buyIn = true;
          addLog(state, `${displayName(uid)} bought in for ${money(BUY_IN)}.`);
        } else {
          addLog(state, `${displayName(uid)} sat out${action.type === "buyin" ? " (not enough cash)" : ""}.`);
        }
        state.buyInIndex += 1;
        if (state.buyInIndex >= state.buyInOrder.length) {
          await finishBuyInStage(state, profiles, assets);
          // A one-person auction can resolve immediately at the opening bid.
          // Persist any private winnings generated by that automatic sale.
          await set(assetsRootRef(), assets);
        } else {
          state.phaseNote = `Waiting for ${displayName(state.buyInOrder[state.buyInIndex])} to choose buy-in or sit out.`;
        }
        await set(stateRef(), state);
      }
    }

    if (action.type === "bid" && state.phase === "bidding" && state.turnUid === uid) {
      const amount = Math.floor(Number(action.amount));
      if (Number.isInteger(amount) && amount >= state.currentBid + MIN_BID && amount % MIN_BID === 0) {
        state.currentBid = amount;
        state.highBidderUid = uid;
        const active = state.bidders.filter(candidate => !state.passed.includes(candidate) && !state.players[candidate]?.eliminated);
        if (active.length <= 1) {
          await resolveAuction(state, profiles, assets);
          await remove(actionRef);
          return;
        }
        state.turnUid = nextActiveAfter(state, uid, active);
        addLog(state, `${displayName(uid)} bid ${money(amount)}. ${displayName(state.turnUid)} is up next.`);
        await set(stateRef(), state);
      }
    }

    if (action.type === "pass" && state.phase === "bidding" && state.turnUid === uid) {
      if (uid === state.highBidderUid) {
        await resolveAuction(state, profiles, assets);
        await remove(actionRef);
        return;
      }
      state.passed = Array.isArray(state.passed) ? state.passed : [];
      if (!state.passed.includes(uid)) state.passed.push(uid);
      const active = state.bidders.filter(candidate => !state.passed.includes(candidate) && !state.players[candidate]?.eliminated);
      if (active.length <= 1) {
        await resolveAuction(state, profiles, assets);
        await remove(actionRef);
        return;
      }
      state.turnUid = nextActiveAfter(state, uid, active);
      addLog(state, `${displayName(uid)} passed.`);
      await set(stateRef(), state);
    }

    await remove(actionRef);
  } catch (error) {
    console.error("Host action error", error);
    showToast("Game action error: " + (error.message || "please try again"));
  }
}

async function startGame() {
  if (!isHost() || !roomState) return;
  const uids = Object.keys(roomPlayers || {});
  if (uids.length < 3) return showToast("You need at least 3 players to start.");
  if (uids.length > MAX_PLAYERS) return showToast("This room supports up to 7 players.");
  const gamePlayers = {};
  for (const uid of uids) {
    gamePlayers[uid] = { cash: STARTING_CASH, buyIn: false, peeked: false, eliminated: false };
  }
  const playerAssets = {};
  for (const uid of uids) playerAssets[uid] = { items: [], itemValue: 0 };
  const schedule = [...uids, ...uids];
  const state = {
    phase: "open",
    players: gamePlayers,
    turnOrder: uids,
    auctioneerSchedule: schedule,
    auctionIndex: 0,
    auctionNo: 0,
    round: 1,
    auctioneerUid: schedule[0],
    unit: null,
    revealedItems: [],
    phaseNote: "The auctioneer is ready to open the first unit.",
    buyInOrder: [],
    buyInIndex: 0,
    bidders: [],
    passed: [],
    currentBid: 0,
    highBidderUid: null,
    turnUid: null,
    peekedBy: {},
    history: [],
    log: [{ text: "The game is on! Each player starts with $5,000 in virtual cash.", at: Date.now() }],
    winnerUid: null
  };
  await Promise.all([
    update(metaRef(), { status: "playing" }),
    set(stateRef(), state),
    set(secretRef(), []),
    set(assetsRootRef(), playerAssets),
    set(ref(db, `rooms/${currentRoomCode}/private/peeks`), {})
  ]);
  showToast("Game started. The first auctioneer is up!");
}

async function openNextUnit() {
  if (!isHost() || !roomState || roomState.phase !== "open") return;
  const selectedUnit = UNITS[Math.floor(Math.random() * UNITS.length)];
  const allItems = shuffle(ITEM_DECK).slice(0, selectedUnit.items).map(item => ({ ...item }));
  const faceUpIndex = selectedUnit.flip ? Math.floor(Math.random() * allItems.length) : -1;
  const state = structuredClone(roomState);
  state.phase = "preview";
  state.auctionNo = (state.auctionNo || 0) + 1;
  state.unit = { ...selectedUnit, faceUpIndex };
  state.revealedItems = faceUpIndex >= 0 ? [{ index: faceUpIndex, ...allItems[faceUpIndex] }] : [];
  state.phaseNote = `${displayName(state.auctioneerUid)} is the auctioneer. Players may inspect the unit rules.`;
  state.buyInOrder = [];
  state.buyInIndex = 0;
  state.bidders = [];
  state.passed = [];
  state.currentBid = 0;
  state.highBidderUid = null;
  state.turnUid = null;
  state.peekedBy = {};
  state.lastResult = null;
  state.players = state.players || {};
  Object.values(state.players).forEach(player => { player.buyIn = false; player.peeked = false; });
  await Promise.all([
    set(secretRef(), allItems),
    set(ref(db, `rooms/${currentRoomCode}/private/peeks`), {}),
    set(stateRef(), state)
  ]);
  addLog(state, `${displayName(state.auctioneerUid)} opened ${selectedUnit.name}.`);
  await set(stateRef(), state);
}

async function startBuyIn() {
  if (!isHost() || !roomState || roomState.phase !== "preview") return;
  const order = playerOrder(roomState);
  const auctioneerIndex = order.indexOf(roomState.auctioneerUid);
  const buyInOrder = [];
  for (let step = 1; step < order.length; step++) buyInOrder.push(order[(auctioneerIndex + step) % order.length]);
  const state = structuredClone(roomState);
  state.phase = "buyin";
  state.buyInOrder = buyInOrder;
  state.buyInIndex = 0;
  state.phaseNote = `Waiting for ${displayName(buyInOrder[0])} to choose buy-in or sit out.`;
  addLog(state, "Buy-in is open. It starts with the player to the auctioneer's left.");
  await set(stateRef(), state);
}

async function nextAuction() {
  if (!isHost() || !roomState || roomState.phase !== "result") return;
  const state = structuredClone(roomState);
  let nextIndex = Number(state.auctionIndex || 0) + 1;
  const schedule = state.auctioneerSchedule || [];
  while (nextIndex < schedule.length && state.players[schedule[nextIndex]]?.eliminated) nextIndex++;
  if (nextIndex >= schedule.length) {
    const contenders = state.turnOrder.filter(uid => !state.players[uid]?.eliminated);
    const assetsSnap = await get(assetsRootRef());
    const allAssets = assetsSnap.val() || {};
    const scores = contenders.map(uid => {
      const cash = Number(state.players[uid]?.cash || 0);
      const itemValue = Number(allAssets[uid]?.itemValue || 0);
      return { uid, cash, itemValue, score: cash + itemValue };
    });
    scores.sort((a, b) => b.score - a.score);
    state.phase = "gameover";
    state.winnerUid = scores[0]?.uid || null;
    state.finalScores = scores;
    state.phaseNote = "The final auction has closed. The champion is crowned!";
    if (state.winnerUid) addLog(state, `${displayName(state.winnerUid)} won Bidder Battle with ${money(scores[0]?.score || 0)}.`);
    else addLog(state, "There are no eligible players left to claim the title.");
    await Promise.all([set(stateRef(), state), update(metaRef(), { status: "complete" })]);
    return;
  }
  state.auctionIndex = nextIndex;
  state.round = nextIndex < state.turnOrder.length ? 1 : 2;
  state.auctioneerUid = schedule[nextIndex];
  state.phase = "open";
  state.unit = null;
  state.revealedItems = [];
  state.phaseNote = `${displayName(state.auctioneerUid)} is the auctioneer for auction ${nextIndex + 1}.`;
  state.buyInOrder = [];
  state.buyInIndex = 0;
  state.bidders = [];
  state.passed = [];
  state.currentBid = 0;
  state.highBidderUid = null;
  state.turnUid = null;
  state.lastResult = null;
  addLog(state, `Next up: ${displayName(state.auctioneerUid)} takes the auctioneer seat.`);
  await Promise.all([
    set(secretRef(), []),
    set(ref(db, `rooms/${currentRoomCode}/private/peeks`), {}),
    set(stateRef(), state)
  ]);
}

async function quitToHome() {
  resetRoomListeners();
  if (currentRoomCode && me) {
    try { await update(ref(db, `rooms/${currentRoomCode}/players/${me.uid}`), { connected: false }); } catch (_) { }
  }
  currentRoomCode = null;
  roomMeta = null; roomPlayers = {}; roomState = null; myPeek = null; myProfile = null;
  localStorage.removeItem("bb_room");
  localStorage.removeItem("bb_name");
  history.replaceState({}, "", location.pathname);
  showHome();
}

function canPeekNow(uid) {
  if (!roomState?.unit || roomState.peekedBy?.[uid] !== undefined) return false;
  if (uid === roomState.auctioneerUid && roomState.phase === "preview") return true;
  if (roomState.unit.peek === "before" && roomState.phase === "preview") return true;
  if (roomState.unit.peek === "after" && roomState.phase === "bidding" && roomState.players?.[uid]?.buyIn) return true;
  return false;
}

function renderPlayerRows(source, isGame = false) {
  const state = roomState;
  const entries = Object.entries(source || {});
  const order = state?.turnOrder?.length ? state.turnOrder : entries.map(([uid]) => uid);
  const sorted = order.map(uid => [uid, source?.[uid]]).filter(([, player]) => !!player);
  return sorted.map(([uid, profile]) => {
    const gamePlayer = isGame ? state?.players?.[uid] : null;
    const isMe = uid === me?.uid;
    const isAuctioneer = isGame && uid === state?.auctioneerUid && state.phase !== "gameover";
    const isTurn = isGame && uid === state?.turnUid;
    const eliminated = isGame && gamePlayer?.eliminated;
    const cash = isGame ? gamePlayer?.cash : null;
    return `<div class="player-row ${isMe ? "me" : ""}">
      <div class="player-avatar">${escapeHtml((profile.name || "?").slice(0, 1).toUpperCase())}</div>
      <div class="player-details"><div class="player-name">${escapeHtml(profile.name || "Player")} ${isMe ? "<span class='badge'>YOU</span>" : ""} ${isAuctioneer ? "<span class='badge auctioneer'>AUCTIONEER</span>" : ""} ${isTurn ? "<span class='badge'>UP NOW</span>" : ""}</div>
        <div class="player-tag">${eliminated ? "ELIMINATED" : isGame ? "ACTIVE PLAYER" : (profile.connected === false ? "OFFLINE" : "READY")}</div></div>
      <div class="player-cash">${isGame ? money(cash) : (profile.connected === false ? "OFFLINE" : "READY")}<small>${isGame ? "CASH IN HAND" : (uid === roomMeta?.hostUid ? "ROOM HOST" : "IN THE ROOM")}</small></div>
    </div>`;
  }).join("");
}

function renderLobby() {
  const count = Object.keys(roomPlayers || {}).length;
  const canStart = isHost() && count >= 3 && count <= MAX_PLAYERS;
  roomScreen.innerHTML = `
    <div class="room-topline"><div><div class="room-kicker">THE CREW IS GATHERING</div><h2 class="room-heading">Waiting room</h2></div>
      <div class="room-code-card"><div><span>ROOM CODE</span><strong>${escapeHtml(currentRoomCode || "-----")}</strong></div><button data-action="copy-code">Copy code ↗</button></div>
    </div>
    <div class="room-grid">
      <section class="panel"><div class="panel-title"><h3>Players in the room</h3><small>${count} / ${MAX_PLAYERS} players</small></div>
        <div class="player-list">${renderPlayerRows(roomPlayers)}${count < MAX_PLAYERS ? `<div class="empty-state">${MAX_PLAYERS - count} open seat${MAX_PLAYERS - count === 1 ? "" : "s"}. Share the room code to invite more players.</div>` : ""}</div>
      </section>
      <aside class="lobby-side">
        <div class="invite-box"><strong>Bring your crew.</strong><p>Send friends the room code or invite link. The game starts when at least 3 players have joined.</p><button class="btn btn-outline" data-action="copy-link">Copy invite link</button></div>
        <div class="panel"><div class="panel-title"><h3>Ready check</h3><small>Quick setup</small></div>
          <div class="turn-callout">${isHost() ? "<strong>You're the host.</strong> Start the game once 3–7 players have joined." : `<strong>${escapeHtml(roomMeta?.hostName || "The host")}</strong> will start the game when everyone is ready.`}</div>
          <div style="margin-top:12px"><button class="btn btn-primary btn-block" data-action="start-game" ${canStart ? "" : "disabled"}>Start the game ↗</button></div>
          <p class="form-note">Each player starts with $5,000 in virtual cash. The room is private to people with this code.</p>
        </div>
        <button class="btn btn-quiet btn-block" data-action="leave-room">Leave room</button>
      </aside>
    </div>`;
}

function renderUnit(state) {
  const unit = state.unit;
  if (!unit) return `<div class="empty-state">The auctioneer is preparing the next storage unit.</div>`;
  const visible = state.revealedItems || [];
  const myRevealed = visible.find(item => item.index === unit.faceUpIndex);
  const auctioneerName = displayName(state.auctioneerUid);
  const cards = Array.from({ length: unit.items }, (_, index) => {
    const faceUp = index === unit.faceUpIndex && myRevealed;
    const peekCard = myPeek && Number(myPeek.index) === index;
    const visibleItem = faceUp ? myRevealed : (peekCard ? myPeek.item : null);
    if (visibleItem) {
      const event = visibleItem.type === "EVENT";
      const label = faceUp ? "FACE-UP" : "YOUR PEEK";
      return `<div class="loot-card revealed ${event ? "event" : ""}"><span class="loot-type">${label} · ${event ? "EVENT" : "ITEM"}</span><div class="loot-icon">${escapeHtml(visibleItem.icon || "📦")}</div><div class="loot-name">${escapeHtml(visibleItem.name)}</div><span class="loot-value">${event ? "EVENT" : money(visibleItem.value)}</span></div>`;
    }
    const canPeek = canPeekNow(me.uid);
    return `<div class="loot-card back"><span class="loot-type">HIDDEN ITEM ${index + 1}</span><span class="loot-name">SEALED CONTENTS</span>${canPeek ? `<button class="peek-btn" data-action="peek" data-index="${index}">Peek</button>` : ""}</div>`;
  }).join("");
  return `<div class="unit-card"><div class="unit-illustration"><span class="unit-emoji">${escapeHtml(unit.emoji || "📦")}</span></div><div class="unit-copy"><div class="unit-label">STORAGE UNIT · ${escapeHtml(unit.size)}</div><h4>${escapeHtml(unit.name)}</h4><div class="unit-facts"><span>${unit.items} items</span><span>Flip: ${unit.flip ? "Yes" : "No"}</span><span>Peek: ${unit.peek === "before" ? "Before buy-in" : "After buy-in"}</span></div><p>${escapeHtml(auctioneerName)} is running this auction. ${unit.flip ? "One item is face-up." : "All items are hidden."}</p></div></div>
    <div class="loot-grid">${cards}</div>
    ${myPeek ? `<div class="my-peek"><div class="peek-icon">${escapeHtml(myPeek.item?.icon || "🔎")}</div><div><strong>Your private peek: ${escapeHtml(myPeek.item?.name || "Mystery item")}</strong><span>${myPeek.item?.type === "EVENT" ? "Event card — its effect is revealed when the unit is won." : `${money(myPeek.item?.value || 0)} item value. Keep it quiet!`}</span></div></div>` : ""}`;
}

function renderHostControls(state) {
  if (!isHost()) return "";
  if (state.phase === "open") return `<div class="host-controls"><button class="btn btn-primary" data-action="open-unit">Open storage unit ↗</button></div>`;
  if (state.phase === "preview") return `<div class="host-controls"><button class="btn btn-primary" data-action="start-buyin">Start buy-in ↗</button></div>`;
  if (state.phase === "result") return `<div class="host-controls"><button class="btn btn-primary" data-action="next-auction">Next auction ↗</button></div>`;
  if (state.phase === "gameover") return `<div class="host-controls"><button class="btn btn-outline" data-action="new-room">Back to lobby</button></div>`;
  return `<p class="form-note">Host controls: the room host advances the game between phases. Player decisions happen in real time.</p>`;
}

function renderActionControls(state) {
  const uid = me.uid;
  const player = state.players?.[uid];
  if (!player || player.eliminated) return `<div class="auction-controls"><h4>You're out</h4><p>You are eliminated from bidding. You can still watch the rest of the game.</p></div>`;
  if (state.phase === "buyin" && state.buyInOrder?.[state.buyInIndex] === uid) {
    const canAfford = player.cash >= BUY_IN;
    return `<div class="auction-controls"><h4>You're up: buy in?</h4><p>Pay ${money(BUY_IN)} to join this auction. The auctioneer collects the buy-in. You can only bid if you join.</p><div class="action-row"><button class="btn btn-primary" data-action="buyin" ${canAfford ? "" : "disabled"}>Buy in ${money(BUY_IN)}</button><button class="btn btn-pass" data-action="sitout">Sit out</button></div></div>`;
  }
  if (state.phase === "buyin") {
    const nextUid = state.buyInOrder?.[state.buyInIndex];
    return `<div class="auction-controls"><h4>Buy-in in progress</h4><p>Waiting for <b>${escapeHtml(displayName(nextUid))}</b> to choose. Players decide in order, starting left of the auctioneer.</p></div>`;
  }
  if (state.phase === "bidding") {
    if (state.turnUid !== uid) {
      const isHigh = state.highBidderUid === uid;
      return `<div class="auction-controls"><div class="bid-summary"><div class="metric"><span>Current bid</span><strong>${money(state.currentBid)}</strong></div><div class="metric"><span>High bidder</span><strong>${escapeHtml(displayName(state.highBidderUid))}</strong></div></div><h4>${isHigh ? "You're in the lead" : "Hold your nerve"}</h4><p>Waiting for <b>${escapeHtml(displayName(state.turnUid))}</b>. ${isHigh ? "You are currently the highest bidder." : "Watch the bid and plan your next move."}</p></div>`;
    }
    const minimum = Number(state.currentBid || 0) + MIN_BID;
    const isHigh = state.highBidderUid === uid;
    return `<div class="auction-controls"><div class="bid-summary"><div class="metric"><span>Current bid</span><strong>${money(state.currentBid)}</strong></div><div class="metric"><span>Minimum raise</span><strong>${money(minimum)}</strong></div></div><h4>Your move</h4><p>${isHigh ? "You're the high bidder. Pass to close the auction and win at the current bid, or raise the bid if another player is still active." : "Raise the bid by at least $100, or pass and leave this auction."}</p>
      <div class="bid-box"><div><label for="bid-amount">Your bid amount</label><input id="bid-amount" type="number" min="${minimum}" step="100" value="${minimum}" /></div><button class="btn btn-primary" data-action="place-bid">Bid ↗</button></div>
      <div class="bid-shortcuts"><button data-action="quick-bid" data-amount="${minimum}">+ minimum</button><button data-action="quick-bid" data-amount="${minimum + 400}">+ $500</button><button data-action="quick-bid" data-amount="${minimum + 900}">+ $1,000</button></div>
      <div class="action-row" style="margin-top:10px"><button class="btn btn-pass" data-action="pass">${isHigh ? "Pass & win at current bid" : "Pass this auction"}</button></div></div>`;
  }
  if (state.phase === "preview") {
    const canPeek = canPeekNow(uid);
    const note = state.unit?.peek === "before" ? "Players can peek at one hidden item now." : "This unit allows peeking only after the buy-in.";
    return `<div class="auction-controls"><h4>Study the unit</h4><p>${canPeek ? "Choose one hidden card to peek at privately." : note}</p><div class="turn-callout">Auctioneer: <strong>${escapeHtml(displayName(state.auctioneerUid))}</strong></div></div>`;
  }
  if (state.phase === "result") {
    const result = state.lastResult;
    return `<div class="auction-controls"><h4>Auction complete</h4><p>${result?.winnerUid ? `<b>${escapeHtml(displayName(result.winnerUid))}</b> won the unit for ${money(result.winningBid)}.` : escapeHtml(result?.note || "This unit did not sell.")}</p></div>`;
  }
  if (state.phase === "open") return `<div class="auction-controls"><h4>Next unit up</h4><p>Waiting for the host to open the storage unit.</p></div>`;
  return `<div class="auction-controls"><h4>Game complete</h4><p>Check the final scoreboard to see who took home the title.</p></div>`;
}

function renderHistory(state) {
  const log = Array.isArray(state.log) ? state.log : [];
  return log.length ? log.slice(0, 14).map(item => `<div class="log-entry"><i></i><span>${escapeHtml(item.text || "")}</span></div>`).join("") : `<div class="empty-state">The auction log will appear here.</div>`;
}

function renderResult(state) {
  const result = state.lastResult || {};
  const won = !!result.winnerUid;
  const isMe = won && result.winnerUid === me.uid;
  const headline = won ? (isMe ? "You won the unit!" : `${escapeHtml(displayName(result.winnerUid))} won the unit.`) : "Unit closed";
  const description = won
    ? `Winning bid: ${money(result.winningBid)} · ${isMe ? "Your haul was added to your private stash." : "The winner's hidden haul stays private."}`
    : escapeHtml(result.note || "The auction ended without a sale.");
  return `<div class="result-banner"><h4>${headline}</h4><p>${description}</p></div>
    ${isMe ? `<div class="turn-callout"><strong>Your private stash has been updated.</strong> Check the My stash panel to see the items you collected.</div>` : `<div class="empty-state">The hidden item cards stay with the winner. Only your own stash is visible to you; final item values appear on the scoreboard when the game ends.</div>`}`;
}

function renderMyStash() {
  const items = Array.isArray(myAssets?.items) ? myAssets.items : [];
  const itemCards = items.slice().reverse().slice(0, 8).map(item => `<div class="log-entry"><i></i><span><b>${escapeHtml(item.name)}</b> · ${item.type === "EVENT" ? "Event card" : money(item.value)}</span></div>`).join("");
  return `<div class="panel"><div class="panel-title"><h3>My stash</h3><small>Private to you</small></div>
    <div class="bid-summary"><div class="metric"><span>Items collected</span><strong>${items.length}</strong></div><div class="metric"><span>Item value</span><strong>${money(myAssets?.itemValue || 0)}</strong></div></div>
    ${items.length ? `<div class="log-list">${itemCards}</div>` : `<div class="empty-state">Win a storage unit to start building your private stash.</div>`}
  </div>`;
}

function renderFinalScores(state) {
  const scores = state.finalScores || [];
  const hasWinner = !!state.winnerUid;
  return `<div class="winner-card"><div class="trophy">${hasWinner ? "🏆" : "📦"}</div><span>${hasWinner ? "THE BIDDER BATTLE CHAMPION" : "AUCTION CLOSED"}</span><h3>${hasWinner ? escapeHtml(displayName(state.winnerUid)) : "No champion"}</h3><strong>${hasWinner ? money(scores[0]?.score || 0) : "No active players"}</strong></div>
    <div class="panel"><div class="panel-title"><h3>Final scoreboard</h3><small>Cash + item value</small></div><table class="scoreboard-table"><thead><tr><th>Player</th><th>Cash</th><th>Items</th><th>Total</th></tr></thead><tbody>${scores.map(entry => `<tr><td>${escapeHtml(displayName(entry.uid))}${entry.uid === state.winnerUid ? " 🏆" : ""}</td><td>${money(entry.cash)}</td><td>${money(entry.itemValue)}</td><td>${money(entry.score)}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderGame() {
  const state = roomState;
  if (!state || !state.players) return renderLobby();
  if (state.phase === "lobby") return renderLobby();
  const auctioneerName = displayName(state.auctioneerUid);
  const isDone = state.phase === "gameover";
  const phaseLabel = ({ open: "Ready", preview: "Unit open", buyin: "Buy-in", bidding: "Live bidding", result: "Results", gameover: "Final scores" })[state.phase] || state.phase;
  const turnCopy = state.phase === "buyin" ? `Buy-in ${Math.min(state.buyInIndex + 1, state.buyInOrder.length)} of ${state.buyInOrder.length}` : state.phase === "bidding" ? `Current turn: ${displayName(state.turnUid)}` : state.phaseNote;
  return `<div class="room-topline"><div><div class="room-kicker">${isDone ? "GAME FINISHED" : `AUCTION ${state.auctionNo || 0} · ${phaseLabel}`}</div><h2 class="room-heading">${isDone ? "Battle results" : "The auction floor"}</h2></div>
    <div class="room-code-card"><div><span>ROOM CODE</span><strong>${escapeHtml(currentRoomCode || "-----")}</strong></div><button data-action="copy-code">Copy code ↗</button></div>
    </div>
    ${isDone ? `<div class="room-grid"><div class="game-main">${renderFinalScores(state)}<div class="panel"><div class="panel-title"><h3>Final auction log</h3><small>Latest events</small></div><div class="log-list">${renderHistory(state)}</div></div></div><aside class="game-side">${renderHostControls(state)}<button class="btn btn-quiet btn-block" data-action="leave-room">Leave room</button></aside></div>` : `
    <div class="game-layout">
      <section class="game-main">
        <div class="game-banner"><div><h3>${escapeHtml(auctioneerName)}'s auction</h3><p>${escapeHtml(turnCopy || "The auction is ready.")}</p></div><div class="round-badge">ROUND<strong>${state.round || 1} / 2</strong></div></div>
        <div class="auction-stage"><div class="auction-stage-head"><h3>${state.phase === "result" ? "The reveal" : state.unit ? escapeHtml(state.unit.name) : "Storage unit"}</h3><span class="stage-status">${escapeHtml(phaseLabel)}</span></div><div class="auction-stage-body">${state.phase === "result" ? renderResult(state) : renderUnit(state)}</div></div>
        ${renderActionControls(state)}
      </section>
      <aside class="game-side">
        <div class="panel"><div class="panel-title"><h3>Player standings</h3><small>${Object.keys(state.players).length} players</small></div><div class="player-list game-player-list">${renderPlayerRows(state.players, true)}</div></div>
        <div class="panel"><div class="panel-title"><h3>Auctioneer desk</h3><small>Host controls</small></div><div class="turn-callout">Auctioneer: <strong>${escapeHtml(auctioneerName)}</strong><br />${escapeHtml(state.phaseNote || "Keep the bids moving.")}</div><div style="margin-top:12px">${renderHostControls(state)}</div></div>
        ${renderMyStash()}
        <div class="panel"><div class="panel-title"><h3>Live activity</h3><small>Latest 14</small></div><div class="log-list">${renderHistory(state)}</div></div>
        <button class="btn btn-quiet btn-block" data-action="leave-room">Leave room</button>
      </aside>
    </div>`}`;
}

function renderRoom() {
  if (!currentRoomCode || !roomMeta) return;
  if (roomMeta.status === "lobby" || !roomState || roomState.phase === "lobby") renderLobby();
  else roomScreen.innerHTML = renderGame();
}

function setEntrySubmitting(isSubmitting) {
  const submit = $("#entry-submit");
  submit.disabled = isSubmitting;
  submit.textContent = isSubmitting ? "Please wait…" : (mode === "join" ? "Join the battle ↗" : "Create room ↗");
}

async function handleEntrySubmit(event) {
  event.preventDefault();
  const name = cleanName($("#player-name").value);
  if (name.length < 2) return showToast("Choose a name with at least 2 characters.");
  setEntrySubmitting(true);
  try {
    if (!auth || !db) throw new Error("Firebase is not configured yet. Follow the Firebase setup steps in README.md first.");
    await ensureSignedIn();
    if (mode === "create") await createRoom(name);
    else await joinRoom($("#room-code").value, name);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Something went wrong. Check your Firebase setup.");
  } finally {
    setEntrySubmitting(false);
  }
}

async function maybeResumeRoom() {
  const code = localStorage.getItem("bb_room");
  const name = localStorage.getItem("bb_name");
  if (!code || !name || !me) return;
  try {
    const playerSnap = await get(ref(db, `rooms/${code}/players/${me.uid}`));
    const metaSnap = await get(ref(db, `rooms/${code}/meta`));
    if (playerSnap.exists() && metaSnap.exists()) {
      await enterRoom(code, name, metaSnap.val().hostUid === me.uid);
    } else {
      localStorage.removeItem("bb_room");
      localStorage.removeItem("bb_name");
    }
  } catch (error) {
    console.warn("Could not resume previous room", error);
  }
}

function firebaseReady() {
  const values = [firebaseConfig.apiKey, firebaseConfig.projectId, firebaseConfig.databaseURL, firebaseConfig.appId];
  return values.every(value => value && !String(value).includes("PASTE_") && !String(value).includes("YOUR_PROJECT") && !String(value).includes("YOUR_DATABASE"));
}

function initFirebase() {
  if (!firebaseReady()) {
    setConnection("offline", "Firebase setup needed");
    showToast("First add your Firebase settings. See README.md in the project folder.");
    return;
  }
  try {
    const firebaseApp = initializeApp(firebaseConfig);
    auth = getAuth(firebaseApp);
    db = getDatabase(firebaseApp);
    const connectedRef = ref(db, ".info/connected");
    onValue(connectedRef, snap => {
      if (snap.val() === true) setConnection("online", "Live connection");
      else setConnection("offline", "Reconnecting…");
    });
    onAuthStateChanged(auth, async user => {
      if (!user) {
        try { await signInAnonymously(auth); } catch (error) { console.error(error); showToast("Anonymous sign-in is not enabled in Firebase yet."); }
        return;
      }
      me = user;
      await maybeResumeRoom();
    });
  } catch (error) {
    console.error(error);
    setConnection("offline", "Firebase error");
    showToast("Firebase could not start. Check firebase-config.js.");
  }
}

document.addEventListener("click", async event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  try {
    if (action === "how") return openHow();
    if (action === "close-how") return closeHow();
    if (action === "toggle-theme") return toggleTheme();
    if (action === "show-create") return showEntry("create");
    if (action === "show-join") return showEntry("join");
    if (action === "back-home") return showHome();
    if (action === "copy-code") {
      await navigator.clipboard.writeText(currentRoomCode);
      return showToast("Room code copied.");
    }
    if (action === "copy-link") {
      const url = `${location.origin}${location.pathname}?room=${currentRoomCode}`;
      await navigator.clipboard.writeText(url);
      return showToast("Invite link copied.");
    }
    if (action === "start-game") return startGame();
    if (action === "open-unit") return openNextUnit();
    if (action === "start-buyin") return startBuyIn();
    if (action === "next-auction") return nextAuction();
    if (action === "buyin") return submitAction("buyin");
    if (action === "sitout") return submitAction("sitout");
    if (action === "pass") return submitAction("pass");
    if (action === "peek") return submitAction("peek", { index: Number(button.dataset.index) });
    if (action === "place-bid") {
      const amount = Number($("#bid-amount")?.value);
      return submitAction("bid", { amount });
    }
    if (action === "quick-bid") {
      return submitAction("bid", { amount: Number(button.dataset.amount) });
    }
    if (action === "leave-room") return quitToHome();
    if (action === "new-room") return quitToHome();
  } catch (error) {
    console.error(error);
    showToast(error.message || "That action could not be completed.");
  }
});

$("#entry-form").addEventListener("submit", handleEntrySubmit);
$("#room-code").addEventListener("input", event => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5); });
$("#how-modal").addEventListener("click", event => { if (event.target.id === "how-modal") closeHow(); });
document.addEventListener("keydown", event => { if (event.key === "Escape") closeHow(); });

initFirebase();
