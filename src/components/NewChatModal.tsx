import React, { useState } from 'react';
import { X, UserPlus, Phone, User, Send } from 'lucide-react';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateChat: (phoneNumber: string, name?: string) => Promise<void>;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({
  isOpen,
  onClose,
  onCreateChat,
}) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [contactName, setContactName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim()) return;

    setIsSubmitting(true);
    try {
      await onCreateChat(phoneNumber.trim(), contactName.trim() || undefined);
      setPhoneNumber('');
      setContactName('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fadeIn">
      <div className="bg-[#111b21] border border-[#2a3942] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#202c33] border-b border-[#313d45]">
          <div className="flex items-center gap-2.5">
            <UserPlus className="w-5 h-5 text-[#00a884]" />
            <h2 className="text-base font-bold text-[#e9edef]">פתיחת שיחה חדשה בוואטסאפ</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="סגור חלון"
            className="p-1.5 text-[#8696a0] hover:text-[#e9edef] hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-sm text-[#e9edef]">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#8696a0] flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-[#00a884]" />
              <span>מספר טלפון (כולל קידומת):</span>
            </label>
            <input
              type="tel"
              required
              placeholder="050-1234567 או 972501234567"
              dir="ltr"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="w-full bg-[#202c33] border border-[#313d45] rounded-xl px-3.5 py-2.5 text-sm font-mono text-white outline-none focus:border-[#00a884]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#8696a0] flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#53bdeb]" />
              <span>שם איש הקשר (אופציונלי):</span>
            </label>
            <input
              type="text"
              placeholder="למשל: דני כהן"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="w-full bg-[#202c33] border border-[#313d45] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#00a884]"
            />
          </div>

          <p className="text-xs text-[#8696a0] leading-relaxed">
            השיחה תתווסף לרשימת השיחות שלך בוואטסאפ. תוכל לשלוח הודעות טקסט והודעות קוליות, ולקבוע האם תמלול הבוט יפעל בה.
          </p>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-[#202c33] hover:bg-[#2a3942] text-[#d1d7db] text-xs font-semibold transition-colors border border-[#313d45]"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !phoneNumber.trim()}
              className="flex-1 py-2.5 rounded-xl bg-[#00a884] hover:bg-[#008f6f] text-white text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'פותח שיחה...' : 'פתח שיחה'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
