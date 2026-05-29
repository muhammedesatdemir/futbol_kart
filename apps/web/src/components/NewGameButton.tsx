'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { PlayIcon } from './icons';

export function NewGameButton({ label }: { label: string }) {
  const href = useMemo(
    () => `/oyna/${Math.random().toString(36).slice(2, 10)}`,
    [],
  );
  return (
    <span className="relative inline-flex">
      {/* Glow ring — sürekli dışa açılan radyo dalgası */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0 rounded-full bg-accent-gold/40 animate-cta-ring motion-reduce:hidden"
      />
      <Link
        href={href}
        prefetch
        className="btn-primary relative z-10 animate-cta-pulse motion-reduce:animate-none"
      >
        <PlayIcon size={16} />
        {label}
      </Link>
    </span>
  );
}
