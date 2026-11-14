/**
 * Timer and queue management for scheduling transcription delivery
 * with a precise 10-second delay rule.
 */

export interface QueuedVoiceNote {
  id: string;
  sender: string;
  audioName: string;
  audioDurationSeconds?: number;
  receivedAt: number; // timestamp ms
  scheduledSendTime: number; // timestamp ms (receivedAt + delayMs)
  delaySeconds: number; // default 10 seconds
  status: 'received' | 'transcribing' | 'waiting_timer' | 'sent' | 'failed';
  transcription?: string;
  error?: string;
  completedAt?: number;
}

export const DEFAULT_DELAY_SECONDS = 10;

/**
 * Calculates remaining time in milliseconds and seconds
 */
export function calculateRemainingDelay(scheduledSendTime: number, now = Date.now()): {
  remainingMs: number;
  remainingSeconds: number;
  isReady: boolean;
  progressPercent: number; // 0 to 100
} {
  const remainingMs = Math.max(0, scheduledSendTime - now);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const isReady = remainingMs <= 0;
  
  return {
    remainingMs,
    remainingSeconds,
    isReady,
    progressPercent: 0,
  };
}

/**
 * Calculates progress percentage (0% when received, 100% when delay elapsed)
 */
export function calculateDelayProgress(
  receivedAt: number,
  scheduledSendTime: number,
  now = Date.now()
): number {
  const total = scheduledSendTime - receivedAt;
  if (total <= 0) return 100;
  const elapsed = now - receivedAt;
  const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
  return Math.round(pct);
}

/**
 * Creates a queued voice item scheduled for exact delay (default 10s)
 */
export function createQueuedItem(params: {
  id?: string;
  sender: string;
  audioName: string;
  audioDurationSeconds?: number;
  delaySeconds?: number;
  now?: number;
}): QueuedVoiceNote {
  const now = params.now ?? Date.now();
  const delaySec = params.delaySeconds ?? DEFAULT_DELAY_SECONDS;
  const scheduledTime = now + delaySec * 1000;

  return {
    id: params.id ?? `vn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    sender: params.sender,
    audioName: params.audioName,
    audioDurationSeconds: params.audioDurationSeconds,
    receivedAt: now,
    scheduledSendTime: scheduledTime,
    delaySeconds: delaySec,
    status: 'received',
  };
}
