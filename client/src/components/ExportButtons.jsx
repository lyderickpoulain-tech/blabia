import { useState } from 'react';
import { FileDown, FileText } from 'lucide-react';
import { Button } from './ui';
import { downloadFile } from '../utils/download';

// Export (v5.1) : PDF par la page d'impression (nouvel onglet, « Enregistrer en PDF »),
// Word (.docx) généré par le serveur.
export default function ExportButtons({ pdfPath, wordPath, size = 'sm', className = '', ...rest }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const word = async () => {
    setBusy(true); setError('');
    try { await downloadFile(wordPath); } catch { setError('Export Word impossible.'); }
    setBusy(false);
  };
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} {...rest}>
      <Button size={size} variant="secondary" onClick={() => window.open(pdfPath, '_blank', 'noopener')} title="Ouvre une page à imprimer ou à enregistrer en PDF">
        <FileDown size={15} aria-hidden="true" /> PDF
      </Button>
      <Button size={size} variant="secondary" onClick={word} disabled={busy} title="Télécharger au format Word (.docx)">
        <FileText size={15} aria-hidden="true" /> {busy ? '…' : 'Word'}
      </Button>
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
