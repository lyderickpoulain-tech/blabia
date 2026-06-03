import { useState, useEffect } from 'react';
import api from '../utils/api';

export default function ExportModal({ summary, projectId, onClose }) {
  const [prompt,  setPrompt]  = useState('');
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [copied,  setCopied]  = useState(false);

  useEffect(() => {
    api.post('/export/claude-code', { summary, ...(projectId ? { projectId } : {}) })
      .then(({ data }) => setPrompt(data.prompt))
      .catch((err)     => setError(err.response?.data?.error || 'Erreur lors de la génération'))
      .finally(()      => setLoading(false));
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      // Fallback navigateurs anciens
      const el = document.createElement('textarea');
      el.value = prompt;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[85vh]">

        {/* ── En-tête ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-gray-900">Prompt pour Claude Code</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition"
          >
            ×
          </button>
        </div>

        {/* ── Corps (flex-1, overflow interne) ──────────────────────────── */}
        <div className="flex-1 overflow-hidden flex flex-col gap-4 p-6 min-h-0">

          {/* Chargement */}
          {loading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
              <p className="text-sm text-gray-500">Génération du prompt en cours…</p>
            </div>
          )}

          {/* Erreur */}
          {!loading && error && (
            <div className="flex-1 flex items-center justify-center">
              <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-xl text-sm text-center max-w-sm">
                <p className="font-medium mb-1">Génération impossible</p>
                <p className="text-red-500 text-xs">{error}</p>
              </div>
            </div>
          )}

          {/* Prompt généré */}
          {!loading && !error && (
            <>
              {/* Bloc de code scrollable */}
              <div className="flex-1 min-h-0 overflow-auto bg-gray-900 rounded-xl">
                <pre className="p-5 text-sm text-gray-100 whitespace-pre-wrap font-mono leading-relaxed">
                  {prompt}
                </pre>
              </div>

              {/* Bouton Copier */}
              <button
                onClick={handleCopy}
                className={`shrink-0 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition ${
                  copied
                    ? 'bg-green-600 hover:bg-green-600 text-white'
                    : 'bg-gray-900 hover:bg-gray-800 text-white'
                }`}
              >
                {copied ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copié !
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Copier
                  </>
                )}
              </button>

              {/* Instructions discrètes */}
              <p className="shrink-0 text-xs text-gray-400 text-center -mt-1">
                Ouvre Claude Code dans VS Code, crée une nouvelle session et colle ce prompt.
              </p>
            </>
          )}
        </div>

        {/* ── Pied de page ──────────────────────────────────────────────── */}
        <div className="shrink-0 px-6 pb-5 pt-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full border border-gray-300 text-gray-700 py-2.5 rounded-xl hover:bg-gray-50 transition text-sm font-medium"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
}
