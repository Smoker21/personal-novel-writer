import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'success';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
}

const variantClass: Record<Variant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover disabled:bg-ink-300 disabled:text-ink-500',
  secondary:
    'bg-ink-100 text-ink-800 hover:bg-ink-200 dark:bg-ink-700 dark:text-ink-100 dark:hover:bg-ink-600 disabled:opacity-50',
  ghost:
    'bg-transparent text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-700 disabled:opacity-50',
  destructive:
    'bg-status-error text-white hover:bg-red-700 disabled:opacity-50',
  success:
    'bg-status-saved text-white hover:bg-emerald-700 disabled:opacity-50',
};

const sizeClass: Record<Size, string> = {
  sm: 'text-xs px-2.5 py-1.5 gap-1',
  md: 'text-sm px-3.5 py-2 gap-1.5',
  lg: 'text-base px-5 py-2.5 gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  leftIcon,
  children,
  className = '',
  disabled,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={
        'inline-flex items-center justify-center rounded-btn font-medium transition-colors ' +
        'focus:outline-none focus:ring-2 focus:ring-accent/40 ' +
        variantClass[variant] +
        ' ' +
        sizeClass[size] +
        ' ' +
        className
      }
    >
      {loading ? (
        <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
      ) : (
        leftIcon
      )}
      {children}
    </button>
  );
}
