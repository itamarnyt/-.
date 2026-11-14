import React, { useState, useEffect } from 'react';
import {
  X,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  RefreshCw,
  ShieldCheck,
  Zap,
  HelpCircle,
} from 'lucide-react';

interface HealthCheckItem {
  component: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  details: string;
  recommendation?: string;
}

interface HealthCheckReport {
  id: string;
  timestamp: string;
  overallStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  score: number;
  checks: HealthCheckItem[];
  nextRunInSeconds: number;
  summary: string;
}

interface HealthStatusData {
  active: boolean;
  intervalHours: number;
  lastCheckTime: string | null;
  nextCheckInSeconds: number;
  latestReport: HealthCheckReport | null;
  reportsCount: number;
  history: HealthCheckReport[];
}

interface HealthCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HealthCheckModal: React.FC<HealthCheckModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [data, setData] = useState<HealthStatusData | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const fetchHealthStatus = async () => {
    try {
      const res = await fetch('/api/health-check/status');
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.warn('Failed to fetch health check status:', e);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchHealthStatus();
    const interval = setInterval(fetchHealthStatus, 5000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const handleRunNow = async () => {
    setIsRunning(true);
    try {
      await fetch('/api/health-check/run', { method: 'POST' });
      await fetchHealthStatus();
    } finally {
      setIsRunning(false);
    }
  };

  if (!isOpen) return null;

  const report = data?.latestReport;
  const minutesToNext = data ? Math.max(0, Math.floor(data.nextCheckInSeconds / 60)) : 60;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85">
      <div className="bg-[#111b21] border border-[#2a3942] rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#202c33] border-b border-[#313d45]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-[#00a884] to-[#25d366] text-white shadow-md">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#e9edef]">
                  בוט בדיקה ואבחון שגיאות אוטומטי
                </h2>
                <span className="text-[10px] bg-[#00a884]/20 text-[#25d366] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#25d366] animate-pulse" />
                  פעיל כל שעה
                </span>
              </div>
              <p className="text-xs text-[#8696a0]">
                מנטר את חיבור הוואטסאפ, שגיאות הסוקט, ה-Gemini AI ומנגנון ה-10 שניות באופן רציף
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Top Status Card */}
          <div className="p-4 rounded-xl bg-[#202c33] border border-[#2a3942] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-right">
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <span className="text-sm font-bold text-[#e9edef]">סטטוס בדיקה שעתית:</span>
                {report?.overallStatus === 'HEALTHY' && (
                  <span className="text-xs font-bold text-[#25d366] bg-[#00a884]/20 px-2 py-0.5 rounded-full">
                    תקין לחלוטין (100%)
                  </span>
                )}
                {report?.overallStatus === 'WARNING' && (
                  <span className="text-xs font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-full">
                    דורש תשומת לב ({report.score}/100)
                  </span>
                )}
                {report?.overallStatus === 'CRITICAL' && (
                  <span className="text-xs font-bold text-red-400 bg-red-500/20 px-2 py-0.5 rounded-full">
                    שגיאה קריטית ({report.score}/100)
                  </span>
                )}
              </div>
              <p className="text-xs text-[#8696a0] flex items-center gap-2 justify-center sm:justify-start">
                <Clock className="w-3.5 h-3.5 text-[#00a884]" />
                <span>בדיקה אחרונה: {report?.timestamp || 'הרגע'}</span>
                <span>•</span>
                <span>הבדיקה האוטומטית הבאה: בעוד כ-{minutesToNext} דקות</span>
              </p>
            </div>

            <button
              onClick={handleRunNow}
              disabled={isRunning}
              className="px-4 py-2 bg-[#00a884] hover:bg-[#008f6f] text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
              <span>{isRunning ? 'מריץ בדיקה...' : 'הרץ בדיקה עכשיו'}</span>
            </button>
          </div>

          {/* Explanation on 'בעיה בקישור המכשיר' */}
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2 text-[#d1d7db]">
            <div className="flex items-center gap-1.5 font-bold text-amber-400">
              <HelpCircle className="w-4 h-4 shrink-0" />
              <span>מדוע לפעמים מופיעה הודעת "בעיה בקישור המכשיר" בטלפון?</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-[#aebac1] leading-relaxed text-[11px]">
              <li>
                <strong>פג תוקף קוד ה-QR:</strong> קוד ה-QR מתרענן כל 20-30 שניות. אם סורקים קוד שהספיק להתחלף, הטלפון מציג שגיאה זו. עדכנו את המערכת להחזיק סוקט פעיל ומתרענן ברציפות!
              </li>
              <li>
                <strong>סנכרון גרסת וואטסאפ:</strong> השרת שודרג לגרסה הרשמית העדכנית ביותר של WhatsApp Web כדי ששרתי WhatsApp לא יסרבו לקישור.
              </li>
              <li>
                <strong>פתרון מהיר נוסף:</strong> השתמש בלשונית <strong>"קוד 8 תווים לטלפון"</strong> בחלון החיבור – מזינים מספר טלפון, מקבלים קוד של 8 תווים (אותיות ומספרים), ומאשרים מיד בהתראה בטלפון ללא תלות במצלמה.
              </li>
            </ul>
          </div>

          {/* Detailed Component Diagnostic Checks */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-[#8696a0] uppercase tracking-wider">
              בדיקות רכיבי המערכת שבוצעו:
            </h3>

            <div className="space-y-2">
              {report?.checks.map((check, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-[#202c33]/70 border border-[#2a3942] space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#e9edef] flex items-center gap-2">
                      {check.status === 'PASS' && (
                        <CheckCircle2 className="w-4 h-4 text-[#25d366] shrink-0" />
                      )}
                      {check.status === 'WARN' && (
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      )}
                      {check.status === 'FAIL' && (
                        <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                      )}
                      {check.component}
                    </span>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        check.status === 'PASS'
                          ? 'bg-[#00a884]/20 text-[#25d366]'
                          : check.status === 'WARN'
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {check.status === 'PASS' ? 'תקין' : check.status === 'WARN' ? 'אזהרה' : 'שגיאה'}
                    </span>
                  </div>

                  <p className="text-xs text-[#8696a0] leading-relaxed mr-6">{check.details}</p>

                  {check.recommendation && (
                    <div className="text-[11px] text-[#00a884] bg-[#00a884]/10 p-2 rounded-lg mr-6 mt-1 flex items-start gap-1.5">
                      <Zap className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{check.recommendation}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#202c33] border-t border-[#313d45] flex items-center justify-between text-xs text-[#8696a0]">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#00a884]" />
            הבוט פועל ברקע ובודק שגיאות אוטומטית בכל שעה
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#2a3942] hover:bg-[#32444e] text-white rounded-lg font-medium transition-colors"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
};
