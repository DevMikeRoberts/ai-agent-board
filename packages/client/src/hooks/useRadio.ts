import { useState, useRef, useEffect, useCallback } from 'react';

const STREAM_URL = 'https://streams.ilovemusic.de/iloveradio17.mp3';

export interface UseRadioReturn {
  on: boolean;
  volume: number;
  toggle: () => void;
  setVolume: (v: number) => void;
}

/**
 * Owns the audio element and playback state for the retro internet radio.
 * Lives at the App root so it survives route / project switches.
 */
export function useRadio(): UseRadioReturn {
  const [on, setOn] = useState(false);
  const [volume, setVolume] = useState(0.35);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Create audio element once
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = volume;
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, []);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (on) {
      audio.pause();
      audio.src = '';
      setOn(false);
    } else {
      audio.src = STREAM_URL;
      audio.play().catch(() => {});
      setOn(true);
    }
  }, [on]);

  return { on, volume, toggle, setVolume };
}
