import { createGame, play, undo, serialize, other, BLACK, WHITE } from './core.js';
import { BoardRenderer } from './renderer.js?v=feature-suite-1';
import { AudioManager } from './audio.js?v=home-bgm-1';
import { OnlineSession, createRoomCode } from './online.js?v=feature-suite-1';
import { CHALLENGES, restoreChallenge } from './challenges.js?v=finish-mode-1';
import { toDataURL } from '../vendor/qrcode.js';

const $ = selector => document.querySelector(selector);
const menu = $('#menuDialog'), result = $('#resultDialog'), thinking = $('#thinking');
const ONLINE_STATE_KEY = 'cube-four-online-v1', STATS_KEY = 'cube-four-stats-v1', CHALLENGE_KEY = 'cube-four-challenges-v1';
const audio = new AudioManager();
let game = createGame(), mode = 'cpu', difficulty = 'normal', human = BLACK, busy = false, requestId = 0, onlineGameStarted = false;
let clockLimit = 0, timeLeft = 0, clockTimer = null, lastClockTick = 0;
let replaying = false, replayHistory = [], replayIndex = 0, replayBase = 0, resultRecorded = false, resultTimer = null, installPrompt = null, activeChallenge = null;

const worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
const renderer = new BoardRenderer($('#board'), humanMove);
const online = new OnlineSession({ onMessage: receiveOnline, onStatus: onlineStatus });

function selected(name) { return document.querySelector(`input[name="${name}"]:checked`).value; }
function playerName(player) { return player === BLACK ? 'ゴールド' : 'シルバー'; }

function update(animateCell = -1) {
  renderer.setState(game, animateCell);
  $('#turnPiece').className = `mini-piece ${game.turn === BLACK ? 'dark' : 'light'}`;
  $('#statusText').textContent = game.winner ? 'しょうぶ あり！' : game.draw ? 'ひきわけ！' : `${playerName(game.turn)} の ばん`;
  const undoFloor = mode === 'challenge' && activeChallenge ? activeChallenge.history.length : 0;
  $('#undoBtn').disabled = busy || replaying || game.history.length <= undoFloor || mode === 'online';
  updateClockDisplay();
  if ((game.winner || game.draw) && !replaying) {
    pauseClock(); clearTimeout(resultTimer); resultTimer = setTimeout(showResult, 850);
  }
}

function configureClock(seconds, remaining = seconds) {
  clockLimit = Number(seconds) || 0; timeLeft = Math.max(0, Number(remaining) || clockLimit); updateClockDisplay();
}

function startTurnClock(reset = true) {
  pauseClock();
  if (!clockLimit || game.winner || game.draw || replaying) return updateClockDisplay();
  if (reset) timeLeft = clockLimit;
  lastClockTick = performance.now();
  clockTimer = setInterval(() => {
    const now = performance.now(); timeLeft -= (now - lastClockTick) / 1000; lastClockTick = now; updateClockDisplay();
    if (timeLeft <= 0) handleTimeout();
  }, 200);
  updateClockDisplay();
}

function pauseClock() { if (clockTimer) clearInterval(clockTimer); clockTimer = null; }
function updateClockDisplay() {
  const clock = $('#clockDisplay'); clock.hidden = !clockLimit || replaying; if (clock.hidden) return;
  clock.textContent = `0:${String(Math.max(0, Math.ceil(timeLeft))).padStart(2, '0')}`; clock.classList.toggle('danger', timeLeft <= 10);
}

async function handleTimeout() {
  if (!clockLimit || game.winner || game.draw) return;
  pauseClock(); game.winner = other(game.turn); game.winningLine = null; game.timeout = true;
  if (mode === 'online') await online.send('timeout', { loser: game.turn, ply: game.history.length });
  update();
}

async function humanMove(rod) {
  if (busy || replaying || game.winner || game.draw) return;
  if ((mode === 'cpu' || mode === 'challenge' || mode === 'online') && game.turn !== human) return;
  const cell = play(game, rod); if (cell == null) return;
  audio.drop();
  if (mode === 'online') { persistOnlineGame(); await online.send('move', { rod, ply: game.history.length }); }
  update(cell); startTurnClock();
  if ((mode === 'cpu' || mode === 'challenge') && !game.winner && !game.draw) cpuMove();
}

function cpuMove() { busy = true; thinking.hidden = false; update(); worker.postMessage({ game: serialize(game), difficulty, id: ++requestId }); }
worker.onmessage = event => {
  if (event.data.id !== requestId) return;
  busy = false; thinking.hidden = true; const cell = play(game, event.data.rod); if (cell != null) audio.drop(); update(cell ?? -1); startTurnClock();
};

async function start() {
  mode = selected('mode'); if (mode === 'online') return;
  await online.leave(); sessionStorage.removeItem(ONLINE_STATE_KEY);
  if (mode === 'challenge') {
    activeChallenge = CHALLENGES.find(item => item.id === $('#challengeSelect').value) || CHALLENGES[0];
    difficulty = activeChallenge.difficulty; human = activeChallenge.human; configureClock(0); game = restoreChallenge(activeChallenge); recordChallengeAttempt(activeChallenge.id);
  } else {
    activeChallenge = null; difficulty = selected('difficulty'); human = Number(selected('side')); configureClock(selected('clock')); game = createGame();
  }
  resultRecorded = false; replaying = false; busy = false; thinking.hidden = true; renderer.reset(); update(); menu.close(); audio.startBgm(); audio.click(); startTurnClock();
  if (mode === 'cpu' && human !== BLACK) setTimeout(cpuMove, 350);
}

function restoreGame(history = []) { const restored = createGame(); for (const move of history) if (play(restored, move.rod) == null) break; return restored; }

async function createOnlineRoom() {
  mode = 'online'; human = BLACK; onlineGameStarted = false; configureClock(selected('clock')); game = createGame(); resultRecorded = false; audio.startBgm(); setRoomStatus('接続しています…');
  try {
    await online.connect(createRoomCode(), 'host'); persistOnlineGame();
    setRoomStatus(`この対戦コードを相手に共有してください<span class="room-code">${online.code}</span>参加を待っています…`); await renderInvite(online.code);
  } catch (error) { setRoomStatus(`${error.message} 再接続を試みています…`, true); }
}

async function joinOnlineRoom(startAudio = true) {
  const code = $('#roomCodeInput').value.trim().toUpperCase();
  if (!/^[2-9A-HJ-NP-Z]{6}$/.test(code)) { setRoomStatus('6文字の対戦コードを入力してください', true); return; }
  mode = 'online'; human = WHITE; onlineGameStarted = false; if (startAudio) audio.startBgm(); setRoomStatus('部屋を検索しています…');
  try { await online.connect(code, 'guest'); persistOnlineGame(); setRoomStatus('相手を検索しています…'); }
  catch (error) { setRoomStatus(`${error.message} 再接続を試みています…`, true); }
}

async function renderInvite(code) {
  const url = new URL(location.href); url.search = ''; url.hash = ''; url.searchParams.set('room', code);
  $('#roomQr').src = await toDataURL(url.href, { width: 240, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#17212c', light: '#ffffff' } });
  $('#shareRoomBtn').dataset.url = url.href; $('#inviteCard').hidden = false;
}

async function shareRoom() {
  const button = $('#shareRoomBtn'), url = button.dataset.url; if (!url) return;
  const data = { title: 'CUBE FOUR', text: `対戦コード ${online.code}`, url };
  try {
    if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(`${data.text}\n${url}`); button.textContent = '✓ コピーしました'; button.classList.add('copied'); setTimeout(() => { button.textContent = '相手に送る'; button.classList.remove('copied'); }, 1800); }
  } catch (error) { if (error.name !== 'AbortError') setRoomStatus('共有できませんでした', true); }
}

function setRoomStatus(html, error = false) { const element = $('#roomStatus'); element.className = `room-status${error ? ' online-error' : ''}`; element.innerHTML = html; }

function persistOnlineGame() {
  if (mode !== 'online' || !online.code || !online.role) return;
  sessionStorage.setItem(ONLINE_STATE_KEY, JSON.stringify({ code: online.code, role: online.role, history: game.history.map(move => ({ rod: move.rod })), clockLimit, timeLeft }));
}

function savedOnlineGame() { try { return JSON.parse(sessionStorage.getItem(ONLINE_STATE_KEY)); } catch { return null; } }

function onlineStatus(status) {
  if (mode !== 'online') return;
  if (status.state === 'disconnected' || status.state === 'reconnecting') { busy = true; thinking.hidden = true; $('#statusText').textContent = '再接続しています…'; }
  if (status.state === 'reconnected' || status.state === 'connected') { busy = false; if (!menu.open) update(); if (status.state === 'reconnected') online.send('hello'); }
  if (status.state === 'presence' && status.role === 'host') {
    const guestCount = status.players.filter(player => player.role === 'guest').length;
    if (guestCount > 0 && menu.open) setRoomStatus(`対戦コード<span class="room-code">${status.code}</span>相手が参加しました`);
  }
}

async function receiveOnline(message) {
  if (mode !== 'online') return;
  if (message.kind === 'hello' && online.role === 'host') {
    if (!onlineGameStarted) { onlineGameStarted = true; game = game.history.length ? game : createGame(); busy = false; renderer.reset(); resultRecorded = false; update(); if (menu.open) menu.close(); startTurnClock(false); }
    await online.send(game.history.length ? 'sync' : 'start', { history: game.history.map(move => ({ rod: move.rod })), clockLimit, timeLeft }); persistOnlineGame();
  } else if ((message.kind === 'start' || message.kind === 'sync') && online.role === 'guest') {
    onlineGameStarted = true; game = restoreGame(message.data.history); configureClock(message.data.clockLimit, message.data.timeLeft); busy = false; resultRecorded = false; renderer.reset(); update(); if (menu.open) menu.close(); startTurnClock(false); persistOnlineGame();
  } else if (message.kind === 'move' && message.role !== online.role) {
    const { rod, ply } = message.data;
    if (Number.isInteger(rod) && ply === game.history.length + 1 && game.turn !== human) { const cell = play(game, rod); if (cell != null) { audio.drop(); update(cell); startTurnClock(); persistOnlineGame(); } }
    else if (online.role === 'guest') await online.send('hello');
  } else if (message.kind === 'restart') {
    configureClock(message.data.clockLimit ?? clockLimit); restart(false);
  } else if (message.kind === 'timeout' && message.role !== online.role && message.data.ply === game.history.length) {
    pauseClock(); game.winner = other(message.data.loser); game.timeout = true; update(); persistOnlineGame();
  }
}

async function restart(broadcast = true) {
  game = mode === 'challenge' && activeChallenge ? restoreChallenge(activeChallenge) : createGame();
  if (mode === 'challenge' && activeChallenge) recordChallengeAttempt(activeChallenge.id);
  resultRecorded = false; replaying = false; $('#replayBar').hidden = true; busy = false; thinking.hidden = true; requestId++;
  if (mode === 'online') onlineGameStarted = true; renderer.reset(); update(); startTurnClock();
  if (result.open) result.close();
  if (mode === 'online') { persistOnlineGame(); if (broadcast) await online.send('restart', { clockLimit }); }
  if (mode === 'cpu' && human !== BLACK) setTimeout(cpuMove, 250);
}

function getStats() { try { return { played: 0, wins: 0, losses: 0, draws: 0, streak: 0, best: 0, ...JSON.parse(localStorage.getItem(STATS_KEY)) }; } catch { return { played: 0, wins: 0, losses: 0, draws: 0, streak: 0, best: 0 }; } }
function renderStats() { const stats = getStats(); $('#statPlayed').textContent = stats.played; $('#statWins').textContent = stats.wins; $('#statBest').textContent = stats.best; }
function getChallengeProgress() { try { return JSON.parse(localStorage.getItem(CHALLENGE_KEY)) || {}; } catch { return {}; } }
function saveChallengeProgress(progress) { localStorage.setItem(CHALLENGE_KEY, JSON.stringify(progress)); }
function recordChallengeAttempt(id) { const progress = getChallengeProgress(); progress[id] = { attempts: 0, cleared: false, best: null, ...progress[id] }; progress[id].attempts++; saveChallengeProgress(progress); renderChallengeBrief(); }
function recordChallengeResult() {
  if (mode !== 'challenge' || !activeChallenge || game.winner !== human) return;
  const progress = getChallengeProgress(), moves = game.history.length - activeChallenge.history.length;
  progress[activeChallenge.id] = { attempts: 1, cleared: false, best: null, ...progress[activeChallenge.id] };
  progress[activeChallenge.id].cleared = true; progress[activeChallenge.id].best = progress[activeChallenge.id].best == null ? moves : Math.min(progress[activeChallenge.id].best, moves); saveChallengeProgress(progress); renderChallengeBrief();
}
function renderChallengeBrief() {
  const challenge = CHALLENGES.find(item => item.id === $('#challengeSelect').value) || CHALLENGES[0], record = getChallengeProgress()[challenge.id];
  const status = record?.cleared ? `<span class="cleared">✓ CLEAR　自己最短 ${record.best}手</span>` : `未クリア${record?.attempts ? `　挑戦 ${record.attempts}回` : ''}`;
  $('#challengeBrief').innerHTML = `<b>${challenge.type}</b>　担当：${playerName(challenge.human)}　CPU：${challenge.difficulty === 'hard' ? 'つよい' : 'ふつう'}<br>${challenge.brief}<br>${status}`;
}
function recordResult() {
  if (resultRecorded || replaying) return; resultRecorded = true;
  const stats = getStats(); stats.played++;
  if (game.draw) { stats.draws++; stats.streak = 0; }
  else if (game.winner === human || mode === 'local' && game.winner === BLACK) { stats.wins++; stats.streak++; stats.best = Math.max(stats.best, stats.streak); }
  else { stats.losses++; stats.streak = 0; }
  localStorage.setItem(STATS_KEY, JSON.stringify(stats)); renderStats();
}

function showResult() {
  if (result.open || replaying || !game.winner && !game.draw) return;
  replayHistory = game.history.map(move => ({ rod: move.rod })); replayBase = mode === 'challenge' && activeChallenge ? activeChallenge.history.length : 0; recordResult(); recordChallengeResult();
  const humanWon = game.winner === human;
  if (game.draw) { $('#resultEmoji').textContent = '＝'; $('#resultTitle').textContent = 'DRAW'; $('#resultText').textContent = '64手で引き分けました。'; }
  else {
    $('#resultEmoji').textContent = humanWon || mode === 'local' ? '◆' : '◇';
    $('#resultTitle').textContent = mode === 'local' ? `${playerName(game.winner)} の勝利` : humanWon ? 'YOU WIN' : 'YOU LOSE';
    $('#resultText').textContent = mode === 'challenge' ? (humanWon ? `「${activeChallenge.title}」を勝ちきりました。` : '局面を勝ちきれませんでした。もう一度挑戦できます。') : game.timeout ? `${playerName(other(game.winner))}の時間切れです。` : '4つのラインが完成しました。'; audio.win(); confetti();
  }
  result.showModal();
}

function startReplay() { if (!replayHistory.length) return; result.close(); replaying = true; pauseClock(); replayIndex = replayBase; renderer.reset(); $('#replayBar').hidden = false; renderReplay(); }
function renderReplay() {
  game = restoreGame(replayHistory.slice(0, replayIndex)); renderer.setState(game, replayIndex ? game.history.at(-1).cell : -1);
  $('#statusText').textContent = '棋譜を再生中'; $('#replayCount').textContent = `${replayIndex - replayBase} / ${replayHistory.length - replayBase}`;
  $('#replayPrevBtn').disabled = replayIndex === replayBase; $('#replayNextBtn').disabled = replayIndex === replayHistory.length; updateClockDisplay();
}
function stepReplay(amount) { replayIndex = Math.max(replayBase, Math.min(replayHistory.length, replayIndex + amount)); renderReplay(); }
function exitReplay() { replaying = false; $('#replayBar').hidden = true; game = restoreGame(replayHistory); renderer.reset(); update(); }

function confetti() {
  const colors = ['#e6b951', '#fff0ad', '#d8e1e7', '#8797a3'];
  for (let i = 0; i < 44; i++) { const element = document.createElement('i'); element.className = 'confetti'; element.style.left = `${Math.random() * 100}vw`; element.style.background = colors[i % colors.length]; element.style.setProperty('--drift', `${Math.random() * 200 - 100}px`); element.style.animationDelay = `${Math.random() * 0.5}s`; document.body.append(element); setTimeout(() => element.remove(), 2500); }
}

function updateModeOptions() {
  const selectedMode = selected('mode'); $('#cpuOptions').hidden = selectedMode !== 'cpu'; $('#onlineOptions').hidden = selectedMode !== 'online'; $('#challengeOptions').hidden = selectedMode !== 'challenge'; $('.clock-options').hidden = selectedMode === 'challenge'; $('#startBtn').hidden = selectedMode === 'online';
  if (selectedMode !== 'online') $('#inviteCard').hidden = true;
  if (selectedMode === 'online' && !online.available) setRoomStatus('オンライン設定を読み込めませんでした', true);
  if (selectedMode === 'challenge') renderChallengeBrief();
}

async function resumeOnline(saved) {
  mode = 'online'; human = saved.role === 'host' ? BLACK : WHITE; onlineGameStarted = true; game = restoreGame(saved.history); configureClock(saved.clockLimit, saved.timeLeft); busy = true; renderer.reset(); update();
  try { await online.connect(saved.code, saved.role, true); busy = false; update(); startTurnClock(false); await online.send('hello'); }
  catch { $('#statusText').textContent = '再接続しています…'; }
}

document.querySelectorAll('input[name="mode"]').forEach(input => input.onchange = updateModeOptions);
$('#startBtn').onclick = event => { event.preventDefault(); start(); };
$('#createRoomBtn').onclick = createOnlineRoom; $('#joinRoomBtn').onclick = joinOnlineRoom; $('#shareRoomBtn').onclick = shareRoom;
$('#roomCodeInput').oninput = event => { event.target.value = event.target.value.toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, ''); };
$('#challengeSelect').onchange = renderChallengeBrief;
$('#homeBtn').onclick = () => { if (!menu.open) { pauseClock(); menu.showModal(); } };
$('#newBtn').onclick = () => restart(); $('#againBtn').onclick = event => { event.preventDefault(); restart(); };
$('#resultMenuBtn').onclick = () => setTimeout(() => menu.showModal());
$('#resetViewBtn').onclick = () => renderer.reset();
$('#transparentBtn').onclick = () => { renderer.transparent = !renderer.transparent; renderer.draw(); };
$('#undoBtn').onclick = () => { const floor = mode === 'challenge' && activeChallenge ? activeChallenge.history.length : 0; if (busy || replaying || mode === 'online' || game.history.length <= floor) return; requestId++; thinking.hidden = true; busy = false; undo(game, (mode === 'cpu' || mode === 'challenge') && game.history.length - floor >= 2 ? 2 : 1); audio.click(); update(); startTurnClock(); };
$('#soundBtn').onclick = () => { const soundMode = audio.cycleMode(), labels = { full: ['🔊', 'BGMと効果音'], effects: ['🎵', '効果音だけ'], muted: ['🔇', 'すべて消音'] }; $('#soundBtn').textContent = labels[soundMode][0]; $('#soundBtn').setAttribute('aria-label', labels[soundMode][1]); };
$('#tutorialBtn').onclick = () => $('#tutorialDialog').showModal();
$('#replayBtn').onclick = startReplay; $('#replayPrevBtn').onclick = () => stepReplay(-1); $('#replayNextBtn').onclick = () => stepReplay(1); $('#replayExitBtn').onclick = exitReplay;

window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('#installBtn').hidden = false; });
$('#installBtn').onclick = async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $('#installBtn').hidden = true; };
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js?v=finish-mode-1');

renderer.setState(game); renderStats();
const saved = savedOnlineGame(), invitedRoom = new URLSearchParams(location.search).get('room')?.toUpperCase();
if (saved?.code && saved?.role) resumeOnline(saved);
else if (/^[2-9A-HJ-NP-Z]{6}$/.test(invitedRoom || '')) { document.querySelector('input[name="mode"][value="online"]').checked = true; $('#roomCodeInput').value = invitedRoom; updateModeOptions(); menu.showModal(); setTimeout(() => joinOnlineRoom(false), 0); }
else { updateModeOptions(); menu.showModal(); audio.startBgm(); }
