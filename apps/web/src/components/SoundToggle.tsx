'use client';

import { useEffect, useState } from 'react';
import { useSoundStore } from '@/lib/soundStore';
import { SoundOnIcon, SoundOffIcon } from '@/components/icons';
import { cn } from '@/lib/cn';

/**
 * Ses aç/kapa düğmesi — header'a yerleşir.
 * Tercih localStorage'da (soundStore, skipHydration), bu yüzden client'ta
 * rehydrate edilir; SSR'da fallback "kapalı" gösterilir.
 */
export function SoundToggle() {
  const enabled = useSoundStore((s) => s.enabled);
  const toggle = useSoundStore((s) => s.toggle);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    useSoundStore.persist.rehydrate();
    setReady(true);
  }, []);

  const on = ready && enabled;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? 'Sesi kapat' : 'Sesi aç'}
      title={on ? 'Ses açık' : 'Ses kapalı'}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-full border transition',
        on
          ? 'border-accent-gold/40 bg-accent-gold/15 text-accent-goldHi hover:bg-accent-gold/25'
          : 'border-white/10 bg-white/5 text-white/55 hover:bg-white/10 hover:text-white/80',
      )}
    >
      {on ? <SoundOnIcon size={16} /> : <SoundOffIcon size={16} />}
    </button>
  );
}
