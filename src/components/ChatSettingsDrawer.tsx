import React, { useState } from 'react';
import {
  X,
  Mic,
  MicOff,
  Phone,
  Users,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { WhatsAppChat } from '../utils/chatStore';

interface ChatSettingsDrawerProps {
  chat: WhatsAppChat | null;
  isOpen: boolean;
  onClose: () => void;
  onToggleTranscription: (jid: string, enabled: boolean) => Promise<void>;
}

export const ChatSettingsDrawer: React.FC<ChatSettingsDrawerProps> = ({
  chat,
  isOpen,
  onClose,
  onToggleTranscription,
}) => {
  const [isUpdating, setIsUpdating] = useState(false);

  if (!isOpen || !chat) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="w-full max-w-md bg-[#111b21] border-r border-[#2a3942] h-full flex flex-col shadow-2xl animate-slideLeft">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#202c33] border-b border-[#313d45]">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-bold text-[#e9edef]">פרטי שיחה והגדרות בוט</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="סגור הגדרות שיחה"
            className="p-1.5 text-[#8696a0] hover:text-[#e9edef] hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-sm text-[#e9edef]">
          {/* Contact Header Card */}
          <div className="p-4 rounded-2xl bg-[#202c33] border border-[#2a3942] flex flex-col items-center text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-[#00a884]/20 border border-[#00a884]/40 flex items-center justify-center text-3xl shadow-md">
              {chat.avatar || (chat.isGroup ? '👥' : '👤')}
            </div>
            <div>
              <h3 className="font-bold text-base text-[#e9edef]">{chat.name}</h3>
              <p className="text-xs text-[#8696a0] font-mono mt-0.5" dir="ltr">
                {chat.phoneNumber || (chat.isGroup ? 'קבוצת וואטסאפ' : chat.id.replace(/@.+/, ''))}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] bg-[#111b21] px-2.5 py-1 rounded-full border border-[#313d45]">
              {chat.isGroup ? (
                <>
                  <Users className="w-3.5 h-3.5 text-[#53bdeb]" />
                  <span className="text-[#aebac1]">קבוצה</span>
                </>
              ) : (
                <>
                  <Phone className="w-3.5 h-3.5 text-[#00a884]" />
                  <span className="text-[#aebac1]">שיחה פרטית (1:1)</span>
                </>
              )}
            </div>
          </div>

          {/* MAIN FEATURE: Per-Chat Voice Transcription Toggle */}
          <div className="p-4 rounded-2xl bg-[#202c33] border border-[#2a3942] space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="font-bold text-sm text-[#e9edef] flex items-center gap-1.5">
                  {chat.transcriptionEnabled ? (
                    <Mic className="w-4 h-4 text-[#00a884]" />
                  ) : (
                    <MicOff className="w-4 h-4 text-red-400" />
                  )}
                  תמלול הודעות קוליות בשיחה זו
                </span>
                <p className="text-xs text-[#8696a0] leading-relaxed">
                  הפעל או השבת את מענה הבוט להקלטות קוליות הנשלחות בשיחה זו.
                </p>
              </div>

              {/* Accessible switch toggle button */}
              <button
                type="button"
                role="switch"
                aria-checked={chat.transcriptionEnabled}
                aria-label="הפעל או השבת תמלול אוטומטי להודעות קוליות בשיחה זו"
                onClick={async () => {
                  setIsUpdating(true);
                  try {
                    await onToggleTranscription(chat.id, !chat.transcriptionEnabled);
                  } finally {
                    setIsUpdating(false);
                  }
                }}
                disabled={isUpdating}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  chat.transcriptionEnabled ? 'bg-[#00a884]' : 'bg-[#374248]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    chat.transcriptionEnabled ? 'translate-x-0 rtl:-translate-x-5' : 'translate-x-5 rtl:translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Status explanation */}
            {chat.transcriptionEnabled ? (
              <div className="p-3 rounded-xl bg-[#00a884]/15 border border-[#00a884]/30 space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-[#25d366]">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>תמלול אוטומטי מופעל</span>
                </div>
                <p className="text-[11px] text-[#aebac1] leading-relaxed">
                  כל הודעה קולית שתישלח בשיחה זו תתומלל אוטומטית באמצעות Gemini AI ותיענה כעבור 10 שניות בדיוק.
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-red-400">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>תמלול אוטומטי מבוטל לשיחה זו</span>
                </div>
                <p className="text-[11px] text-[#aebac1] leading-relaxed">
                  הודעות קוליות שיתקבלו בשיחה זו יושמעו כרגיל אך לא יתומללו והבוט לא יגיב עליהן.
                </p>
              </div>
            )}
          </div>

          {/* General Information */}
          <div className="p-4 rounded-2xl bg-[#202c33]/50 border border-[#2a3942] text-xs space-y-2 text-[#8696a0]">
            <div className="flex items-center justify-between">
              <span>מזהה צ'אט (JID):</span>
              <span className="font-mono text-[#d1d7db] text-[11px] truncate max-w-[200px]" dir="ltr">
                {chat.id}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>הודעות בשיחה:</span>
              <span className="font-mono text-[#d1d7db]">{chat.messages.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>זמן עיכוב כללי:</span>
              <span className="font-mono text-[#00a884] font-bold">10 שניות</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
