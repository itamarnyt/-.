import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Smartphone,
  QrCode,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LogOut,
  Sliders,
  Copy,
  Check,
  Clock,
  Phone,
  HelpCircle,
} from 'lucide-react';

interface PersonalAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ActivityEvent {
  id: string;
  timestamp: string;
  type: string;
  sender: string;
  details: string;
  audioDuration?: number;
  transcription?: string;
  delaySeconds?: number;
}

interface PersonalBotStatus {
  status: 'DISCONNECTED' | 'INITIALIZING' | 'SCAN_QR' | 'CONNECTING' | 'CONNECTED';
  qrCodeDataUrl: string | null;
  pairingCode: string | null;
  connectedPhone: string | null;
  connectedName: string | null;
  disconnectReasonMessage?: string | null;
  settings: {
    autoReplyPrivate: boolean;
    autoReplyGroups: boolean;
    delaySeconds: number;
    quoteOriginalMessage: boolean;
  };
  activities: ActivityEvent[];
}

export const PersonalAccountModal: React.FC<PersonalAccountModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [data, setData] = useState<PersonalBotStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [pairPhoneNumber, setPairPhoneNumber] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [pairMode, setPairMode] = useState<'qr' | 'code'>('qr');
  const [activeTab, setActiveTab] = useState<'connect' | 'settings' | 'logs'>('connect');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const autoStartedRef = useRef(false);

  // Poll status while open and auto-start QR connection if disconnected
  useEffect(() => {
    if (!isOpen) {
      autoStartedRef.current = false;
      setConfirmDisconnect(false);
      return;
    }

    const initAndPoll = async () => {
      const latest = await fetchStatus();
      if (
        latest &&
        latest.status === 'DISCONNECTED' &&
        !latest.qrCodeDataUrl &&
        !autoStartedRef.current
      ) {
        autoStartedRef.current = true;
        await fetch('/api/personal-bot/connect', { method: 'POST' }).catch(() => {});
        await fetchStatus();
      }
    };

    initAndPoll();
    const interval = setInterval(fetchStatus, 1500);
    return () => clearInterval(interval);
  }, [isOpen]);

  const fetchStatus = async (): Promise<PersonalBotStatus | null> => {
    try {
      const res = await fetch('/api/personal-bot/status');
      const json: PersonalBotStatus = await res.json();
      setData(json);
      return json;
    } catch (e) {
      console.error('Failed to fetch personal bot status:', e);
      return null;
    }
  };

  const [pairingError, setPairingError] = useState<string | null>(null);

  const handleStartConnection = async () => {
    setLoading(true);
    setPairingError(null);
    try {
      await fetch('/api/personal-bot/reset', {
        method: 'POST',
      });
      await fetchStatus();
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPairingCode = async (phone: string) => {
    if (!phone.trim()) return;
    setLoading(true);
    setPairingError(null);
    try {
      const res = await fetch('/api/personal-bot/request-pairing-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone }),
      });
      const resJson = await res.json();
      if (!res.ok || resJson.error) {
        setPairingError(resJson.error || 'שגיאה בקבלת קוד קישור');
      } else if (resJson.pairingCode) {
        if (data) {
          setData({ ...data, pairingCode: resJson.pairingCode });
        }
      }
      await fetchStatus();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'שגיאה בתקשורת עם השרת';
      setPairingError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await fetch('/api/personal-bot/disconnect', { method: 'POST' });
      setConfirmDisconnect(false);
      await fetchStatus();
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSettings = async (patch: Partial<PersonalBotStatus['settings']>) => {
    try {
      const res = await fetch('/api/personal-bot/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const updated = await res.json();
      if (updated.settings && data) {
        setData({ ...data, settings: updated.settings });
      }
    } catch (e) {
      console.error('Failed to update settings:', e);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  if (!isOpen) return null;

  const isConnected = data?.status === 'CONNECTED';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85">
      <div className="bg-[#111b21] border border-[#2a3942] rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#202c33] border-b border-[#313d45]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-[#00a884] to-[#25d366] text-white shadow-md">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#e9edef]">
                  חיבור וואטסאפ אישי (מענה ישיר מחשבונך)
                </h2>
                {isConnected ? (
                  <span className="flex items-center gap-1 text-[11px] bg-[#00a884]/20 text-[#25d366] px-2 py-0.5 rounded-full font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    מחובר
                  </span>
                ) : (
                  <span className="text-[11px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-medium">
                    לא מחובר
                  </span>
                )}
              </div>
              <p className="text-xs text-[#8696a0]">
                חבר את הוואטסאפ שלך בסריקת QR קלה — הבוט יענה להודעות קוליות ישירות מהחשבון שלך!
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

        {/* Diagnostic / Error Explanation Banner for User */}
        <div className="mx-6 mt-4 p-3 rounded-xl bg-[#202c33]/80 border border-emerald-500/30 text-xs text-[#d1d7db] space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-[#25d366]">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>פתרון לבעיית "קישור מכשיר" בוואטסאפ:</span>
          </div>
          <p className="text-[11px] text-[#aebac1] leading-relaxed">
            • <strong>קוד QR מתרענן רציף:</strong> שרתי וואטסאפ דורשים סנכרון מהיר (תוך 20 שניות). המערכת שודרגה לשמור על סוקט חי ומסונכרן ברציפות לגרסת WhatsApp Web הרשמית.
            <br />
            • <strong>פתרון מומלץ שעוקף תקלות מצלמה/סריקה:</strong> עבור למטה ל-<strong>"קוד 8 תווים לטלפון"</strong>, הזן מספר טלפון וקבל קוד של 8 תווים (אותיות ומספרים) לאישור מיידי בהתראת הוואטסאפ בטלפון.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#2a3942] bg-[#111b21] px-6 text-sm font-medium">
          <button
            onClick={() => setActiveTab('connect')}
            className={`py-3 px-4 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'connect'
                ? 'border-[#00a884] text-[#00a884]'
                : 'border-transparent text-[#8696a0] hover:text-[#d1d7db]'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>{isConnected ? 'פרטי החשבון המחובר' : 'חיבור וקוד QR'}</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`py-3 px-4 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'settings'
                ? 'border-[#00a884] text-[#00a884]'
                : 'border-transparent text-[#8696a0] hover:text-[#d1d7db]'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>הגדרות מענה אוטומטי</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`py-3 px-4 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'logs'
                ? 'border-[#00a884] text-[#00a884]'
                : 'border-transparent text-[#8696a0] hover:text-[#d1d7db]'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>פעילות בחשבון ({data?.activities.length || 0})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'connect' && (
            <div>
              {isConnected ? (
                /* CONNECTED VIEW */
                <div className="space-y-5 animate-fadeIn">
                  <div className="p-5 rounded-2xl bg-gradient-to-b from-[#005c4b]/30 to-[#111b21] border border-[#00a884]/40 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4 text-center sm:text-right">
                      <div className="w-14 h-14 rounded-full bg-[#00a884]/20 border-2 border-[#00a884] flex items-center justify-center text-2xl text-[#00a884] shadow-lg shrink-0">
                        📱
                      </div>
                      <div>
                        <div className="flex items-center gap-2 justify-center sm:justify-start">
                          <h3 className="text-base font-bold text-[#e9edef]">
                            {data.connectedName || 'הוואטסאפ האישי שלך'}
                          </h3>
                          <span className="w-2 h-2 rounded-full bg-[#25d366] animate-pulse"></span>
                        </div>
                        <p className="text-sm font-mono text-[#00a884] font-semibold mt-0.5">
                          {data.connectedPhone ? `+${data.connectedPhone}` : 'מחובר'}
                        </p>
                        <p className="text-xs text-[#8696a0] mt-1">
                          הבוט פעיל ומאזין להודעות קוליות. תמלול נשלח בחזרה תוך 10 שניות בדיוק!
                        </p>
                      </div>
                    </div>

                    {confirmDisconnect ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={handleDisconnect}
                          disabled={loading}
                          className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-all"
                        >
                          אשר ניתוק
                        </button>
                        <button
                          onClick={() => setConfirmDisconnect(false)}
                          className="px-3 py-2 bg-[#202c33] hover:bg-[#2a3942] text-[#d1d7db] rounded-xl text-xs font-medium transition-all"
                        >
                          ביטול
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDisconnect(true)}
                        disabled={loading}
                        className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-xl text-xs font-semibold transition-all border border-red-500/20 flex items-center gap-2 shrink-0 active:scale-95"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>נתק חשבון</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* DISCONNECTED / PAIRING VIEW */
                <div className="space-y-5 animate-fadeIn">
                  {data?.disconnectReasonMessage && (
                    <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{data.disconnectReasonMessage}</span>
                    </div>
                  )}

                  {data?.status === 'CONNECTING' && (
                    <div className="p-4 rounded-xl bg-[#00a884]/15 border border-[#00a884]/40 text-[#25d366] text-xs font-semibold flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>המכשיר אומת בהצלחה! משלים חיבור מול שרתי וואטסאפ ומסנכרן שיחות...</span>
                    </div>
                  )}

                  {/* Pair Mode Toggle */}
                  <div className="flex bg-[#202c33] p-1 rounded-xl max-w-sm mx-auto text-xs font-semibold">
                    <button
                      onClick={() => setPairMode('qr')}
                      className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                        pairMode === 'qr'
                          ? 'bg-[#00a884] text-white shadow-sm'
                          : 'text-[#8696a0] hover:text-[#d1d7db]'
                      }`}
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>סריקת קוד QR (מומלץ)</span>
                    </button>
                    <button
                      onClick={() => setPairMode('code')}
                      className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                        pairMode === 'code'
                          ? 'bg-[#00a884] text-white shadow-sm'
                          : 'text-[#8696a0] hover:text-[#d1d7db]'
                      }`}
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>קוד 8 תווים לטלפון</span>
                    </button>
                  </div>

                  {pairMode === 'qr' ? (
                    <div className="flex flex-col items-center text-center space-y-4">
                      {data?.qrCodeDataUrl ? (
                        <div className="p-3 bg-white rounded-2xl shadow-xl border-4 border-[#00a884] inline-block">
                          <img
                            src={data.qrCodeDataUrl}
                            alt="קוד QR לחיבור וואטסאפ"
                            className="w-56 h-56 sm:w-64 sm:h-64 object-contain rounded-lg"
                          />
                        </div>
                      ) : (
                        <div className="w-56 h-56 sm:w-64 sm:h-64 rounded-2xl bg-[#202c33] border border-[#2a3942] flex flex-col items-center justify-center gap-3 p-4 text-[#8696a0]">
                          <QrCode className="w-12 h-12 text-[#00a884] opacity-50" />
                          <p className="text-xs">
                            {data?.status === 'CONNECTING'
                              ? 'משלים אימות וסנכרון...'
                              : data?.status === 'INITIALIZING' || loading
                              ? 'מייצר קוד QR אמיתי מול שרתי וואטסאפ...'
                              : 'לחץ על הכפתור למטה כדי להפיק קוד QR'}
                          </p>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleStartConnection()}
                          disabled={loading || data?.status === 'CONNECTING'}
                          className="px-5 py-2.5 bg-[#00a884] hover:bg-[#008f6f] text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-2 disabled:opacity-50"
                        >
                          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                          <span>
                            {data?.qrCodeDataUrl ? 'איפוס ורענון קוד QR' : 'הפקת קוד QR נקי לסריקה'}
                          </span>
                        </button>
                      </div>

                      {/* Instructions */}
                      <div className="w-full bg-[#202c33]/60 border border-[#2a3942] rounded-xl p-4 text-right space-y-2 text-xs text-[#aebac1]">
                        <span className="font-bold text-[#e9edef] block flex items-center gap-1.5">
                          <HelpCircle className="w-4 h-4 text-[#00a884]" />
                          כיצד לקשר את וואטסאפ בטלפון?
                        </span>
                        <ol className="list-decimal list-inside space-y-1 text-[#8696a0] leading-relaxed">
                          <li>פתח את <strong>WhatsApp</strong> בטלפון שלך.</li>
                          <li>
                            הקש על <strong>שלוש הנקודות ⋮</strong> (או <strong>הגדרות ⚙️</strong>{' '}
                            באייפון).
                          </li>
                          <li>
                            בחר ב-<strong>"מכשירים מקושרים"</strong> (Linked Devices).
                          </li>
                          <li>
                            הקש על <strong>"קשר מכשיר"</strong> וסרוק את קוד ה-QR שמופיע למעלה.
                          </li>
                        </ol>
                      </div>
                    </div>
                  ) : (
                    /* 8-DIGIT PAIRING CODE VIEW */
                    <div className="space-y-4 max-w-md mx-auto text-center">
                      <div className="p-4 rounded-xl bg-[#202c33] border border-[#2a3942] space-y-3 text-right">
                        <label className="text-xs font-semibold text-[#8696a0] block">
                          הזן מספר טלפון (למשל: 055-970-7899 או 972559707899):
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="tel"
                            placeholder="0559707899 או 972559707899"
                            dir="ltr"
                            value={pairPhoneNumber}
                            onChange={(e) => setPairPhoneNumber(e.target.value)}
                            className="flex-1 bg-[#111b21] border border-[#313d45] rounded-lg px-3 py-2 text-sm font-mono text-white outline-none focus:border-[#00a884]"
                          />
                          <button
                            onClick={() => handleRequestPairingCode(pairPhoneNumber)}
                            disabled={loading || !pairPhoneNumber.trim()}
                            className="px-4 py-2 bg-[#00a884] hover:bg-[#008f6f] text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 shrink-0"
                          >
                            {loading ? 'מפיק קוד...' : 'קבל קוד קישור'}
                          </button>
                        </div>
                        {pairingError && (
                          <p className="text-[11px] text-red-400 bg-red-500/10 p-2 rounded-lg border border-red-500/20">
                            {pairingError}
                          </p>
                        )}
                      </div>

                      {data?.pairingCode && (
                        <div className="p-4 rounded-xl bg-[#005c4b]/20 border border-[#00a884] space-y-2 animate-fadeIn">
                          <span className="text-xs text-[#8696a0]">קוד הקישור שלך (הזן בוואטסאפ בטלפון):</span>
                          <div className="flex items-center justify-center gap-2">
                            <span className="font-mono text-2xl font-bold tracking-widest text-[#25d366] bg-[#111b21] px-4 py-1.5 rounded-lg border border-[#00a884]/40">
                              {data.pairingCode}
                            </span>
                            <button
                              onClick={() => handleCopyCode(data.pairingCode!)}
                              className="p-2 bg-[#202c33] hover:bg-[#2a3942] rounded-lg text-[#00a884] transition-colors"
                              title="העתק קוד"
                            >
                              {copiedCode ? <Check className="w-4 h-4 text-[#25d366]" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                          <p className="text-[11px] text-[#aebac1]">
                            בטלפון: לחץ על 'מכשירים מקושרים' &gt; 'קשר מכשיר' &gt; 'קשר באמצעות מספר טלפון' והזן את 8 התווים (אותיות ומספרים) תוך דקה.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#202c33] border border-[#2a3942] space-y-4">
                <h3 className="text-sm font-bold text-[#e9edef] flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[#00a884]" />
                  <span>כללי מענה אוטומטי מהחשבון שלך</span>
                </h3>

                {/* Toggle: Private Chats */}
                <div className="flex items-center justify-between py-2 border-b border-[#313d45]">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-[#e9edef] block">
                      תמלול הודעות קוליות בשיחות פרטיות (1 על 1)
                    </span>
                    <p className="text-[11px] text-[#8696a0]">
                      כאשר איש קשר שולח לך הקלטה קולית בפרטי, הבוט ישלח לו תמלול מדויק
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={data?.settings?.autoReplyPrivate ?? true}
                    onChange={(e) => handleUpdateSettings({ autoReplyPrivate: e.target.checked })}
                    className="w-4 h-4 accent-[#00a884] cursor-pointer"
                  />
                </div>

                {/* Toggle: Group Chats */}
                <div className="flex items-center justify-between py-2 border-b border-[#313d45]">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-[#e9edef] block">
                      תמלול הודעות קוליות בקבוצות וואטסאפ
                    </span>
                    <p className="text-[11px] text-[#8696a0]">
                      האם להגיב גם להקלטות קוליות הנשלחות בקבוצות שאתה חבר בהן
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={data?.settings?.autoReplyGroups ?? false}
                    onChange={(e) => handleUpdateSettings({ autoReplyGroups: e.target.checked })}
                    className="w-4 h-4 accent-[#00a884] cursor-pointer"
                  />
                </div>

                {/* Delay setting: 10s */}
                <div className="space-y-2 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#e9edef] flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#00a884]" />
                      זמן עיכוב לשליחת התמלול (שניות):
                    </span>
                    <span className="text-xs font-mono font-bold text-[#00a884] bg-[#00a884]/20 px-2 py-0.5 rounded">
                      {data?.settings?.delaySeconds ?? 10} שניות
                    </span>
                  </div>
                  <input
                    type="range"
                    min={3}
                    max={30}
                    step={1}
                    value={data?.settings?.delaySeconds ?? 10}
                    onChange={(e) => handleUpdateSettings({ delaySeconds: Number(e.target.value) })}
                    className="w-full accent-[#00a884] cursor-pointer"
                  />
                  <p className="text-[11px] text-[#8696a0]">
                    מוגדר ל-<strong>10 שניות בדיוק</strong> כבקשתך.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-[#8696a0]">
                <span>פעולות שבוצעו בחשבון האישי שלך:</span>
                <span>{data?.activities?.length || 0} רשומות</span>
              </div>

              {!data?.activities || data.activities.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#8696a0] bg-[#202c33]/40 rounded-xl border border-dashed border-[#2a3942]">
                  טרם נרשמה פעילות. לאחר חיבור החשבון, כל הודעה קולית והתמלול שלה יתועדו כאן.
                </div>
              ) : (
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {data.activities.map((act) => (
                    <div
                      key={act.id}
                      className="p-3 rounded-xl bg-[#202c33] border border-[#2a3942] text-xs font-mono space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`font-semibold px-2 py-0.5 rounded text-[10px] ${
                            act.type === 'replied'
                              ? 'bg-[#00a884]/20 text-[#25d366]'
                              : act.type === 'delayed_sending'
                              ? 'bg-amber-500/20 text-amber-400'
                              : act.type === 'voice_received'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-white/10 text-[#aebac1]'
                          }`}
                        >
                          {act.type === 'replied'
                            ? '✅ תמלול נשלח מהחשבון (10 שנ\')'
                            : act.type === 'delayed_sending'
                            ? '⏳ עיכוב 10 שניות פעיל'
                            : act.type === 'voice_received'
                            ? '🎙️ הקלטה התקבלה'
                            : 'ℹ️ אירוע חיבור'}
                        </span>
                        <span className="text-[#8696a0] text-[11px]">{act.timestamp}</span>
                      </div>
                      <p className="text-[#e9edef] font-sans text-xs pt-1">{act.details}</p>
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
