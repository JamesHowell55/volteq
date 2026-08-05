interface IconProps {
  size?: number;
}

const common = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function ShareIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} {...common}>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <line x1="8.2" y1="10.7" x2="15.8" y2="6.3" />
      <line x1="8.2" y1="13.3" x2="15.8" y2="17.7" />
    </svg>
  );
}

export function SaveIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} {...common}>
      <path d="M5 3h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M8 3v6h8V3" />
      <path d="M8 21v-7h8v7" />
    </svg>
  );
}

export function FeedbackIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} {...common}>
      <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4.5 3.5A0.5 0.5 0 0 1 3.7 20V17a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
      <line x1="8" y1="9.5" x2="16" y2="9.5" />
      <line x1="8" y1="13" x2="13" y2="13" />
    </svg>
  );
}

export function DownloadIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} {...common}>
      <path d="M12 3v12" />
      <path d="M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </svg>
  );
}
