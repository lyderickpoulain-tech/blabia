import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

// ── Icônes et statuts ──────────────────────────────────────────────────────────
const TYPE_ICON = {
  meeting:     '🤝',
  technical:   '💻',
  stack_check: '🔧',
  milestone:   '🎯',
};

const TYPES = ['meeting', 'technical', 'stack_check', 'milestone'];

const STATUS_DOT = {
  pending:     { cls: 'bg-gray-300',  label: 'Pas commencé' },
  in_progress: { cls: 'bg-blue-500',  label: 'En cours',    pulse: true },
  done:        { cls: 'bg-green-500', label: 'Terminé' },
  blocked:     { cls: 'bg-red-400',   label: 'Bloqué' },
};

function trunc(str, n = 28) {
  return str && str.length > n ? str.slice(0, n) + '…' : (str || '');
}

// ── Contenu partagé desktop / mobile ──────────────────────────────────────────
function PanelBody({ milestones, loading, showAdd, setShowAdd, onAdd }) {
  const [title, setTitle]   = useState('');
  const [type, setType]     = useState('meeting');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    await onAdd({ title: title.trim(), type });
    setTitle('');
    setType('meeting');
    setSaving(false);
    setShowAdd(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Liste des étapes */}
      <div className="flex-1 overflow-y-auto py-1 px-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : milestones.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8 px-3">
            Aucune étape —<br />commencez par en créer une
          </p>
        ) : (
          milestones.map(m => {
            const sd = STATUS_DOT[m.status] || STATUS_DOT.pending;
            return (
              <div key={m.id}
                className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer transition group"
                title={m.title}
              >
                <span className="text-sm shrink-0 leading-none">{TYPE_ICON[m.type] || '🎯'}</span>
                <span className="text-xs text-gray-700 flex-1 min-w-0 truncate leading-snug">
                  {trunc(m.title)}
                </span>
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${sd.cls} ${sd.pulse ? 'animate-pulse' : ''}`}
                  title={sd.label}
                />
              </div>
            );
          })
        )}
      </div>

      {/* Bouton / formulaire "Ajouter une étape" */}
      <div className="shrink-0 border-t border-gray-100 px-2 py-2">
        {showAdd ? (
          <form onSubmit={handleSubmit} className="space-y-1.5">
            <input
              autoFocus
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Titre de l'étape…"
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            />
            {/* Sélecteur de type — icônes compactes */}
            <div className="flex gap-1">
              {TYPES.map(t => (
                <button key={t} type="button" onClick={() => setType(t)}
                  title={t}
                  className={`flex-1 text-sm py-1 rounded-lg border transition ${
                    type === t
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300'
                  }`}>
                  {TYPE_ICON[t]}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <button type="submit" disabled={!title.trim() || saving}
                className="flex-1 text-xs bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-lg font-medium transition disabled:opacity-50">
                {saving ? '…' : 'Ajouter'}
              </button>
              <button type="button"
                onClick={() => { setShowAdd(false); setTitle(''); setType('meeting'); }}
                className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg transition">
                ✕
              </button>
            </div>
          </form>
        ) : (
          <button onClick={() => setShowAdd(true)}
            className="w-full flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 py-2 rounded-lg border border-dashed border-gray-200 hover:border-blue-300 transition font-medium">
            + Ajouter une étape
          </button>
        )}
      </div>
    </div>
  );
}

// ── Composant principal ────────────────────────────────────────────────────────
export default function ProjectTimelinePanel({ projectId, refreshKey = 0 }) {
  const [isOpen, setIsOpen]         = useState(true);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showAdd, setShowAdd]       = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const loadMilestones = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/projects/${projectId}/plan`);
      setMilestones(data.milestones || []);
    } catch {}
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadMilestones(); }, [loadMilestones, refreshKey]);

  const handleAdd = async ({ title, type }) => {
    try {
      await api.post(`/projects/${projectId}/milestones`, { title, type });
      loadMilestones();
    } catch {}
  };

  // ── Desktop ──────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="hidden lg:flex items-start shrink-0 sticky top-6 self-start">
        {/* Bouton toggle sur le bord gauche du panel */}
        <button
          onClick={() => setIsOpen(p => !p)}
          title={isOpen ? 'Fermer le panel' : 'Ouvrir le panel'}
          className="flex items-center justify-center w-5 h-8 bg-white border border-gray-200 rounded-l-lg shadow-sm text-gray-400 hover:text-blue-500 text-xs transition shrink-0 mt-2"
        >
          {isOpen ? '›' : '‹'}
        </button>

        {/* Panel */}
        <div className={`transition-all duration-300 overflow-hidden ${isOpen ? 'w-64' : 'w-0'}`}>
          <div className="w-64 bg-white border border-gray-200 border-l-0 rounded-r-xl shadow-sm"
               style={{ minHeight: '320px', maxHeight: 'calc(100vh - 120px)' }}>
            {/* En-tête */}
            <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex-1">
                ⏱ Timeline
              </span>
              <span className="text-xs text-gray-400">{milestones.length}</span>
            </div>
            <div style={{ height: 'calc(100vh - 120px - 44px)', display: 'flex', flexDirection: 'column' }}>
              <PanelBody
                milestones={milestones}
                loading={loading}
                showAdd={showAdd}
                setShowAdd={setShowAdd}
                onAdd={handleAdd}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile : bouton flottant ─────────────────────────────────────── */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed bottom-6 right-6 z-40 w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center text-lg transition"
        title="Timeline du projet"
      >
        ⏱
      </button>

      {/* ── Mobile : slide-over ──────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex justify-end">
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="w-72 bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
              <span className="text-sm font-semibold text-gray-800">⏱ Timeline</span>
              <button onClick={() => setMobileOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition">
                ×
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <PanelBody
                  milestones={milestones}
                  loading={loading}
                  showAdd={showAdd}
                  setShowAdd={setShowAdd}
                  onAdd={handleAdd}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
