import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import {
  extractVoiceMessageFromWebhook,
  buildWhatsAppTextMessage,
  formatTranscriptionMessage,
} from './src/utils/whatsappParser.ts';
import {
  createQueuedItem,
  QueuedVoiceNote,
  DEFAULT_DELAY_SECONDS,
} from './src/utils/timerQueue.ts';
import { personalBotService } from './src/services/whatsappPersonalBot.ts';
import { healthCheckBot } from './src/services/healthCheckBot.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProd = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize GoogleGenAI client (Server-Side only)
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// In-memory state for bot activity & webhook queue
interface WebhookLog {
  id: string;
  timestamp: string;
  type: 'incoming_webhook' | 'transcription_scheduled' | 'delayed_sending' | 'outgoing_whatsapp' | 'error';
  sender: string;
  details: string;
  payload?: unknown;
}

const webhookLogs: WebhookLog[] = [];
const queueMap = new Map<string, QueuedVoiceNote>();
let totalTranscriptionsCount = 0;

function addLog(log: Omit<WebhookLog, 'id' | 'timestamp'>) {
  const newLog: WebhookLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toLocaleTimeString('he-IL', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    ...log,
  };
  webhookLogs.unshift(newLog);
  if (webhookLogs.length > 100) webhookLogs.pop();
  return newLog;
}

/**
 * Transcribes audio buffer / base64 using Gemini AI (no fake fallback)
 */
async function transcribeAudioWithGemini(
  audioBase64: string,
  mimeType: string,
  contextPrompt = 'Transcribe this voice message accurately in its spoken language (usually Hebrew or English). Return only the spoken text.'
): Promise<string> {
  if (!ai) {
    throw new Error('מפתח GEMINI_API_KEY אינו מוגדר בשרת — לא ניתן לבצע תמלול אמיתי.');
  }

  const cleanMime = mimeType.split(';')[0].trim() || 'audio/webm';

  try {
    // Primary: gemini-3.5-transcribe
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: cleanMime,
              data: audioBase64,
            },
          },
          {
            text: `${contextPrompt} Please transcribe every word faithfully. Output only the transcription without commentary.`,
          },
        ],
      },
    });

    const result = response.text?.trim();
    if (result) return result;
  } catch (err: unknown) {
    console.warn('gemini-3.5-transcribe error, trying gemini-4-hydrogen:', err);
  }

  // Secondary fallback: gemini-4-hydrogen
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: cleanMime,
            data: audioBase64,
          },
        },
        {
          text: `${contextPrompt} Transcribe the spoken audio accurately. Output plain text only.`,
        },
      ],
    },
  });

  const result = response.text?.trim();
  if (!result) {
    throw new Error('לא זוהה דיבור ברור בהקלטה.');
  }
  return result;
}

// ================= API ROUTES =================

/**
 * POST /api/transcribe: Transcribes audio file immediately
 */
app.post('/api/transcribe', async (req, res) => {
  try {
    const { audioBase64, mimeType, prompt } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: 'Missing audioBase64 in request body' });
    }

    const transcription = await transcribeAudioWithGemini(audioBase64, mimeType || 'audio/webm', prompt);
    res.json({ success: true, transcription });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown transcription error';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/transcribe-delayed: Handles 10-second delayed transcription
 * Receives the voice recording, begins transcribing in background,
 * and holds/schedules the response until the requested delay (default 10s).
 */
app.post('/api/transcribe-delayed', async (req, res) => {
  try {
    const {
      audioBase64,
      mimeType,
      sender = 'משתמש וואטסאפ',
      audioName = 'הודעה_קולית.ogg',
      audioDurationSeconds = 5,
      delaySeconds = DEFAULT_DELAY_SECONDS,
      customPrompt,
    } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: 'חסר קובץ שמע לתמלול (audioBase64)' });
    }

    const queuedItem = createQueuedItem({
      sender,
      audioName,
      audioDurationSeconds,
      delaySeconds: Number(delaySeconds) || DEFAULT_DELAY_SECONDS,
    });

    queuedItem.status = 'transcribing';
    queueMap.set(queuedItem.id, queuedItem);

    addLog({
      type: 'transcription_scheduled',
      sender,
      details: `התקבלה הודעה קולית (${audioDurationSeconds} שנ'). התמלול מתוזמן להישלח בעוד ${queuedItem.delaySeconds} שניות בדיוק.`,
      payload: { id: queuedItem.id, scheduledTime: new Date(queuedItem.scheduledSendTime).toISOString() },
    });

    const transcriptionText = await transcribeAudioWithGemini(
      audioBase64,
      mimeType || 'audio/webm',
      customPrompt
    );

    queuedItem.transcription = transcriptionText;
    queuedItem.status = 'waiting_timer';

    // Return the scheduled item immediately so frontend can display the 10-second countdown in real time!
    res.json({
      success: true,
      item: queuedItem,
    });

    // Set exact delay timer on the server as well
    const delayMs = queuedItem.delaySeconds * 1000;
    setTimeout(() => {
      queuedItem.status = 'sent';
      queuedItem.completedAt = Date.now();
      totalTranscriptionsCount++;

      const formatted = formatTranscriptionMessage(transcriptionText, {
        durationSeconds: audioDurationSeconds,
        delaySeconds: queuedItem.delaySeconds,
      });

      addLog({
        type: 'outgoing_whatsapp',
        sender,
        details: `חלפו ${queuedItem.delaySeconds} שניות: התמלול נשלח בהצלחה לוואטסאפ של ${sender}!`,
        payload: { transcription: transcriptionText, formattedMessage: formatted },
      });
    }, delayMs);

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/queue/:id: Check status of a delayed voice note
 */
app.get('/api/queue/:id', (req, res) => {
  const item = queueMap.get(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Item not found in queue' });
  }
  const now = Date.now();
  const remainingMs = Math.max(0, item.scheduledSendTime - now);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const isReady = item.status === 'sent' || remainingMs <= 0;

  res.json({
    item,
    remainingSeconds,
    isReady,
  });
});

/**
 * WhatsApp Cloud API Webhook: GET for Verification Challenge
 */
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'whatsapp_bot_token_secret_123';

app.get('/api/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('WhatsApp Webhook verified successfully!');
    return res.status(200).send(challenge);
  }
  res.status(403).send('Verification failed');
});

/**
 * WhatsApp Cloud API Webhook: POST for Incoming Messages
 */
app.post('/api/whatsapp/webhook', async (req, res) => {
  try {
    const payload = req.body;
    addLog({
      type: 'incoming_webhook',
      sender: 'Meta WhatsApp Cloud API',
      details: 'התקבל אירוע Webhook חדש מחשבון וואטסאפ עסקי',
      payload,
    });

    const voiceData = extractVoiceMessageFromWebhook(payload);
    if (voiceData) {
      addLog({
        type: 'transcription_scheduled',
        sender: voiceData.senderNumber,
        details: `זוהתה הודעה קולית ב-Cloud API (Media ID: ${voiceData.audioMediaId}).`,
      });
    }

    res.status(200).send('EVENT_RECEIVED');
  } catch (err: unknown) {
    console.error('Webhook processing error:', err);
    res.status(500).send('ERROR');
  }
});

/**
 * GET /api/bot/status
 */
app.get('/api/bot/status', (req, res) => {
  res.json({
    active: true,
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    defaultDelaySeconds: DEFAULT_DELAY_SECONDS,
    totalProcessed: totalTranscriptionsCount,
    activeQueueCount: Array.from(queueMap.values()).filter(q => q.status !== 'sent').length,
    verifyToken: VERIFY_TOKEN,
  });
});

/**
 * GET /api/bot/logs
 */
app.get('/api/bot/logs', (req, res) => {
  res.json({ logs: webhookLogs });
});

// Hook up Gemini transcription to personal bot
personalBotService.setTranscriber(async (base64, mimeType) => {
  return transcribeAudioWithGemini(base64, mimeType);
});

// Configure health check bot
healthCheckBot.setGeminiTester(async () => {
  return Boolean(process.env.GEMINI_API_KEY || ai);
});

/**
 * GET /api/health-check/status: Returns hourly health status and latest report
 */
app.get('/api/health-check/status', (req, res) => {
  res.json(healthCheckBot.getStatus());
});

/**
 * POST /api/health-check/run: Manually triggers an immediate diagnostic check
 */
app.post('/api/health-check/run', async (req, res) => {
  const report = await healthCheckBot.runCheck('בדיקה יזומה מהממשק');
  res.json({ success: true, report });
});

/**
 * GET /api/personal-bot/status: Status, QR code Data URL, pairing code, settings, and activity logs
 */
app.get('/api/personal-bot/status', (req, res) => {
  res.json(personalBotService.getStatus());
});

/**
 * POST /api/personal-bot/connect: Initiates WhatsApp Web multi-device connection or requests pairing code
 */
app.post('/api/personal-bot/connect', async (req, res) => {
  try {
    const { phoneNumber } = req.body || {};
    if (phoneNumber && typeof phoneNumber === 'string' && phoneNumber.trim()) {
      const pairingCode = await personalBotService.requestPairingCodeDirect(phoneNumber);
      return res.json({ success: true, pairingCode, message: 'הופק קוד קישור לטלפון' });
    }
    await personalBotService.startConnection({ resetQrAttempts: true });
    res.json({ success: true, message: 'החיבור לוואטסאפ הופעל' });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/personal-bot/reset: Purges corrupt session and generates a fresh clean QR code
 */
app.post('/api/personal-bot/reset', async (req, res) => {
  try {
    await personalBotService.resetConnection();
    res.json({ success: true, message: 'החיבור אופס לחלוטין. קוד חדש מופק כעת.' });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/personal-bot/request-pairing-code: Direct generation of 8-character phone pairing code
 */
app.post('/api/personal-bot/request-pairing-code', async (req, res) => {
  try {
    const { phoneNumber } = req.body || {};
    if (!phoneNumber) {
      return res.status(400).json({ error: 'חסר מספר טלפון' });
    }
    const pairingCode = await personalBotService.requestPairingCodeDirect(phoneNumber);
    res.json({ success: true, pairingCode });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'שגיאה בהפקת קוד קישור';
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/personal-bot/disconnect: Logs out and resets session
 */
app.post('/api/personal-bot/disconnect', async (req, res) => {
  try {
    await personalBotService.disconnect();
    res.json({ success: true, message: 'החשבון נותק בהצלחה' });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/personal-bot/settings: Updates personal bot settings
 */
app.post('/api/personal-bot/settings', (req, res) => {
  const updated = personalBotService.updateSettings(req.body);
  res.json({ success: true, settings: updated });
});

/**
 * GET /api/personal-bot/chats: Returns all chats with their metadata and transcription status
 */
app.get('/api/personal-bot/chats', (req, res) => {
  res.json({ chats: personalBotService.getChats() });
});

/**
 * POST /api/personal-bot/clear-chats: Resets and clears all chats
 */
app.post('/api/personal-bot/clear-chats', (req, res) => {
  personalBotService.clearChats();
  res.json({ success: true, message: 'הצ\'אטים נוקו' });
});

/**
 * GET /api/personal-bot/chats/:jid: Returns specific chat and messages
 */
app.get('/api/personal-bot/chats/:jid', (req, res) => {
  const chat = personalBotService.getChat(req.params.jid);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  res.json({ chat });
});

/**
 * POST /api/personal-bot/chats/:jid/toggle-transcription: Toggles voice transcription for a specific chat
 */
app.post('/api/personal-bot/chats/:jid/toggle-transcription', (req, res) => {
  const { enabled } = req.body;
  const isEnabled = personalBotService.toggleChatTranscription(req.params.jid, Boolean(enabled));
  res.json({ success: true, jid: req.params.jid, transcriptionEnabled: isEnabled });
});

/**
 * POST /api/personal-bot/chats/:jid/send-message: Sends a text message to a chat
 */
app.post('/api/personal-bot/chats/:jid/send-message', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Missing text in body' });
    }
    const message = await personalBotService.sendTextMessage(req.params.jid, text.trim());
    res.json({ success: true, message });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Send error';
    const statusCode = msg.includes('אינו מחובר') ? 409 : 500;
    res.status(statusCode).json({ error: msg });
  }
});

/**
 * POST /api/personal-bot/chats/:jid/send-voice: Sends a real voice note (PTT) through WhatsApp
 */
app.post('/api/personal-bot/chats/:jid/send-voice', async (req, res) => {
  try {
    const { audioBase64, mimeType, durationSeconds = 5 } = req.body || {};
    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return res.status(400).json({ error: 'Missing audioBase64 in body' });
    }
    const buffer = Buffer.from(audioBase64, 'base64');
    const message = await personalBotService.sendVoiceMessage(
      req.params.jid,
      buffer,
      mimeType || 'audio/ogg; codecs=opus',
      Number(durationSeconds) || 5
    );
    res.json({ success: true, message });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Voice send error';
    const statusCode = msg.includes('אינו מחובר') ? 409 : 500;
    res.status(statusCode).json({ error: msg });
  }
});

/**
 * GET /api/personal-bot/media/:msgId: Streams real WhatsApp audio buffers cached by the bot
 */
app.get('/api/personal-bot/media/:msgId', (req, res) => {
  const media = personalBotService.getMedia(req.params.msgId);
  if (!media) {
    return res.status(404).json({ error: 'Media not found' });
  }
  res.setHeader('Content-Type', media.mimeType || 'audio/ogg');
  res.setHeader('Content-Length', media.buffer.length.toString());
  res.send(media.buffer);
});

/**
 * POST /api/personal-bot/chats/new: Opens a new chat with a phone number
 */
app.post('/api/personal-bot/chats/new', (req, res) => {
  const { phoneNumber, name } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: 'Missing phoneNumber' });
  const chat = personalBotService.createNewChat(phoneNumber, name);
  res.json({ success: true, chat });
});

// ================= FRONTEND SERVING =================
async function startServer() {
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`WhatsApp Transcribe Bot Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
