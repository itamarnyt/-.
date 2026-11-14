import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  Send,
  Terminal,
  ExternalLink,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface WebhookModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: Array<{
    id: string;
    timestamp: string;
    type: string;
    sender: string;
    details: string;
    payload?: unknown;
  }>;
  onSimulateWebhook: (duration: number) => Promise<void>;
}

export const WebhookModal: React.FC<WebhookModalProps> = ({
  isOpen,
  onClose,
  logs,
  onSimulateWebhook,
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationDuration, setSimulationDuration] = useState(7);
  const [activeTab, setActiveTab] = useState<'setup' | 'logs' | 'simulator'>('setup');

  if (!isOpen) return null;

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const webhookUrl = `${currentOrigin}/api/whatsapp/webhook`;
  const verifyToken = 'whatsapp_bot_token_secret_123';

  const handleCopy = (text: string, type: 'url' | 'token') => {
    navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  const runSimulation = async () => {
    setIsSimulating(true);
    try {
      await onSimulateWebhook(simulationDuration);
    } finally {
      setIsSimulating(false);
      setActiveTab('logs');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#111b21] border border-[#2a3942] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#202c33] border-b border-[#313d45]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#00a884]/20 text-[#00a884]">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#e9edef]">חיבור והגדרת WhatsApp Cloud API</h2>
              <p className="text-xs text-[#8696a0]">
                מדריך אינטגרציה מלא עם Meta Webhook וסימולטור אירועים בזמן אמת
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="סגור חלון"
            className="p-1.5 text-[#8696a0] hover:text-[#e9edef] hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-[#2a3942] bg-[#111b21] px-6 text-sm font-medium">
          <button
            onClick={() => setActiveTab('setup')}
            className={`py-3 px-4 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'setup'
                ? 'border-[#00a884] text-[#00a884]'
                : 'border-transparent text-[#8696a0] hover:text-[#d1d7db]'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>כתובות והגדרות Webhook</span>
          </button>
          <button
            onClick={() => setActiveTab('simulator')}
            className={`py-3 px-4 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'simulator'
                ? 'border-[#00a884] text-[#00a884]'
                : 'border-transparent text-[#8696a0] hover:text-[#d1d7db]'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>סימולטור הודעות Webhook</span>
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`py-3 px-4 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'logs'
                ? 'border-[#00a884] text-[#00a884]'
                : 'border-transparent text-[#8696a0] hover:text-[#d1d7db]'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>יומן אירועים ו-Logs ({logs.length})</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'setup' && (
            <div className="space-y-5">
              {/* Box 1: Webhook URL */}
              <div className="p-4 rounded-xl bg-[#202c33] border border-[#2a3942] space-y-2">
                <label className="text-xs font-semibold text-[#8696a0] block">
                  Callback URL (להזנה ב-Meta for Developers):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={webhookUrl}
                    className="flex-1 bg-[#111b21] border border-[#313d45] rounded-lg px-3 py-2 text-xs font-mono text-[#00a884] select-all outline-none"
                  />
                  <button
                    onClick={() => handleCopy(webhookUrl, 'url')}
                    className="flex items-center gap-1 px-3 py-2 bg-[#00a884] hover:bg-[#008f6f] text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    {copiedUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedUrl ? 'הועתק!' : 'העתק'}</span>
                  </button>
                </div>
              </div>

              {/* Box 2: Verify Token */}
              <div className="p-4 rounded-xl bg-[#202c33] border border-[#2a3942] space-y-2">
                <label className="text-xs font-semibold text-[#8696a0] block">
                  Verify Token (אסימון אימות):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={verifyToken}
                    className="flex-1 bg-[#111b21] border border-[#313d45] rounded-lg px-3 py-2 text-xs font-mono text-[#e9edef] select-all outline-none"
                  />
                  <button
                    onClick={() => handleCopy(verifyToken, 'token')}
                    className="flex items-center gap-1 px-3 py-2 bg-[#2a3942] hover:bg-[#32444e] text-[#e9edef] rounded-lg text-xs font-medium transition-colors border border-[#374248]"
                  >
                    {copiedToken ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedToken ? 'הועתק!' : 'העתק'}</span>
                  </button>
                </div>
              </div>

              {/* Step-by-step instructions */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-[#e9edef] flex items-center gap-2">
                  <span>כיצד מחברים את הבוט למספר וואטסאפ אמיתי ב-Meta?</span>
                </h3>
                <ol className="list-decimal list-inside space-y-2 text-xs text-[#aebac1] leading-relaxed bg-[#202c33]/50 p-4 rounded-xl border border-[#2a3942]">
                  <li>
                    היכנס ל-
                    <a
                      href="https://developers.facebook.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#00a884] inline-flex items-center gap-0.5 mx-1 underline"
                    >
                      Meta for Developers <ExternalLink className="w-3 h-3" />
                    </a>
                    וצור אפליקציה מסוג <strong>Business</strong>.
                  </li>
                  <li>הוסף את המוצר <strong>WhatsApp</strong> לאפליקציה שלך.</li>
                  <li>
                    תחת תפריט <strong>Configuration / Webhooks</strong>, הדבק את ה-
                    <span className="font-mono text-white bg-black/40 px-1 rounded">Callback URL</span>
                    ואת ה-
                    <span className="font-mono text-white bg-black/40 px-1 rounded">Verify Token</span>
                    שלמעלה ולחץ על <strong>Verify and Save</strong>.
                  </li>
                  <li>
                    בחר להירשם לשדה <strong>messages</strong> (כדי לקבל אירועי הודעות קוליות).
                  </li>
                  <li>
                    זה הכל! כאשר משתמש ישלח הודעה קולית למספר הוואטסאפ שלכם, השרת יקלוט אותה,
                    יתמלל בעזרת Gemini, ימתין בדיוק 10 שניות ויחזיר את התמלול למשתמש!
                  </li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === 'simulator' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#202c33] border border-[#2a3942] space-y-3">
                <h3 className="text-sm font-bold text-[#e9edef]">
                  סימולציית הודעה קולית אמיתית מ-WhatsApp Cloud API
                </h3>
                <p className="text-xs text-[#8696a0] leading-relaxed">
                  בלחיצה אחת תוכל לשלוח אירוע Webhook מלא (מבנה JSON זהה בדיוק למבנה ש-Meta שולחת).
                  השרת יפעיל את תור ה-10 שניות, יבצע תמלול ויסמן את השליחה.
                </p>

                <div className="flex items-center gap-4 pt-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-[#8696a0]">אורך הקלטה בסימולציה:</label>
                    <select
                      value={simulationDuration}
                      onChange={(e) => setSimulationDuration(Number(e.target.value))}
                      className="bg-[#111b21] border border-[#313d45] rounded px-2 py-1 text-xs text-[#e9edef]"
                    >
                      <option value={5}>5 שניות</option>
                      <option value={8}>8 שניות</option>
                      <option value={15}>15 שניות</option>
                      <option value={30}>30 שניות</option>
                    </select>
                  </div>

                  <button
                    onClick={runSimulation}
                    disabled={isSimulating}
                    className="flex items-center gap-2 px-4 py-2 bg-[#00a884] hover:bg-[#008f6f] text-white rounded-lg text-xs font-semibold transition-all shadow-md active:scale-95 disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    <span>{isSimulating ? 'שולח אירוע Webhook...' : 'שלח אירוע לבדיקת עיכוב 10 שניות'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-[#8696a0]">
                <span>יומן אירועים חיים מהשרת:</span>
                <span>{logs.length} רשומות</span>
              </div>

              {logs.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#8696a0] bg-[#202c33]/40 rounded-xl border border-dashed border-[#2a3942]">
                  טרם התקבלו אירועי Webhook. שלח הודעה קולית בצ׳אט או הפעל את הסימולטור כדי לצפות ביומן.
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-lg bg-[#202c33] border border-[#2a3942] text-xs font-mono space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`font-semibold px-2 py-0.5 rounded text-[10px] ${
                            log.type === 'outgoing_whatsapp'
                              ? 'bg-[#00a884]/20 text-[#25d366]'
                              : log.type === 'transcription_scheduled'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-blue-500/20 text-blue-400'
                          }`}
                        >
                          {log.type === 'outgoing_whatsapp'
                            ? '✅ שליחה לוואטסאפ (10 שנ\')'
                            : log.type === 'transcription_scheduled'
                            ? '⏳ תוזמן עיכוב 10 שניות'
                            : '📥 קבלת Webhook'}
                        </span>
                        <span className="text-[#8696a0] text-[11px]">{log.timestamp}</span>
                      </div>
                      <p className="text-[#e9edef] font-sans text-xs pt-1">{log.details}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
