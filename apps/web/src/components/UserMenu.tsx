'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { authClient, useSession } from '@/lib/authClient';
import { cn } from '@/lib/cn';

/**
 * Sağ üst köşede kullanıcı durumu rozeti.
 * - Oturum yoksa: "Giriş" linki
 * - Oturum varsa: ad/baş harfler + tıklayınca açılan dropdown (Çıkış)
 *
 * Skeleton: oturum yüklenirken görünmez kalır — header layout'unu
 * bozmasın diye sabit yer tutar.
 */
export function UserMenu() {
  const { data: session, isPending } = useSession();
  const [open, setOpen] = useState(false);

  if (isPending) {
    return <div className="h-7 w-20 rounded-full bg-white/5" aria-hidden />;
  }

  if (!session?.user) {
    return (
      <Link
        href="/giris"
        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/70 transition hover:border-white/20 hover:bg-white/10"
      >
        Giriş
      </Link>
    );
  }

  const user = session.user;
  const display = user.name?.trim() || user.email;
  const initial = display.charAt(0).toUpperCase();

  const handleSignOut = async () => {
    setOpen(false);
    await authClient.signOut();
    // Sayfayı yenile — middleware/SSR auth state sıfırlansın
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3',
          'text-xs font-semibold text-white/85 transition hover:border-white/20 hover:bg-white/10',
        )}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-gold/25 text-[11px] font-bold text-accent-goldHi ring-1 ring-accent-gold/40">
          {initial}
        </span>
        <span className="max-w-[120px] truncate">{display}</span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Overlay — dışına tıklayınca kapat */}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-30 cursor-default"
              aria-hidden
            />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              role="menu"
              className="glass-panel-strong absolute right-0 top-full z-40 mt-2 w-48 overflow-hidden p-1"
            >
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
                {user.email}
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-white/85 transition hover:bg-white/10"
                role="menuitem"
              >
                Çıkış yap
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
