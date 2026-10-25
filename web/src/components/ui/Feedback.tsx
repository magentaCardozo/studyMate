import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { errorMessage } from '../../lib/api';

export function Spinner({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" role="status" aria-label="Chargement">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Loading({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted" aria-live="polite">
      <Spinner className="text-crimson" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-line/70 ${className}`} aria-hidden />;
}

export function SkeletonCards({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Chargement">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card space-y-3 p-5">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-line bg-white/60 px-6 py-12 text-center">
      {icon && <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-crimson-soft text-crimson">{icon}</div>}
      <h3 className="font-serif text-lg font-semibold">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Impossible de charger cette page' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-lg border border-danger/20 bg-danger-soft/60 px-6 py-10 text-center">
      <AlertTriangle className="mb-3 text-danger" size={28} aria-hidden />
      <h3 className="font-serif text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{errorMessage(error)}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-crimson hover:underline">
          <RefreshCw size={15} aria-hidden /> Réessayer
        </button>
      )}
    </div>
  );
}

export function Notice({ tone = 'info', children, title }: { tone?: 'info' | 'warning' | 'success' | 'danger'; children: ReactNode; title?: string }) {
  const tones = {
    info: 'border-line bg-white text-charcoal',
    warning: 'border-warning/30 bg-warning-soft text-charcoal',
    success: 'border-success/30 bg-success-soft text-charcoal',
    danger: 'border-danger/30 bg-danger-soft text-charcoal',
  };
  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${tones[tone]}`} role={tone === 'danger' ? 'alert' : undefined}>
      {title && <p className="mb-0.5 font-medium">{title}</p>}
      <div className="text-[13.5px] leading-relaxed">{children}</div>
    </div>
  );
}
