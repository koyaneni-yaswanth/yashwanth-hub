import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'teal' | 'amber' | 'red' | 'blue' | 'purple' | 'emerald' | 'gray';
  className?: string;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'teal',
  className = '',
  dot = false,
}) => {
  const variantStyles = {
    teal: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20',
    amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
    red: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20',
    blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20',
    purple: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
    gray: 'bg-gray-500/10 text-gray-700 dark:text-gray-300 border-gray-500/20',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${variantStyles[variant]} ${className}`}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            variant === 'red'
              ? 'bg-red-500'
              : variant === 'amber'
              ? 'bg-amber-500'
              : variant === 'emerald' || variant === 'teal'
              ? 'bg-teal-500'
              : 'bg-current'
          }`}
        />
      )}
      {children}
    </span>
  );
};

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
