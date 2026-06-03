import { useState } from 'react';
import api from '../utils/api';

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }
}

export default function QuickExportModal({ milestone, projectId, onClose, onRefresh }) {
  const [title, setTitle]         = useState(milestone.title || '');
  const [description, setDescription] = useState(milestone.description || '');
  const [prompt, setPrompt]       = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied]       = useState(false);
  const [saving, setSaving]       = useState(false);
  const [statusDone, setStatusDone] = useState(false);

  // Construit le "summary" à partir du titre et de la description
  const buildSummary = () => {
    let s = `Tâche technique à implémenter : ${title.trim()}`;
    if (description.trim()) s += `\n\nContexte et détails :\n${description.trim()}`;
    return s;
  };

  const handleGenerate = async () => {
    if (!title.trim()) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/export/claude-code', {
        summary: buildSummary(),
        ...(projectId ? { projectId } : {})
      });
      setPrompt(data.prompt);
      setGenerated(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la génération');
    }
    setLoading(false);
  };

  const handleCopy = async () => {
    await copyToClipboard(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleMilestoneStatus = async (newStatus) => {
    if (saving) return;
    setSaving(true);
    try {
      await api.patch(`/projects/${projectId}/milestones/${milestone.id}`, { status: newStatus });
      onRefresh?.();
      if (newStatus === 'done') setStatusDone(true);
      else onClose();
    } catch {}
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col">

        {/* ── En-tête ────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900">Générer un prompt Claude Code</h2>
            <p className="text-xs text-gray-500 mt-0.5">Mode rapide · sans session</p>
          </div>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition">
            ×
          </button>
        </div>

        {/* ── Corps ──────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">

          {/* Titre éditable */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Tâche à implémenter
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              disabled={generated}
              placeholder="Ex : Créer le système d'authentification JWT…"
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-gray-50 disabled:text-gray-500 transition"
            />
          </div>

          {/* Description éditable */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Contexte / détails <span className="font-normal text-gray-400 normal-case">(optionnel)</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              disabled={generated}
              placeholder="Décrivez le contexte, les contraintes techniques, les exigences spécifiques…"
              rows={3}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 resize-none disabled:bg-gray-50 disabled:text-gray-500 transition"
            />
          </div>

          {/* ── Phase génération ──────────────────────────────────────────── */}
          {!generated && !loading && (
            <>
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              <button
                onClick={handleGenerate}
                disabled={!title.trim() || loading}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Générer le prompt →
              </button>
            </>
          )}

          {/* ── Chargement ───────────────────────────────────────────────── */}
          {loading && (
            <div className="flex items-center justify-center gap-3 py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-600" />
              <p className="text-sm text-gray-500">Génération du prompt en cours…</p>
            </div>
          )}

          {/* ── Prompt généré ─────────────────────────────────────────────── */}
          {generated && prompt && (
            <>
              {/* Bloc code dark */}
              <div className="bg-gray-900 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
                  <span className="text-xs font-mono text-gray-400">Claude Code · Prompt</span>
                  <button onClick={handleGenerate} disabled={loading}
                    className="text-xs text-gray-500 hover:text-gray-300 transition">
                    ↺ Régénérer
                  </button>
                </div>
                <div className="overflow-auto max-h-64">
                  <pre className="p-4 text-sm text-gray-100 whitespace-pre-wrap font-mono leading-relaxed">
                    {prompt}
                  </pre>
                </div>
              </div>

              {/* Bouton copier */}
              <button onClick={handleCopy}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition ${
                  copied
                    ? 'bg-green-600 text-white'
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
                    Copier le prompt
                  </>
                )}
              </button>

              <p className="text-xs text-gray-400 text-center -mt-1">
                Ouvre Claude Code dans VS Code, crée une nouvelle session et colle ce prompt.
              </p>

              {/* Statut d'implémentation */}
              {!statusDone ? (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-gray-600 text-center">
                    Le code a-t-il été implémenté ?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleMilestoneStatus('done')}
                      disabled={saving}
                      className="flex-1 bg-green-50 hover:bg-green-100 border border-green-300 text-green-700 font-medium py-2.5 rounded-xl transition text-sm disabled:opacity-50"
                    >
                      ✅ Code implémenté et commité
                    </button>
                    <button
                      onClick={() => handleMilestoneStatus('blocked')}
                      disabled={saving}
                      className="flex-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-medium py-2.5 rounded-xl transition text-sm disabled:opacity-50"
                    >
                      ❌ Ce code n'a pas été généré
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-center">
                  <p className="text-sm font-semibold text-green-700">✅ Étape marquée comme implémentée</p>
                  <button onClick={onClose}
                    className="mt-2 text-xs text-green-600 hover:text-green-800 transition">
                    Fermer →
                  </button>
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
}
