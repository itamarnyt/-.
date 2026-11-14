import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractVoiceMessageFromWebhook,
  buildWhatsAppTextMessage,
  formatTranscriptionMessage,
} from './whatsappParser.ts';

test('extractVoiceMessageFromWebhook extracts audio message correctly', () => {
  const sampleMetaPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123456789',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550001234',
                phone_number_id: '987654321',
              },
              contacts: [{ profile: { name: 'Yossi' }, wa_id: '972540000000' }],
              messages: [
                {
                  from: '972540000000',
                  id: 'wamid.HBgMOTcyNTQwMDAwMDAwFQIAEhgWM0VCMDAwMDAwMDAwMDAwMDAwMDAAA',
                  timestamp: '1700000000',
                  type: 'audio',
                  audio: {
                    mime_type: 'audio/ogg; codecs=opus',
                    sha256: 'abc123sha',
                    id: 'media_id_audio_9999',
                  },
                },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  };

  const extracted = extractVoiceMessageFromWebhook(sampleMetaPayload);
  assert.ok(extracted);
  assert.equal(extracted.senderNumber, '972540000000');
  assert.equal(extracted.audioMediaId, 'media_id_audio_9999');
  assert.equal(extracted.mimeType, 'audio/ogg; codecs=opus');
});

test('extractVoiceMessageFromWebhook returns null for text messages', () => {
  const textPayload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from: '972540000000',
                  id: 'msg_1',
                  timestamp: '1700000000',
                  type: 'text',
                  text: { body: 'שלום' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const extracted = extractVoiceMessageFromWebhook(textPayload);
  assert.equal(extracted, null);
});

test('buildWhatsAppTextMessage constructs valid WhatsApp Cloud API request body', () => {
  const body = buildWhatsAppTextMessage('972540000000', 'שלום, הנה התמלול');
  assert.equal(body.messaging_product, 'whatsapp');
  assert.equal(body.to, '972540000000');
  assert.equal(body.type, 'text');
  assert.equal(body.text.body, 'שלום, הנה התמלול');
});

test('formatTranscriptionMessage formats message with 10-second notice', () => {
  const formatted = formatTranscriptionMessage('שלום וברכה, מה שלומך?', {
    durationSeconds: 8,
    delaySeconds: 10,
  });

  assert.match(formatted, /תמלול הודעה קולית \(8 שנ'\)/);
  assert.match(formatted, /"שלום וברכה, מה שלומך\?"/);
  assert.match(formatted, /עיכוב של 10 שניות/);
});
