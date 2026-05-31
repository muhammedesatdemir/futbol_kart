'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

interface PlayerSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  /** Filtrelenmiş sonuç sayısı — "247 oyuncu" gibi göstermek için */
  resultCount?: number;
  /** Total havuz sayısı — "/2702 arasında" */
  totalCount?: number;
  /** Tema rengi (sağ avatar gibi düşün); default: white/translucent */
  placeholder?: string;
}

export function PlayerSearchBar({
  value,
  onChange,
  resultCount,
  totalCount,
  placeholder = 'Ara: ad, ülke, lig, takım veya #forma…',
}: PlayerSearchBarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ⌘K / Ctrl+K ile odaklan (masaüstü kısayolu)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      // Esc → temizle
      if (e.key === 'Escape' && document.activeElement === inputRef.current && value.length > 0) {
        onChange('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [value, onChange]);

  const clear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 rounded-2xl border px-4 py-3',
        'border-white/12 bg-black/35 backdrop-blur',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
        'focus-within:border-accent-gold/50 focus-within:shadow-[0_0_0_3px_rgba(240,193,75,0.18),inset_0_1px_0_rgba(255,255,255,0.06)]',
        'transition',
      )}
    >
      {/* Magnifier ikonu (saf SVG, küçük) */}
      <svg
        className="h-5 w-5 shrink-0 text-white/45 group-focus-within:text-accent-gold transition"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>

      <input
        ref={inputRef}
        type="search"
        inputMode="search"
        autoComplete="off"
        spellCheck={false}
        className={cn(
          'flex-1 bg-transparent text-base font-medium text-white outline-none',
          'placeholder:text-white/35',
        )}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Oyuncu ara"
      />

      {/* Sonuç sayısı veya kısayol ipucu */}
      <div className="flex items-center gap-2">
        {value.length > 0 ? (
          <>
            {typeof resultCount === 'number' && (
              <span className="hidden text-xs font-semibold text-white/55 sm:inline">
                {resultCount}
                {typeof totalCount === 'number' && totalCount !== resultCount && (
                  <span className="text-white/30"> / {totalCount}</span>
                )}
              </span>
            )}
            <button
              type="button"
              onClick={clear}
              className="rounded-md p-1 text-white/45 hover:bg-white/10 hover:text-white transition"
              aria-label="Aramayı temizle"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M6 6 18 18 M18 6 6 18" />
              </svg>
            </button>
          </>
        ) : (
          <kbd className="hidden rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-white/50 sm:inline">
            ⌘K
          </kbd>
        )}
      </div>
    </div>
  );
}
