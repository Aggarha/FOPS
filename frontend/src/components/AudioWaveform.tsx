'use client';

import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';

interface AudioWaveformProps {
  url?: string;
  title?: string;
  onReady?: (wavesurfer: WaveSurfer) => void;
}

export function AudioWaveform({ url, title = 'Audio Waveform', onReady }: AudioWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize WaveSurfer
    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#00FF9C',
      progressColor: '#00CC7A',
      cursorColor: '#00FF9C',
      barWidth: 3,
      barRadius: 3,
      barGap: 2,
      height: 80,
      normalize: true,
    } as any);

    wavesurferRef.current = wavesurfer;

    // Set up event listeners
    wavesurfer.on('play', () => setIsPlaying(true));
    wavesurfer.on('pause', () => setIsPlaying(false));
    wavesurfer.on('ready', () => {
      setDuration(wavesurfer.getDuration());
      onReady?.(wavesurfer);
    });
    wavesurfer.on('timeupdate', (time) => {
      setCurrentTime(time);
    });

    // Load audio if URL provided
    if (url) {
      wavesurfer.load(url);
    }

    return () => {
      wavesurfer.destroy();
    };
  }, [url, onReady]);

  const handlePlayPause = () => {
    wavesurferRef.current?.playPause();
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-gradient-to-b from-gray-900 to-black border border-green-500/30 rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-green-400 uppercase tracking-wider">{title}</h3>
        <button
          onClick={handlePlayPause}
          className="px-4 py-2 bg-green-600 hover:bg-green-500 text-black font-bold rounded transition-colors text-sm"
        >
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>
      </div>

      {/* Waveform container with glow */}
      <div className="relative">
        <div className="absolute inset-0 bg-green-500/10 blur-xl rounded"></div>
        <div ref={containerRef} className="relative z-10" />
      </div>

      {/* Time display */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
