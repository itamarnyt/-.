import React from 'react';
import { X, Sliders, RotateCcw, Clock, Volume2, Shield } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  delaySeconds: number;
  setDelaySeconds: (sec: number) => void;
  autoPlayAudio: boolean;
  setAutoPlayAudio: (enabled: boolean) => void;
  onClearHistory: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  delaySeconds,
  setDelaySeconds,
  autoPlayAudio,
  setAutoPlayAudio,
  onClearHistory,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#111b21] border border-[#2a3942] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#202c33] border-b border-[#313d45]">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-[#00a884]" />
            <h2 className="text-base font-bold text-[#e9edef]">הגדרות בוט התמלול</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="סגור הגדרות"
            className="p-1.5 text-[#8696a0] hover:text-[#e9edef] hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 text-sm text-[#e9edef]">
          {/* Delay Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#00a884]" />
                <span>זמן עיכוב לפני שליחת התמלול:</span>
              </label>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[#00a884]/20 text-[#25d366]">
                {delaySeconds} שניות
              </span>
            </div>
            <input
              type="range"
              min={3}
              max={30}
              step={1}
              value={delaySeconds}
              onChange={(e) => setDelaySeconds(Number(e.target.value))}
              className="w-full accent-[#00a884] cursor-pointer"
            />
            <p className="text-xs text-[#8696a0]">
              ברירת המחדל לפי הדרישה היא <strong>10 שניות בדיוק</strong>. ניתן לשנות לצורך בדיקה.
            </p>
          </div>

          {/* Auto read aloud */}
          <div className="flex items-center justify-between pt-2 border-t border-[#2a3942]">
            <div className="space-y-0.5">
              <label className="font-semibold flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-[#53bdeb]" />
                <span>הקראת תמלול קולית אוטומטית</span>
              </label>
              <p className="text-xs text-[#8696a0]">השמעת התמלול שהתקבל בדיבור עברי</p>
            </div>
            <input
              type="checkbox"
              checked={autoPlayAudio}
              onChange={(e) => setAutoPlayAudio(e.target.checked)}
              className="w-4 h-4 accent-[#00a884] rounded cursor-pointer"
            />
          </div>

          {/* AI Model Badge */}
          <div className="p-3 rounded-xl bg-[#202c33] border border-[#2a3942] flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#00a884]" />
              <span>מנוע תמלול AI:</span>
            </div>
            <span className="font-mono text-[#00a884] font-semibold">Gemini 3.5 Transcribe</span>
          </div>

          {/* Clear chat */}
          <div className="pt-2 border-t border-[#2a3942]">
            <button
              onClick={() => {
                onClearHistory();
                onClose();
              }}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors border border-red-500/20"
            >
              <RotateCcw className="w-4 h-4" />
              <span>נקה היסטוריית שיחה</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
