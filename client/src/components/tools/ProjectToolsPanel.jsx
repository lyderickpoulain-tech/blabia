import { useState, useEffect, useRef } from 'react';
import { TriangleAlert, Check, RefreshCw, Sparkles } from 'lucide-react';
import ToolsFlow from './ToolsFlow';
import ToolCostEditor from './ToolCostEditor';
import api from '../../utils/api';
import { useToolsCatalog, PROJECT_STATUS, costLabel, totalLabel } from '../../utils/toolsCatalog';
import { ToolCategoryIcon } from '../ui/icons';

// v5.0 phase 4.3 : outils d'un projet, organisés par type d'outil nécessaire.
// BlabIA analyse les besoins du projet et pré-remplit avec « Mes outils » :
// outil adapté → validé ; pas adapté → suggéré + avertissement ; aucun → avertissement.

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `t${Date.now()}${Math.random().toString(16).slice(2)}`;
}

const ACTIVE = ['validated', 'suggested'];

// Sélecteur d'outil pour une catégorie : mes outils, catalogue, saisie libre
function ToolPicker({ category, myTools, catalogTools, excludeKeys, onPick, onCancel, label }) {
  const [choice, setChoice] = useState('');
  const [custom, setCustom] = useState('');
  const keyOf = t => t.catalogId || t.id;
  const mineHere   = myTools.filter(t => t.category === category.id && !excludeKeys.has(t.catalogId || t.name));
  const mineOther  = myTools.filter(t => t.category !== category.id && !excludeKeys.has(t.catalogId || t.name));
  const catalogHere = catalogTools.filter(t => t.category === category.id && !excludeKeys.has(t.id) && !myTools.some(m => m.catalogId === t.id));

  const submit = () => {
    if (choice === '__custom') {
      if (!custom.trim()) return;
      onPick({ catalogId: null, name: custom.trim(), cost: { type: 'free', monthlyMin: 0, monthlyMax: 0, freeTier: null } });
      return;
    }
    const [kind, id] = choice.split(':');
    if (kind === 'mine') {
      const m = myTools.find(t => t.id === id);
      if (m) onPick({ catalogId: m.catalogId, name: m.name, cost: m.cost });
    } else if (kind === 'cat') {
      const c = catalogTools.find(t => t.id === id);
      if (c) onPick({ catalogId: c.id, name: c.name, cost: { ...c.cost } });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg p-2">
      <select value={choice} onChange={e => setChoice(e.target.value)}
        className="text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white outline-none flex-1 min-w-[180px]">
        <option value="">{label}</option>
        {mineHere.length > 0 && (
          <optgroup label="Mes outils">
            {mineHere.map(t => <option key={t.id} value={`mine:${t.id}`}>{t.name}</option>)}
          </optgroup>
        )}
        {catalogHere.length > 0 && (
          <optgroup label="Autres outils connus">
            {catalogHere.map(t => <option key={keyOf(t)} value={`cat:${t.id}`}>{t.name} — {costLabel(t.cost)}</option>)}
          </optgroup>
        )}
        {mineOther.length > 0 && (
          <optgroup label="Mes outils d'autres catégories">
            {mineOther.map(t => <option key={t.id} value={`mine:${t.id}`}>{t.name}</option>)}
          </optgroup>
        )}
        <option value="__custom">Autre (saisie libre)…</option>
      </select>
      {choice === '__custom' && (
        <input autoFocus value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="Nom de l'outil" className="text-sm border border-gray-200 rounded-lg px-2 py-1 outline-none flex-1 min-w-[140px]" />
      )}
      <button onClick={submit} disabled={!choice || (choice === '__custom' && !custom.trim())}
        className="text-xs bg-blabia-blue text-white px-3 py-1.5 rounded-lg disabled:opacity-40">OK</button>
      <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600">Annuler</button>
    </div>
  );
}

function ToolLine({ tool, onChange, onRemove, onReplace, needsSetup }) {
  const [editingCost, setEditingCost] = useState(false);
  const refused = tool.status === 'refused';
  return (
    <div className={`border rounded-lg px-3 py-2 space-y-1 ${refused ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-sm font-medium flex-1 min-w-[110px] ${refused ? 'line-through text-gray-500' : 'text-gray-900'}`}>{tool.name}</span>
        <span className={`text-[10px] font-medium border px-1.5 py-0.5 rounded-full ${PROJECT_STATUS[tool.status]?.cls}`}>{PROJECT_STATUS[tool.status]?.label}</span>
        <span className="text-xs text-gray-500">{costLabel(tool.cost)}</span>
      </div>
      {/* v5.1 : outil à mettre en place (compte, branchement) — un développement qui s'en sert
          n'est lancé qu'une fois la case cochée (services/devTools.js) */}
      {needsSetup && tool.status === 'validated' && (
        <label className={`flex items-center gap-2 text-xs font-semibold cursor-pointer min-h-[28px] ${tool.setupDone ? 'text-green-700' : 'text-amber-800'}`}>
          <input type="checkbox" className="w-4 h-4 accent-green-600" checked={!!tool.setupDone} onChange={e => onChange({ ...tool, setupDone: e.target.checked })} />
          {tool.setupDone ? 'Mis en place (compte créé et branché)' : 'À mettre en place : cochez une fois le compte créé et branché (voir le guide ci-dessus)'}
        </label>
      )}
      {tool.warning && !refused && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 flex items-start gap-1.5"><TriangleAlert size={13} className="shrink-0 mt-px" aria-hidden="true" /> <span>{tool.warning}</span></p>
      )}
      {tool.why && <p className="text-xs text-gray-600"><span className="text-gray-400">Pourquoi :</span> {tool.why}</p>}
      {tool.origin === 'complementary' && (
        <p className="text-[11px] text-gray-400">
          Proposé en réunion{tool.cost?.freeTier ? ` · gratuit jusqu'à : ${tool.cost.freeTier}` : ''}
          {tool.priceSource
            ? <> · <a href={tool.priceSource} target="_blank" rel="noopener noreferrer" className="text-blabia-blue hover:underline">source du prix</a></>
            : <span className="text-amber-600"> · prix indicatif, à vérifier</span>}
        </p>
      )}
      {editingCost && <ToolCostEditor cost={tool.cost} onChange={cost => onChange({ ...tool, cost })} />}
      <div className="flex gap-3 flex-wrap text-xs pt-0.5">
        {tool.status === 'suggested' && (
          <button onClick={() => onChange({ ...tool, status: 'validated', warning: null })} className="text-green-700 hover:underline font-medium inline-flex items-center gap-1"><Check size={12} aria-hidden="true" /> Garder</button>
        )}
        {refused
          ? <button onClick={() => onChange({ ...tool, status: 'suggested' })} className="text-gray-600 hover:underline">Rétablir</button>
          : <button onClick={() => onChange({ ...tool, status: 'refused' })} className="text-gray-500 hover:underline">Refuser</button>}
        {!refused && <button onClick={onReplace} className="text-blabia-blue hover:underline">Remplacer</button>}
        <button onClick={() => setEditingCost(e => !e)} className="text-gray-500 hover:underline">{editingCost ? 'Fermer' : 'Coût'}</button>
        <button onClick={onRemove} className="text-gray-300 hover:text-red-500 ml-auto">Retirer</button>
      </div>
    </div>
  );
}

function CategoryBlock({ category, need, tools, myTools, catalogTools, onSave, setupCategories = [] }) {
  const [picker, setPicker] = useState(null); // null | { replaceId: string|null }
  const inCat = tools.filter(t => t.category === category.id);
  const covered = inCat.some(t => ACTIVE.includes(t.status));
  const excludeKeys = new Set(inCat.map(t => t.catalogId || t.name));

  const pick = (base) => {
    const entry = {
      id: newId(), catalogId: base.catalogId, name: base.name, category: category.id,
      origin: 'mine', status: 'validated', need: need?.need || '', why: '', cost: base.cost || null,
      priceSource: null, sessionId: null, warning: null,
    };
    const next = picker?.replaceId ? tools.filter(t => t.id !== picker.replaceId) : tools;
    onSave([...next, entry]);
    setPicker(null);
  };

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${need && !covered ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-start gap-2">
        <ToolCategoryIcon id={category.id} size={20} className="shrink-0 text-ink-soft" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            {category.label} <span className="text-xs font-normal text-gray-400">· {category.technical}</span>
          </p>
          {need?.need && <p className="text-xs text-gray-600">Besoin : {need.need}</p>}
        </div>
        {!picker && (
          <button onClick={() => setPicker({ replaceId: null })} className="text-xs text-blabia-blue hover:underline shrink-0">+ Ajouter</button>
        )}
      </div>

      {need && !covered && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
          <TriangleAlert size={13} className="inline -mt-0.5 mr-1" aria-hidden="true" />Aucun outil retenu pour ce besoin. {need.warning || need.need}
          {need.examples?.length > 0 && <span className="block text-amber-700 mt-0.5">Exemples : {need.examples.join(', ')}</span>}
        </div>
      )}

      {inCat.map(t => (
        <ToolLine
          key={t.id} tool={t} needsSetup={setupCategories.includes(category.id)}
          onChange={u => onSave(tools.map(x => x.id === u.id ? u : x))}
          onRemove={() => onSave(tools.filter(x => x.id !== t.id))}
          onReplace={() => setPicker({ replaceId: t.id })}
        />
      ))}

      {picker && (
        <ToolPicker
          category={category} myTools={myTools} catalogTools={catalogTools} excludeKeys={excludeKeys}
          label={picker.replaceId ? 'Remplacer par…' : 'Choisir un outil…'}
          onPick={pick} onCancel={() => setPicker(null)}
        />
      )}
    </div>
  );
}

export default function ProjectToolsPanel({ projectId, onChanged }) {
  const { catalog } = useToolsCatalog();
  const [tools, setTools]       = useState(null);
  const [needs, setNeeds]       = useState(null);
  const [myTools, setMyTools]   = useState([]);
  const [total, setTotal]       = useState({ min: 0, max: 0 });
  const [saving, setSaving]     = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError]       = useState('');
  const [notice, setNotice]     = useState('');
  const [showOthers, setShowOthers] = useState(false);
  const autoAnalyzed = useRef(false);

  const analyze = async () => {
    setAnalyzing(true);
    setError('');
    setNotice('');
    try {
      const { data } = await api.post(`/projects/${projectId}/tools/analyze`);
      setTools(data.tools);
      setNeeds(data.needs);
      setTotal(data.total);
      onChanged?.(data.tools, data.needs);
    } catch (err) {
      const msg = err.response?.data?.error || 'Erreur lors de l\'analyse des besoins';
      if (err.response?.status === 400) setNotice(msg); else setError(msg);
    }
    setAnalyzing(false);
  };

  useEffect(() => {
    Promise.all([api.get(`/projects/${projectId}/tools`), api.get('/tools/me')])
      .then(([{ data: p }, { data: mine }]) => {
        setTools(p.tools || []);
        setNeeds(p.needs);
        setTotal(p.total || { min: 0, max: 0 });
        setMyTools(Array.isArray(mine) ? mine : []);
        onChanged?.(p.tools || [], p.needs); // page Outils : le guide suit l'état « mis en place »
        // Première ouverture : BlabIA identifie les outils nécessaires automatiquement
        if (p.needs === null && !autoAnalyzed.current) {
          autoAnalyzed.current = true;
          analyze();
        }
      })
      .catch(() => setError('Impossible de charger les outils du projet.'));
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (next) => {
    setTools(next);
    setSaving(true);
    setError('');
    try {
      const { data } = await api.put(`/projects/${projectId}/tools`, { tools: next });
      setTotal(data.total);
      onChanged?.(next, needs);
    } catch {
      setError('Erreur lors de l\'enregistrement');
    }
    setSaving(false);
  };


  if (!catalog || tools === null) {
    return (
      <Shell>
        {error ? <p className="text-sm text-red-600">{error}</p>
          : <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-blabia-blue border-t-transparent rounded-full animate-spin" /></div>}
      </Shell>
    );
  }

  const needByCat = Object.fromEntries((needs || []).map(n => [n.category, n]));
  const neededCats = catalog.categories.filter(c => needByCat[c.id]);
  const otherWithTools = catalog.categories.filter(c => !needByCat[c.id] && tools.some(t => t.category === c.id));
  const otherEmpty = catalog.categories.filter(c => !needByCat[c.id] && !tools.some(t => t.category === c.id));
  const missingCount = neededCats.filter(c => !tools.some(t => t.category === c.id && ACTIVE.includes(t.status))).length;
  const warnCount = tools.filter(t => t.warning && t.status !== 'refused').length;


  const blockProps = { tools, myTools, catalogTools: catalog.tools, onSave: save, setupCategories: catalog.setupCategories || [] };

  return (
    <Shell saving={saving}>
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex items-center justify-between gap-3 flex-wrap bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
        <div>
          <p className="text-sm text-gray-600">Total mensuel estimé <span className="text-xs text-gray-400">(outils validés)</span></p>
          <p className="text-base font-bold text-gray-900">{totalLabel(total)}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {(missingCount > 0 || warnCount > 0) && (
            <span className="text-xs text-amber-700 inline-flex items-center gap-1"><TriangleAlert size={13} aria-hidden="true" /> {missingCount + warnCount} point{missingCount + warnCount > 1 ? 's' : ''} d'attention</span>
          )}
          <button onClick={analyze} disabled={analyzing}
            className="text-xs border border-gray-300 text-gray-700 hover:bg-white px-3 py-1.5 rounded-lg disabled:opacity-50">
            <span className="inline-flex items-center gap-1.5">{needs ? <RefreshCw size={13} aria-hidden="true" /> : <Sparkles size={13} aria-hidden="true" />}{analyzing ? 'Analyse…' : needs ? 'Réanalyser les besoins' : 'Analyser les besoins'}</span>
          </button>
        </div>
      </div>

      {analyzing && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="w-4 h-4 border-2 border-blabia-blue border-t-transparent rounded-full animate-spin" />
          BlabIA identifie les outils nécessaires au projet à partir de son brief…
        </div>
      )}
      {notice && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{notice}</p>}

      <ToolsFlow catalog={catalog} tools={tools} needByCat={needByCat} />

      {neededCats.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">Outils nécessaires pour ce projet</h3>
          <p className="text-xs text-gray-400">Pré-remplis avec <a href="/outils" className="text-blabia-blue hover:underline">Mes outils</a> — modifiables à tout moment.</p>
          {neededCats.map(c => <CategoryBlock key={c.id} category={c} need={needByCat[c.id]} {...blockProps} />)}
        </section>
      )}

      {otherWithTools.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">{needs ? 'Autres outils du projet' : 'Outils du projet'}</h3>
          {otherWithTools.map(c => <CategoryBlock key={c.id} category={c} need={null} {...blockProps} />)}
        </section>
      )}

      {otherEmpty.length > 0 && (
        <section className="space-y-2">
          <button onClick={() => setShowOthers(s => !s)} className="text-xs text-gray-500 hover:text-gray-800">
            {showOthers ? '▲' : '▼'} {needs ? 'Catégories jugées non nécessaires' : 'Autres catégories'} ({otherEmpty.length})
          </button>
          {showOthers && otherEmpty.map(c => <CategoryBlock key={c.id} category={c} need={null} {...blockProps} />)}
        </section>
      )}

    </Shell>
  );
}

function Shell({ children, saving }) {
  return (
    <div className="space-y-5">
      {saving && <p className="text-xs text-ink-faint" role="status">Enregistrement…</p>}
      {children}
    </div>
  );
}
