import { createGame, play, undo, serialize, BLACK, WHITE } from './core.js';
import { BoardRenderer } from './renderer.js';
import { AudioManager } from './audio.js';
import { OnlineSession, createRoomCode } from './online.js';
import { toDataURL } from '../vendor/qrcode.js';

const $ = selector => document.querySelector(selector);
const menu = $('#menuDialog'), result = $('#resultDialog'), thinking = $('#thinking');
const audio = new AudioManager();
let game = createGame(), mode = 'cpu', difficulty = 'normal', human = BLACK, busy = false, requestId = 0, onlineGameStarted = false;

const worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
const renderer = new BoardRenderer($('#board'), humanMove);
const online = new OnlineSession({ onMessage: receiveOnline, onStatus: onlineStatus });

function selected(name) { return document.querySelector(`input[name="${name}"]:checked`).value; }

function update() {
  renderer.setState(game);
  $('#turnPiece').className = `mini-piece ${game.turn === BLACK ? 'dark' : 'light'}`;
  $('#statusText').textContent = game.winner ? 'しょうぶ あり！' : game.draw ? 'ひきわけ！' : `${game.turn === BLACK ? 'くろ' : 'しろ'} の ばん`;
  $('#undoBtn').disabled = busy || !game.history.length || mode === 'online';
  if (game.winner || game.draw) setTimeout(showResult, 650);
}

async function humanMove(rod) {
  if (busy || game.winner || game.draw) return;
  if ((mode === 'cpu' || mode === 'online') && game.turn !== human) return;
  if (play(game, rod) == null) return;
  audio.drop();
  if (mode === 'online') await online.send('move', { rod, ply: game.history.length });
  update();
  if (mode === 'cpu' && !game.winner && !game.draw) cpuMove();
}

function cpuMove() { busy = true; thinking.hidden = false; update(); worker.postMessage({ game: serialize(game), difficulty, id: ++requestId }); }
worker.onmessage = event => { if (event.data.id !== requestId) return; busy = false; thinking.hidden = true; if (play(game, event.data.rod) != null) audio.drop(); update(); };

async function start() {
  mode = selected('mode');
  if (mode === 'online') return;
  await online.leave();
  difficulty = selected('difficulty'); human = Number(selected('side'));
  game = createGame(); busy = false; thinking.hidden = true; renderer.reset(); update(); menu.close(); audio.startBgm(); audio.click();
  if (mode === 'cpu' && human !== BLACK) setTimeout(cpuMove, 350);
}

function restoreGame(history = []) { const restored = createGame(); for (const move of history) if (play(restored, move.rod) == null) break; return restored; }

async function createOnlineRoom() {
  mode = 'online'; human = BLACK; onlineGameStarted = false; audio.startBgm(); setRoomStatus('つないでいます…');
  try { await online.connect(createRoomCode(), 'host'); setRoomStatus(`この合言葉を 相手に見せてね<span class="room-code">${online.code}</span>相手を まっています…`); await renderInvite(online.code); }
  catch (error) { setRoomStatus(error.message, true); }
}

async function joinOnlineRoom(startAudio = true) {
  const code = $('#roomCodeInput').value.trim().toUpperCase();
  if (!/^[2-9A-HJ-NP-Z]{6}$/.test(code)) { setRoomStatus('6文字の合言葉を 入れてね', true); return; }
  mode = 'online'; human = WHITE; onlineGameStarted = false; if (startAudio) audio.startBgm(); setRoomStatus('部屋を さがしています…');
  try { await online.connect(code, 'guest'); setRoomStatus('相手を さがしています…'); }
  catch (error) { setRoomStatus(error.message, true); }
}

async function renderInvite(code) {
  const url = new URL(location.href); url.search = ''; url.hash = ''; url.searchParams.set('room', code);
  $('#roomQr').src = await toDataURL(url.href, { width: 240, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#173f58', light: '#ffffff' } });
  $('#shareRoomBtn').dataset.url = url.href; $('#inviteCard').hidden = false;
}

async function shareRoom() {
  const button = $('#shareRoomBtn'), url = button.dataset.url;
  if (!url) return;
  const data = { title: 'キューブならべ！', text: `合言葉 ${online.code} で対戦しよう！`, url };
  try {
    if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(`${data.text}\n${url}`); button.textContent = '✓ コピーしたよ'; button.classList.add('copied'); setTimeout(() => { button.textContent = '📤 相手に送る'; button.classList.remove('copied'); }, 1800); }
  } catch (error) { if (error.name !== 'AbortError') setRoomStatus('共有できませんでした', true); }
}

function setRoomStatus(html, error = false) { const element = $('#roomStatus'); element.className = `room-status${error ? ' online-error' : ''}`; element.innerHTML = html; }

function onlineStatus(status) {
  if (status.state === 'disconnected' && mode === 'online') { busy = true; thinking.hidden = true; $('#statusText').textContent = 'せつだん しました'; }
  if (status.state === 'presence' && status.role === 'host') {
    const guestCount = status.players.filter(player => player.role === 'guest').length;
    if (guestCount > 0) setRoomStatus(`合言葉<span class="room-code">${status.code}</span>相手が 入りました！`);
  }
}

async function receiveOnline(message) {
  if (mode !== 'online') return;
  if (message.kind === 'hello' && online.role === 'host') {
    if (!onlineGameStarted) { onlineGameStarted = true; game = createGame(); busy = false; renderer.reset(); update(); if (menu.open) menu.close(); await online.send('start', { history: [] }); }
    else await online.send('sync', { history: game.history.map(move => ({ rod: move.rod })) });
  } else if ((message.kind === 'start' || message.kind === 'sync') && online.role === 'guest') {
    onlineGameStarted = true; game = restoreGame(message.data.history); busy = false; renderer.reset(); update(); if (menu.open) menu.close();
  } else if (message.kind === 'move' && message.role !== online.role) {
    const { rod, ply } = message.data;
    if (Number.isInteger(rod) && ply === game.history.length + 1 && game.turn !== human && play(game, rod) != null) { audio.drop(); update(); }
    else if (online.role === 'guest') await online.send('hello');
  } else if (message.kind === 'restart') {
    restart(false);
  }
}

async function restart(broadcast = true) {
  game = createGame(); busy = false; thinking.hidden = true; requestId++; if (mode === 'online') onlineGameStarted = true; update();
  if (result.open) result.close();
  if (mode === 'online' && broadcast) await online.send('restart');
  if (mode === 'cpu' && human !== BLACK) setTimeout(cpuMove, 250);
}

function showResult() {
  if (result.open) return;
  const humanWon = game.winner === human;
  if (game.draw) { $('#resultEmoji').textContent = '🤝'; $('#resultTitle').textContent = 'ひきわけ！'; $('#resultText').textContent = 'さいごまで よくがんばったね！'; }
  else { $('#resultEmoji').textContent = humanWon || mode === 'local' ? '🎉' : '🌟'; $('#resultTitle').textContent = mode === 'local' ? `${game.winner === BLACK ? 'くろ' : 'しろ'} の かち！` : humanWon ? 'やったね！' : 'おしい！'; $('#resultText').textContent = humanWon || mode === 'local' ? '4つ きれいに そろったよ！' : 'もう一回 やってみよう！'; audio.win(); confetti(); }
  result.showModal();
}

function confetti() { for (let i = 0; i < 55; i++) { const element = document.createElement('i'); element.className = 'confetti'; element.style.left = `${Math.random() * 100}vw`; element.style.background = `hsl(${Math.random() * 360} 80% 55%)`; element.style.setProperty('--drift', `${Math.random() * 200 - 100}px`); element.style.animationDelay = `${Math.random() * 0.5}s`; document.body.append(element); setTimeout(() => element.remove(), 2500); } }

function updateModeOptions() {
  const selectedMode = selected('mode');
  $('#cpuOptions').hidden = selectedMode !== 'cpu';
  $('#onlineOptions').hidden = selectedMode !== 'online';
  $('#startBtn').hidden = selectedMode === 'online';
  if (selectedMode !== 'online') $('#inviteCard').hidden = true;
  if (selectedMode === 'online' && !online.available) setRoomStatus('オンライン設定を 読みこめませんでした', true);
}

document.querySelectorAll('input[name="mode"]').forEach(input => input.onchange = updateModeOptions);
$('#startBtn').onclick = event => { event.preventDefault(); start(); };
$('#createRoomBtn').onclick = createOnlineRoom; $('#joinRoomBtn').onclick = joinOnlineRoom;
$('#shareRoomBtn').onclick = shareRoom;
$('#roomCodeInput').oninput = event => { event.target.value = event.target.value.toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, ''); };
$('#homeBtn').onclick = () => { if (!menu.open) menu.showModal(); };
$('#newBtn').onclick = () => restart(); $('#againBtn').onclick = event => { event.preventDefault(); restart(); };
$('#resultMenuBtn').onclick = () => setTimeout(() => menu.showModal());
$('#resetViewBtn').onclick = () => renderer.reset();
$('#transparentBtn').onclick = () => { renderer.transparent = !renderer.transparent; renderer.draw(); };
$('#undoBtn').onclick = () => { if (busy || mode === 'online') return; requestId++; thinking.hidden = true; busy = false; undo(game, mode === 'cpu' && game.history.length >= 2 ? 2 : 1); audio.click(); update(); };
$('#soundBtn').onclick = () => { const mode = audio.cycleMode(), labels = { full: ['🔊', 'BGMと効果音'], effects: ['🎵', '効果音だけ'], muted: ['🔇', 'すべて消音'] }; $('#soundBtn').textContent = labels[mode][0]; $('#soundBtn').setAttribute('aria-label', labels[mode][1]); };
$('#tutorialBtn').onclick = () => $('#tutorialDialog').showModal();
renderer.setState(game);
const invitedRoom = new URLSearchParams(location.search).get('room')?.toUpperCase();
if (/^[2-9A-HJ-NP-Z]{6}$/.test(invitedRoom || '')) { document.querySelector('input[name="mode"][value="online"]').checked = true; $('#roomCodeInput').value = invitedRoom; updateModeOptions(); menu.showModal(); setTimeout(() => joinOnlineRoom(false), 0); }
else { updateModeOptions(); menu.showModal(); }
