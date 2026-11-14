import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Mic } from 'lucide-react';

interface AudioWaveformProps {
  audioUrl?: string;
  durationSeconds: number;
  isSender?: boolean;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  audioUrl,
  durationSeconds,
  isSender = true,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [audioError, setAudioError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Waveform bar heights
  const waveformHeights = useRef<number[]>(
    Array.from({ length: 28 }, (_, i) => {
      const v = Math.sin(i * 0.4) * 12 + Math.cos(i * 0.9) * 8 + 18;
      return Math.max(6, Math.min(30, Math.round(v)));
    })
  ).current;

  const togglePlay = () => {
    if (!audioUrl) return;

    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      setAudioError(false);
      if (!audioRef.current || audioRef.current.src !== audioUrl) {
        audioRef.current = new Audio(audioUrl);
        audioRef.current.playbackRate = playbackSpeed;
        audioRef.current.ontimeupdate = () => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        };
        audioRef.current.onended = () => {
          setIsPlaying(false);
          setCurrentTime(0);
        };
        audioRef.current.onerror = () => {
          setIsPlaying(false);
          setAudioError(true);
        };
      }
      setIsPlaying(true);
      audioRef.current.play().catch(() => {
        setIsPlaying(false);
        setAudioError(true);
      });
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const speeds = [1, 1.5, 2];
    const nextIndex = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const nextSpeed = speeds[nextIndex];
    setPlaybackSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const formatSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPct = durationSeconds > 0 ? (currentTime / durationSeconds) * 100 : 0;

  return (
    <div className="flex items-center gap-3 w-full min-w-[240px] max-w-[320px] select-none py-1">
      {/* Mic Avatar Icon */}
      <div className="relative shrink-0">
        <div
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
            isSender
              ? 'bg-[#00a884]/20 text-[#00a884] border border-[#00a884]/40'
              : 'bg-[#53bdeb]/20 text-[#53bdeb] border border-[#53bdeb]/40'
          }`}
        >
          <Mic className={`w-5 h-5 ${isPlaying ? 'animate-pulse text-[#25d366]' : ''}`} />
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#00a884] flex items-center justify-center text-white text-[9px] shadow-sm">
          🎙️
        </div>
      </div>

      {/* Play/Pause Button */}
      <button
        onClick={togglePlay}
        disabled={!audioUrl}
        aria-label={isPlaying ? 'השהה הודעה קולית' : 'השמע הודעה קולית'}
        title={!audioUrl ? 'קובץ השמע אינו זמין במטמון' : undefined}
        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed ${
          isPlaying
            ? 'bg-[#00a884] text-white hover:bg-[#008f6f]'
            : 'bg-white/10 hover:bg-white/20 text-[#e9edef]'
        }`}
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>

      {/* Waveform and Time */}
      <div className="flex-1 flex flex-col justify-center min-w-0">
        <div
          className={`flex items-center gap-[2.5px] h-8 relative ${audioUrl ? 'cursor-pointer' : 'cursor-default'} group`}
          onClick={togglePlay}
        >
          {waveformHeights.map((h, i) => {
            const barPct = (i / waveformHeights.length) * 100;
            const isFilled = barPct <= progressPct;
            return (
              <div
                key={i}
                className="flex-1 rounded-full transition-colors duration-150"
                style={{
                  height: `${h}px`,
                  backgroundColor: isFilled
                    ? '#00a884'
                    : isSender
                    ? 'rgba(255, 255, 255, 0.35)'
                    : 'rgba(255, 255, 255, 0.25)',
                }}
              />
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[11px] text-[#8696a0] font-mono mt-0.5">
          <span>
            {audioError ? 'שגיאה בטעינת שמע' : isPlaying ? formatSec(currentTime) : formatSec(durationSeconds)}
          </span>
          <button
            onClick={cycleSpeed}
            className="text-[10px] bg-white/10 hover:bg-white/20 text-[#aebac1] px-1.5 py-0.5 rounded font-sans transition-colors"
            title="שנה מהירות ניגון"
          >
            {playbackSpeed}x
          </button>
        </div>
      </div>
    </div>
  );
};
