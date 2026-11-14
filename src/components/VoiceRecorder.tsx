import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Trash2, Send, Paperclip } from 'lucide-react';

interface WhatsAppInputBarProps {
  onSendMessage: (text: string) => void;
  onSendVoiceNote: (params: {
    audioBase64?: string;
    audioBlob?: Blob;
    mimeType: string;
    durationSeconds: number;
    title: string;
  }) => void;
  isProcessing: boolean;
}

export const WhatsAppInputBar: React.FC<WhatsAppInputBarProps> = ({
  onSendMessage,
  onSendVoiceNote,
  isProcessing,
}) => {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Start real microphone recording
  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
      setMicError(null);
    } catch (err) {
      console.error('Microphone access error:', err);
      setMicError('לא ניתן לגשת למיקרופון בדפדפן. ודא שהענקת הרשאת גישה למיקרופון.');
    }
  };

  // Stop recording and send
  const stopAndSend = () => {
    if (!mediaRecorderRef.current) return;

    const recorder = mediaRecorderRef.current;
    recorder.onstop = async () => {
      const mimeType = recorder.mimeType || 'audio/webm';
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Data = (reader.result as string).split(',')[1];
        onSendVoiceNote({
          audioBase64: base64Data,
          audioBlob,
          mimeType,
          durationSeconds: Math.max(1, recordingSeconds),
          title: `הודעה קולית (${recordingSeconds} שנ')`,
        });
      };
      reader.readAsDataURL(audioBlob);

      recorder.stream.getTracks().forEach((track) => track.stop());
    };

    recorder.stop();
    cleanUpRecording();
  };

  // Cancel recording
  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
    }
    cleanUpRecording();
  };

  const cleanUpRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setIsRecording(false);
    setRecordingSeconds(0);
    audioChunksRef.current = [];
  };

  // File upload for audio
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1];
      onSendVoiceNote({
        audioBase64: base64Data,
        mimeType: file.type || 'audio/ogg',
        durationSeconds: 5,
        title: file.name,
      });
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmitText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSendMessage(text.trim());
    setText('');
  };

  useEffect(() => {
    return () => {
      cleanUpRecording();
    };
  }, []);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="bg-[#202c33] border-t border-[#313d45]">
      {micError && (
        <div className="px-4 py-1.5 bg-red-500/15 border-b border-red-500/30 text-xs text-red-300 flex items-center justify-between">
          <span>{micError}</span>
          <button
            type="button"
            onClick={() => setMicError(null)}
            className="text-red-200 hover:text-white underline text-[11px]"
          >
            סגור
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 p-2.5 px-4">
      {/* Hidden File Input for audio attachment */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Attach Audio Button */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isProcessing || isRecording}
        aria-label="צרף קובץ שמע"
        className="p-2 text-[#8696a0] hover:text-[#d1d7db] hover:bg-white/5 rounded-full transition-colors disabled:opacity-40 shrink-0"
        title="צרף קובץ שמע"
      >
        <Paperclip className="w-5 h-5 rotate-45" />
      </button>

      {/* Center: Either Voice Recording Status or Text Input */}
      {isRecording ? (
        <div className="flex-1 flex items-center justify-between bg-[#111b21] rounded-xl px-4 py-2 border border-red-500/40">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 font-mono text-sm font-semibold">
              {formatTimer(recordingSeconds)}
            </span>
            <span className="text-xs text-[#8696a0]">מקליט הודעה קולית...</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cancelRecording}
              aria-label="בטל הקלטה"
              className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-full transition-colors"
              title="בטל הקלטה"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={stopAndSend}
              aria-label="שלח הקלטה"
              className="p-2 bg-[#00a884] hover:bg-[#008f6f] text-white rounded-full transition-transform active:scale-95 shadow-md flex items-center justify-center"
              title="שלח הקלטה"
            >
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmitText} className="flex-1 flex items-center">
          <input
            type="text"
            placeholder="הקלד הודעה..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full bg-[#2a3942] rounded-xl px-4 py-2 text-sm text-[#e9edef] placeholder-[#8696a0] outline-none border border-transparent focus:border-[#00a884]/40 transition-colors"
          />
        </form>
      )}

      {/* Left Action: Either Send Text Button or Microphone Button */}
      {!isRecording && (
        <>
          {text.trim() ? (
            <button
              type="button"
              onClick={handleSubmitText}
              aria-label="שלח הודעה"
              className="p-2.5 bg-[#00a884] hover:bg-[#008f6f] text-white rounded-full transition-transform active:scale-95 shadow-md flex items-center justify-center shrink-0"
              title="שלח הודעה"
            >
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              disabled={isProcessing}
              aria-label="הקלט הודעה קולית"
              className="p-2.5 bg-[#00a884] hover:bg-[#008f6f] text-white rounded-full transition-transform active:scale-95 shadow-md flex items-center justify-center shrink-0 disabled:opacity-50"
              title="לחץ להקלטת הודעה קולית"
            >
              <Mic className="w-5 h-5" />
            </button>
          )}
        </>
      )}
      </div>
    </div>
  );
};
