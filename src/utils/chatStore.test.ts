import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPhoneNumber,
  isTranscriptionEnabledForChat,
  sortChatsByRecent,
  createTextMessage,
  createVoiceMessage,
  isPairedAuthCreds,
  shouldClearIncompleteAuthCreds,
  WhatsAppChat,
} from './chatStore.ts';

test('formatPhoneNumber formats Israeli numbers with hyphens', () => {
  assert.equal(formatPhoneNumber('972501234567@s.whatsapp.net'), '050-123-4567');
  assert.equal(formatPhoneNumber('972529876543'), '052-987-6543');
});

test('isTranscriptionEnabledForChat respects per-chat disabled list', () => {
  const disabled = new Set(['chat_123', 'group_456']);

  // Chat not in disabled set -> enabled
  assert.equal(isTranscriptionEnabledForChat('chat_789', disabled, true), true);

  // Chat in disabled set -> disabled
  assert.equal(isTranscriptionEnabledForChat('chat_123', disabled, true), false);
  assert.equal(isTranscriptionEnabledForChat('group_456', disabled, true), false);

  // Global disabled overrides everything
  assert.equal(isTranscriptionEnabledForChat('chat_789', disabled, false), false);
});

test('sortChatsByRecent puts newest message on top', () => {
  const chats: WhatsAppChat[] = [
    {
      id: 'c1',
      name: 'דוד',
      isGroup: false,
      lastMessageText: 'שלום',
      lastMessageTimestamp: 1000,
      unreadCount: 0,
      transcriptionEnabled: true,
      messages: [],
    },
    {
      id: 'c2',
      name: 'יוסי',
      isGroup: false,
      lastMessageText: 'מה קורה',
      lastMessageTimestamp: 3000,
      unreadCount: 0,
      transcriptionEnabled: true,
      messages: [],
    },
    {
      id: 'c3',
      name: 'משפחה',
      isGroup: true,
      lastMessageText: 'הודעה קולית',
      lastMessageTimestamp: 2000,
      unreadCount: 0,
      transcriptionEnabled: false,
      messages: [],
    },
  ];

  const sorted = sortChatsByRecent(chats);
  assert.equal(sorted[0].id, 'c2'); // timestamp 3000
  assert.equal(sorted[1].id, 'c3'); // timestamp 2000
  assert.equal(sorted[2].id, 'c1'); // timestamp 1000
});

test('createTextMessage creates valid message with read status if from me', () => {
  const msg = createTextMessage({
    fromMe: true,
    sender: 'me',
    text: 'שלום!',
  });
  assert.equal(msg.fromMe, true);
  assert.equal(msg.text, 'שלום!');
  assert.equal(msg.status, 'read');
});

test('createVoiceMessage creates audio message with duration', () => {
  const vMsg = createVoiceMessage({
    fromMe: false,
    sender: '0501234567',
    audioDuration: 8,
  });
  assert.equal(vMsg.isAudio, true);
  assert.equal(vMsg.audioDuration, 8);
  assert.equal(vMsg.fromMe, false);
});

test('auth creds helpers preserve QR pair-success creds across 515 restart and clear only drafts', () => {
  // Fresh empty creds
  assert.equal(isPairedAuthCreds({ registered: false }), false);
  assert.equal(shouldClearIncompleteAuthCreds({ registered: false }), false);

  // Incomplete pairing code draft (me exists, no account, registered false)
  const draft = { registered: false, me: { id: '972559707899@s.whatsapp.net', name: '~' } };
  assert.equal(isPairedAuthCreds(draft), false);
  assert.equal(shouldClearIncompleteAuthCreds(draft), true);

  // Immediately after QR pair-success (account + me exist, registered still false prior to 515 login)
  const postPairSuccess = {
    registered: false,
    me: { id: '972559707899:49@s.whatsapp.net', lid: '123@lid' },
    account: { details: 'signed' },
  };
  assert.equal(isPairedAuthCreds(postPairSuccess), true);
  assert.equal(shouldClearIncompleteAuthCreds(postPairSuccess), false);

  // Fully registered
  const fullyRegistered = { registered: true, me: { id: '972559707899:49@s.whatsapp.net' }, account: {} };
  assert.equal(isPairedAuthCreds(fullyRegistered), true);
  assert.equal(shouldClearIncompleteAuthCreds(fullyRegistered), false);
});
