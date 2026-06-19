import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import api from '../utils/api';
import { TOOLBOX_CATEGORIES } from '../utils/techStack';

const STATUS_LABELS = { owned: 'Possédé', planned: 'Prévu', evaluating: "J'évalue" };
const STATUS_COLORS = {
  owned:      'bg-green-100 text-green-700',
  planned:    'bg-blue-100  text-blue-700',
  evaluating: 'bg-yellow-100 text-yellow-700',
};

const CAT_ICONS = {
  hosting: '🌐', database: '🗄️', frontend: '🎨', backend: '⚙️',
  auth: '🔐', emails: '📧', devtools: '🛠️', domain: '🌐'
};

const MD = {
  h2: ({ children }) => <h2 className="text-xs font-bold text-gray-800 mt-3 mb-1">{children}</h2>,
  h3: ({ children }) => <h3 className="text-xs font-semibold text-gray-700 mt-2 mb-1">{children}</h3>,
  p:  ({ children }) => <p className="text-xs text-gray-600 mb-1.5 leading-relaxed last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-1.5 space-y-0.5">{children}</ul>,
  li: ({ children }) => (
    <li className="flex items-start gap-1.5 text-xs text-gray-600">
      <span className="text-blue-400 shrink-0 mt-0.5">▸</span>
      <span>{children}</span>
    </li>
  ),
  strong: ({ children }) => <strong className="font-semibold text-gray-800">{children}</strong>,
};

export default function StackPanel({
  project, toolbox, overrides, onSaveOverrides, onClose,
  onToolboxUpdate, onPendingToolsChange
}) {
  const [localOverrides, setLocalOverrides] = useState(overrides || {});
  const [suggestion, setSuggestion]         = useState('');
  const [suggesting, setSuggesting]         = useState(false);
  const [copied, setCopied]                 = useState(false);
  const [pendingTools, setPendingTools]     = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [resolving, setResolving]           = useState({});

  useEffect(() => { setLocalOverrides(overrides || {}); }, [overrides]);

  useEffect(() => {
    setPendingLoading(true);
    api.get(`/projects/${project.id}/pending-tools`)
      .then(({ data }) => setPendingTools(data || []))
      .catch(() => {})
      .finally(() => setPendingLoading(false));
  }, [project.id]);

  // ── Effective tool for a category ─────────────────────────────────────────
  const getEffective = (catId) => {
    const cat = TOOLBOX_CATEGORIES.find(c => c.id === catId);
    if (!cat) return null;
    if (catId in localOverrides) {
      const ovId = localOverrides[catId];
      if (!ovId) return null;
      const tool = cat.tools.find(t => t.id === ovId);
      if (tool) return { ...tool, source: 'override', status: toolbox[catId]?.status };
      const custom = (toolbox[`_custom_${catId}`] || []).find(t => t.id === ovId);
      if (custom) return { id: custom.id, label: custom.name, source: 'override', status: toolbox[catId]?.status };
      return null;
    }
    const sel = toolbox[catId]?.selected;
    if (!sel) return null;
    const tool = cat.tools.find(t => t.id === sel);
    if (tool) return { ...tool, source: 'toolbox', status: toolbox[catId]?.status || 'owned' };
    const custom = (toolbox[`_custom_${catId}`] || []).find(t => t.id === sel);
    if (custom) return { id: custom.id, label: custom.name, source: 'toolbox', status: toolbox[catId]?.status || 'owned' };
    return null;
  };

  const allTools = (catId) => {
    const cat = TOOLBOX_CATEGORIES.find(c => c.id === catId);
    const base = cat?.tools || [];
    const customs = (toolbox[`_custom_${catId}`] || []).map(c => ({ id: c.id, label: c.name }));
    return [...base, ...customs];
  };

  // ── Override per-project ───────────────────────────────────────────────────
  const handleOverride = (catId, newId) => {
    const toolboxSel = toolbox[catId]?.selected;
    const next = { ...localOverrides };
    if (newId === toolboxSel) { delete next[catId]; } else { next[catId] = newId || null; }
    setLocalOverrides(next);
    onSaveOverrides(next);
  };

  // ── Pending tools handlers ─────────────────────────────────────────────────
  const dismissTool = async (tool) => {
    setResolving(r => ({ ...r, [tool.id]: true }));
    try {
      await api.patch(`/sessions/${tool.sessionId}/pending-tool`, { toolId: tool.id });
      const next = pendingTools.filter(t => !(t.id === tool.id && t.sessionId === tool.sessionId));
      setPendingTools(next);
      onPendingToolsChange?.(next.length);
    } catch {}
    setResolving(r => ({ ...r, [tool.id]: false }));
  };

  const handleHaveTool = async (tool) => {
    setResolving(r => ({ ...r, [tool.id]: true }));
    try {
      const catId = tool.category || 'devtools';
      const newToolbox = {
        ...toolbox,
        [catId]: { selected: tool.id, status: 'owned' }
      };
      await api.patch('/users/me/toolbox', { toolbox: newToolbox });
      onToolboxUpdate?.(newToolbox);
      await api.patch(`/sessions/${tool.sessionId}/pending-tool`, { toolId: tool.id });
      const next = pendingTools.filter(t => !(t.id === tool.id && t.sessionId === tool.sessionId));
      setPendingTools(next);
      onPendingToolsChange?.(next.length);
    } catch {}
    setResolving(r => ({ ...r, [tool.id]: false }));
  };

  // ── Claude suggest-stack ───────────────────────────────────────────────────
  const buildSummary = () => {
    const owned = [], planned = [], evaluating = [];
    for (const cat of TOOLBOX_CATEGORIES) {
      const eff = getEffective(cat.id);
      if (!eff) continue;
      (eff.status === 'planned' ? planned : eff.status === 'evaluating' ? evaluating : owned).push(eff.label);
    }
    return { owned, planned, evaluating };
  };

  const handleSuggest = async () => {
    setSuggesting(true); setSuggestion('');
    try {
      const { data } = await api.post(`/projects/${project.id}/suggest-stack`, { toolboxSummary: buildSummary() });
      setSuggestion(data.suggestion);
    } catch { setSuggestion('Erreur lors de la suggestion — réessayez.'); }
    finally { setSuggesting(false); }
  };

  const handleExport = async () => {
    const lines = [`# Stack technique — ${project.name}`, ''];
    for (const cat of TOOLBOX_CATEGORIES) {
      const eff = getEffective(cat.id);
      if (!eff) continue;
      lines.push(`${cat.icon} ${cat.label} : ${eff.label} (${STATUS_LABELS[eff.status] || 'Possédé'})`);
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { alert(lines.join('\n')); }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col border-l border-gray-200">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900">Stack technique</h2>
            <p className="text-xs text-gray-400 mt-0.5">Boîte à outils · ajustements projet</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition text-lg leading-none">
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Section : Outils suggérés par les réunions ───────────────── */}
          {(pendingLoading || pendingTools.length > 0) && (
            <div className="px-4 pt-4 pb-3 border-b border-amber-100 bg-amber-50">
              <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide mb-2.5">
                ⚡ Outils suggérés par les réunions
                {pendingTools.length > 0 && (
                  <span className="ml-1.5 bg-amber-200 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {pendingTools.length}
                  </span>
                )}
              </p>
              {pendingLoading ? (
                <p className="text-xs text-amber-500">Chargement…</p>
              ) : (
                <div className="space-y-2.5">
                  {pendingTools.map((tool) => {
                    const catIcon = CAT_ICONS[tool.category] || '🔧';
                    const isResolving = resolving[tool.id];
                    return (
                      <div key={`${tool.id}-${tool.sessionId}`} className="bg-white rounded-xl border border-amber-200 p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <span className="text-base shrink-0 mt-0.5">{catIcon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900">{tool.label}</p>
                            {tool.reason && (
                              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{tool.reason}</p>
                            )}
                            <p className="text-[10px] text-gray-400 mt-1">
                              Suggéré par {tool.agentName || 'un agent'} · {tool.sessionTitle || 'réunion'}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          <button
                            onClick={() => handleHaveTool(tool)}
                            disabled={isResolving}
                            className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1.5 rounded-lg transition disabled:opacity-50 font-medium"
                          >
                            ✓ J'ai cet outil
                          </button>
                          {tool.required ? (
                            <button
                              onClick={() => dismissTool(tool)}
                              disabled={isResolving}
                              className="text-xs border border-blue-200 text-blue-600 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg transition disabled:opacity-50"
                            >
                              Choisir une alternative
                            </button>
                          ) : (
                            <button
                              onClick={() => dismissTool(tool)}
                              disabled={isResolving}
                              className="text-xs border border-gray-200 text-gray-500 hover:bg-gray-50 px-2.5 py-1.5 rounded-lg transition disabled:opacity-50"
                            >
                              Non pertinent
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Section : catégories de la boîte à outils ──────────────── */}
          <div className="px-4 py-3 space-y-1.5">
            {TOOLBOX_CATEGORIES.map(cat => {
              const eff    = getEffective(cat.id);
              const tools  = allTools(cat.id);
              const curSel = cat.id in localOverrides
                ? (localOverrides[cat.id] || '')
                : (toolbox[cat.id]?.selected || '');
              const hasOv  = cat.id in localOverrides;

              return (
                <div key={cat.id}
                  className={`flex items-center gap-2.5 py-2 px-3 rounded-xl border transition ${
                    eff ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100'
                  }`}>
                  <span className="text-lg shrink-0">{cat.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-gray-400 leading-none mb-0.5">{cat.label}</p>
                    {eff ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium text-gray-900 truncate">{eff.label}</span>
                        {eff.status && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLORS[eff.status] || ''}`}>
                            {STATUS_LABELS[eff.status] || eff.status}
                          </span>
                        )}
                        {hasOv && <span className="text-[10px] text-violet-500 shrink-0 font-medium">ajusté</span>}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-300">Non configuré</p>
                    )}
                  </div>
                  <select
                    value={curSel}
                    onChange={e => handleOverride(cat.id, e.target.value || null)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white shrink-0 max-w-[130px] focus:outline-none focus:ring-1 focus:ring-blabia-blue"
                  >
                    <option value="">— aucun</option>
                    {tools.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </div>

        {/* Suggestion result */}
        {suggestion && (
          <div className="px-4 py-3 border-t border-gray-100 max-h-52 overflow-y-auto shrink-0">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Suggestion IA</p>
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown components={MD}>{suggestion}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-4 py-4 border-t border-gray-100 space-y-2 shrink-0">
          <button onClick={handleSuggest} disabled={suggesting}
            className="w-full flex items-center justify-center gap-2 border border-violet-200 text-violet-600 hover:bg-violet-50 text-sm font-medium py-2.5 rounded-xl transition disabled:opacity-50">
            {suggesting
              ? <><span className="animate-spin inline-block">⌛</span> Analyse en cours…</>
              : <>⚡ Suggérer une stack pour ce projet</>
            }
          </button>
          <button onClick={handleExport}
            className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2.5 rounded-xl transition">
            {copied ? '✅ Copié !' : '📋 Exporter pour Claude Code'}
          </button>
        </div>
      </div>
    </>
  );
}
