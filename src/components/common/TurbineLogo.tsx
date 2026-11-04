import React from 'react';

interface TurbineLogoProps {
  className?: string;
  size?: number;
  durationSeconds?: number;
}

export const TurbineLogo: React.FC<TurbineLogoProps> = ({
  className = '',
  size = 40,
  durationSeconds = 8,
}) => {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={`flex-none overflow-visible ${className}`}
      aria-hidden="true"
    >
      {/* Tower and nacelle */}
      <path d="M56 46h8l5 66H51z" fill="var(--hub-muted)" />
      
      {/* Rotor blades with dynamic CSS spin animation */}
      <g
        className="animate-turbine origin-[60px_46px]"
        style={{
          animationDuration: `${Math.max(1.5, durationSeconds)}s`,
        }}
      >
        {/* Blade 1 (up) */}
        <path d="M60 46 57 6q3-4 6 0z" fill="var(--hub-accent)" />
        {/* Blade 2 (120 deg) */}
        <path
          d="M60 46 57 6q3-4 6 0z"
          fill="var(--hub-accent)"
          transform="rotate(120 60 46)"
        />
        {/* Blade 3 (240 deg) */}
        <path
          d="M60 46 57 6q3-4 6 0z"
          fill="var(--hub-accent)"
          transform="rotate(240 60 46)"
        />
      </g>
      
      {/* Center amber rotor hub */}
      <circle cx="60" cy="46" r="5" fill="var(--hub-amber)" />
    </svg>
  );
};
