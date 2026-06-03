import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function SoccerBallIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3 L14.5 7 L12 10 L9.5 7 Z" />
      <path d="M12 14 L14.5 17 L12 21" />
      <path d="M12 14 L9.5 17 L12 21" />
      <path d="M3 12 L7 10.5 L9.5 7" />
      <path d="M21 12 L17 10.5 L14.5 7" />
      <path d="M9.5 17 L7 19.5" />
      <path d="M14.5 17 L17 19.5" />
    </Icon>
  );
}

export function CardsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="6" width="11" height="15" rx="2" transform="rotate(-8 8.5 13.5)" />
      <rect x="10" y="4" width="11" height="15" rx="2" transform="rotate(8 15.5 11.5)" />
    </Icon>
  );
}

export function QuestionIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function SwordsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14.5 17.5 21 11l-4-4-6.5 6.5" />
      <path d="M9.5 6.5 3 13l4 4 6.5-6.5" />
      <path d="M5 19l2-2" />
      <path d="M17 5l2-2" />
    </Icon>
  );
}

export function TrophyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4v2a3 3 0 0 0 3 3" />
      <path d="M17 6h3v2a3 3 0 0 1-3 3" />
      <path d="M10 14h4v3h-4z" />
      <path d="M8 20h8" />
      <path d="M12 17v3" />
    </Icon>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 5v14l12-7L7 5z" fill="currentColor" />
    </Icon>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v10h12V10" />
    </Icon>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 5l-7 7 7 7" />
      <path d="M8 12h12" />
    </Icon>
  );
}

export function SoundOnIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M16 9a3 3 0 0 1 0 6" />
      <path d="M18.5 7a6 6 0 0 1 0 10" />
    </Icon>
  );
}

export function SoundOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M22 9l-5 6" />
      <path d="M17 9l5 6" />
    </Icon>
  );
}

/** Çarpan jokeri — kesişen iki ok (büyüt/küçült çarpan sembolü). */
export function MultiplierIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 7l10 10" />
      <path d="M17 7L7 17" />
      <path d="M5 5l1.5 1.5" />
      <path d="M19 5l-1.5 1.5" />
      <path d="M5 19l1.5-1.5" />
      <path d="M19 19l-1.5-1.5" />
    </Icon>
  );
}

/** İstatistiği Gör jokeri — göz ikonu. */
export function EyeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

/** Transfer — iki yönlü değiş-tokuş okları. */
export function SwapIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 4 3 8l4 4" />
      <path d="M3 8h13" />
      <path d="M17 20l4-4-4-4" />
      <path d="M21 16H8" />
    </Icon>
  );
}

/** Joker (genel) — sihirli değnek / yıldız tını; bar başlığı için. */
export function JokerWandIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 19 16 8" />
      <path d="M14 6l4 4" />
      <path d="M18 4l.6 1.4L20 6l-1.4.6L18 8l-.6-1.4L16 6l1.4-.6L18 4Z" fill="currentColor" stroke="none" />
      <path d="M6 11l.5 1.2L7.7 12.7l-1.2.5L6 14.4l-.5-1.2L4.3 12.7l1.2-.5L6 11Z" fill="currentColor" stroke="none" />
    </Icon>
  );
}
