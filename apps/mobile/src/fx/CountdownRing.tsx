import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Canvas,
  Circle,
  Path,
  Skia,
  Group,
} from '@shopify/react-native-skia';
import { useSfx } from '../lib/useSfx';

const TICK_FROM_SECONDS = 5;

interface CountdownRingProps {
  seconds: number;
  /** ONLINE: sunucu-otoriteli bitiş anı (epoch ms). Verilirse buna kilitlenir. */
  deadlineMs?: number | null;
  onComplete: () => void;
  runKey?: string | number;
  color?: string;
  urgentColor?: string;
  size?: number;
  stroke?: number;
  paused?: boolean;
}

/**
 * Dairesel geri sayım. Web karşılığı: CountdownRing.tsx — AYNI RAF/deadline/tik
 * mantığı; görsel Skia'ya taşındı (web SVG stroke-dashoffset → Skia path trim).
 *
 * - Ortada saniye, kenarında süreyle orantılı akıcı dolan halka (60fps).
 * - Son %30'da urgentColor + hafif büyüme nabzı.
 * - Son 5sn tik-tak loop sesi (seçim yapılınca / süre bitince / pause'da durur).
 */
export function CountdownRing({
  seconds,
  deadlineMs = null,
  onComplete,
  runKey = 'once',
  color = '#f0c14b',
  urgentColor = '#ef4444',
  size = 48,
  stroke = 4,
  paused = false,
}: CountdownRingProps) {
  const [ratio, setRatio] = useState(1);
  const playSfx = useSfx();
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    completedRef.current = false;
    setRatio(1);

    const totalMs = seconds * 1000;
    let raf = 0;
    let startTs: number | null = null;
    let pausedAccum = 0;
    let pauseStartedAt: number | null = null;

    const finish = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      playSfx.stop('tick');
      setRatio(0);
      onCompleteRef.current();
    };

    // ONLINE (deadline-tabanlı).
    if (deadlineMs != null) {
      const deadlineTick = () => {
        if (pausedRef.current) {
          raf = requestAnimationFrame(deadlineTick);
          return;
        }
        const remainingMs = deadlineMs - Date.now();
        const r = Math.max(0, Math.min(1, remainingMs / totalMs));
        setRatio(r);
        if (remainingMs <= 0) {
          finish();
          return;
        }
        raf = requestAnimationFrame(deadlineTick);
      };
      raf = requestAnimationFrame(deadlineTick);
      return () => cancelAnimationFrame(raf);
    }

    const tick = (ts: number) => {
      if (startTs === null) startTs = ts;
      if (pausedRef.current) {
        if (pauseStartedAt === null) pauseStartedAt = ts;
        raf = requestAnimationFrame(tick);
        return;
      }
      if (pauseStartedAt !== null) {
        pausedAccum += ts - pauseStartedAt;
        pauseStartedAt = null;
      }
      const elapsed = ts - startTs - pausedAccum;
      const r = Math.max(0, 1 - elapsed / totalMs);
      setRatio(r);
      if (r <= 0) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, seconds, deadlineMs]);

  // Aciliyet tik-tak (loop) — son TICK_FROM_SECONDS saniyede.
  useEffect(() => {
    const sec = ratio * seconds;
    const inWindow =
      !paused && !completedRef.current && sec > 0 && sec <= TICK_FROM_SECONDS;
    if (inWindow) playSfx.loop('tick');
    else playSfx.stop('tick');
  }, [ratio, seconds, paused, playSfx]);

  useEffect(() => {
    return () => playSfx.stop('tick');
  }, [playSfx]);

  const urgent = ratio <= 0.3;
  const ringColor = urgent ? urgentColor : color;
  const displaySec = Math.max(0, Math.ceil(ratio * seconds));

  // Skia geometri: merkez, yarıçap, dolu arc (-90°'den başlar, saat yönü).
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - stroke) / 2;

  // Dolu arc path'i: oval üzerinde -90° başlangıç, ratio*360° süpürme.
  const arc = Skia.Path.Make();
  const sweep = 360 * ratio;
  arc.addArc(
    { x: cx - r, y: cy - r, width: r * 2, height: r * 2 },
    -90,
    sweep,
  );

  return (
    <View style={{ width: size, height: size }}>
      <Canvas style={StyleSheet.absoluteFill}>
        {/* İz (boş halka) */}
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          style="stroke"
          strokeWidth={stroke}
          color="rgba(255,255,255,0.12)"
        />
        {/* Dolu kısım — orantılı, yuvarlak uç + glow */}
        <Group>
          <Path
            path={arc}
            style="stroke"
            strokeWidth={stroke}
            strokeCap="round"
            color={ringColor}
          />
        </Group>
      </Canvas>
      <View style={styles.center} pointerEvents="none">
        <Text style={[styles.num, { color: ringColor }]}>{displaySec}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  num: {
    fontSize: 13,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
});
