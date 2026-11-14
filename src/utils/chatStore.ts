/**
 * Pure utilities for WhatsApp chat management, per-chat transcription settings,
 * and message formatting.
 */

export interface ChatMessage {
  id: string;
  fromMe: boolean;
  sender: string;
  senderName?: string;
  text?: string;
  isAudio?: boolean;
  audioUrl?: string;
  audioDuration?: number;
  transcription?: string;
  isTranscriptionReply?: boolean;
  timestamp: number; // ms
  status?: 'sent' | 'delivered' | 'read';
}

export interface WhatsAppChat {
  id: string; // jid (e.g. 972501234567@s.whatsapp.net or group jid)
  name: string;
  phoneNumber?: string;
  isGroup: boolean;
  avatar?: string;
  lastMessageText: string;
  lastMessageTimestamp: number;
  unreadCount: number;
  transcriptionEnabled: boolean; // Per-chat setting requested by user!
  messages: ChatMessage[];
}

/**
 * Normalizes user input (e.g. 055-970-7899 or 0501234567) to international WhatsApp format (e.g. 972559707899)
 */
export function normalizePhoneForWhatsApp(input: string): string {
  const digits = input.replace(/[^0-9]/g, '');
  if (digits.startsWith('0') && digits.length === 10) {
    return '972' + digits.substring(1);
  }
  if (digits.startsWith('972')) {
    return digits;
  }
  return digits;
}

/**
 * Normalizes phone number or JID to clean display format
 */
export function formatPhoneNumber(input: string): string {
  const cleaned = input.replace(/@.+/, '').replace(/[^0-9]/g, '');
  if (cleaned.startsWith('972') && cleaned.length >= 11) {
    // Israeli phone number formatting e.g. 972501234567 -> 050-123-4567
    const local = '0' + cleaned.substring(3);
    if (local.length === 10) {
      return `${local.substring(0, 3)}-${local.substring(3, 6)}-${local.substring(6)}`;
    }
    return local;
  }
  return cleaned ? `+${cleaned}` : input;
}

/**
 * Checks whether transcription is enabled for a specific chat
 */
export function isTranscriptionEnabledForChat(
  chatId: string,
  disabledChatIds: Set<string> | string[],
  globalEnabled = true
): boolean {
  if (!globalEnabled) return false;
  const set = Array.isArray(disabledChatIds) ? new Set(disabledChatIds) : disabledChatIds;
  return !set.has(chatId);
}

/**
 * Sorts chats so the most recent conversation is on top
 */
export function sortChatsByRecent(chats: WhatsAppChat[]): WhatsAppChat[] {
  return [...chats].sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
}

/**
 * Creates a standard text message
 */
export function createTextMessage(params: {
  id?: string;
  fromMe: boolean;
  sender: string;
  senderName?: string;
  text: string;
  timestamp?: number;
}): ChatMessage {
  return {
    id: params.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    fromMe: params.fromMe,
    sender: params.sender,
    senderName: params.senderName,
    text: params.text,
    timestamp: params.timestamp || Date.now(),
    status: params.fromMe ? 'read' : undefined,
  };
}

/**
 * Creates a standard voice note message
 */
export function createVoiceMessage(params: {
  id?: string;
  fromMe: boolean;
  sender: string;
  senderName?: string;
  audioDuration: number;
  audioUrl?: string;
  timestamp?: number;
}): ChatMessage {
  return {
    id: params.id || `voice_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    fromMe: params.fromMe,
    sender: params.sender,
    senderName: params.senderName,
    isAudio: true,
    audioDuration: params.audioDuration,
    audioUrl: params.audioUrl,
    timestamp: params.timestamp || Date.now(),
    status: params.fromMe ? 'read' : undefined,
  };
}

export interface AuthCredsLike {
  registered?: boolean;
  me?: { id?: string; name?: string } | null;
  account?: unknown;
}

/**
 * Returns true if credentials represent a paired WhatsApp session (either fully registered
 * or immediately post pair-success before 515 restart completes registration).
 */
export function isPairedAuthCreds(creds?: AuthCredsLike | null): boolean {
  if (!creds) return false;
  return Boolean(creds.registered || (creds.account && creds.me?.id));
}

/**
 * Only clear an abandoned pairing-code draft where `me` exists without `account` or `registered`.
 * Never wipe fresh QR `pair-success` creds (`account` present) during 515 reconnect!
 */
export function shouldClearIncompleteAuthCreds(creds?: AuthCredsLike | null): boolean {
  if (!creds) return false;
  return Boolean(!creds.registered && !creds.account && creds.me);
}
