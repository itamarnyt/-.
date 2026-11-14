import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Settings,
  CheckCheck,
  Copy,
  Check,
  Sparkles,
  Clock,
  MessageSquare,
  Search,
  Smartphone,
  QrCode,
  UserPlus,
  Sliders,
  Activity,
  AlertCircle,
} from 'lucide-react';
import { AudioWaveform } from './components/AudioWaveform';
import { CountdownProgress } from './components/CountdownProgress';
import { WhatsAppInputBar } from './components/VoiceRecorder';
import { SettingsModal } from './components/SettingsModal';
import { PersonalAccountModal } from './components/PersonalAccountModal';
import { ChatSettingsDrawer } from './components/ChatSettingsDrawer';
import { NewChatModal } from './components/NewChatModal';
import { HealthCheckModal } from './components/HealthCheckModal';
import { DEFAULT_DELAY_SECONDS } from './utils/timerQueue';
import { WhatsAppChat, ChatMessage } from './utils/chatStore';

interface WebhookLogItem {
  id: string;
  timestamp: string;
  type: string;
  sender: string;
  details: string;
  payload?: unknown;
}

export default function App() {
  const [chats, setChats] = useState<WhatsAppChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [chatFilter, setChatFilter] = useState<'all' | 'personal' | 'groups' | 'transcribe_active'>('all');

  const [delaySeconds, setDelaySeconds] = useState<number>(DEFAULT_DELAY_SECONDS);
  const [activeCountdown, setActiveCountdown] = useState<{
    id: string;
    chatId: string;
    remaining: number;
    total: number;
    transcriptionText: string;
    durationSeconds: number;
  } | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isPersonalAccountModalOpen, setIsPersonalAccountModalOpen] = useState(false);
  const [isChatSettingsOpen, setIsChatSettingsOpen] = useState(false);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [isHealthCheckModalOpen, setIsHealthCheckModalOpen] = useState(false);

  const [personalPhone, setPersonalPhone] = useState<string | null>(null);
  const [isPersonalConnected, setIsPersonalConnected] = useState(false);
  const [autoPlayAudio, setAutoPlayAudio] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const prevConnectedRef = useRef(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Fetch real chats from backend
  const fetchChats = async () => {
    try {
      const res = await fetch('/api/personal-bot/chats');
      const data = await res.json();
      if (Array.isArray(data.chats)) {
        setChats(data.chats);
        setActiveChatId((currentId) => {
          if (!currentId && data.chats.length > 0) {
            return data.chats[0].id;
          }
          if (currentId && !data.chats.some((c: WhatsAppChat) => c.id === currentId)) {
            return data.chats.length > 0 ? data.chats[0].id : '';
          }
          return currentId;
        });
      }
    } catch (err) {
      console.warn('Failed to fetch chats:', err);
    }
  };

  useEffect(() => {
    fetchChats();
    const interval = setInterval(fetchChats, 3000);
    return () => clearInterval(interval);
  }, []);

  // Poll personal WhatsApp status and refresh chats immediately on connect
  useEffect(() => {
    const checkPersonalStatus = () => {
      fetch('/api/personal-bot/status')
        .then((res) => res.json())
        .then((data) => {
          const connectedNow = data.status === 'CONNECTED';
          setIsPersonalConnected(connectedNow);
          setPersonalPhone(data.connectedPhone || null);
          if (connectedNow && !prevConnectedRef.current) {
            fetchChats();
          }
          prevConnectedRef.current = connectedNow;
        })
        .catch(() => {});
    };

    checkPersonalStatus();
    const interval = setInterval(checkPersonalStatus, 2500);
    return () => clearInterval(interval);
  }, []);

  // Auto scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats, activeChatId, activeCountdown]);

  // Current active chat object
  const activeChat = chats.find((c) => c.id === activeChatId) || null;

  // Countdown timer effect for the 10-second delay rule
  useEffect(() => {
    if (!activeCountdown) return;

    if (activeCountdown.remaining <= 0) {
      // 10 seconds delay elapsed! Deliver the transcription now!
      deliverTranscription(
        activeCountdown.chatId,
        activeCountdown.transcriptionText,
        activeCountdown.durationSeconds,
        activeCountdown.total
      );
      setActiveCountdown(null);
      setIsProcessing(false);
      return;
    }

    const timer = setTimeout(() => {
      setActiveCountdown((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          remaining: prev.remaining - 1,
        };
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [activeCountdown]);

  // Deliver transcription into the real WhatsApp chat
  const deliverTranscription = async (
    chatId: string,
    text: string,
    durationSeconds: number,
    delayUsed: number
  ) => {
    const replyText = `🎙️ *תמלול הודעה קולית (${durationSeconds} שנ'):*\n\n"${text}"\n\n_⏱️ נשלח אוטומטית בעיכוב של ${delayUsed} שניות_`;

    try {
      const res = await fetch(`/api/personal-bot/chats/${encodeURIComponent(chatId)}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: replyText }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSendError(json.error || 'שליחת התמלול לוואטסאפ נכשלה');
        return;
      }
      await fetchChats();
    } catch {
      setSendError('שגיאת תקשורת בעת שליחת התמלול לוואטסאפ');
    }
  };

  // Immediate send override
  const handleInstantSend = () => {
    if (activeCountdown) {
      deliverTranscription(
        activeCountdown.chatId,
        activeCountdown.transcriptionText,
        activeCountdown.durationSeconds,
        activeCountdown.total
      );
      setActiveCountdown(null);
      setIsProcessing(false);
    }
  };

  // Send regular text message via real WhatsApp socket
  const handleSendTextMessage = async (messageText: string) => {
    if (!messageText.trim() || !activeChat) return;
    setSendError(null);

    if (!isPersonalConnected) {
      setSendError('חשבון הוואטסאפ אינו מחובר. סרוק קוד QR או הזן קוד 8 ספרות כדי לשלוח הודעות אמיתיות.');
      return;
    }

    try {
      const res = await fetch(`/api/personal-bot/chats/${encodeURIComponent(activeChat.id)}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: messageText }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSendError(json.error || 'שליחת ההודעה לוואטסאפ נכשלה');
        return;
      }
      await fetchChats();
    } catch {
      setSendError('שגיאה בתקשורת עם השרת בעת שליחת ההודעה');
    }
  };

  // Handle sending a real voice note
  const handleSendVoiceNote = async (params: {
    audioBase64?: string;
    audioBlob?: Blob;
    mimeType: string;
    durationSeconds: number;
    title: string;
  }) => {
    if (!activeChat) return;
    setSendError(null);

    if (!isPersonalConnected) {
      setSendError('חשבון הוואטסאפ אינו מחובר. סרוק קוד QR כדי לשלוח הודעה קולית אמיתית.');
      return;
    }

    if (!params.audioBase64) {
      setSendError('לא התקבל קובץ שמע תקין.');
      return;
    }

    setIsProcessing(true);

    try {
      const sendRes = await fetch(`/api/personal-bot/chats/${encodeURIComponent(activeChat.id)}/send-voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: params.audioBase64,
          mimeType: params.mimeType,
          durationSeconds: params.durationSeconds,
        }),
      });
      const sendJson = await sendRes.json();
      if (!sendRes.ok) {
        setSendError(sendJson.error || 'שליחת ההודעה הקולית לוואטסאפ נכשלה');
        setIsProcessing(false);
        return;
      }
      await fetchChats();
    } catch {
      setSendError('שגיאת תקשורת בעת שליחת ההודעה הקולית');
      setIsProcessing(false);
      return;
    }

    // Check if transcription is disabled for this chat
    if (!activeChat.transcriptionEnabled) {
      setIsProcessing(false);
      return;
    }

    // Transcription is enabled: run real Gemini AI transcription
    try {
      const response = await fetch('/api/transcribe-delayed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: params.audioBase64,
          mimeType: params.mimeType,
          audioDurationSeconds: params.durationSeconds,
          delaySeconds: delaySeconds,
          customPrompt: 'תמלל את ההודעה הקולית המצורפת בעברית באופן מדויק.',
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.item?.transcription) {
        setSendError(data.error || 'שגיאה בתמלול ההקלטה באמצעות Gemini AI');
        setIsProcessing(false);
        return;
      }

      // Start the 10-second visual countdown
      setActiveCountdown({
        id: `cd_${Date.now()}`,
        chatId: activeChat.id,
        remaining: delaySeconds,
        total: delaySeconds,
        transcriptionText: data.item.transcription,
        durationSeconds: params.durationSeconds,
      });
    } catch {
      setSendError('שגיאת תקשורת בעת ביצוע התמלול');
      setIsProcessing(false);
    }
  };

  // Toggle per-chat transcription setting
  const handleToggleTranscription = async (jid: string, enabled: boolean) => {
    try {
      await fetch(`/api/personal-bot/chats/${encodeURIComponent(jid)}/toggle-transcription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      setChats((prev) =>
        prev.map((c) => (c.id === jid ? { ...c, transcriptionEnabled: enabled } : c))
      );
    } catch (e) {
      console.error('Failed to toggle transcription:', e);
    }
  };

  // Create new chat
  const handleCreateChat = async (phoneNumber: string, name?: string) => {
    try {
      const res = await fetch('/api/personal-bot/chats/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, name }),
      });
      const data = await res.json();
      if (data.chat) {
        await fetchChats();
        setActiveChatId(data.chat.id);
      }
    } catch (e) {
      console.error('Failed to create chat:', e);
    }
  };

  const copyTranscription = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filter chats by query and filter tab
  const filteredChats = chats.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.phoneNumber && c.phoneNumber.includes(searchQuery)) ||
      c.lastMessageText.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (chatFilter === 'personal') return !c.isGroup;
    if (chatFilter === 'groups') return c.isGroup;
    if (chatFilter === 'transcribe_active') return c.transcriptionEnabled;
    return true;
  });

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0c1317] font-sans text-[#e9edef] select-none">
      {/* ================= SIDEBAR: WhatsApp Chat List ================= */}
      <aside className="w-80 sm:w-96 flex flex-col border-l border-[#2a3942] bg-[#111b21] shrink-0">
        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#202c33] border-b border-[#313d45]">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#00a884] to-[#25d366] flex items-center justify-center text-white shadow-md font-bold text-lg">
                {isPersonalConnected ? '📱' : '🎙️'}
              </div>
              <span
                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#202c33] ${
                  isPersonalConnected ? 'bg-[#25d366] animate-pulse' : 'bg-amber-400'
                }`}
              />
            </div>
            <div>
              <h1 className="text-sm font-bold text-[#e9edef] flex items-center gap-1.5">
                {isPersonalConnected ? `וואטסאפ: ${personalPhone || 'מחובר'}` : 'וואטסאפ בוט תמלול'}
              </h1>
              <p className="text-[11px] text-[#00a884] font-medium">
                {isPersonalConnected ? 'מחובר לחשבונך (מענה ישיר)' : 'סרוק QR לחיבור מספרך'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 text-[#aebac1]">
            <button
              onClick={() => setIsHealthCheckModalOpen(true)}
              aria-label="בוט בדיקה שעתית ואבחון שגיאות"
              className="p-2 hover:bg-white/10 rounded-full transition-colors relative"
              title="בוט בדיקה שעתית ואבחון שגיאות"
            >
              <Activity className="w-5 h-5 text-[#25d366]" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#25d366] animate-pulse" />
            </button>

            <button
              onClick={() => setIsNewChatModalOpen(true)}
              aria-label="פתח שיחה חדשה"
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
              title="שיחה חדשה עם מספר טלפון"
            >
              <UserPlus className="w-5 h-5 text-[#00a884]" />
            </button>

            <button
              onClick={() => setIsPersonalAccountModalOpen(true)}
              aria-label="חיבור חשבון אישי"
              className="p-2 hover:bg-white/10 rounded-full transition-colors relative"
              title="סריקת קוד QR וחיבור וואטסאפ אישי"
            >
              <QrCode className="w-5 h-5 text-[#25d366]" />
            </button>

            <button
              onClick={() => setIsSettingsModalOpen(true)}
              aria-label="הגדרות"
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
              title="הגדרות בוט כלליות"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* WhatsApp Personal Account Banner */}
        <div className="mx-3 my-2 p-3 rounded-xl bg-gradient-to-b from-[#202c33] to-[#182229] border border-[#00a884]/40 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#e9edef] flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-[#00a884]" />
              חיבור חשבון אישי
            </span>
            {isPersonalConnected ? (
              <span className="text-[10px] bg-[#00a884]/20 text-[#25d366] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#25d366] animate-pulse"></span>
                מחובר
              </span>
            ) : (
              <span className="text-[10px] bg-amber-500/20 text-amber-400 font-medium px-1.5 py-0.5 rounded-full">
                לא מחובר
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#8696a0] leading-relaxed">
            {isPersonalConnected
              ? `הבוט פעיל ומחובר למספר שלך (+${personalPhone}) ועונה אוטומטית תוך 10 שניות.`
              : 'סרוק קוד QR מתוך וואטסאפ בטלפון כדי שהבוט יענה ישירות מהמספר שלך.'}
          </p>
          <button
            onClick={() => setIsPersonalAccountModalOpen(true)}
            className="w-full py-1.5 px-3 rounded-lg bg-[#00a884] hover:bg-[#008f6f] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>{isPersonalConnected ? 'ניהול חיבור חשבון אישי' : 'סרוק קוד QR לחיבור'}</span>
          </button>
        </div>

        {/* Search input */}
        <div className="px-3 pt-1 pb-2">
          <div className="flex items-center gap-2 bg-[#202c33] px-3 py-1.5 rounded-lg text-xs text-[#8696a0]">
            <Search className="w-4 h-4" />
            <input
              type="text"
              placeholder="חפש שיחה או מספר טלפון..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-[#e9edef] w-full text-xs"
            />
          </div>
        </div>

        {/* Filter Tabs */}
        {chats.length > 0 && (
          <div className="flex items-center gap-1.5 px-3 pb-2 text-[11px] font-medium overflow-x-auto no-scrollbar">
            <button
              onClick={() => setChatFilter('all')}
              className={`px-2.5 py-1 rounded-full transition-colors shrink-0 ${
                chatFilter === 'all'
                  ? 'bg-[#00a884] text-white font-bold'
                  : 'bg-[#202c33] text-[#8696a0] hover:text-[#d1d7db]'
              }`}
            >
              הכל ({chats.length})
            </button>
            <button
              onClick={() => setChatFilter('personal')}
              className={`px-2.5 py-1 rounded-full transition-colors shrink-0 ${
                chatFilter === 'personal'
                  ? 'bg-[#00a884] text-white font-bold'
                  : 'bg-[#202c33] text-[#8696a0] hover:text-[#d1d7db]'
              }`}
            >
              פרטיות
            </button>
            <button
              onClick={() => setChatFilter('groups')}
              className={`px-2.5 py-1 rounded-full transition-colors shrink-0 ${
                chatFilter === 'groups'
                  ? 'bg-[#00a884] text-white font-bold'
                  : 'bg-[#202c33] text-[#8696a0] hover:text-[#d1d7db]'
              }`}
            >
              קבוצות
            </button>
            <button
              onClick={() => setChatFilter('transcribe_active')}
              className={`px-2.5 py-1 rounded-full transition-colors shrink-0 flex items-center gap-1 ${
                chatFilter === 'transcribe_active'
                  ? 'bg-[#00a884] text-white font-bold'
                  : 'bg-[#202c33] text-[#8696a0] hover:text-[#d1d7db]'
              }`}
            >
              <Mic className="w-3 h-3" />
              <span>תמלול פעיל</span>
            </button>
          </div>
        )}

        {/* Chat List or Clean Empty State */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#202c33]/40">
          {filteredChats.length > 0 ? (
            filteredChats.map((chat) => {
              const isSelected = chat.id === activeChatId;
              const isCountdownOnThis = activeCountdown && activeCountdown.chatId === chat.id;

              return (
                <div
                  key={chat.id}
                  onClick={() => setActiveChatId(chat.id)}
                  className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[#2a3942] border-r-4 border-[#00a884]'
                      : 'hover:bg-[#202c33]/70'
                  }`}
                >
                  {/* Contact Avatar */}
                  <div className="relative shrink-0">
                    <div className="w-12 h-12 rounded-full bg-[#00a884]/20 border border-[#00a884]/30 flex items-center justify-center text-xl shadow-sm">
                      {chat.avatar || (chat.isGroup ? '👥' : '👤')}
                    </div>
                    {/* Transcription Status Badge on Avatar */}
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] border border-[#111b21] shadow-xs ${
                        chat.transcriptionEnabled
                          ? 'bg-[#00a884] text-white'
                          : 'bg-[#8696a0] text-white'
                      }`}
                      title={
                        chat.transcriptionEnabled
                          ? 'תמלול אוטומטי מופעל בשיחה זו'
                          : 'תמלול אוטומטי מבוטל בשיחה זו'
                      }
                    >
                      {chat.transcriptionEnabled ? '🎙️' : '🔇'}
                    </span>
                  </div>

                  {/* Chat Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-[#e9edef] truncate flex items-center gap-1.5">
                        {chat.name}
                        {chat.isGroup && <span className="text-[10px] text-[#8696a0]">(קבוצה)</span>}
                      </span>
                      <span className="text-[10px] text-[#8696a0] font-mono shrink-0">
                        {new Date(chat.lastMessageTimestamp).toLocaleTimeString('he-IL', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-[#8696a0] truncate flex-1">
                        {isCountdownOnThis ? (
                          <span className="text-[#00a884] font-medium flex items-center gap-1">
                            <Clock className="w-3 h-3 animate-spin inline" />
                            מקליד תמלול... בעוד {activeCountdown.remaining} שנ'
                          </span>
                        ) : (
                          <span>{chat.lastMessageText || 'שיחה חדשה'}</span>
                        )}
                      </p>

                      {!chat.transcriptionEnabled && (
                        <span className="text-[10px] text-[#8696a0] bg-[#202c33] px-1.5 py-0.2 rounded font-medium shrink-0 ml-1">
                          תמלול כבוי
                        </span>
                      )}

                      {chat.unreadCount > 0 && (
                        <span className="w-4 h-4 rounded-full bg-[#00a884] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mr-1">
                          {chat.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-[#8696a0] space-y-3 mt-10">
              <div className="w-12 h-12 rounded-full bg-[#202c33] flex items-center justify-center text-[#00a884]">
                <MessageSquare className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-[#e9edef]">אין שיחות להצגה</p>
              <p className="text-xs text-[#8696a0] leading-relaxed">
                {isPersonalConnected
                  ? 'הוואטסאפ מחובר! ברגע שיישלחו או יתקבלו הודעות, הן יופיעו כאן.'
                  : 'חבר את חשבון הוואטסאפ שלך כדי לסנכרן את השיחות, או פתח שיחה חדשה.'}
              </p>
              <div className="flex flex-col gap-2 w-full max-w-[200px] pt-2">
                {!isPersonalConnected && (
                  <button
                    onClick={() => setIsPersonalAccountModalOpen(true)}
                    className="w-full py-1.5 px-3 rounded-lg bg-[#00a884] hover:bg-[#008f6f] text-white text-xs font-bold transition-all shadow-sm"
                  >
                    סרוק קוד QR לחיבור
                  </button>
                )}
                <button
                  onClick={() => setIsNewChatModalOpen(true)}
                  className="w-full py-1.5 px-3 rounded-lg bg-[#202c33] hover:bg-[#2a3942] text-[#d1d7db] text-xs font-medium border border-[#313d45] transition-all"
                >
                  שיחה חדשה עם מספר
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ================= MAIN CHAT PANE ================= */}
      <main className="flex-1 flex flex-col bg-[#0b141a] relative overflow-hidden">
        {activeChat ? (
          <>
            {/* Active Chat Header */}
            <header className="flex items-center justify-between px-4 py-2.5 bg-[#202c33] border-b border-[#313d45] z-10 shadow-sm">
              <div
                className="flex items-center gap-3 cursor-pointer group"
                onClick={() => setIsChatSettingsOpen(true)}
                title="לחץ לפתיחת פרטי שיחה והגדרות תמלול"
              >
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#00a884] to-[#25d366] flex items-center justify-center text-white text-lg shadow-sm">
                    {activeChat.avatar || (activeChat.isGroup ? '👥' : '👤')}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-[#e9edef] group-hover:text-[#00a884] transition-colors">
                      {activeChat.name}
                    </h2>
                    {activeChat.transcriptionEnabled ? (
                      <span className="text-[10px] bg-[#00a884]/20 text-[#25d366] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <Mic className="w-3 h-3" />
                        <span>תמלול פעיל (10 שנ')</span>
                      </span>
                    ) : (
                      <span className="text-[10px] bg-[#202c33] text-[#8696a0] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <MicOff className="w-3 h-3" />
                        <span>תמלול כבוי</span>
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-[#8696a0] flex items-center gap-1 mt-0.5">
                    {activeCountdown && activeCountdown.chatId === activeChat.id ? (
                      <span className="text-[#00a884] font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00a884] animate-ping" />
                        הבוט מעבד הקלטה... שליחה בעוד {activeCountdown.remaining} שניות
                      </span>
                    ) : (
                      <span>
                        {activeChat.phoneNumber || (activeChat.isGroup ? 'קבוצה' : 'שיחה')}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Header actions: Clean icon buttons like WhatsApp Web */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsChatSettingsOpen(true)}
                  className="p-2 text-[#aebac1] hover:text-[#00a884] hover:bg-white/10 rounded-full transition-colors"
                  title="הגדרות צ'אט (ביטול/הפעלת תמלול)"
                  aria-label="הגדרות צ'אט"
                >
                  <Sliders className="w-5 h-5" />
                </button>
              </div>
            </header>

            {/* Messages Area */}
            <div
              className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 relative"
              style={{
                backgroundImage: `radial-gradient(circle at 50% 50%, rgba(32, 44, 51, 0.4) 1px, transparent 1px)`,
                backgroundSize: '24px 24px',
              }}
            >
              {activeChat.messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-[#8696a0] space-y-2">
                  <p className="text-xs bg-[#182229] border border-[#2a3942] px-3 py-1.5 rounded-lg">
                    זוהי תחילת השיחה. הקלד הודעה או הקלט הודעה קולית למטה.
                  </p>
                </div>
              ) : (
                activeChat.messages.map((msg) => {
                  const isUser = msg.fromMe;
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isUser ? 'items-start' : 'items-end'} animate-fadeIn`}
                    >
                      <div
                        className={`relative max-w-[85%] md:max-w-[70%] rounded-2xl p-3 shadow-md ${
                          isUser
                            ? 'bg-[#005c4b] text-[#e9edef] rounded-tr-none'
                            : 'bg-[#202c33] text-[#e9edef] rounded-tl-none border border-[#2a3942]'
                        }`}
                      >
                        {/* Sender Name in incoming */}
                        {!isUser && (
                          <div className="flex items-center justify-between gap-3 mb-1 pb-1 border-b border-[#2a3942] text-[11px]">
                            <span className="text-[#00a884] font-bold">
                              {msg.senderName || activeChat.name}
                            </span>
                            {msg.isTranscriptionReply && (
                              <span className="text-[10px] bg-[#00a884]/20 text-[#25d366] px-1.5 py-0.2 rounded font-medium">
                                ⏱️ נשלח בעיכוב 10 שניות
                              </span>
                            )}
                          </div>
                        )}

                        {/* Voice Note Message */}
                        {msg.isAudio && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs text-[#aebac1] pb-1">
                              <span className="font-semibold text-white">הודעה קולית</span>
                              <span className="text-[10px] text-[#8696a0]">
                                {msg.audioDuration || 5} שנ'
                              </span>
                            </div>
                            <AudioWaveform
                              audioUrl={msg.audioUrl}
                              durationSeconds={msg.audioDuration || 5}
                              isSender={isUser}
                            />
                          </div>
                        )}

                        {/* Text Message */}
                        {msg.text && (
                          <div className="space-y-2">
                            {msg.isTranscriptionReply ? (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs text-[#8696a0]">
                                  <span className="text-[#00a884] font-semibold flex items-center gap-1">
                                    <Sparkles className="w-3.5 h-3.5" />
                                    תמלול הודעה קולית:
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => copyTranscription(msg.id, msg.text || '')}
                                      aria-label="העתק תמלול"
                                      className="p-1 hover:bg-white/10 rounded text-[#8696a0] hover:text-[#e9edef] transition-colors"
                                      title="העתק טקסט"
                                    >
                                      {copiedId === msg.id ? (
                                        <Check className="w-3.5 h-3.5 text-[#00a884]" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </div>
                                </div>

                                <div className="p-2.5 rounded-lg bg-[#111b21] border border-[#2a3942] text-sm text-[#e9edef] font-medium leading-relaxed select-text">
                                  {msg.text}
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                            )}
                          </div>
                        )}

                        {/* Message Timestamp & Checkmarks */}
                        <div className="flex items-center justify-end gap-1 text-[10px] text-[#8696a0] mt-1">
                          <span>
                            {new Date(msg.timestamp).toLocaleTimeString('he-IL', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {isUser && <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Active 10-Second Countdown Card in Chat */}
              {activeCountdown && activeCountdown.chatId === activeChat.id && (
                <div className="flex flex-col items-end animate-fadeIn">
                  <CountdownProgress
                    remainingSeconds={activeCountdown.remaining}
                    totalSeconds={activeCountdown.total}
                    onInstantSend={handleInstantSend}
                  />
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Inline Send Error Banner */}
            {sendError && (
              <div className="px-4 py-2 bg-red-500/15 border-t border-red-500/30 text-xs text-red-200 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{sendError}</span>
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {!isPersonalConnected && (
                    <button
                      onClick={() => {
                        setSendError(null);
                        setIsPersonalAccountModalOpen(true);
                      }}
                      className="px-2.5 py-1 bg-[#00a884] hover:bg-[#008f6f] text-white rounded-md font-bold text-[11px]"
                    >
                      חבר וואטסאפ עכשיו
                    </button>
                  )}
                  <button
                    onClick={() => setSendError(null)}
                    className="text-red-300 hover:text-white underline text-[11px]"
                  >
                    סגור
                  </button>
                </div>
              </div>
            )}

            {/* Single Clean Authentic WhatsApp Web Bottom Input Bar */}
            <WhatsAppInputBar
              onSendMessage={handleSendTextMessage}
              onSendVoiceNote={handleSendVoiceNote}
              isProcessing={isProcessing}
            />
          </>
        ) : (
          /* WhatsApp Web Clean Welcome Screen */
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#111b21] text-center border-b-6 border-[#00a884] select-none">
            <div className="max-w-md space-y-5 flex flex-col items-center">
              <div className="w-20 h-20 rounded-full bg-[#202c33] border border-[#2a3942] flex items-center justify-center text-[#00a884] shadow-xl">
                <Smartphone className="w-10 h-10" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-[#e9edef]">WhatsApp Web</h2>
                <p className="text-sm text-[#8696a0] leading-relaxed">
                  בוט תמלול הודעות קוליות ישירות מחשבון הוואטסאפ שלך.
                  <br />
                  הודעות קוליות מתומללות אוטומטית בעברית ונשלחות 10 שניות בדיוק לאחר קבלתן.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                {!isPersonalConnected ? (
                  <button
                    onClick={() => setIsPersonalAccountModalOpen(true)}
                    className="py-2.5 px-5 rounded-xl bg-[#00a884] hover:bg-[#008f6f] text-white text-sm font-bold flex items-center gap-2 shadow-lg transition-transform active:scale-95"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>חבר חשבון וואטסאפ (QR)</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setIsNewChatModalOpen(true)}
                    className="py-2.5 px-5 rounded-xl bg-[#00a884] hover:bg-[#008f6f] text-white text-sm font-bold flex items-center gap-2 shadow-lg transition-transform active:scale-95"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>פתח שיחה חדשה</span>
                  </button>
                )}
              </div>

              <div className="pt-8 text-xs text-[#8696a0] flex items-center gap-1.5 justify-center">
                <span>🔒</span>
                <span>מוגן ומאובטח בהצפנה מקצה לקצה</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ================= MODALS & DRAWERS ================= */}
      {/* 1. Chat Settings Drawer (Per-Chat Transcription Toggle) */}
      <ChatSettingsDrawer
        chat={activeChat}
        isOpen={isChatSettingsOpen}
        onClose={() => setIsChatSettingsOpen(false)}
        onToggleTranscription={handleToggleTranscription}
      />

      {/* 2. New Chat Modal */}
      <NewChatModal
        isOpen={isNewChatModalOpen}
        onClose={() => setIsNewChatModalOpen(false)}
        onCreateChat={handleCreateChat}
      />

      {/* 3. Personal WhatsApp Account QR & Pairing Modal */}
      <PersonalAccountModal
        isOpen={isPersonalAccountModalOpen}
        onClose={() => setIsPersonalAccountModalOpen(false)}
      />

      {/* 4. Global Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        delaySeconds={delaySeconds}
        setDelaySeconds={setDelaySeconds}
        autoPlayAudio={autoPlayAudio}
        setAutoPlayAudio={setAutoPlayAudio}
        onClearHistory={async () => {
          await fetch('/api/personal-bot/clear-chats', { method: 'POST' });
          await fetchChats();
        }}
      />

      {/* 5. Hourly Health Check & Diagnostic Bot Modal */}
      <HealthCheckModal
        isOpen={isHealthCheckModalOpen}
        onClose={() => setIsHealthCheckModalOpen(false)}
      />
    </div>
  );
}
