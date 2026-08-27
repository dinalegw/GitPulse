'use client';

import { forwardRef, SelectHTMLAttributes } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'input-field appearance-none bg-bg-primary',
        'pr-10', // space for chevron
        error && 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20',
        className
      )}
      {...props}
    />
  )
);

Select.displayName = 'Select';

interface SelectTriggerProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function SelectTrigger({ children, className, onClick }: SelectTriggerProps) {
  return (
    <div
      className={cn(
        'relative w-full',
        className
      )}
      onClick={onClick}
    >
      <Select>{children}</Select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted">
        <ChevronDown className="h-4 w-4" />
      </div>
    </div>
  );
}

interface SelectValueProps {
  placeholder?: string;
  children?: React.ReactNode;
}

export function SelectValue({ placeholder, children }: SelectValueProps) {
  if (children) return <span>{children}</span>;
  return <span className="text-text-muted/50">{placeholder}</span>;
}

interface SelectContentProps {
  children: React.ReactNode;
  className?: string;
  position?: 'popper' | 'inline';
}

export function SelectContent({ children, className, position = 'popper' }: SelectContentProps) {
  return (
    <div
      className={cn(
        'absolute z-50 w-full max-h-60 overflow-y-auto rounded-lg border border-border-subtle bg-bg-card shadow-lg',
        'mt-1 py-1',
        position === 'popper' && 'animate-in fade-in-0 zoom-in-95',
        className
      )}
    >
      {children}
    </div>
  );
}

interface SelectItemProps {
  value: string;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export function SelectItem({ value, children, disabled, className }: SelectItemProps) {
  return (
    <option
      value={value}
      disabled={disabled}
      className={cn(
        'px-4 py-2 text-sm text-text-primary hover:bg-accent-primary/10',
        'focus:bg-accent-primary/10 focus:outline-none',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {children}
    </option>
  );
}

SelectItem.displayName = 'SelectItem';