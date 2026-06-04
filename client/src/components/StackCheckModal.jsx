import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import {
  extractStackToolNames,
  getCategoryKey,
  CAT_LABELS,
  getPricing,
  PRICING_CONFIG,
} from '../utils/techStack';

// ── Construction de la liste fusionnée d'outils ──────────────────────────────

function buildItems(userTechStack, projectTechStack, suggestedTools, missingTools, existingItems) {
  // État persisté (checklistData) — source de vérité pour checked/notes
  const existingMap = {};
  for (const item of existingItems) {
    existingMap[item.label.toLowerCase().trim()] = { checked: item.checked, notes: item.notes || '' };
  }

  // Outils déjà dans l'environnement (user + project) → pré-cochés
  const stackNames = new Set([
    ...extractStackToolNames(userTechStack),
    ...extractStackToolNames(projectTechStack),
  ]);

  const toolMap = new Map(); // key(lower) → { label, checked, missing, fromStack }

  // 1. Outils de l'environnement
  for (const nameKey of stackNames) {
    const ex = existingMap[nameKey];
    toolMap.set(nameKey, {
      label:     normalizeLabel(nameKey),
      checked:   ex ? ex.checked : true,
      notes:     ex?.notes || '',
      missing:   false,
      fromStack: true,
    });
  }

  // 2. Outils suggérés par les agents
  for (const name of (suggestedTools || [])) {
    const key = name.toLowerCase().trim();
    if (!toolMap.has(key)) {
      const ex = existingMap[key];
      toolMap.set(key, {
        label:     name,
        checked:   ex ? ex.checked : false,
        notes:     ex?.notes || '',
        missing:   false,
        fromStack: false,
      });
    }
  }

  // 3. Outils manquants identifiés par les agents
  for (const name of (missingTools || [])) {
    const key = name.toLowerCase().trim();
    if (!toolMap.has(key)) {
      const ex = existingMap[key];
      toolMap.set(key, {
        label:     name,
        checked:   ex ? ex.checked : false,
        notes:     ex?.notes || '',
        missing:   true,
        fromStack: false,
      });
    } else {
      toolMap.set(key, { ...toolMap.get(key), missing: true });
    }
  }

  // Convertir en tableau avec id stable
  return [...toolMap.entries()].map(([key, val]) => ({
    id:        `tool-${key.replace(/[^a-z0-9]/g, '_')}`,
    label:     val.label,
    checked:   val.checked,
    notes:     val.notes,
    missing:   val.missing,
    fromStack: val.fromStack,
    catKey:    getCategoryKey(key),
  }));
}

// Normalise un nom d'outil conservé en lowercase vers une forme affichable
function normalizeLabel(key) {
  // Cherche dans les options connues une correspondance exacte (casse) — fallback : capitalize
  const known = [
    'Railway','Vercel','Netlify','OVH mutualisé','OVH VPS','AWS','Render','Fly.io',
    'DigitalOcean','Hetzner',
    'PostgreSQL','MySQL','MongoDB','SQLite','Supabase','PlanetScale','Redis',
    'React','Vue.js','Next.js','Nuxt','Svelte','Astro','HTML/CSS vanilla','Angular',
    'Node.js/Express','Python/FastAPI','Python/Django','PHP/Laravel','NestJS','Ruby on Rails',
    'JWT maison','Auth0','Clerk','Supabase Auth','NextAuth.js','Keycloak',
    'Nodemailer/SMTP','Resend','SendGrid','Mailgun','Brevo','Postmark',
    'VS Code','Claude Code','GitHub','GitLab','Docker','Cursor',
    'OVH','Namecheap','Cloudflare','Gandi',
  ];
  return known.find(n => n.toLowerCase() === key) || key.charAt(0).toUpperCase() + key.slice(1);
}

// ── Groupement par catégorie ──────────────────────────────────────────────────

function groupByCategory(items) {
  const groups = {};
  for (const item of items) {
    const cat = item.catKey ? (CAT_LABELS[item.catKey] || item.catKey) : 'Autres outils suggérés';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }
  return groups;
}

// ── Composant principal ────────────────────────────────────────────────────────

export default function StackCheckModal({ milestone, projectId, onClose, onRefresh }) {
  const navigate = useNavigate();

  const initialItems = useMemo(() => {
    const raw = milestone.checklistData;
    const existingItems = (() => {
      if (!raw) return [];
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed.items) ? parsed.items : [];
    })();

    return buildItems(
      milestone.userTechStack    || {},
      milestone.projectTechStack || {},
      milestone.suggestedTools   || [],
      milestone.missingTools     || [],
      existingItems,
    );
  }, [milestone]);

  const [items, setItems]           = useState(initialItems);
  const [showMissing, setShowMissing] = useState(false);
  const [missingText, setMissingText] = useState('');
  const [saving, setSaving]         = useState(false);

  const groups      = useMemo(() => groupByCategory(items), [items]);
  const checkedCount = items.filter(i => i.checked).length;
  const pct          = items.length > 0 ? Math.round((checkedCount / items.length) * 100) : 0;

  // ── Sauvegarde checklist ──────────────────────────────────────────────────
  const saveChecklist = useCallback(async (newItems, finalStatus = null) => {
    setSaving(true);
    try {
      await api.patch(`/projects/${projectId}/milestones/${milestone.id}/checklist`, {
        items: newItems.map(({ id, label, checked, notes, missing }) => ({ id, label, checked, notes: notes || '', missing: missing || false })),
        ...(finalStatus ? { finalStatus } : {})
      });
      onRefresh?.();
    } catch {}
    setSaving(false);
  }, [projectId, milestone.id, onRefresh]);

  // ── Sync project.techStack quand on coche un outil ───────────────────────
  const syncProjectStack = useCallback(async (item, checked) => {
    const catKey = item.catKey;
    if (!catKey) return; // outil inconnu → pas de sync
    try {
      const { data: proj } = await api.get(`/projects/${projectId}`);
      const ts = proj.techStack
        ? (typeof proj.techStack === 'string' ? JSON.parse(proj.techStack) : proj.techStack)
        : {};
      const current = Array.isArray(ts[catKey]) ? [...ts[catKey]] : [];
      if (checked && !current.includes(item.label)) {
        ts[catKey] = [...current, item.label];
      } else if (!checked) {
        ts[catKey] = current.filter(v => v !== item.label);
      }
      await api.patch(`/projects/${projectId}/tech-stack`, { techStack: ts });
    } catch {}
  }, [projectId]);

  // ── Toggle checkbox ───────────────────────────────────────────────────────
  const toggleItem = async (id) => {
    const newItems = items.map(i => i.id === id ? { ...i, checked: !i.checked } : i);
    setItems(newItems);
    const toggled = newItems.find(i => i.id === id);
    await Promise.all([
      saveChecklist(newItems),
      syncProjectStack(toggled, toggled.checked),
    ]);
  };

  const updateNotes = (id, notes) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, notes } : i));
  };

  const handleMarkDone = async () => {
    await saveChecklist(items, 'done');
    onClose();
  };

  const handleMissingConfirm = async () => {
    await saveChecklist(items, 'blocked');
    const task = missingText.trim()
      ? `Résoudre les outils manquants : ${missingText.trim()}`
      : 'Résoudre les outils manquants de la stack';
    onClose();
    navigate(`/projects/${projectId}/session/new`, {
      state: { initialTask: task, milestoneId: milestone.id }
    });
  };

  const catEntries = Object.entries(groups);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col">

        {/* En-tête */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <span className="text-2xl">🔧</span>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900">Vérification de la stack</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{milestone.title}</p>
          </div>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition">
            ×
          </button>
        </div>

        {/* Barre de progression */}
        <div className="px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span>{checkedCount}/{items.length} outil{items.length !== 1 ? 's' : ''} vérifié{checkedCount !== 1 ? 's' : ''}</span>
            <span className="font-medium">{pct}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full transition-all duration-500 ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Checklist groupée par catégorie */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {items.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">Aucun outil à vérifier</p>
              <p className="text-xs text-gray-300 mt-1">
                La checklist se remplit depuis l'environnement et les sessions
              </p>
            </div>
          ) : catEntries.map(([category, catItems]) => (
            <div key={category}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5">
                {category}
              </h3>
              <div className="space-y-2">
                {catItems.map(item => {
                  const pricing = getPricing(item.label);
                  const pricingCfg = pricing && PRICING_CONFIG[pricing];
                  return (
                    <div key={item.id}
                      className={`flex items-start gap-3 rounded-xl px-3 py-2.5 transition ${
                        item.checked ? 'bg-green-50 border border-green-100' : 'bg-gray-50 border border-transparent'
                      }`}>
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleItem(item.id)}
                        className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition shrink-0 ${
                          item.checked
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-gray-300 hover:border-green-400 bg-white'
                        }`}
                      >
                        {item.checked && (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className={`text-sm font-medium leading-snug ${
                            item.checked ? 'text-green-800' : 'text-gray-800'
                          }`}>
                            {item.label}
                            {item.checked && <span className="ml-1.5 text-green-500 text-xs">✓</span>}
                          </p>
                          {pricingCfg && (
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${pricingCfg.color}`}>
                              {pricingCfg.dot} {pricingCfg.label}
                            </span>
                          )}
                          {item.missing && (
                            <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-orange-100 text-orange-700">
                              ⚠ Manquant
                            </span>
                          )}
                          {item.fromStack && (
                            <span className="text-xs text-gray-400">· environnement</span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={item.notes}
                          onChange={e => updateNotes(item.id, e.target.value)}
                          onBlur={() => saveChecklist(items)}
                          placeholder="Notes (optionnel)…"
                          className="mt-1 w-full text-xs bg-transparent border-0 border-b border-gray-200 focus:border-blue-400 outline-none py-0.5 text-gray-500 placeholder-gray-300 transition"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="shrink-0 px-5 py-4 border-t border-gray-100 space-y-2">
          {!showMissing ? (
            <div className="flex gap-2">
              <button onClick={handleMarkDone} disabled={saving}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl text-sm transition disabled:opacity-50 flex items-center justify-center gap-1.5">
                ✅ Marquer comme vérifié
              </button>
              <button onClick={() => setShowMissing(true)}
                className="flex-1 border border-orange-300 text-orange-700 hover:bg-orange-50 font-medium py-2.5 rounded-xl text-sm transition">
                ⚠️ Des outils manquent
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600 block">
                Quels outils manquent ?
              </label>
              <textarea
                value={missingText}
                onChange={e => setMissingText(e.target.value)}
                autoFocus
                placeholder="Ex : système de paiement, CDN, monitoring…"
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-orange-400 resize-none"
              />
              <div className="flex gap-2">
                <button onClick={() => setShowMissing(false)}
                  className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 py-2.5 rounded-xl text-sm transition font-medium">
                  Annuler
                </button>
                <button onClick={handleMissingConfirm} disabled={saving}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2.5 rounded-xl text-sm transition disabled:opacity-50">
                  Créer une réunion →
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
