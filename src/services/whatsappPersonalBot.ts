import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WAMessage,
  downloadMediaMessage,
  WASocket,
  Browsers,
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
  makeCacheableSignalKeyStore,
  proto,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatTranscriptionMessage } from '../utils/whatsappParser.ts';
import {
  WhatsAppChat,
  ChatMessage,
  createTextMessage,
  createVoiceMessage,
  formatPhoneNumber,
  normalizePhoneForWhatsApp,
  isTranscriptionEnabledForChat,
  sortChatsByRecent,
  isPairedAuthCreds,
  shouldClearIncompleteAuthCreds,
} from '../utils/chatStore.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_DIR = path.resolve(__dirname, '../../whatsapp_auth_info');

export type ConnectionStatus = 'DISCONNECTED' | 'INITIALIZING' | 'SCAN_QR' | 'CONNECTING' | 'CONNECTED';

export interface PersonalBotSettings {
  autoReplyPrivate: boolean;
  autoReplyGroups: boolean;
  delaySeconds: number;
  quoteOriginalMessage: boolean;
}

export interface ActivityEvent {
  id: string;
  timestamp: string;
  type:
    | 'qr_generated'
    | 'pairing_code'
    | 'connected'
    | 'disconnected'
    | 'voice_received'
    | 'delayed_sending'
    | 'replied'
    | 'error'
    | 'skipped_disabled';
  sender: string;
  details: string;
  audioDuration?: number;
  transcription?: string;
  delaySeconds?: number;
}

class WhatsAppPersonalService {
  private sock: WASocket | null = null;
  private status: ConnectionStatus = 'DISCONNECTED';
  private qrCodeDataUrl: string | null = null;
  private pairingCode: string | null = null;
  private connectedPhone: string | null = null;
  private connectedName: string | null = null;
  private isConnecting = false;
  private disconnectReasonMessage: string | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private qrAttempts = 0;
  private readonly MAX_QR_ATTEMPTS = 6;
  private pendingCredsSave: Promise<void> = Promise.resolve();
  private awaitingPairingCode = false;
  private socketReadyResolve: (() => void) | null = null;
  private waVersionInUse: [number, number, number] | null = null;

  // Real synced chats, contacts, audio media cache, and raw proto cache for message retries
  private chats: Map<string, WhatsAppChat> = new Map();
  private contactNames: Map<string, string> = new Map();
  private mediaCache: Map<string, { buffer: Buffer; mimeType: string }> = new Map();
  private rawMessages: Map<string, proto.IMessage> = new Map();
  // Per-chat disabled set (chats where user turned off transcription)
  private disabledChatIds: Set<string> = new Set();

  private settings: PersonalBotSettings = {
    autoReplyPrivate: true,
    autoReplyGroups: false,
    delaySeconds: 10,
    quoteOriginalMessage: true,
  };

  private activities: ActivityEvent[] = [];
  private onTranscribeAudio: ((base64: string, mimeType: string) => Promise<string>) | null = null;

  constructor() {
    this.addActivity({
      type: 'disconnected',
      sender: 'מערכת',
      details: 'שירות וואטסאפ אמיתי מוכן לחיבור. סרוק קוד QR או הזן קוד 8 ספרות כדי לקשר את חשבונך.',
    });

    // If an already-paired session exists on disk, reconnect automatically
    try {
      const credsPath = path.join(AUTH_DIR, 'creds.json');
      if (fs.existsSync(credsPath)) {
        const raw = fs.readFileSync(credsPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (isPairedAuthCreds(parsed)) {
          setTimeout(() => {
            this.startConnection();
          }, 800);
        }
      }
    } catch {
      // Ignore invalid/unreadable creds on startup
    }
  }

  public setTranscriber(fn: (base64: string, mimeType: string) => Promise<string>) {
    this.onTranscribeAudio = fn;
  }

  public getMedia(msgId: string): { buffer: Buffer; mimeType: string } | null {
    return this.mediaCache.get(msgId) || null;
  }

  public getStatus() {
    return {
      status: this.status,
      qrCodeDataUrl: this.qrCodeDataUrl,
      pairingCode: this.pairingCode,
      connectedPhone: this.connectedPhone,
      connectedName: this.connectedName,
      disconnectReasonMessage: this.disconnectReasonMessage,
      waVersion: this.waVersionInUse ? this.waVersionInUse.join('.') : null,
      settings: this.settings,
      activities: this.activities.slice(0, 50),
      chatsCount: this.chats.size,
    };
  }

  public getChats(): WhatsAppChat[] {
    const list: WhatsAppChat[] = [];
    for (const chat of this.chats.values()) {
      list.push({
        ...chat,
        transcriptionEnabled: isTranscriptionEnabledForChat(chat.id, this.disabledChatIds, true),
      });
    }
    return sortChatsByRecent(list);
  }

  public getChat(jid: string): WhatsAppChat | null {
    const chat = this.chats.get(jid);
    if (!chat) return null;
    return {
      ...chat,
      transcriptionEnabled: isTranscriptionEnabledForChat(chat.id, this.disabledChatIds, true),
    };
  }

  public toggleChatTranscription(jid: string, enabled: boolean): boolean {
    if (enabled) {
      this.disabledChatIds.delete(jid);
    } else {
      this.disabledChatIds.add(jid);
    }

    const chat = this.chats.get(jid);
    if (chat) {
      chat.transcriptionEnabled = enabled;
    }

    this.addActivity({
      type: enabled ? 'connected' : 'skipped_disabled',
      sender: chat?.name || jid.replace(/@.+/, ''),
      details: `הגדרות צ'אט עודכנו: תמלול הודעות קוליות עבור שיחה זו ${enabled ? 'הופעל' : 'בוטל בהצלחה'}.`,
    });

    return enabled;
  }

  /**
   * Ensures a chat entry exists in the store using the exact JID (private, group @g.us, or @lid)
   */
  private ensureChat(jid: string, name?: string, timestampMs?: number): WhatsAppChat {
    const existing = this.chats.get(jid);
    const knownContactName = this.contactNames.get(jid);
    const resolvedName = name || knownContactName;

    if (existing) {
      if (resolvedName && (existing.name.startsWith('+') || existing.name.startsWith('05') || existing.name === jid.replace(/@.+/, ''))) {
        existing.name = resolvedName;
      }
      return existing;
    }

    const isGroup = jid.endsWith('@g.us');
    const rawNum = jid.replace(/@.+/, '');
    const formatted = isGroup ? undefined : formatPhoneNumber(rawNum);
    const chatName = resolvedName || formatted || rawNum;

    const newChat: WhatsAppChat = {
      id: jid,
      name: chatName,
      phoneNumber: formatted,
      isGroup,
      avatar: isGroup ? '👥' : '👤',
      lastMessageText: '',
      lastMessageTimestamp: timestampMs || Date.now(),
      unreadCount: 0,
      transcriptionEnabled: isTranscriptionEnabledForChat(jid, this.disabledChatIds, true),
      messages: [],
    };

    this.chats.set(jid, newChat);
    return newChat;
  }

  public createNewChat(phoneNumber: string, name?: string): WhatsAppChat {
    const normalized = normalizePhoneForWhatsApp(phoneNumber);
    const cleanNumber = normalized || phoneNumber.replace(/[^0-9]/g, '');
    const jid = `${cleanNumber}@s.whatsapp.net`;
    return this.ensureChat(jid, name);
  }

  public async sendTextMessage(jid: string, text: string): Promise<ChatMessage> {
    if (!this.sock || this.status !== 'CONNECTED') {
      throw new Error('חשבון הוואטסאפ אינו מחובר כרגע. חבר את החשבון כדי לשלוח הודעות אמיתיות.');
    }

    const sent = await this.sock.sendMessage(jid, { text });

    const message = createTextMessage({
      id: sent?.key?.id || undefined,
      fromMe: true,
      sender: 'me',
      text,
      timestamp: Date.now(),
    });

    const chat = this.ensureChat(jid);
    chat.messages.push(message);
    chat.lastMessageText = text;
    chat.lastMessageTimestamp = Date.now();

    return message;
  }

  public async sendVoiceMessage(
    jid: string,
    audioBuffer: Buffer,
    mimeType: string,
    durationSeconds: number
  ): Promise<ChatMessage> {
    if (!this.sock || this.status !== 'CONNECTED') {
      throw new Error('חשבון הוואטסאפ אינו מחובר כרגע. חבר את החשבון כדי לשלוח הודעה קולית.');
    }

    const sent = await this.sock.sendMessage(jid, {
      audio: audioBuffer,
      mimetype: mimeType || 'audio/ogg; codecs=opus',
      ptt: true,
    });

    const msgId = sent?.key?.id || `voice_${Date.now()}`;
    this.mediaCache.set(msgId, { buffer: audioBuffer, mimeType });

    const message = createVoiceMessage({
      id: msgId,
      fromMe: true,
      sender: 'me',
      audioDuration: durationSeconds,
      audioUrl: `/api/personal-bot/media/${encodeURIComponent(msgId)}`,
      timestamp: Date.now(),
    });

    const chat = this.ensureChat(jid);
    chat.messages.push(message);
    chat.lastMessageText = `הודעה קולית (${durationSeconds} שנ')`;
    chat.lastMessageTimestamp = Date.now();

    return message;
  }

  public updateSettings(newSettings: Partial<PersonalBotSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    return this.settings;
  }

  private addActivity(act: Omit<ActivityEvent, 'id' | 'timestamp'>) {
    const event: ActivityEvent = {
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleTimeString('he-IL', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      ...act,
    };
    this.activities.unshift(event);
    if (this.activities.length > 80) this.activities.pop();
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private teardownCurrentSocket() {
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners('connection.update');
        this.sock.ev.removeAllListeners('creds.update');
        this.sock.ev.removeAllListeners('messages.upsert');
        this.sock.ev.removeAllListeners('messaging-history.set');
        this.sock.ev.removeAllListeners('chats.upsert');
        this.sock.ev.removeAllListeners('chats.update');
        this.sock.ev.removeAllListeners('contacts.upsert');
        this.sock.ev.removeAllListeners('contacts.update');
        this.sock.end(undefined);
      } catch {}
      this.sock = null;
    }
  }

  /**
   * Completely cleans up previous auth state to prevent 401 loops
   */
  public clearAuthState() {
    try {
      if (fs.existsSync(AUTH_DIR)) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      }
    } catch (e) {
      console.warn('Error clearing auth directory:', e);
    }
  }

  /**
   * Initializes the WhatsApp Web connection cleanly
   */
  public async startConnection(options?: { resetQrAttempts?: boolean; pairingMode?: boolean }) {
    if (options?.resetQrAttempts) {
      this.qrAttempts = 0;
    }
    if (options?.pairingMode !== undefined) {
      this.awaitingPairingCode = options.pairingMode;
    }

    this.clearReconnectTimer();
    this.teardownCurrentSocket();

    this.isConnecting = true;
    this.status = 'INITIALIZING';
    this.disconnectReasonMessage = null;

    try {
      if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true });
      }

      let { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

      // Clear ONLY an abandoned pairing-code draft (never wipe pair-success creds during 515 restart!)
      if (shouldClearIncompleteAuthCreds(state.creds)) {
        console.log('Clearing incomplete pairing-code draft...');
        this.clearAuthState();
        const fresh = await useMultiFileAuthState(AUTH_DIR);
        state = fresh.state;
        saveCreds = fresh.saveCreds;
      }

      // Fetch live current WhatsApp Web version first; fallback to Baileys version if needed
      let version: [number, number, number] | undefined;
      try {
        const waInfo = await fetchLatestWaWebVersion({});
        if (waInfo?.version && waInfo.isLatest) {
          version = waInfo.version;
        }
      } catch (e) {
        console.warn('Could not fetch latest WA Web version:', e);
      }
      if (!version) {
        try {
          const bInfo = await fetchLatestBaileysVersion();
          version = bInfo.version;
        } catch (e) {
          console.warn('Could not fetch fallback Baileys version:', e);
        }
      }
      this.waVersionInUse = version || null;

      const logger = pino({ level: 'silent' });

      const sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        version,
        logger,
        printQRInTerminal: false,
        browser: Browsers.macOS('Chrome'),
        syncFullHistory: false,
        markOnlineOnConnect: true,
        qrTimeout: 45000,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 20000,
        defaultQueryTimeoutMs: 60000,
        getMessage: async (key) => {
          if (!key?.id) return undefined;
          return this.rawMessages.get(key.id);
        },
      });

      this.sock = sock;

      sock.ev.on('creds.update', async () => {
        // Chain writes sequentially after microtask so Baileys' Object.assign(creds, update) finishes first
        this.pendingCredsSave = this.pendingCredsSave
          .then(
            () =>
              new Promise<void>((resolve) => {
                queueMicrotask(() => {
                  Promise.resolve(saveCreds())
                    .then(() => resolve())
                    .catch((err) => {
                      console.error('Failed saving WA creds:', err);
                      resolve();
                    });
                });
              })
          );
        await this.pendingCredsSave;
      });

      sock.ev.on('connection.update', async (update) => {
        // Ignore events from stale sockets that were replaced
        if (this.sock !== sock) return;

        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          if (this.socketReadyResolve) {
            this.socketReadyResolve();
            this.socketReadyResolve = null;
          }

          if (!this.awaitingPairingCode) {
            this.qrAttempts++;
            this.status = 'SCAN_QR';
            try {
              const dataUrl = await QRCode.toDataURL(qr, {
                margin: 2,
                width: 320,
                color: {
                  dark: '#005c4b',
                  light: '#ffffff',
                },
              });
              this.qrCodeDataUrl = dataUrl;
              this.addActivity({
                type: 'qr_generated',
                sender: 'מערכת',
                details: 'קוד QR חדש ורענן הופק לסריקה מתוך וואטסאפ בטלפון.',
              });
            } catch (e) {
              console.error('QR code generation failed:', e);
            }
          }
        }

        if (connection === 'connecting') {
          if (sock.authState?.creds?.registered || sock.authState?.creds?.account) {
            this.status = 'CONNECTING';
          }
        }

        if (connection === 'open') {
          if (this.socketReadyResolve) {
            this.socketReadyResolve();
            this.socketReadyResolve = null;
          }
          this.status = 'CONNECTED';
          this.awaitingPairingCode = false;
          this.qrAttempts = 0;
          this.qrCodeDataUrl = null;
          this.pairingCode = null;
          this.disconnectReasonMessage = null;

          const userId = sock.user?.id ? sock.user.id.split(':')[0] : 'חשבון מחובר';
          this.connectedPhone = userId;
          this.connectedName = sock.user?.name || 'החשבון שלי';

          this.addActivity({
            type: 'connected',
            sender: userId,
            details: `מחובר בהצלחה לחשבון הוואטסאפ האמיתי שלך (+${userId})! הבוט מסנכרן שיחות ומאזין להודעות קוליות.`,
          });
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;
          const isRestartRequired = statusCode === DisconnectReason.restartRequired || statusCode === 515;
          const isConnectionReplaced = statusCode === DisconnectReason.connectionReplaced || statusCode === 440;
          const isBadSession = statusCode === DisconnectReason.badSession || statusCode === 500;
          const isPaired = Boolean(sock.authState?.creds?.registered || sock.authState?.creds?.account);

          this.connectedPhone = null;
          this.connectedName = null;

          if (isRestartRequired) {
            // 515 restartRequired ALWAYS happens immediately after scanning QR or entering pairing code!
            // Wait for serialized creds save and immediately open the new authenticated socket!
            this.status = 'CONNECTING';
            this.awaitingPairingCode = false;
            this.qrCodeDataUrl = null;
            this.pairingCode = null;
            this.addActivity({
              type: 'qr_generated',
              sender: 'מערכת',
              details: 'המכשיר אומת בהצלחה! משלים כעת את החיבור מול שרתי וואטסאפ...',
            });

            await this.pendingCredsSave;
            await new Promise((r) => setTimeout(r, 250));
            this.reconnectTimer = setTimeout(() => {
              this.isConnecting = false;
              this.startConnection({ resetQrAttempts: true, pairingMode: false });
            }, 500);
          } else if (isLoggedOut) {
            this.status = 'DISCONNECTED';
            this.awaitingPairingCode = false;
            this.qrCodeDataUrl = null;
            this.pairingCode = null;
            this.clearAuthState();
            this.disconnectReasonMessage =
              'החיבור נותק מוואטסאפ (קוד 401). נתוני הסשן נוקו — סרוק קוד QR חדש או בקש קוד קישור.';
            this.addActivity({
              type: 'disconnected',
              sender: 'מערכת',
              details: 'וואטסאפ ניתק את המכשיר (קוד 401). ניתן לסרוק קוד QR חדש כדי להתחבר.',
            });
          } else if (isConnectionReplaced) {
            this.status = 'DISCONNECTED';
            this.awaitingPairingCode = false;
            this.qrCodeDataUrl = null;
            this.disconnectReasonMessage = 'החיבור הוחלף על ידי סשן אחר.';
            this.addActivity({
              type: 'disconnected',
              sender: 'מערכת',
              details: 'החיבור הוחלף (קוד 440). לחץ לחיבור מחדש.',
            });
          } else if (isBadSession) {
            this.clearAuthState();
            this.awaitingPairingCode = false;
            this.status = 'INITIALIZING';
            this.addActivity({
              type: 'disconnected',
              sender: 'מערכת',
              details: 'סשן פגום (קוד 500). מנקה ומפעיל חיבור נקי מחדש...',
            });
            this.reconnectTimer = setTimeout(() => {
              this.isConnecting = false;
              this.startConnection({ resetQrAttempts: true });
            }, 1500);
          } else if (this.awaitingPairingCode && !isPaired) {
            this.status = 'DISCONNECTED';
            this.awaitingPairingCode = false;
            this.qrCodeDataUrl = null;
            this.pairingCode = null;
            this.clearAuthState();
            this.disconnectReasonMessage =
              'פג תוקף קוד הקישור (יש לאשר את הקוד בטלפון תוך כדקה מהפקתו). לחץ "קבל קוד קישור" להפקת קוד חדש.';
            this.addActivity({
              type: 'disconnected',
              sender: 'מערכת',
              details: `פג תוקף קוד הקישור (קוד: ${statusCode || '408'}). יש להפיק קוד חדש.`,
            });
          } else if (!isPaired && this.qrAttempts >= this.MAX_QR_ATTEMPTS) {
            // Stop spinning after repeated un-scanned QR timeouts
            this.status = 'DISCONNECTED';
            this.awaitingPairingCode = false;
            this.qrCodeDataUrl = null;
            this.disconnectReasonMessage = 'פג תוקף קוד ה-QR. לחץ על "הפקת קוד QR לסריקה" כשתהיה מוכן לסרוק.';
            this.addActivity({
              type: 'disconnected',
              sender: 'מערכת',
              details: 'פג תוקף קוד ה-QR לאחר המתנה ממושכת. לחץ להפקת קוד חדש.',
            });
          } else {
            // Normal transient network error / 408 / 428 -> automatically reconnect
            this.status = isPaired ? 'CONNECTING' : 'INITIALIZING';
            this.addActivity({
              type: 'disconnected',
              sender: 'מערכת',
              details: `חידוש חיבור מול וואטסאפ (קוד: ${statusCode || 'רענון'})...`,
            });
            await this.pendingCredsSave;
            this.reconnectTimer = setTimeout(() => {
              this.isConnecting = false;
              this.startConnection();
            }, 2500);
          }
        }
      });

      // Sync contacts for real names
      sock.ev.on('contacts.upsert', (contacts) => {
        for (const c of contacts) {
          if (c.id) {
            const name = c.name || c.notify || c.verifiedName;
            if (name) {
              this.contactNames.set(c.id, name);
              const existing = this.chats.get(c.id);
              if (existing && (existing.name.startsWith('+') || existing.name.startsWith('05'))) {
                existing.name = name;
              }
            }
          }
        }
      });

      sock.ev.on('contacts.update', (updates) => {
        for (const c of updates) {
          if (c.id) {
            const name = c.name || c.notify || c.verifiedName;
            if (name) {
              this.contactNames.set(c.id, name);
              const existing = this.chats.get(c.id);
              if (existing) existing.name = name;
            }
          }
        }
      });

      // Initial history sync when connecting real WhatsApp account!
      sock.ev.on('messaging-history.set', async ({ chats, contacts, messages }) => {
        for (const c of contacts || []) {
          if (c.id) {
            const name = c.name || c.notify || c.verifiedName;
            if (name) this.contactNames.set(c.id, name);
          }
        }

        for (const c of chats || []) {
          if (!c.id || c.id === 'status@broadcast') continue;
          const ts = c.conversationTimestamp
            ? Number(c.conversationTimestamp) * 1000
            : Date.now();
          const chat = this.ensureChat(c.id, c.name || undefined, ts);
          if (typeof c.unreadCount === 'number') {
            chat.unreadCount = c.unreadCount;
          }
          if (c.id.endsWith('@g.us') && !c.name) {
            sock.groupMetadata(c.id).then((meta) => {
              if (meta?.subject) chat.name = meta.subject;
            }).catch(() => {});
          }
        }

        for (const msg of messages || []) {
          await this.ingestMessage(sock, msg, true);
        }

        this.addActivity({
          type: 'connected',
          sender: 'סנכרון',
          details: `סונכרנו ${this.chats.size} שיחות אמיתיות מחשבון הוואטסאפ שלך.`,
        });
      });

      // Live chat updates
      sock.ev.on('chats.upsert', (newChats) => {
        for (const c of newChats) {
          if (!c.id || c.id === 'status@broadcast') continue;
          const chat = this.ensureChat(c.id, c.name || undefined);
          if (c.id.endsWith('@g.us') && !c.name) {
            sock.groupMetadata(c.id).then((meta) => {
              if (meta?.subject) chat.name = meta.subject;
            }).catch(() => {});
          }
        }
      });

      sock.ev.on('chats.update', (updates) => {
        for (const u of updates) {
          if (!u.id) continue;
          const chat = this.chats.get(u.id);
          if (chat) {
            if (u.name) chat.name = u.name;
            if (typeof u.unreadCount === 'number') chat.unreadCount = u.unreadCount;
          }
        }
      });

      // Real incoming & outgoing messages
      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        const isRealtime = type === 'notify';
        for (const msg of messages) {
          await this.ingestMessage(sock, msg, !isRealtime);
        }
      });
    } catch (err: unknown) {
      this.status = 'DISCONNECTED';
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.addActivity({
        type: 'error',
        sender: 'מערכת',
        details: `שגיאה בהפעלת החיבור: ${msg}`,
      });
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Processes both historical synced messages and live incoming messages from WhatsApp
   */
  private async ingestMessage(sock: WASocket, msg: WAMessage, isHistorySync: boolean) {
    if (!msg.message) return;

    const jid = msg.key.remoteJid;
    if (!jid || jid === 'status@broadcast') return;

    const fromMe = Boolean(msg.key.fromMe);
    const senderJid = msg.key.participant || jid;
    const senderNumber = senderJid.replace(/@.+/, '');
    const isGroup = jid.endsWith('@g.us');
    const msgId = msg.key.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const msgTimestamp = msg.messageTimestamp
      ? Number(msg.messageTimestamp) * 1000
      : Date.now();

    if (!fromMe && msg.pushName && !isGroup) {
      this.contactNames.set(jid, msg.pushName);
    }

    const chat = this.ensureChat(
      jid,
      !isGroup && !fromMe ? msg.pushName || undefined : undefined,
      msgTimestamp
    );

    if (isGroup && chat.name === chat.id.replace(/@.+/, '')) {
      sock.groupMetadata(jid).then((meta) => {
        if (meta?.subject) chat.name = meta.subject;
      }).catch(() => {});
    }

    // Deduplicate message if already ingested
    if (chat.messages.some((m) => m.id === msgId)) return;

    this.rawMessages.set(msgId, msg.message);
    if (this.rawMessages.size > 500) {
      const oldestKey = this.rawMessages.keys().next().value;
      if (oldestKey) this.rawMessages.delete(oldestKey);
    }

    const senderDisplayName =
      this.contactNames.get(senderJid) || msg.pushName || formatPhoneNumber(senderNumber);

    // 1. Text messages
    const textContent =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      '';

    if (textContent) {
      const textMsg = createTextMessage({
        id: msgId,
        fromMe,
        sender: senderNumber,
        senderName: fromMe ? 'אני' : senderDisplayName,
        text: textContent,
        timestamp: msgTimestamp,
      });
      chat.messages.push(textMsg);
      chat.messages.sort((a, b) => a.timestamp - b.timestamp);
      if (msgTimestamp >= chat.lastMessageTimestamp) {
        chat.lastMessageText = textContent;
        chat.lastMessageTimestamp = msgTimestamp;
      }
      if (!isHistorySync && !fromMe) chat.unreadCount++;
      return;
    }

    // 2. Voice notes / Audio messages
    const audioMsg = msg.message.audioMessage;
    if (!audioMsg) return;

    const duration = audioMsg.seconds || 5;
    const mimeType = audioMsg.mimetype || 'audio/ogg; codecs=opus';

    const voiceMsg = createVoiceMessage({
      id: msgId,
      fromMe,
      sender: senderNumber,
      senderName: fromMe ? 'אני' : senderDisplayName,
      audioDuration: duration,
      audioUrl: `/api/personal-bot/media/${encodeURIComponent(msgId)}`,
      timestamp: msgTimestamp,
    });
    chat.messages.push(voiceMsg);
    chat.messages.sort((a, b) => a.timestamp - b.timestamp);
    if (msgTimestamp >= chat.lastMessageTimestamp) {
      chat.lastMessageText = `הודעה קולית (${duration} שנ')`;
      chat.lastMessageTimestamp = msgTimestamp;
    }
    if (!isHistorySync && !fromMe) chat.unreadCount++;

    // Download audio buffer for playback in UI (and transcription if live incoming)
    let downloadedBuffer: Buffer | null = null;
    try {
      downloadedBuffer = (await downloadMediaMessage(
        msg,
        'buffer',
        {},
        {
          logger: pino({ level: 'silent' }),
          reuploadRequest: sock.updateMediaMessage,
        }
      )) as Buffer;
      this.mediaCache.set(msgId, { buffer: downloadedBuffer, mimeType });
    } catch (dlErr) {
      console.warn('Could not download audio media:', dlErr);
    }

    // Only auto-transcribe & reply to LIVE incoming voice notes from others
    if (isHistorySync || fromMe) return;

    const isEnabledForThisChat = isTranscriptionEnabledForChat(
      jid,
      this.disabledChatIds,
      isGroup ? this.settings.autoReplyGroups : this.settings.autoReplyPrivate
    );

    if (!isEnabledForThisChat) {
      this.addActivity({
        type: 'skipped_disabled',
        sender: chat.name || senderNumber,
        details: `התקבלה הודעה קולית מ-${chat.name || senderNumber}, אך התמלול האוטומטי מושבת עבור שיחה זו.`,
        audioDuration: duration,
      });
      return;
    }

    this.addActivity({
      type: 'voice_received',
      sender: chat.name || senderNumber,
      details: `התקבלה הודעה קולית בת ${duration} שניות מ-${chat.name || senderNumber}. מתמלל...`,
      audioDuration: duration,
    });

    try {
      if (!downloadedBuffer) {
        throw new Error('הורדת קובץ השמע מוואטסאפ נכשלה');
      }

      if (!this.onTranscribeAudio) {
        throw new Error('שירות התמלול לא הוגדר');
      }

      const base64Audio = downloadedBuffer.toString('base64');
      const transcription = await this.onTranscribeAudio(base64Audio, mimeType);
      voiceMsg.transcription = transcription;

      this.addActivity({
        type: 'delayed_sending',
        sender: chat.name || senderNumber,
        details: `התמלול מוכן: "${transcription.slice(0, 60)}...". ממתין בדיוק ${this.settings.delaySeconds} שניות לפני שליחה...`,
        audioDuration: duration,
        delaySeconds: this.settings.delaySeconds,
        transcription,
      });

      const delayMs = this.settings.delaySeconds * 1000;
      setTimeout(async () => {
        try {
          const replyText = formatTranscriptionMessage(transcription, {
            durationSeconds: duration,
            delaySeconds: this.settings.delaySeconds,
          });

          const activeSock = this.sock;
          if (!activeSock || this.status !== 'CONNECTED') {
            throw new Error('החיבור לוואטסאפ נותק לפני שליחת המענה');
          }

          await activeSock.sendMessage(
            jid,
            { text: replyText },
            this.settings.quoteOriginalMessage ? { quoted: msg } : undefined
          );

          const replyMsg = createTextMessage({
            fromMe: true,
            sender: 'me',
            text: replyText,
            timestamp: Date.now(),
          });
          replyMsg.isTranscriptionReply = true;
          chat.messages.push(replyMsg);
          chat.lastMessageText = replyText;
          chat.lastMessageTimestamp = Date.now();

          this.addActivity({
            type: 'replied',
            sender: chat.name || senderNumber,
            details: `חלפו ${this.settings.delaySeconds} שניות! התמלול נשלח בהצלחה ל-${chat.name || senderNumber} מחשבונך.`,
            audioDuration: duration,
            transcription,
          });
        } catch (sendErr: unknown) {
          const errMsg = sendErr instanceof Error ? sendErr.message : 'Send error';
          this.addActivity({
            type: 'error',
            sender: chat.name || senderNumber,
            details: `שגיאה בשליחת הודעת התמלול: ${errMsg}`,
          });
        }
      }, delayMs);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Transcription error';
      this.addActivity({
        type: 'error',
        sender: chat.name || senderNumber,
        details: `שגיאה בתמלול ההודעה הקולית: ${errMsg}`,
      });
    }
  }

  public clearChats(): void {
    this.chats.clear();
    this.disabledChatIds.clear();
    this.mediaCache.clear();
  }

  /**
   * Resets connection and purges any corrupt auth state
   */
  public async resetConnection(options?: { pairingMode?: boolean }) {
    this.clearReconnectTimer();
    this.teardownCurrentSocket();
    this.clearAuthState();
    this.qrCodeDataUrl = null;
    this.pairingCode = null;
    this.connectedPhone = null;
    this.connectedName = null;
    this.status = 'INITIALIZING';
    this.disconnectReasonMessage = null;

    this.addActivity({
      type: 'disconnected',
      sender: 'מערכת',
      details: options?.pairingMode
        ? 'איפוס סשן קודם. מכין חיבור להפקת קוד קישור בן 8 תווים...'
        : 'איפוס סשן קודם. מפיק חיבור וקוד QR חדשים...',
    });

    await this.startConnection({ resetQrAttempts: true, pairingMode: Boolean(options?.pairingMode) });
  }

  /**
   * Requests an 8-character pairing code directly after noise handshake is ready
   */
  public async requestPairingCodeDirect(phoneNumber: string): Promise<string> {
    const normalized = normalizePhoneForWhatsApp(phoneNumber);
    if (normalized.length < 9) {
      throw new Error('מספר טלפון קצר מדי. הזן מספר מלא כולל קידומת (למשל: 055-970-7899 או 972559707899)');
    }

    const readyPromise = new Promise<void>((resolve) => {
      this.socketReadyResolve = resolve;
      setTimeout(() => {
        if (this.socketReadyResolve === resolve) {
          this.socketReadyResolve = null;
          resolve();
        }
      }, 10000);
    });

    // Reset any old socket or stale keys to guarantee clean pairing
    await this.resetConnection({ pairingMode: true });

    // Wait for noise handshake / pair-device ready signal
    await readyPromise;
    await new Promise((r) => setTimeout(r, 350));

    if (!this.sock) {
      this.awaitingPairingCode = false;
      throw new Error('אתחול סוקט וואטסאפ נכשל. נסה שוב בעוד רגע.');
    }

    try {
      const code = await this.sock.requestPairingCode(normalized);
      this.pairingCode = code;
      this.addActivity({
        type: 'pairing_code',
        sender: normalized,
        details: `הופק קוד קישור בן 8 תווים: ${code}. הזן אותו באפליקציית וואטסאפ בטלפון שלך!`,
      });
      return code;
    } catch (err: unknown) {
      this.awaitingPairingCode = false;
      const msg = err instanceof Error ? err.message : 'שגיאה בהפקת קוד קישור';
      throw new Error(`וואטסאפ דחה את בקשת הקוד: ${msg}. נסה שוב או סרוק קוד QR.`);
    }
  }

  /**
   * Disconnects and removes auth credentials completely
   */
  public async disconnect() {
    try {
      this.clearReconnectTimer();
      if (this.sock) {
        try {
          await this.sock.logout();
        } catch {}
        this.teardownCurrentSocket();
      }
      this.clearAuthState();
      this.status = 'DISCONNECTED';
      this.qrCodeDataUrl = null;
      this.pairingCode = null;
      this.connectedPhone = null;
      this.connectedName = null;
      this.disconnectReasonMessage = null;

      this.addActivity({
        type: 'disconnected',
        sender: 'מערכת',
        details: 'החשבון נותק ונתוני ההתחברות נוקו.',
      });
    } catch (e) {
      console.error('Logout error:', e);
    }
  }
}

export const personalBotService = new WhatsAppPersonalService();
