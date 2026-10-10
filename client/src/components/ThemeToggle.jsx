import { useState } from 'react';
import { Sun, Moon } from 'lucide-react';

const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';

// Bascule clair/sombre : data-theme sur <html>, choix mémorisé dans localStorage (clé « theme »)
export default function ThemeToggle() {
  const [dark, setDark] = useState(isDark);

  const toggle = () => {
    const next = !dark;
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch { /* stockage indisponible : le choix vaut pour cette visite */ }
    setDark(next);
  };

  const label = dark ? 'Activer le mode clair' : 'Activer le mode sombre';
  return (
    <button type="button" onClick={toggle} aria-label={label} aria-pressed={dark} title={label}
      className="inline-flex items-center justify-center h-10 w-10 rounded-[10px] text-ink-soft hover:bg-canvas transition">
      {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  );
}
