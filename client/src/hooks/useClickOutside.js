import { useEffect } from 'react';

// Ferme un menu ouvert (open) quand on clique en dehors de l'élément ref.
export default function useClickOutside(ref, open, close) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) close();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
}
