'use client';

import { cn } from '@/lib/cn';

interface CardRowProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Kart sırası kabı — DÜZ div (motion DEĞİL).
 *
 * Eskiden `motion.div` + `variants(initial="hidden" animate="show")` idi ama
 * staggerChildren çocuklara HİÇ uygulanmıyordu (çocuk kartlar motion.div değil,
 * className-transition'lı düz div). Yani animasyonun görsel faydası yoktu AMA
 * ONLINE'da ZARARI vardı: re-render fırtınası (Ably + 1.5/5sn poll + her aksiyon
 * sonrası refresh) container'ı "hidden" varyantına geri düşürüp kartları bir an
 * GÖRÜNMEZ/yarı-saydam bırakıyordu → "bazen sol bazen sağ kart eksik" artefaktı.
 * Düz div bu yarışı kökten keser; offline'da görsel sonuç aynı (zaten etkisizdi).
 */
export function CardRow({ children, className }: CardRowProps) {
  return (
    <div className={cn('flex flex-wrap items-end gap-3 sm:gap-4', className)}>
      {children}
    </div>
  );
}
