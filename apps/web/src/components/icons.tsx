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
