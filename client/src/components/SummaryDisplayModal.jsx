import { useState } from 'react';
import { Check, X } from 'lucide-react';
import Markdown from './Markdown';
import ExportButtons from './ExportButtons';

// exports (v5.1) : { pdfPath, wordPath } pour exporter le compte-rendu en PDF / Word
export default function SummaryDisplayModal({ title, date, content, onClose, exports, actions = null }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
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
          {exports && <ExportButtons size="sm" pdfPath={exports.pdfPath} wordPath={exports.wordPath} className="shrink-0" />}
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

        {/* Corps scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {typeof content === 'string' ? (
            <article>
              <Markdown>{content}</Markdown>
            </article>
          ) : (
            <pre className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
              {JSON.stringify(content, null, 2)}
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
