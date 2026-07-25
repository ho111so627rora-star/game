import { createClient } from '../vendor/supabase.js';

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function createRoomCode() { const bytes = crypto.getRandomValues(new Uint8Array(6)); return Array.from(bytes, value => ALPHABET[value % ALPHABET.length]).join(''); }

export class OnlineSession {
  constructor({ onMessage, onStatus }) {
    this.onMessage = onMessage; this.onStatus = onStatus; this.clientId = crypto.randomUUID();
    this.channel = null; this.role = null; this.code = null; this.connectionId = 0; this.reconnectTimer = null; this.manuallyLeaving = false;
    const config = window.__SUPABASE_CONFIG__;
    this.available = Boolean(config?.url && config?.publishableKey);
    if (this.available) this.client = createClient(config.url, config.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  }

  async connect(code, role, reconnecting = false) {
    if (!this.available) throw new Error('Supabaseの接続設定がありません');
    clearTimeout(this.reconnectTimer); this.manuallyLeaving = false; const connectionId = ++this.connectionId;
    await this.removeCurrentChannel();
    this.code = code.toUpperCase(); this.role = role;
    this.onStatus({ state: reconnecting ? 'reconnecting' : 'connecting', code: this.code, role });
    this.channel = this.client.channel(`cube-game:${this.code}`, { config: { broadcast: { ack: true, self: false }, presence: { key: this.clientId } } });
    this.channel
      .on('broadcast', { event: 'game' }, ({ payload }) => { if (payload?.sender !== this.clientId) this.onMessage(payload); })
      .on('presence', { event: 'sync' }, () => this.reportPresence());
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { if (connectionId === this.connectionId) reject(new Error('接続がタイムアウトしました')); }, 12000);
      this.channel.subscribe(async status => {
        if (connectionId !== this.connectionId) return;
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer); await this.channel.track({ role, joinedAt: Date.now() });
          this.onStatus({ state: reconnecting ? 'reconnected' : 'connected', code: this.code, role });
          if (role === 'guest') await this.send('hello'); resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer); this.scheduleReconnect(connectionId); reject(new Error('Supabaseへ接続できませんでした'));
        } else if (status === 'CLOSED' && !this.manuallyLeaving) {
          this.onStatus({ state: 'disconnected', code: this.code, role }); this.scheduleReconnect(connectionId);
        }
      });
    });
  }

  scheduleReconnect(connectionId) {
    if (this.manuallyLeaving || this.reconnectTimer || connectionId !== this.connectionId || !this.code || !this.role) return;
    const code = this.code, role = this.role;
    this.onStatus({ state: 'reconnecting', code, role });
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try { await this.connect(code, role, true); }
      catch { this.scheduleReconnect(this.connectionId); }
    }, 1800);
  }

  reportPresence() {
    if (!this.channel) return;
    const players = Object.values(this.channel.presenceState()).flat();
    this.onStatus({ state: 'presence', code: this.code, role: this.role, players });
    if (this.role === 'guest' && players.some(player => player.role === 'host')) this.send('hello');
  }

  async send(kind, data = {}) {
    if (!this.channel) return false;
    const response = await this.channel.send({ type: 'broadcast', event: 'game', payload: { kind, data, sender: this.clientId, role: this.role, sentAt: Date.now() } });
    return response === 'ok';
  }

  async removeCurrentChannel() {
    if (!this.channel || !this.client) return;
    const old = this.channel; this.channel = null; await this.client.removeChannel(old);
  }

  async leave() {
    this.manuallyLeaving = true; clearTimeout(this.reconnectTimer); this.reconnectTimer = null; this.connectionId++;
    await this.removeCurrentChannel(); this.role = null; this.code = null;
  }
}
