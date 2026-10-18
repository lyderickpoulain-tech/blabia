import { useState } from 'react';
import { Check, X } from 'lucide-react';
import Markdown from './Markdown';
import ExportButtons from './ExportButtons';
import api from '../utils/api';
import { notifyError } from '../utils/notify';

// v5.1 (16/10/2026) : un même compte rendu, selon le lecteur (POST /sessions/:id/summary-format)
const FORMAT_TABS = [
  { id: 'full',      label: 'Compte rendu' },
  { id: 'decisions', label: 'Relevé de décisions' },
  { id: 'executive', label: 'Synthèse exécutive' },
  { id: 'pv',        label: 'Procès-verbal' },
];
// v5.1 (F4, personas) : livrables prêts à servir, tirés de ce qui a été décidé
const DELIVERABLE_TABS = [
  { id: 'checklist',     label: 'Liste de tâches' },
  { id: 'retroplanning', label: 'Rétroplanning' },
  { id: 'budget',        label: 'Budget' },
  { id: 'messages',      label: 'Messages prêts à envoyer' },
];
const ALL_TABS = [...FORMAT_TABS, ...DELIVERABLE_TABS];

// exports (v5.1) : { pdfPath, wordPath } pour exporter le compte-rendu en PDF / Word
// formatsPath : réunion conclue → onglets de formats, générés à la demande puis conservés
export default function SummaryDisplayModal({ title, date, content, onClose, exports, actions = null, formatsPath = null }) {
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState('full');
  const [variants, setVariants] = useState({});
  const [loadingFormat, setLoadingFormat] = useState(null);
  const shown = tab === 'full' ? content : variants[tab];
  const pickFormat = async id => {
    setTab(id);
    if (id === 'full' || variants[id] || !formatsPath) return;
    setLoadingFormat(id);
    try {
      const { data } = await api.post(formatsPath, { format: id });
      setVariants(v => ({ ...v, [id]: data.content }));
    } catch (err) { notifyError(err, 'La mise en forme a échoué.'); setTab('full'); }
    setLoadingFormat(null);
  };

  // Livrable ou format affiché, en fichier texte (Markdown) : à ouvrir, imprimer ou envoyer
  const download = () => {
    const label = ALL_TABS.find(t => t.id === tab)?.label || 'document';
    const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const url = URL.createObjectURL(new Blob([shown], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${slug(title) || 'reunion'}-${slug(label)}.md`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleCopy = () => {
    const text = typeof shown === 'string' ? shown : JSON.stringify(shown, null, 2);
    navigator.clipboard.writeText(text).catch(() => {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-gray-900 leading-snug">{title || 'Compte-rendu'}</h2>
            {date && <p className="text-xs text-gray-400 mt-0.5">{date}</p>}
          </div>
          {tab !== 'full' && typeof shown === 'string' && (
            <button type="button" onClick={download}
              className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700 transition">
              Télécharger
            </button>
          )}
          {exports && tab === 'full' && <ExportButtons size="sm" pdfPath={exports.pdfPath} wordPath={exports.wordPath} className="shrink-0" />}
          <button
            onClick={handleCopy}
            className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
              copied
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            {copied ? <span className="inline-flex items-center gap-1"><Check size={12} aria-hidden="true" /> Copié</span> : 'Copier'}
          </button>
          <button
            onClick={onClose}
            aria-label="Fermer" className="shrink-0 text-gray-400 hover:text-gray-600 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition"
          >
            <X size={18} />
          </button>
        </div>

        {formatsPath && (
          <div role="tablist" aria-label="Format du compte rendu" className="shrink-0 flex flex-wrap gap-1 px-5 pt-3">
            {FORMAT_TABS.map(f => (
              <button key={f.id} type="button" role="tab" aria-selected={tab === f.id} onClick={() => pickFormat(f.id)}
                className={`h-8 px-3 rounded-full text-xs font-bold border transition ${tab === f.id ? 'bg-action text-white border-action' : 'bg-white text-ink-muted border-line hover:border-action-border'}`}>
                {f.label}
              </button>
            ))}
            <span className="basis-full h-0" aria-hidden="true" />
            <span className="self-center text-[11px] font-extrabold uppercase tracking-wider text-ink-faint mr-1">Livrables</span>
            {DELIVERABLE_TABS.map(f => (
              <button key={f.id} type="button" role="tab" aria-selected={tab === f.id} onClick={() => pickFormat(f.id)}
                className={`h-8 px-3 rounded-full text-xs font-bold border transition ${tab === f.id ? 'bg-ai text-white border-ai' : 'bg-white text-ink-muted border-line hover:border-ai-border'}`}>
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Corps scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loadingFormat ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
              <span className="w-4 h-4 border-2 border-action border-t-transparent rounded-full animate-spin" aria-hidden="true" /> Mise en forme…
            </div>
          ) : typeof shown === 'string' ? (
            <article>
              <Markdown>{shown}</Markdown>
            </article>
          ) : (
            <pre className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
              {JSON.stringify(shown, null, 2)}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 pb-4 pt-3 border-t border-line flex flex-wrap gap-2">
          {actions}
          <button
            onClick={onClose}
            className={`${actions ? 'ml-auto px-4' : 'w-full'} h-11 border border-line text-ink-soft rounded-[10px] text-sm hover:bg-canvas transition font-bold`}
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
}
