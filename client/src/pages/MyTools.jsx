import { useState, useEffect, useRef, useMemo } from 'react';
import { Pencil, Trash2, Plus, Check, StickyNote } from 'lucide-react';
import Layout from '../components/Layout';
import { Button, IconButton, Card } from '../components/ui';
import ToolsFlow from '../components/tools/ToolsFlow';
import ToolCostEditor from '../components/tools/ToolCostEditor';
import api from '../utils/api';
import { useToolsCatalog, USER_STATUS, costLabel } from '../utils/toolsCatalog';
import { ToolCategoryIcon } from '../components/ui/icons';

// v5.0 phase 4.1 : « Mes outils » — fusion de l'ancienne page Environnement
// (User.techStack) et de la Boîte à outils (User.toolbox) dans User.tools.

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `t${Date.now()}${Math.random().toString(16).slice(2)}`;
}

function ToolRow({ tool, catalogTool, onChange, onRemove }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className={`border rounded-xl px-3 py-2 transition ${editing ? 'border-action-border bg-white' : 'border-line bg-canvas/60'}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-extrabold text-ink flex-1 min-w-[120px]">{tool.name}</span>
        <span className="text-xs font-semibold text-ink-muted">{costLabel(tool.cost)}</span>
        <select
          value={tool.status}
          onChange={e => onChange({ ...tool, status: e.target.value })}
          aria-label="Statut"
          className={`text-xs font-bold border rounded-full px-2 py-0.5 outline-none ${USER_STATUS[tool.status]?.cls || ''}`}
        >
          {Object.entries(USER_STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
        </select>
        <IconButton size="sm" label={editing ? 'Fermer l’édition' : 'Coût et note'} active={editing} onClick={() => setEditing(e => !e)}>
          {editing ? <Check size={15} aria-hidden="true" /> : <Pencil size={15} aria-hidden="true" />}
        </IconButton>
        <IconButton size="sm" label="Retirer" onClick={onRemove} className="hover:!text-red-600">
          <Trash2 size={15} aria-hidden="true" />
        </IconButton>
      </div>
      {catalogTool?.role && <p className="text-xs text-ink-faint">{catalogTool.role}</p>}
      {tool.note && !editing && (
        <p className="text-xs text-ink-soft mt-1 flex items-start gap-1.5"><StickyNote size={12} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden="true" /> {tool.note}</p>
      )}
      {editing && (
        <div className="mt-2 space-y-2">
          <ToolCostEditor cost={tool.cost} onChange={cost => onChange({ ...tool, cost })} />
          <textarea
            value={tool.note || ''}
            onChange={e => onChange({ ...tool, note: e.target.value })}
            placeholder="Note libre (ex. compte pro, identifiant, limite atteinte…)"
            rows={2}
            aria-label="Note"
            className="w-full text-xs text-ink border border-line rounded-[10px] px-2.5 py-2 outline-none focus:ring-2 focus:ring-action resize-none"
          />
        </div>
      )}
    </div>
  );
}

function AddToolForm({ category, catalogTools, existing, onAdd, onCancel }) {
  const [choice, setChoice] = useState('');
  const [customName, setCustomName] = useState('');
  const available = catalogTools.filter(t => !existing.some(e => e.catalogId === t.id));

  const submit = () => {
    if (choice && choice !== '__custom') {
      const t = catalogTools.find(x => x.id === choice);
      onAdd({ id: newId(), catalogId: t.id, name: t.name, category: category.id, cost: { ...t.cost }, status: 'using', note: '' });
    } else if (customName.trim()) {
      onAdd({ id: newId(), catalogId: null, name: customName.trim(), category: category.id, cost: { type: 'free', monthlyMin: 0, monthlyMax: 0, freeTier: null }, status: 'using', note: '' });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 bg-action-light/60 border border-action-border rounded-xl p-2">
      <select
        value={choice}
        onChange={e => setChoice(e.target.value)}
        aria-label="Outil à ajouter"
        className="text-sm h-9 border border-line rounded-lg px-2 bg-white text-ink outline-none flex-1 min-w-[160px]"
      >
        <option value="">Choisir un outil…</option>
        {available.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        <option value="__custom">Autre (saisie libre)…</option>
      </select>
      {choice === '__custom' && (
        <input
          autoFocus
          value={customName}
          onChange={e => setCustomName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="Nom de l'outil"
          aria-label="Nom de l'outil"
          className="text-sm h-9 border border-line rounded-lg px-2 bg-white text-ink outline-none flex-1 min-w-[140px]"
        />
      )}
      <Button size="sm" variant="primary" onClick={submit} disabled={!choice || (choice === '__custom' && !customName.trim())}>
        Ajouter
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>Annuler</Button>
    </div>
  );
}

export default function MyTools() {
  const { catalog, error: catalogError } = useToolsCatalog();
  const [tools, setTools]     = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [addingCat, setAddingCat] = useState(null);
  const [showEmpty, setShowEmpty] = useState(true);
  const loaded = useRef(false);

  useEffect(() => {
    api.get('/tools/me')
      .then(({ data }) => setTools(Array.isArray(data) ? data : []))
      .catch(() => setLoadError('Impossible de charger vos outils.'));
  }, []);

  // Enregistrement automatique (débounce) après chaque modification
  useEffect(() => {
    if (tools === null) return;
    if (!loaded.current) { loaded.current = true; return; }
    setSaveState('saving');
    const t = setTimeout(() => {
      api.put('/tools/me', { tools })
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    }, 600);
    return () => clearTimeout(t);
  }, [tools]);

  const catalogById = useMemo(
    () => Object.fromEntries((catalog?.tools || []).map(t => [t.id, t])),
    [catalog]
  );

  const updateTool = (updated) => setTools(prev => prev.map(t => t.id === updated.id ? updated : t));
  const removeTool = (id) => setTools(prev => prev.filter(t => t.id !== id));
  const addTool    = (tool) => { setTools(prev => [...prev, tool]); setAddingCat(null); };

  // Parcours des outils : « à essayer » affiché comme une proposition (pointillés)
  const flowTools = (tools || []).map(t => ({ ...t, status: t.status === 'to_try' ? 'suggested' : 'validated' }));

  const ready = catalog && tools;

  return (
    <Layout wide>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold text-ink">Mes outils</h1>
            <p className="text-sm text-ink-muted mt-1">
              Les outils que vous utilisez ou envisagez, tous projets confondus. Les agents en tiennent compte pour vous conseiller.
            </p>
          </div>
          <span className="text-xs font-semibold text-ink-faint pt-2" aria-live="polite">
            {saveState === 'saving' && 'Enregistrement…'}
            {saveState === 'saved' && <span className="inline-flex items-center gap-1 text-ok"><Check size={13} aria-hidden="true" /> Enregistré</span>}
            {saveState === 'error' && <span className="text-red-600">Erreur d'enregistrement</span>}
          </span>
        </div>

        {(catalogError || loadError) && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{catalogError || loadError}</div>
        )}

        {!ready && !catalogError && !loadError && (
          <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-action border-t-transparent rounded-full animate-spin" /></div>
        )}

        {ready && (
          <>
            <Card as="section" className="p-4">
              <h2 className="text-base font-extrabold text-ink mb-0.5">Comment vos outils s'articulent</h2>
              <p className="text-xs text-ink-muted mb-3">Le chemin d’une visite et celui d’une mise en ligne, avec vos outils. En pointillé : outils « à essayer ».</p>
              <ToolsFlow catalog={catalog} tools={flowTools} />
            </Card>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-extrabold text-ink">Par catégorie</h2>
                <label className="text-xs font-semibold text-ink-muted flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={showEmpty} onChange={e => setShowEmpty(e.target.checked)} className="accent-action" />
                  Afficher les catégories vides
                </label>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
              {catalog.categories.map(cat => {
                const list = tools.filter(t => t.category === cat.id);
                if (!showEmpty && list.length === 0 && addingCat !== cat.id) return null;
                return (
                  <Card key={cat.id} className="p-4 space-y-2">
                    <div className="flex items-start gap-2">
                      <ToolCategoryIcon id={cat.id} size={22} className="shrink-0 text-ink-soft" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-extrabold text-ink">
                          {cat.label} <span className="text-xs font-semibold text-ink-faint">· {cat.technical}</span>
                        </p>
                        <p className="text-xs text-ink-muted">{cat.explanation}</p>
                      </div>
                      {addingCat !== cat.id && (
                        <Button size="sm" variant="ghost" onClick={() => setAddingCat(cat.id)} className="!text-action shrink-0 !h-8">
                          <Plus size={14} aria-hidden="true" /> Ajouter
                        </Button>
                      )}
                    </div>
                    {list.map(t => (
                      <ToolRow key={t.id} tool={t} catalogTool={catalogById[t.catalogId]} onChange={updateTool} onRemove={() => removeTool(t.id)} />
                    ))}
                    {addingCat === cat.id && (
                      <AddToolForm
                        category={cat}
                        catalogTools={catalog.tools.filter(t => t.category === cat.id)}
                        existing={list}
                        onAdd={addTool}
                        onCancel={() => setAddingCat(null)}
                      />
                    )}
                    {list.length === 0 && addingCat !== cat.id && (
                      <p className="text-xs text-ink-faint italic">Aucun outil déclaré.</p>
                    )}
                  </Card>
                );
              })}
              </div>
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}
