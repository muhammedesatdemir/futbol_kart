'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayIcon } from './icons';
import { cn } from '@/lib/cn';
import type { GameMode, PlayerSide } from '@futbol-kart/shared-types';
import type { SessionState } from '@/lib/sessionMachine';

interface ShareMatchButtonProps {
  mode: GameMode;
  p1Name: string;
  p2Name: string;
  p1Score: number;
  p2Score: number;
  winnerSide: PlayerSide | 'tie';
  totalRounds: number;
  snapshot: SessionState;
}

type Status = 'idle' | 'saving' | 'ready' | 'error';

export function ShareMatchButton(props: ShareMatchButtonProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (status === 'saving' || status === 'ready') return;
    setStatus('saving');
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: props.mode,
          p1Name: props.p1Name,
          p2Name: props.p2Name,
          p1Score: props.p1Score,
          p2Score: props.p2Score,
          winnerSide: props.winnerSide,
          totalRounds: props.totalRounds,
          snapshot: props.snapshot,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { url?: string } = await res.json();
      if (!data.url) throw new Error('Sunucu URL döndürmedi');
      setShareUrl(data.url);
      setStatus('ready');
      await copy(data.url);
    } catch {
      setStatus('error');
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard yoksa sessizce devam
    }
  };

  if (status === 'ready' && shareUrl) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <input
            readOnly
            value={shareUrl}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            className={cn(
              'rounded-full border border-white/15 bg-black/30 px-4 py-2',
              'text-xs text-white/85 outline-none focus:border-accent-gold/60',
              'min-w-[260px] max-w-full',
            )}
          />
          <button
            type="button"
            onClick={() => copy(shareUrl)}
            className="btn-ghost text-xs"
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={copied ? 'copied' : 'copy'}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                {copied ? 'Kopyalandı ✓' : 'Kopyala'}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={status === 'saving'}
      className="btn-ghost disabled:opacity-50"
    >
      <PlayIcon size={14} />
      {status === 'saving'
        ? 'Hazırlanıyor…'
        : status === 'error'
          ? 'Tekrar dene'
          : 'Maçı paylaş'}
    </button>
  );
}
