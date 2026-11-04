import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: React.ReactNode;
  trend?: string;
  className?: string;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtext,
  icon,
  className = '',
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={`bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-4 transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:border-[var(--hub-accent)] hover:shadow-md' : ''
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--hub-muted)]">
          {label}
        </span>
        {icon && <div className="text-[var(--hub-accent)]">{icon}</div>}
      </div>
      <div className="text-2xl font-bold font-heading text-[var(--hub-ink)] tracking-tight">
        {value}
      </div>
      {subtext && (
        <div className="text-xs text-[var(--hub-muted)] mt-1 truncate">{subtext}</div>
      )}
    </div>
  );
};
