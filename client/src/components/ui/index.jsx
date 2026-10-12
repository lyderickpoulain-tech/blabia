import { useLayoutEffect, useRef } from 'react';

// Composants partagés de la refonte UX v5.1 (docs/feuille-de-route-v5.1.md).
// Une couleur, un sens : action (bleu), await (ambre : attend l'humain),
// ok (vert : validé), ai (violet : produit par l'IA), muted (gris : secondaire).

const cx = (...c) => c.filter(Boolean).join(' ');

const BUTTON_VARIANTS = {
  primary:   'bg-action text-white hover:bg-action-dark border border-transparent',
  secondary: 'bg-white text-ink-soft border border-line hover:bg-canvas',
  ghost:     'bg-transparent text-ink-muted border border-transparent hover:bg-muted-light',
  await:     'bg-await-bg text-await border border-await-border hover:bg-await-light',
  danger:    'bg-white text-red-700 border border-red-200 hover:bg-red-50',
};
const BUTTON_SIZES = {
  md: 'h-11 px-4 text-sm',   // 44 px : actions principales
  sm: 'h-9 px-3 text-[13px]',
};

export function Button({ variant = 'secondary', size = 'md', className, children, type = 'button', ...props }) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-[10px] font-bold transition',
        'disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-action',
        BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// Bouton icône seul : `label` obligatoire (accessibilité, infobulle)
export function IconButton({ label, active = false, size = 'md', className, children, type = 'button', ...props }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex items-center justify-center rounded-[10px] transition shrink-0',
        'disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-action',
        size === 'md' ? 'w-11 h-11' : 'w-9 h-9',
        active ? 'bg-muted-light text-ink' : 'text-ink-muted hover:bg-muted-light hover:text-ink',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

const BADGE_TONES = {
  action: 'bg-action-light text-action',
  await:  'bg-await-light text-await',
  ok:     'bg-ok-light text-ok',
  ai:     'bg-ai-light text-ai',
  muted:  'bg-muted-light text-ink-muted',
};

export function Badge({ tone = 'muted', className, children, ...props }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold', BADGE_TONES[tone], className)} {...props}>
      {children}
    </span>
  );
}

export function Card({ className, children, as: Tag = 'div', ...props }) {
  return (
    <Tag className={cx('bg-white border border-line rounded-2xl', className)} {...props}>
      {children}
    </Tag>
  );
}

// Petit titre de section en capitales (panneaux latéraux)
export function SectionLabel({ className, children, ...props }) {
  return (
    <h2 className={cx('text-xs font-extrabold uppercase tracking-wider text-ink-muted', className)} {...props}>
      {children}
    </h2>
  );
}

// Zone de texte à hauteur automatique : le texte s'affiche toujours en entier (énoncés
// de décision, intitulés d'action), sur autant de lignes que nécessaire
// singleLine (défaut) : Entrée ne crée pas de retour à la ligne
export function AutoTextarea({ value, className, singleLine = true, onKeyDown, ...props }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} rows={1} value={value} className={cx('resize-none overflow-hidden leading-snug', className)}
    onKeyDown={e => { if (singleLine && e.key === 'Enter') e.preventDefault(); onKeyDown?.(e); }} {...props} />;
}
