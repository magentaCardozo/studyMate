/** Emblème original StudyMate AI : livre ouvert surmonté d'une étoile du savoir. */
export function LogoMark({ size = 32, className = '', inverted = false }: { size?: number; className?: string; inverted?: boolean }) {
  // Version inversée (fond ivoire, livre cramoisi) pour les surfaces cramoisies.
  const bg = inverted ? '#F7F4ED' : '#A51C30';
  const fg = inverted ? '#A51C30' : '#F7F4ED';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="12" fill={bg} />
      <path d="M14 20c6-2 12-1.5 18 2v26c-6-3.5-12-4-18-2V20z" fill={fg} />
      <path d="M50 20c-6-2-12-1.5-18 2v26c6-3.5 12-4 18-2V20z" fill={inverted ? '#7F1425' : '#FFFFFF'} />
      <path d="M44 9l1.6 3.6L49 14l-3.4 1.4L44 19l-1.6-3.6L39 14l3.4-1.4z" fill={fg} />
    </svg>
  );
}

export function Logo({ size = 32, inverted = false }: { size?: number; inverted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5" aria-label="StudyMate AI">
      <LogoMark size={size} inverted={inverted} />
      <span className={`font-serif text-[19px] font-semibold tracking-tight ${inverted ? 'text-white' : 'text-charcoal'}`}>
        StudyMate<span className={`ml-1 align-top font-sans text-[11px] font-semibold tracking-[0.12em] ${inverted ? 'text-white/80' : 'text-crimson'}`}>AI</span>
      </span>
    </span>
  );
}
