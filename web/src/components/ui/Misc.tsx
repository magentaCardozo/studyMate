import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, MoreHorizontal } from 'lucide-react';

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'crimson' | 'success' | 'warning' | 'danger' | 'outline'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-charcoal/[0.06] text-charcoal',
    crimson: 'bg-crimson-soft text-crimson-dark',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    outline: 'border border-line text-muted',
  };
  return <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function DemoBadge() {
  return <Badge tone="outline">Démo</Badge>;
}

export function ProgressBar({ value, label, tone = 'crimson' }: { value: number; label?: string; tone?: 'crimson' | 'success' }) {
  return (
    <div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`h-full rounded-full ${tone === 'success' ? 'bg-success' : 'bg-crimson'}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Fil d’Ariane" className="mb-3 overflow-x-auto">
      <ol className="flex items-center gap-1 whitespace-nowrap text-[13px] text-muted">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} aria-hidden className="text-muted/60" />}
            {item.to && i < items.length - 1 ? (
              <Link to={item.to} className="hover:text-crimson hover:underline">
                {item.label}
              </Link>
            ) : (
              <span aria-current={i === items.length - 1 ? 'page' : undefined} className={i === items.length - 1 ? 'text-charcoal' : ''}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5">{eyebrow}</div>}
        <h1 className="page-title break-words">{title}</h1>
        {subtitle && <div className="mt-1.5 text-[15px] text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label, controls }: { tabs: { id: T; label: string; shortLabel?: string; count?: number; icon?: ReactNode }[]; value: T; onChange: (v: T) => void; label?: string; controls?: string }) {
  return (
    <div role="tablist" aria-label={label} className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          aria-controls={controls}
          onClick={() => onChange(t.id)}
          className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${value === t.id ? 'border-crimson text-crimson' : 'border-transparent text-muted hover:text-charcoal'}`}
        >
          {t.icon}
          {t.shortLabel ? (
            <>
              <span className="sm:hidden">{t.shortLabel}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </>
          ) : (
            t.label
          )}
          {t.count !== undefined && <span className={`rounded-full px-1.5 py-px text-[11px] tabular-nums ${value === t.id ? 'bg-crimson text-white' : 'bg-charcoal/[0.07] text-muted'}`}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

/** Menu contextuel accessible au clavier (actions déplacer, renommer, supprimer…). */
export function Menu({ items, label = 'Plus d’actions' }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-charcoal/5 hover:text-charcoal"
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 min-w-[190px] rounded-md border border-line bg-white py-1 shadow-pop"
          onKeyDown={(e) => {
            const els = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
            const i = els.indexOf(document.activeElement as HTMLElement);
            if (e.key === 'ArrowDown') (e.preventDefault(), els[(i + 1) % els.length]?.focus());
            if (e.key === 'ArrowUp') (e.preventDefault(), els[(i - 1 + els.length) % els.length]?.focus());
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                item.onClick();
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-ivory focus:bg-ivory focus:outline-none ${item.danger ? 'text-danger' : 'text-charcoal'}`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string; icon?: ReactNode }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          aria-label={o.label}
          title={o.label}
          onClick={() => onChange(o.id)}
          className={`inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-[13px] font-medium ${value === o.id ? 'bg-charcoal text-white' : 'text-muted hover:text-charcoal'}`}
        >
          {o.icon}
          {!o.icon && o.label}
        </button>
      ))}
    </div>
  );
}
