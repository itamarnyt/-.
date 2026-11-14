/**
 * Pure utilities for parsing WhatsApp Cloud API payloads and formatting responses.
 */

export interface WhatsAppWebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'audio' | 'voice' | 'text' | 'image' | 'video' | 'unknown';
  audio?: {
    id: string;
    mime_type: string;
    sha256?: string;
  };
  text?: {
    body: string;
  };
}

export interface ExtractedVoiceMessage {
  senderNumber: string;
  messageId: string;
  timestamp: number;
  audioMediaId: string;
  mimeType: string;
}

/**
 * Parses incoming Meta WhatsApp Cloud API webhook JSON payload.
 * Returns voice message details if an audio message is found.
 */
export function extractVoiceMessageFromWebhook(payload: unknown): ExtractedVoiceMessage | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const raw = payload as Record<string, unknown>;
  const entry = Array.isArray(raw.entry) ? raw.entry[0] : null;
  const entryObj = entry as Record<string, unknown>;
  const changes = Array.isArray(entryObj.changes) ? (entryObj.changes as unknown[])[0] : null;
  if (!changes || typeof changes !== 'object') return null;

  const changesObj = changes as Record<string, unknown>;
  const value = changesObj.value as Record<string, unknown> | undefined;
  if (!value || typeof value !== 'object') return null;

  const messages = Array.isArray(value.messages) ? value.messages : [];
  if (messages.length === 0) return null;

  const msg = messages[0] as WhatsAppWebhookMessage;
  if (msg.type === 'audio' || msg.type === 'voice') {
    const audioData = msg.audio;
    if (audioData?.id) {
      return {
        senderNumber: msg.from,
        messageId: msg.id,
        timestamp: parseInt(msg.timestamp, 10) * 1000 || Date.now(),
        audioMediaId: audioData.id,
        mimeType: audioData.mime_type || 'audio/ogg',
      };
    }
  }

  return null;
}

/**
 * Creates the official WhatsApp Cloud API POST body for sending a text message
 */
export function buildWhatsAppTextMessage(to: string, text: string) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: {
      preview_url: false,
      body: text,
    },
  };
}

/**
 * Formats transcription text for WhatsApp reply with user-friendly metadata
 */
export function formatTranscriptionMessage(
  transcription: string,
  options?: {
    durationSeconds?: number;
    delaySeconds?: number;
    language?: string;
  }
): string {
  const cleanText = transcription.trim();
  const durationStr = options?.durationSeconds 
    ? ` (${Math.round(options.durationSeconds)} שנ')` 
    : '';

  return `🎙️ *תמלול הודעה קולית${durationStr}:*\n\n"${cleanText}"\n\n_⏱️ נשלח בעיכוב של ${options?.delaySeconds ?? 10} שניות_`;
}
