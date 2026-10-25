import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Spinner } from './Feedback';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet';
type Size = 'sm' | 'md' | 'lg';

const base = 'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55 whitespace-nowrap';
const variants: Record<Variant, string> = {
  primary: 'bg-crimson text-white hover:bg-crimson-dark active:bg-crimson-dark',
  secondary: 'border border-line bg-white text-charcoal hover:border-charcoal/30 hover:bg-ivory',
  ghost: 'text-charcoal hover:bg-charcoal/5',
  quiet: 'text-crimson hover:bg-crimson-soft',
  danger: 'bg-danger text-white hover:bg-danger/90',
};
const sizes: Record<Size, string> = { sm: 'h-8 px-3 text-[13px]', md: 'h-10 px-4 text-sm', lg: 'h-12 px-5 text-[15px]' };

export const buttonClass = (variant: Variant = 'primary', size: Size = 'md', extra = '') => `${base} ${variants[variant]} ${sizes[size]} ${extra}`;

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, Props>(({ variant = 'primary', size = 'md', loading, icon, children, className = '', disabled, type = 'button', ...rest }, ref) => (
  <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
    {loading ? <Spinner size={16} /> : icon}
    {children}
  </button>
));
Button.displayName = 'Button';

export function ButtonLink({ variant = 'primary', size = 'md', className = '', icon, children, ...rest }: LinkProps & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

export function IconButton({ label, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={`inline-flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-charcoal/5 hover:text-charcoal ${className}`} {...rest}>
      {children}
    </button>
  );
}
