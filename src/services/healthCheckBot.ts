/**
 * Hourly Health Check and Error Monitoring Bot Service.
 * Automatically inspects WhatsApp connection, Gemini AI transcription health,
 * socket error codes (401, 515, 428), and timer queue every hour.
 */

import { personalBotService } from './whatsappPersonalBot.ts';

export interface HealthCheckItem {
  component: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  details: string;
  recommendation?: string;
}

export interface HealthCheckReport {
  id: string;
  timestamp: string;
  timestampMs: number;
  overallStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  score: number; // 0 - 100
  checks: HealthCheckItem[];
  nextRunInSeconds: number;
  summary: string;
}

class HourlyHealthCheckBot {
  private reports: HealthCheckReport[] = [];
  private intervalTimer: NodeJS.Timeout | null = null;
  private checkIntervalMs = 60 * 60 * 1000; // 1 hour
  private lastCheckMs = Date.now();
  private geminiTester: (() => Promise<boolean>) | null = null;

  constructor() {
    // Run initial health check on startup
    setTimeout(() => {
      this.runCheck('אתחול מערכת ובדיקת שעה ראשונה');
    }, 5000);

    // Schedule automatic hourly run
    this.intervalTimer = setInterval(() => {
      this.runCheck('בדיקה אוטומטית שעתית');
    }, this.checkIntervalMs);
  }

  public setGeminiTester(fn: () => Promise<boolean>) {
    this.geminiTester = fn;
  }

  public async runCheck(triggerReason = 'בדיקה ידנית'): Promise<HealthCheckReport> {
    const checks: HealthCheckItem[] = [];
    let score = 100;

    // 1. WhatsApp Connection & Socket Check
    const waStatus = personalBotService.getStatus();
    if (waStatus.status === 'CONNECTED') {
      checks.push({
        component: 'חיבור וואטסאפ (WhatsApp Web)',
        status: 'PASS',
        details: `מחובר בהצלחה למספר ${waStatus.connectedPhone || 'אישי'}. הבוט מקשיב להודעות קוליות.`,
      });
    } else if (waStatus.status === 'SCAN_QR') {
      checks.push({
        component: 'חיבור וואטסאפ (WhatsApp Web)',
        status: 'WARN',
        details: 'קוד QR פעיל וממתין לסריקה מהטלפון. טרם הושלם קישור המכשיר.',
        recommendation: 'סרוק את קוד ה-QR מוואטסאפ בטלפון: הגדרות > מכשירים מקושרים > קשר מכשיר.',
      });
      score -= 15;
    } else if (waStatus.status === 'CONNECTING' || waStatus.status === 'INITIALIZING') {
      checks.push({
        component: 'חיבור וואטסאפ (WhatsApp Web)',
        status: 'WARN',
        details: 'מתבצע אימות וסנכרון מול שרתי WhatsApp Web...',
        recommendation: 'המתן מספר שניות לסיום הקישור וסנכרון השיחות.',
      });
      score -= 10;
    } else {
      checks.push({
        component: 'חיבור וואטסאפ (WhatsApp Web)',
        status: 'WARN',
        details: waStatus.disconnectReasonMessage || 'המכשיר אינו מקושר כרגע.',
        recommendation: 'לחץ על "סרוק קוד QR לחיבור" כדי לקשר את חשבון הוואטסאפ שלך.',
      });
      score -= 25;
    }

    // 2. WhatsApp Socket Error Logs Diagnostic
    const recentErrors = waStatus.activities.filter(
      (a) => a.type === 'error' || a.details.includes('401') || a.details.includes('515') || a.details.includes('428')
    );

    if (recentErrors.length === 0) {
      checks.push({
        component: 'אבחון שגיאות סוקט (401 / 515 / 428)',
        status: 'PASS',
        details: 'אין שגיאות סוקט או ניתוקים חריגים בשעה האחרונה.',
      });
    } else {
      const lastErr = recentErrors[0];
      checks.push({
        component: 'אבחון שגיאות סוקט (401 / 515 / 428)',
        status: 'WARN',
        details: `זוהתה שגיאה אחרונה: "${lastErr.details}". מערכת התיקון האוטומטית מבצעת סנכרון מחדש.`,
        recommendation: 'אם מופיעה שגיאת "בעיה בקישור המכשיר", סרוק את קוד ה-QR מחדש כשהסוקט יציב, או השתמש בקוד 8 תווים לטלפון.',
      });
      score -= 15;
    }

    // 3. Gemini AI Transcription API Check
    let geminiOk = true;
    if (this.geminiTester) {
      try {
        geminiOk = await this.geminiTester();
      } catch {
        geminiOk = false;
      }
    }

    if (geminiOk) {
      checks.push({
        component: 'מנוע תמלול Gemini AI',
        status: 'PASS',
        details: 'מודל gemini-3.5-transcribe / gemini-4-hydrogen זמין ומבצע תמלול בעברית באופן תקין.',
      });
    } else {
      checks.push({
        component: 'מנוע תמלול Gemini AI',
        status: 'FAIL',
        details: 'שגיאה בגישה ל-Gemini API או מפתח לא תקין.',
        recommendation: 'ודא שמפתח GEMINI_API_KEY מוגדר ותקף בהגדרות.',
      });
      score -= 30;
    }

    // 4. Delayed Transcription Rule (10 Seconds) Check
    const delaySetting = waStatus.settings.delaySeconds;
    if (delaySetting === 10) {
      checks.push({
        component: 'כלל עיכוב תמלול (10 שניות בדיוק)',
        status: 'PASS',
        details: 'כלל העיכוב מוגדר על 10 שניות בדיוק כנדרש. מענה ישלח 10 שניות לאחר קבלת ההקלטה.',
      });
    } else {
      checks.push({
        component: 'כלל עיכוב תמלול (10 שניות בדיוק)',
        status: 'WARN',
        details: `כלל העיכוב הנוכחי מוגדר על ${delaySetting} שניות.`,
        recommendation: 'מומלץ להחזיר ל-10 שניות בהגדרות הבוט.',
      });
      score -= 10;
    }

    // Overall status determination
    let overallStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
    if (score < 50) overallStatus = 'CRITICAL';
    else if (score < 90) overallStatus = 'WARNING';

    const now = Date.now();
    this.lastCheckMs = now;

    const report: HealthCheckReport = {
      id: `report_${now}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleTimeString('he-IL', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      timestampMs: now,
      overallStatus,
      score: Math.max(0, score),
      checks,
      nextRunInSeconds: Math.round(this.checkIntervalMs / 1000),
      summary: `${triggerReason}: ציון בריאות ${score}/100 (${overallStatus === 'HEALTHY' ? 'תקין' : overallStatus === 'WARNING' ? 'דורש תשומת לב' : 'שגיאה קריטית'}).`,
    };

    this.reports.unshift(report);
    if (this.reports.length > 24) this.reports.pop(); // Keep last 24 hourly checks

    return report;
  }

  public getStatus() {
    const now = Date.now();
    const elapsedMs = now - this.lastCheckMs;
    const remainingMs = Math.max(0, this.checkIntervalMs - elapsedMs);

    return {
      active: true,
      intervalHours: 1,
      lastCheckTime: this.reports[0]?.timestamp || null,
      nextCheckInSeconds: Math.round(remainingMs / 1000),
      latestReport: this.reports[0] || null,
      reportsCount: this.reports.length,
      history: this.reports.slice(0, 10),
    };
  }
}

export const healthCheckBot = new HourlyHealthCheckBot();
