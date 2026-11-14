import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRemainingDelay,
  calculateDelayProgress,
  createQueuedItem,
  DEFAULT_DELAY_SECONDS,
} from './timerQueue.ts';

test('timerQueue default delay is exactly 10 seconds', () => {
  assert.equal(DEFAULT_DELAY_SECONDS, 10);
});

test('createQueuedItem sets scheduledSendTime to exactly 10 seconds in future', () => {
  const baseTime = 1700000000000;
  const item = createQueuedItem({
    sender: '+972501234567',
    audioName: 'voice_note_1.ogg',
    now: baseTime,
  });

  assert.equal(item.delaySeconds, 10);
  assert.equal(item.receivedAt, baseTime);
  assert.equal(item.scheduledSendTime, baseTime + 10000);
  assert.equal(item.status, 'received');
});

test('calculateRemainingDelay calculates countdown correctly', () => {
  const baseTime = 1000000;
  const scheduledTime = baseTime + 10000; // 10 seconds later

  // At 0 seconds (just received)
  const t0 = calculateRemainingDelay(scheduledTime, baseTime);
  assert.equal(t0.remainingSeconds, 10);
  assert.equal(t0.isReady, false);

  // At 4 seconds passed (6 seconds remaining)
  const t4 = calculateRemainingDelay(scheduledTime, baseTime + 4000);
  assert.equal(t4.remainingSeconds, 6);
  assert.equal(t4.isReady, false);

  // At 10 seconds passed (0 remaining, ready to send)
  const t10 = calculateRemainingDelay(scheduledTime, baseTime + 10000);
  assert.equal(t10.remainingSeconds, 0);
  assert.equal(t10.isReady, true);

  // After 10 seconds passed (overdue, ready to send)
  const t12 = calculateRemainingDelay(scheduledTime, baseTime + 12000);
  assert.equal(t12.remainingSeconds, 0);
  assert.equal(t12.isReady, true);
});

test('calculateDelayProgress returns percentage from 0 to 100', () => {
  const received = 100000;
  const scheduled = 110000; // 10 seconds total

  assert.equal(calculateDelayProgress(received, scheduled, 100000), 0);
  assert.equal(calculateDelayProgress(received, scheduled, 105000), 50);
  assert.equal(calculateDelayProgress(received, scheduled, 110000), 100);
  assert.equal(calculateDelayProgress(received, scheduled, 120000), 100);
});
