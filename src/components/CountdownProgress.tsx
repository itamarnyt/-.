import React from 'react';
import { Clock, Sparkles, CheckCircle2, FastForward } from 'lucide-react';

interface CountdownProgressProps {
  remainingSeconds: number;
  totalSeconds?: number;
  isCompleted?: boolean;
  onInstantSend?: () => void;
}

export const CountdownProgress: React.FC<CountdownProgressProps> = ({
  remainingSeconds,
  totalSeconds = 10,
  isCompleted = false,
  onInstantSend,
}) => {
  const progressPercent = Math.min(
    100,
    Math.max(0, ((totalSeconds - remainingSeconds) / totalSeconds) * 100)
  );

  if (isCompleted) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#00a884]/15 border border-[#00a884]/30 text-[#25d366] text-xs font-medium animate-fadeIn">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span>התמלול נשלח לאחר עיכוב מוגדר של {totalSeconds} שניות</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3 rounded-xl bg-[#182229] border border-[#00a884]/40 shadow-lg text-[#e9edef] my-1 max-w-[340px] animate-fadeIn">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center">
            {/* Animated pulsing spinner */}
            <span className="w-3 h-3 rounded-full bg-[#00a884] animate-ping absolute opacity-75"></span>
            <Clock className="w-4 h-4 text-[#00a884] relative z-10" />
          </div>
          <span className="text-xs font-semibold text-[#00a884] flex items-center gap-1.5">
            הבוט מעבד... שולח תמלול בעוד {remainingSeconds} שניות
            <Sparkles className="w-3 h-3 text-amber-400 inline" />
          </span>
        </div>

        {onInstantSend && (
          <button
            onClick={onInstantSend}
            className="text-[11px] text-[#00a884] hover:text-[#25d366] hover:underline flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#00a884]/10 transition-colors"
            title="שלח תמלול מיד בלי להמתין"
          >
            <FastForward className="w-3 h-3" />
            <span>דלג</span>
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-[#2a3942] h-2 rounded-full overflow-hidden relative">
        <div
          className="h-full bg-gradient-to-r from-[#00a884] to-[#25d366] rounded-full transition-all duration-300 ease-linear"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* WhatsApp Typing indicator status */}
      <div className="flex items-center justify-between text-[11px] text-[#8696a0]">
        <div className="flex items-center gap-1.5">
          <span>הבוט מקליד</span>
          <span className="inline-flex gap-1 items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00a884] animate-bounce [animation-delay:-0.3s]"></span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#00a884] animate-bounce [animation-delay:-0.15s]"></span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#00a884] animate-bounce"></span>
          </span>
        </div>
        <span className="font-mono text-[#aebac1]">
          {remainingSeconds > 0 ? `00:0${remainingSeconds}` : '00:00'}
        </span>
      </div>
    </div>
  );
};
