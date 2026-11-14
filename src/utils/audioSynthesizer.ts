/**
 * Utility to generate audible synthesized speech or audio beeps for demo voice notes
 * using the browser's Web Audio API and SpeechSynthesis API.
 */

export function playDemoAudio(text: string, onEnded?: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  // Check if browser SpeechSynthesis is available
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'he-IL';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onend = () => {
      if (onEnded) onEnded();
    };
    utterance.onerror = () => {
      fallbackTone(onEnded);
    };

    window.speechSynthesis.speak(utterance);

    return () => {
      window.speechSynthesis.cancel();
    };
  }

  return fallbackTone(onEnded);
}

function fallbackTone(onEnded?: () => void): () => void {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 1.5);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.8);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 1.8);

    const timer = setTimeout(() => {
      ctx.close();
      if (onEnded) onEnded();
    }, 1800);

    return () => {
      clearTimeout(timer);
      try {
        osc.stop();
        ctx.close();
      } catch {}
    };
  } catch {
    const timer = setTimeout(() => {
      if (onEnded) onEnded();
    }, 2000);
    return () => clearTimeout(timer);
  }
}
