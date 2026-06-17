import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';

const TYPE_ICON = { meeting: '🤝', technical: '💻', stack_check: '🔧', milestone: '🎯' };

export default function AcceptSessionModal({ session, projectId, planSuggestions, onClose, onAccepted }) {
  const intention = Array.isArray(session.intention) ? session.intention : [];
  const showAll = intention.length === 0;

  // ── Section mémoire ───────────────────────────────────────────────────────
  const [memory, setMemory]         = useState('');
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryGenerated, setMemoryGenerated] = useState(false);
  const [memorySaved, setMemorySaved]     = useState(false);

  const generateMemory = async () => {
    setMemoryLoading(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/sessions/${session.id}/generate-memory`);
      setMemory(data.memory);
      setMemoryGenerated(true);
    } catch { setMemory('Erreur lors de la génération'); }
    setMemoryLoading(false);
  };

  // ── Section plan ──────────────────────────────────────────────────────────
  const milestones = planSuggestions?.milestones || [];
  const [activeMilestones, setActiveMilestones] = useState(() => new Set(milestones.map((_, i) => i)));
  const [planAdded, setPlanAdded]   = useState(false);
  const [planAdding, setPlanAdding] = useState(false);

  const handleAddPlan = async () => {
    setPlanAdding(true);
    try {
      const selected = milestones.filter((_, i) => activeMilestones.has(i));
      await api.post(`/projects/${projectId}/plan/bulk`, {
        milestones: selected, standalone_todos: planSuggestions?.standalone_todos || [],
        sessionId: session.id, sourceSessionId: session.id
      });
      setPlanAdded(true);
    } catch {}
    setPlanAdding(false);
  };

  // ── Code status ───────────────────────────────────────────────────────────
  const [codeStatus, setCodeStatus] = useState(session.codeStatus || null);
  const [codeSaving, setCodeSaving] = useState(false);

  const handleCodeStatus = async (s) => {
    setCodeSaving(true);
    try {
      await api.patch(`/projects/${projectId}/sessions/${session.id}/code-status`, { status: s });
      setCodeStatus(s);
    } catch {}
    setCodeSaving(false);
  };

  // ── Accepter et appliquer ────────────────────────────────────────────────
  const [applying, setApplying] = useState(false);

  const handleApply = async () => {
    setApplying(true);
    try {
      // Sauvegarder le souvenir si généré et modifié
      if (memoryGenerated && memory.trim() && (showAll || intention.includes('memory'))) {
        await api.patch(`/projects/${projectId}/context`, { memory: memory.trim(), sessionTitle: session.task });
      }
      // Passer en accepted
      await api.patch(`/projects/${projectId}/sessions/${session.id}/status`, { status: 'accepted' });
      onAccepted?.();
    } catch {}
    setApplying(false);
  };

  const showSynthesis     = showAll || intention.includes('synthesis');
  const showMemory        = showAll || intention.includes('memory');
  const showClaudeCode    = (showAll || intention.includes('claude_code')) && session.hasCode;
  const showTimelineSteps = (showAll || intention.includes('timeline_steps')) && milestones.length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl max-h-[90vh] flex flex-col">

        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <span className="text-xl">✅</span>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900">Valider et appliquer les résultats</h2>
            <p className="text-xs text-gray-400 truncate">{session.task}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Section synthèse */}
          {showSynthesis && session.summary && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                📄 Synthèse
              </h3>
              <div className="bg-gray-50 rounded-xl px-4 py-3 max-h-40 overflow-y-auto text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">
                {session.summary.substring(0, 800)}{session.summary.length > 800 ? '…' : ''}
              </div>
            </div>
          )}

          {/* Section souvenir */}
          {showMemory && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                🧠 Souvenir projet
              </h3>
              {!memoryGenerated ? (
                <button onClick={generateMemory} disabled={memoryLoading}
                  className="w-full bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50">
                  {memoryLoading ? 'Génération…' : 'Générer un souvenir automatiquement'}
                </button>
              ) : (
                <div className="space-y-1.5">
                  <textarea value={memory} onChange={e => setMemory(e.target.value)} rows={4}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
                  <div className="flex gap-2">
                    <button onClick={generateMemory} disabled={memoryLoading}
                      className="text-xs text-gray-400 hover:text-gray-600 transition">
                      ↻ Régénérer
                    </button>
                    {memorySaved && <span className="text-xs text-green-600">✓ Sera ajouté à la mémoire</span>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section Claude Code */}
          {showClaudeCode && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">💻 Prompt Claude Code</h3>
              <div className="flex gap-2">
                <button onClick={() => handleCodeStatus('implemented')} disabled={codeSaving}
                  className={`flex-1 py-2 rounded-xl text-sm border transition font-medium ${
                    codeStatus === 'implemented' ? 'bg-green-100 border-green-300 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  ✅ Déjà implémenté
                </button>
                <button onClick={() => handleCodeStatus('not_generated')} disabled={codeSaving}
                  className={`flex-1 py-2 rounded-xl text-sm border transition font-medium ${
                    codeStatus === 'not_generated' ? 'bg-orange-100 border-orange-300 text-orange-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  ⏳ À implémenter
                </button>
              </div>
            </div>
          )}

          {/* Section étapes timeline */}
          {showTimelineSteps && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">📅 Nouvelles étapes</h3>
              <div className="space-y-1">
                {milestones.map((m, i) => (
                  <label key={i} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer transition ${
                    activeMilestones.has(i) ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100'
                  }`}>
                    <input type="checkbox" checked={activeMilestones.has(i)}
                      onChange={() => setActiveMilestones(prev => {
                        const s = new Set(prev);
                        s.has(i) ? s.delete(i) : s.add(i);
                        return s;
                      })}
                      className="w-3.5 h-3.5 accent-blabia-blue shrink-0" />
                    <span className="text-sm shrink-0">{TYPE_ICON[m.type] || '🎯'}</span>
                    <span className="text-sm text-gray-700 flex-1">{m.title}</span>
                  </label>
                ))}
              </div>
              {!planAdded ? (
                <button onClick={handleAddPlan} disabled={planAdding || activeMilestones.size === 0}
                  className="w-full bg-blabia-blue hover:bg-blabia-blue text-white font-semibold py-2 rounded-xl text-sm transition disabled:opacity-50">
                  {planAdding ? 'Ajout…' : `+ Ajouter ${activeMilestones.size} étape${activeMilestones.size > 1 ? 's' : ''} à la timeline`}
                </button>
              ) : (
                <div className="flex items-center justify-between text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                  <span>✓ {activeMilestones.size} étape{activeMilestones.size > 1 ? 's' : ''} ajoutée{activeMilestones.size > 1 ? 's' : ''}</span>
                  <Link to={`/projects/${projectId}/plan`} className="font-medium hover:underline text-xs">Voir le plan →</Link>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 px-5 py-4 border-t border-gray-100">
          <button onClick={handleApply} disabled={applying}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl text-sm transition disabled:opacity-50 flex items-center justify-center gap-2">
            {applying ? 'Application…' : '✅ Appliquer et clore la réunion'}
          </button>
        </div>
      </div>
    </div>
  );
}
