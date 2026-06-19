import { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ProjectLayout from '../components/ProjectLayout';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { getPricing, PRICING_CONFIG } from '../utils/techStack';
import GenerateTimelineModal from '../components/GenerateTimelineModal';
import SummaryDisplayModal from '../components/SummaryDisplayModal';
import ExportModal from '../components/ExportModal';
import TimelineStepsModal from '../components/TimelineStepsModal';
import StackPanel from '../components/StackPanel';

const QUICK_COMMANDS = [
  { cmd: '/ajouterEtapes',    label: 'Ajouter des étapes',     placeholder: '/ajouterEtapes ' },
  { cmd: '/résumerProjet',    label: 'Résumer le projet' },
  { cmd: '/résumerRéunion',   label: 'Résumer une réunion',    placeholder: '/résumerRéunion ' },
  { cmd: '/décisions',        label: 'Lister les décisions' },
  { cmd: '/prochainEtape',    label: 'Prochaine étape' },
  { cmd: '/analyserBloquants',label: 'Analyser les blocages' },
  { cmd: '/exporterTimeline', label: 'Exporter la timeline' },
  { cmd: '/rechercher',       label: 'Rechercher 🌐',         placeholder: '/rechercher ' },
  { cmd: '/aide',             label: 'Aide' },
];

const QUICK_MD = {
  h1: ({ children }) => <h1 className="text-base font-bold text-gray-900 mb-2 mt-4 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-bold text-gray-800 mb-2 mt-3 pb-1 border-b border-gray-200">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-800 mb-1.5 mt-3">{children}</h3>,
  p:  ({ children }) => <p className="text-sm text-gray-700 mb-2 leading-relaxed last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 space-y-0.5 list-none">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 space-y-0.5 list-decimal list-inside text-sm text-gray-700">{children}</ol>,
  li: ({ children }) => (
    <li className="flex items-start gap-2 text-sm text-gray-700 leading-relaxed">
      <span className="text-blue-400 font-bold mt-0.5 shrink-0 text-xs">▸</span>
      <span>{children}</span>
    </li>
  ),
  strong:     ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
  em:         ({ children }) => <em className="italic text-gray-600">{children}</em>,
  hr:         () => <hr className="my-3 border-gray-200" />,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-blue-300 pl-3 py-0.5 my-2 text-gray-600 italic bg-blue-50 rounded-r-lg text-sm">
      {children}
    </blockquote>
  ),
  code: ({ inline, children }) => inline
    ? <code className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-xs font-mono">{children}</code>
    : <pre className="bg-gray-900 text-gray-100 p-3 rounded-xl overflow-x-auto text-xs font-mono mb-2"><code>{children}</code></pre>,
};

// ── Définition des catégories de stack (idem EnvironmentPage) ─────────────────
const CATEGORIES = [
  { id: 'hebergement', label: 'Hébergement',             icon: '🖥️', options: ['Railway','Vercel','Netlify','OVH mutualisé','OVH VPS','AWS'], hasAutre: true, autrePlaceholder: 'Ex : DigitalOcean…' },
  { id: 'bdd',         label: 'Base de données',          icon: '🗄️', options: ['PostgreSQL','MySQL','MongoDB','SQLite','Supabase','PlanetScale'], hasAutre: true, autrePlaceholder: 'Ex : Redis…' },
  { id: 'frontend',    label: 'Framework frontend',       icon: '🎨', options: ['React','Vue.js','Next.js','Nuxt','Svelte','HTML/CSS vanilla'], hasAutre: true, autrePlaceholder: 'Ex : Angular…' },
  { id: 'backend',     label: 'Framework backend',        icon: '⚙️', options: ['Node.js/Express','Python/FastAPI','Python/Django','PHP/Laravel'], hasAutre: true, autrePlaceholder: 'Ex : Ruby on Rails…' },
  { id: 'auth',        label: 'Authentification',         icon: '🔐', options: ['JWT maison','Auth0','Clerk','Supabase Auth'], hasAutre: true, autrePlaceholder: 'Ex : Keycloak…' },
  { id: 'emails',      label: "Envoi d'emails",           icon: '📧', options: ['Nodemailer/SMTP','Resend','SendGrid','Mailgun'], hasAutre: true, autrePlaceholder: 'Ex : Postmark…' },
  { id: 'devtools',    label: 'Outils de développement',  icon: '🛠️', options: ['VS Code','Claude Code','GitHub','GitLab','Docker'], hasAutre: true, autrePlaceholder: 'Ex : Cursor…' },
  { id: 'domaine',     label: 'Domaine',                  icon: '🌐', options: ['OVH','Namecheap','Cloudflare'], hasAutre: true, autrePlaceholder: 'Ex : GoDaddy…' }
];

function CategoryCard({ category, stack, onToggle, onAutreChange }) {
  const selected  = stack[category.id] || [];
  const autreText = stack[`${category.id}_autre`] || '';
  const autreChecked = selected.includes('Autre');
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{category.icon}</span>
        <h3 className="font-semibold text-gray-900 text-sm">{category.label}</h3>
        {selected.length > 0 && (
          <span className="ml-auto text-xs font-medium bg-blue-100 text-blabia-blue px-2 py-0.5 rounded-full">
            {selected.filter(x => x !== 'Autre').length + (autreChecked && autreText ? 1 : 0)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {category.options.map(option => (
          <label key={option} className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border cursor-pointer transition select-none text-xs font-medium ${
            selected.includes(option) ? 'bg-blue-50 border-blue-300 text-blue-800' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
          }`}>
            <input type="checkbox" checked={selected.includes(option)} onChange={() => onToggle(category.id, option)} className="w-3 h-3 accent-blabia-blue shrink-0" />
            <span className="flex-1 truncate">{option}</span>
            {(() => {
              const p = getPricing(option);
              const cfg = p && PRICING_CONFIG[p];
              return cfg ? <span className={`text-xs px-1 py-0.5 rounded shrink-0 ${cfg.color}`}>{cfg.dot}</span> : null;
            })()}
          </label>
        ))}
        {category.hasAutre && (
          <label className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border cursor-pointer transition select-none text-xs font-medium ${
            autreChecked ? 'bg-blue-50 border-blue-300 text-blue-800' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
          }`}>
            <input type="checkbox" checked={autreChecked} onChange={() => onToggle(category.id, 'Autre')} className="w-3 h-3 accent-blabia-blue shrink-0" />
            Autre
          </label>
        )}
      </div>
      {category.hasAutre && autreChecked && (
        <input type="text" value={autreText} onChange={e => onAutreChange(category.id, e.target.value)}
          placeholder={category.autrePlaceholder}
          className="mt-2 w-full px-3 py-1.5 text-xs border border-blue-200 bg-blue-50 rounded-xl focus:ring-2 focus:ring-blabia-blue outline-none" />
      )}
    </div>
  );
}

// Cherche si un outil correspond à une option connue dans les catégories
function findToolInCategories(toolName) {
  for (const cat of CATEGORIES) {
    if (cat.options.some(o => o.toLowerCase() === toolName.toLowerCase())) {
      return { categoryId: cat.id, option: cat.options.find(o => o.toLowerCase() === toolName.toLowerCase()) };
    }
  }
  return null;
}

function RenameModal({ project, onSave, onClose }) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await api.patch(`/projects/${project.id}`, { name, description });
      onSave(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la modification');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Modifier le projet</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blabia-blue focus:border-transparent outline-none"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blabia-blue focus:border-transparent outline-none resize-none"
            />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 transition text-sm font-medium">
              Annuler
            </button>
            <button type="submit" disabled={loading || !name.trim()}
              className="flex-1 bg-blabia-blue hover:bg-blabia-blue text-white py-2.5 rounded-lg transition text-sm font-medium disabled:opacity-50">
              {loading ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function parseBriefFields(brief) {
  const objectif = brief?.match(/OBJECTIF\s*:\s*([\s\S]*?)(?=\n\nCONTEXTE|\n\nNOTES|$)/)?.[1]?.trim() || '';
  const contexte = brief?.match(/CONTEXTE\s*:\s*([\s\S]*?)(?=\n\nOBJECTIF|\n\nNOTES|$)/)?.[1]?.trim() || '';
  const notes    = brief?.match(/NOTES\s*:\s*([\s\S]*?)(?=\n\nOBJECTIF|\n\nCONTEXTE|$)/)?.[1]?.trim() || '';
  return { objectif, contexte, notes };
}

function BriefModal({ project, onSave, onClose }) {
  const { objectif: initObj, contexte: initCtx, notes: initNotes } = parseBriefFields(project.brief);
  const [objectif, setObjectif] = useState(initObj);
  const [contexte, setContexte] = useState(initCtx);
  const [notes, setNotes]       = useState(initNotes);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await api.patch(`/projects/${project.id}/brief`, { objectif, contexte, notes });
      onSave(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la modification');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Modifier le brief projet</h2>
        <p className="text-xs text-gray-400 mb-5">Transmis aux agents dès le début de chaque réunion</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Objectif principal</label>
            <textarea
              value={objectif}
              onChange={e => setObjectif(e.target.value)}
              rows={3}
              placeholder="Quel est l'objectif de ce projet ? Que cherchez-vous à accomplir ?"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blabia-blue focus:border-transparent outline-none resize-none text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contexte</label>
            <textarea
              value={contexte}
              onChange={e => setContexte(e.target.value)}
              rows={3}
              placeholder="Quel est le contexte ? Qui sont les utilisateurs ? Quelles contraintes ?"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blabia-blue focus:border-transparent outline-none resize-none text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes initiales</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Idées, inspirations, références, contraintes techniques…"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blabia-blue focus:border-transparent outline-none resize-none text-sm"
            />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 transition text-sm font-medium">
              Annuler
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-blabia-blue hover:bg-blabia-blue text-white py-2.5 rounded-lg transition text-sm font-medium disabled:opacity-50">
              {loading ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteProjectModal({ project, sessionCount, onClose, onConfirm, deleting }) {
  const [inputName, setInputName] = useState('');
  const isValid = inputName === project.name;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Supprimer le projet</h2>
            <p className="text-xs text-gray-500 mt-0.5">Cette action est irréversible</p>
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-700">
          Cette action supprimera définitivement le projet{' '}
          <strong>"{project.name}"</strong> et ses{' '}
          <strong>{sessionCount} réunion{sessionCount !== 1 ? 's' : ''}</strong>.
        </div>

        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Tapez <span className="font-semibold text-gray-900">"{project.name}"</span> pour confirmer
          </label>
          <input
            type="text"
            value={inputName}
            onChange={e => setInputName(e.target.value)}
            placeholder={project.name}
            autoFocus
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none text-sm"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl hover:bg-gray-50 transition text-sm font-medium"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={!isValid || deleting}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? 'Suppression…' : 'Supprimer définitivement'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SessionStatusBadge({ status }) {
  if (status === 'accepted' || status === 'complete')
    return <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✅ Acceptée</span>;
  if (status === 'open')
    return <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-100 text-blabia-blue px-2 py-0.5 rounded-full">⚪ En cours</span>;
  if (status === 'abandoned')
    return <span className="inline-flex items-center gap-1 text-xs font-medium bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full line-through">🚫 Abandonnée</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Interrompue</span>;
}

function getIntentionKey(session) {
  const i = session?.intention;
  if (Array.isArray(i) && i.length) return i[0];
  try { const p = JSON.parse(i || '[]'); return p[0] || ''; } catch { return ''; }
}

const DELIVERABLE_ICON = {
  summary: '📋', synthesis: '📋', memory: '📋', meeting: '📋',
  claude_code: '💻', technical: '💻',
  timeline_steps: '📅',
};

function CodeStatusBadge({ session }) {
  if (!session.hasCode) return null;
  if (session.codeStatus === 'implemented')
    return <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full ml-1">✅ Implémenté</span>;
  if (session.codeStatus === 'not_generated')
    return <span className="inline-flex items-center gap-1 text-xs font-medium bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full ml-1">❌ Non généré</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-medium bg-orange-50 text-blabia-orange border border-orange-200 px-2 py-0.5 rounded-full ml-1">⏳ En attente</span>;
}

// Aplatit la liste de sessions en fil indenté (roots → enfants → petits-enfants)
function buildSessionThreads(sessions) {
  const map = {};
  sessions.forEach(s => { map[s.id] = { ...s, children: [] }; });
  const roots = [];
  sessions.forEach(s => {
    if (s.parentSessionId && map[s.parentSessionId]) {
      map[s.parentSessionId].children.push(map[s.id]);
    } else {
      roots.push(map[s.id]);
    }
  });
  roots.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  function flattenNode(node, depth) {
    const result = [{ ...node, depth }];
    node.children
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .forEach(child => result.push(...flattenNode(child, depth + 1)));
    return result;
  }
  return roots.flatMap(root => flattenNode(root, 0));
}

function SessionRow({ session, projectId, onViewDeliverable }) {
  const navigate   = useNavigate();
  const [reopening, setReopening] = useState(false);

  const truncated = session.task.length > 50 ? session.task.substring(0, 50) + '…' : session.task;
  const date = new Date(session.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const isMeeting  = session.mode === 'meeting';
  const isFinished = isMeeting && (session.status === 'accepted' || session.status === 'abandoned');
  const isOpen     = session.status === 'open';
  const isViewable = session.status === 'complete' || session.status === 'accepted' || isFinished;
  const isClickable = isViewable || (isOpen && isMeeting);
  const depth = session.depth ?? 0;
  const isContinuation = depth > 0;
  const sessionPath = isMeeting
    ? `/projects/${projectId}/meeting/${session.id}`
    : `/projects/${projectId}/session/${session.id}`;

  const handleReopen = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (reopening) return;
    setReopening(true);
    try {
      await api.post(`/projects/${projectId}/sessions/${session.id}/reopen`);
      navigate(`/projects/${projectId}/meeting/${session.id}`);
    } catch {
      setReopening(false);
    }
  };

  const inner = (
    <>
      {/* Desktop */}
      <tr className={`hidden md:table-row ${isClickable ? 'hover:bg-gray-50 cursor-pointer' : 'opacity-70'}`}>
        <td className="px-4 py-3 text-sm text-gray-800 max-w-xs">
          <div className="flex items-center gap-1.5" style={{ paddingLeft: depth * 16 }}>
            {isContinuation && <span className="text-gray-300 text-xs shrink-0">↳</span>}
            <span className="truncate block">{truncated}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <SessionStatusBadge status={session.status} />
          <CodeStatusBadge session={session} />
          {isOpen && isMeeting && (
            <span className="ml-1 inline-flex items-center gap-1 text-xs font-semibold bg-blabia-blue text-white px-1.5 py-0.5 rounded-full animate-pulse">🔵</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-gray-500">{session.agentCount ?? '–'} agents</td>
        <td className="px-4 py-3 text-sm text-gray-400">{date}</td>
        <td className="px-4 py-3 text-right">
          {isFinished ? (
            <div className="inline-flex items-center gap-2">
              {session.status === 'accepted' && onViewDeliverable && DELIVERABLE_ICON[getIntentionKey(session)] && (
                <button
                  onClick={e => { e.preventDefault(); e.stopPropagation(); onViewDeliverable(session); }}
                  title="Voir le livrable"
                  className="text-base leading-none hover:scale-110 transition"
                >
                  {DELIVERABLE_ICON[getIntentionKey(session)]}
                </button>
              )}
              <span className="text-xs text-blabia-blue font-medium">Voir →</span>
              <button
                onClick={handleReopen}
                disabled={reopening}
                className="text-xs text-blabia-blue border border-blue-200 hover:bg-blue-50 px-2 py-0.5 rounded-lg transition disabled:opacity-50"
              >
                {reopening ? '…' : '🔁 Reprendre'}
              </button>
            </div>
          ) : (
            <>
              {isViewable && (
                <span className="text-xs text-blabia-blue font-medium">
                  {isMeeting ? 'Voir la réunion →' : 'Relire →'}
                </span>
              )}
              {isOpen && isMeeting && (
                <span className="text-xs text-green-600 font-medium">Reprendre →</span>
              )}
            </>
          )}
        </td>
      </tr>

      {/* Mobile */}
      <div
        className={`md:hidden bg-white rounded-xl border p-4 shadow-sm ${isClickable ? 'border-gray-200 hover:shadow-md' : 'border-orange-100 opacity-75'} transition`}
        style={{ marginLeft: depth * 16 }}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {isContinuation && <span className="text-gray-300 text-xs shrink-0">↳</span>}
            <p className="text-sm font-medium text-gray-800 leading-snug truncate">{truncated}</p>
          </div>
          <SessionStatusBadge status={session.status} />
          <CodeStatusBadge session={session} />
        </div>
        <p className="text-xs text-gray-400">{session.agentCount ?? '–'} agents · {date}</p>
        {isFinished ? (
          <div className="flex items-center gap-2 mt-2">
            <p className="text-xs text-blabia-blue font-medium flex-1">Voir la réunion →</p>
            {session.status === 'accepted' && onViewDeliverable && DELIVERABLE_ICON[getIntentionKey(session)] && (
              <button
                onClick={e => { e.preventDefault(); e.stopPropagation(); onViewDeliverable(session); }}
                title="Voir le livrable"
                className="text-base leading-none hover:scale-110 transition shrink-0"
              >
                {DELIVERABLE_ICON[getIntentionKey(session)]}
              </button>
            )}
            <button
              onClick={handleReopen}
              disabled={reopening}
              className="text-xs text-blabia-blue border border-blue-200 hover:bg-blue-50 px-2 py-1 rounded-lg transition disabled:opacity-50 shrink-0"
            >
              {reopening ? '…' : '🔁 Reprendre'}
            </button>
          </div>
        ) : (
          <>
            {isViewable && <p className="text-xs text-blabia-blue font-medium mt-2">{isMeeting ? 'Voir la réunion →' : 'Relire →'}</p>}
            {isOpen && isMeeting && <p className="text-xs text-green-600 font-medium mt-1">Reprendre →</p>}
          </>
        )}
      </div>
    </>
  );

  if (!isClickable) return <>{inner}</>;
  return (
    <Link to={sessionPath} className="contents">
      {inner}
    </Link>
  );
}

function DevDirectoryRow({ project, isOwner, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(project.devDirectory || '');
  const [saving, setSaving]   = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/projects/${project.id}`, { devDirectory: val });
      onSave(val.trim() || null);
      setEditing(false);
    } catch {}
    setSaving(false);
  };

  if (editing) return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <span className="text-xs text-gray-400">📁</span>
      <input autoFocus type="text" value={val} onChange={e => setVal(e.target.value)}
        placeholder="ex : C:\MonProjet ou /home/user/projet"
        className="flex-1 text-xs border border-gray-300 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-blue-400 font-mono"
        onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
      />
      <button onClick={handleSave} disabled={saving} className="text-xs bg-blabia-blue text-white px-2 py-1 rounded-lg">
        {saving ? '…' : '✓'}
      </button>
      <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
    </div>
  );

  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <span className="text-xs text-gray-400">📁</span>
      {project.devDirectory
        ? <span className="text-xs text-gray-500 font-mono">{project.devDirectory}</span>
        : <span className="text-xs text-gray-300">Aucun répertoire de dev</span>
      }
      {isOwner && (
        <button onClick={() => { setVal(project.devDirectory || ''); setEditing(true); }}
          className="text-xs text-gray-400 hover:text-blue-500 transition ml-1">
          {project.devDirectory ? 'Modifier' : 'Définir'}
        </button>
      )}
    </div>
  );
}

export default function ProjectView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'supervisor';
  const [project, setProject]           = useState(null);
  const [loading, setLoading]           = useState(true);
  const [sessions, setSessions]         = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [showRename, setShowRename]     = useState(false);
  const [showBrief, setShowBrief]       = useState(false);
  const [showGenTimeline, setShowGenTimeline] = useState(false);
  const [deliverableSession, setDeliverableSession] = useState(null);
  const [stats, setStats]                           = useState(null);
  const [briefExpanded, setBriefExpanded] = useState(false);
  const [archiving, setArchiving]       = useState(false);
  const [memoryOpen, setMemoryOpen]     = useState(false);
  const [resettingMemory, setResettingMemory] = useState(false);
  const [showResetMemoryModal, setShowResetMemoryModal] = useState(false);
  const [resetMemoryConfirmName, setResetMemoryConfirmName] = useState('');
  const [showDelete, setShowDelete]     = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [members, setMembers]           = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [inviteInput, setInviteInput]   = useState('');
  const [inviting, setInviting]         = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [removingMember, setRemovingMember] = useState(null);
  // ── Onglets ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]       = useState('sessions');
  // ── Agents du projet ───────────────────────────────────────────────────────
  const [projectAgents, setProjectAgents]   = useState([]);
  const [agentsLoading, setAgentsLoading]   = useState(false);
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [newAgentForm, setNewAgentForm]       = useState({ name: '', role: '', systemPrompt: '', emoji: '🤖' });
  const [creatingAgent, setCreatingAgent]     = useState(false);
  const [createAgentError, setCreateAgentError] = useState('');
  const [draggedAgentId, setDraggedAgentId]   = useState(null);
  const [dragOverAgentId, setDragOverAgentId] = useState(null);
  // ── Commande rapide ────────────────────────────────────────────────────────
  const [quickInput, setQuickInput]   = useState('');
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickResult, setQuickResult] = useState(null);
  const [quickHistory, setQuickHistory] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(`blabia-qh-${id}`) || '[]'); } catch { return []; }
  });
  // ── Stack technique ────────────────────────────────────────────────────────
  const [projectStack, setProjectStack] = useState({});
  const [stackLoading, setStackLoading] = useState(false);
  const [savingStack, setSavingStack]   = useState(false);
  const [savedStack, setSavedStack]     = useState(false);
  const [stackError, setStackError]     = useState('');
  const [userGlobalStack, setUserGlobalStack] = useState({});
  const stackTimerRef = useRef(null);
  const isFirstStackLoad = useRef(true);
  // ── Stack v4 : panneau latéral ─────────────────────────────────────────────
  const [showStackPanel, setShowStackPanel]   = useState(false);
  const [userToolbox, setUserToolbox]         = useState({});
  const [stackOverrides, setStackOverrides]   = useState({});
  const [pendingToolsCount, setPendingToolsCount] = useState(0);

  // Charger le stack projet + stack global utilisateur + boîte à outils v4
  useEffect(() => {
    setStackLoading(true);
    Promise.all([
      api.get(`/users/me/tech-stack`),
      api.get(`/users/me/toolbox`),
    ]).then(([userRes, toolboxRes]) => {
      setUserGlobalStack(userRes.data || {});
      setUserToolbox(toolboxRes.data || {});
    }).catch(() => {}).finally(() => setStackLoading(false));
  }, []);

  // Auto-save stack projet (debounce 1s)
  useEffect(() => {
    if (stackLoading) return;
    if (isFirstStackLoad.current) { isFirstStackLoad.current = false; return; }
    setSavedStack(false);
    if (stackTimerRef.current) clearTimeout(stackTimerRef.current);
    stackTimerRef.current = setTimeout(async () => {
      setSavingStack(true);
      setStackError('');
      try {
        await api.patch(`/projects/${id}/tech-stack`, { techStack: projectStack });
        setProject(prev => ({ ...prev, techStack: projectStack }));
        setSavedStack(true);
        setTimeout(() => setSavedStack(false), 3000);
      } catch {
        setStackError('Erreur lors de la sauvegarde');
      } finally {
        setSavingStack(false);
      }
    }, 1000);
    return () => clearTimeout(stackTimerRef.current);
  }, [projectStack, stackLoading]);

  useEffect(() => {
    api.get(`/projects/${id}`)
      .then(({ data }) => {
        setProject(data);
        // Initialiser les ajustements v4 (panneau Stack)
        const ts = typeof data.techStack === 'object' ? (data.techStack || {}) : {};
        setStackOverrides(ts.v4?.overrides || {});
        // Initialiser la stack legacy (projet non-technique ou projets existants)
        if (!data.hasTechnicalStack) {
          if (data.techStack && typeof data.techStack === 'object') {
            setProjectStack(data.techStack);
            isFirstStackLoad.current = false;
          } else if (data.techStack) {
            try { setProjectStack(JSON.parse(data.techStack)); isFirstStackLoad.current = false; } catch {}
          }
        }
        // Charger les membres si owner ou admin
        if (data.userId === user?.id || user?.role === 'admin' || user?.role === 'supervisor') {
          setMembersLoading(true);
          api.get(`/projects/${id}/members`)
            .then(({ data: m }) => setMembers(m))
            .catch(() => {})
            .finally(() => setMembersLoading(false));
        }
        // Badge pending tools si projet technique
        if (data.hasTechnicalStack) {
          api.get(`/projects/${id}/pending-tools`)
            .then(({ data: pt }) => setPendingToolsCount(Array.isArray(pt) ? pt.length : 0))
            .catch(() => {});
        }
      })
      .catch(() => navigate('/dashboard'))
      .finally(() => setLoading(false));

    api.get(`/projects/${id}/sessions`)
      .then(({ data }) => setSessions(data))
      .catch(() => {})
      .finally(() => setSessionsLoading(false));

    api.get(`/projects/${id}/stats`)
      .then(({ data }) => setStats(data))
      .catch(() => {});

    setAgentsLoading(true);
    api.get(`/projects/${id}/agents`)
      .then(({ data }) => setProjectAgents(data))
      .catch(() => {})
      .finally(() => setAgentsLoading(false));
  }, [id]);

  // ── Handlers agents ────────────────────────────────────────────────────────

  const toggleAgent = async (agent) => {
    const newEnabled = !(agent.enabled ?? false);
    // Mise à jour optimiste
    setProjectAgents(prev => prev.map(a => a.id === agent.id ? { ...a, enabled: newEnabled, projectAgentId: a.projectAgentId || 'optimistic' } : a));
    try {
      await api.patch(`/projects/${id}/agents/${agent.id}`, { enabled: newEnabled });
      // Recharger pour avoir l'état exact
      const { data } = await api.get(`/projects/${id}/agents`);
      setProjectAgents(data);
    } catch {
      setProjectAgents(prev => prev.map(a => a.id === agent.id ? { ...a, enabled: !newEnabled } : a));
    }
  };

  const handleAgentDragStart = (agentId) => setDraggedAgentId(agentId);
  const handleAgentDragOver  = (e, agentId) => { e.preventDefault(); setDragOverAgentId(agentId); };
  const handleAgentDragEnd   = () => { setDraggedAgentId(null); setDragOverAgentId(null); };

  const handleAgentDrop = async (e, targetId) => {
    e.preventDefault();
    if (!draggedAgentId || draggedAgentId === targetId) {
      setDraggedAgentId(null); setDragOverAgentId(null); return;
    }
    const active = projectAgents.filter(a => a.enabled);
    const fromIdx = active.findIndex(a => a.id === draggedAgentId);
    const toIdx   = active.findIndex(a => a.id === targetId);
    if (fromIdx === -1 || toIdx === -1) { setDraggedAgentId(null); setDragOverAgentId(null); return; }

    const reordered = [...active];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    const inactive = projectAgents.filter(a => !a.enabled);
    setProjectAgents([...reordered.map((a, i) => ({ ...a, displayOrder: i })), ...inactive]);
    setDraggedAgentId(null); setDragOverAgentId(null);

    try {
      await api.patch(`/projects/${id}/agents/reorder`, { order: reordered.map(a => a.id) });
    } catch {}
  };

  const handleCreateAgent = async (e) => {
    e.preventDefault();
    if (!newAgentForm.name.trim() || !newAgentForm.role.trim() || !newAgentForm.systemPrompt.trim()) return;
    setCreatingAgent(true);
    setCreateAgentError('');
    try {
      const { data: newAgent } = await api.post('/agents', newAgentForm);
      await api.post(`/projects/${id}/agents`, { agentId: newAgent.id, source: 'manual' });
      const { data } = await api.get(`/projects/${id}/agents`);
      setProjectAgents(data);
      setShowCreateAgent(false);
      setNewAgentForm({ name: '', role: '', systemPrompt: '', emoji: '🤖' });
    } catch (err) {
      setCreateAgentError(err.response?.data?.error || 'Erreur lors de la création');
    } finally {
      setCreatingAgent(false);
    }
  };

  const toggleStackOption = (categoryId, option) => {
    setProjectStack(prev => {
      const current = prev[categoryId] || [];
      return { ...prev, [categoryId]: current.includes(option) ? current.filter(x => x !== option) : [...current, option] };
    });
  };

  const setStackAutre = (categoryId, value) => {
    setProjectStack(prev => ({ ...prev, [`${categoryId}_autre`]: value }));
  };

  const addToolToStack = (toolName) => {
    const match = findToolInCategories(toolName);
    if (match) {
      setProjectStack(prev => {
        const current = prev[match.categoryId] || [];
        if (current.includes(match.option)) return prev;
        return { ...prev, [match.categoryId]: [...current, match.option] };
      });
    } else {
      setProjectStack(prev => {
        const existing = prev['devtools_autre'] || '';
        const list = existing ? existing.split(', ') : [];
        if (list.some(t => t.toLowerCase() === toolName.toLowerCase())) return prev;
        const current = prev['devtools'] || [];
        const withAutre = current.includes('Autre') ? current : [...current, 'Autre'];
        return { ...prev, devtools: withAutre, devtools_autre: [...list, toolName].join(', ') };
      });
    }
  };

  const handleQuickCommand = async (e) => {
    e?.preventDefault();
    const input = quickInput.trim();
    if (!input || quickLoading) return;
    setQuickLoading(true);
    setQuickResult(null);
    const prev = JSON.parse(sessionStorage.getItem(`blabia-qh-${id}`) || '[]');
    const updated = [input, ...prev.filter(h => h !== input)].slice(0, 5);
    sessionStorage.setItem(`blabia-qh-${id}`, JSON.stringify(updated));
    setQuickHistory(updated);
    try {
      const { data } = await api.post(`/projects/${id}/quick-command`, { input });
      setQuickResult(data);
    } catch (err) {
      setQuickResult({ type: 'error', result: err.response?.data?.error || 'Erreur lors de l\'exécution de la commande' });
    } finally {
      setQuickLoading(false);
    }
  };

  const handleSaveOverrides = async (newOverrides) => {
    setStackOverrides(newOverrides);
    try {
      const base = typeof projectStack === 'object' ? projectStack : {};
      const merged = { ...base, v4: { overrides: newOverrides } };
      await api.patch(`/projects/${id}/tech-stack`, { techStack: merged });
      setProject(prev => ({ ...prev, techStack: merged }));
    } catch {}
  };

  const handleArchive = async () => {
    const label = project.status === 'active' ? 'archiver' : 'réactiver';
    if (!confirm(`Voulez-vous ${label} ce projet ?`)) return;
    setArchiving(true);
    try {
      const { data } = await api.patch(`/projects/${id}/archive`);
      setProject(prev => ({ ...prev, status: data.status }));
    } catch {
      alert('Erreur lors de l\'opération');
    } finally {
      setArchiving(false);
    }
  };

  const handleInviteMember = async (e) => {
    e.preventDefault();
    const input = inviteInput.trim();
    if (!input) return;
    setInviting(true);
    setInviteResult(null);
    try {
      const body = input.startsWith('@')
        ? { username: input.slice(1) }
        : { email: input };
      const { data } = await api.post(`/projects/${id}/members`, body);
      if (data.type === 'added') {
        setMembers(prev => [...prev, data.member]);
        const label = data.member.username ? `@${data.member.username}` : data.member.email;
        setInviteResult({ type: 'ok', message: `${label} ajouté comme collaborateur.` });
      } else {
        setInviteResult({ type: 'ok', message: `Invitation envoyée à ${data.email}.` });
      }
      setInviteInput('');
    } catch (err) {
      setInviteResult({ type: 'error', message: err.response?.data?.error || 'Erreur lors de l\'invitation' });
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (userId) => {
    setRemovingMember(userId);
    try {
      await api.delete(`/projects/${id}/members/${userId}`);
      setMembers(prev => prev.filter(m => m.userId !== userId));
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors du retrait');
    } finally {
      setRemovingMember(null);
    }
  };

  const handleDeleteProject = async () => {
    setDeleting(true);
    try {
      await api.delete(`/projects/${id}`);
      navigate('/dashboard');
    } catch {
      alert('Erreur lors de la suppression');
      setDeleting(false);
    }
  };

  const handleResetMemory = async () => {
    setResettingMemory(true);
    try {
      await api.delete(`/projects/${id}/memory`);
      setProject(prev => ({ ...prev, context: null }));
      setShowResetMemoryModal(false);
      setResetMemoryConfirmName('');
    } catch {
      alert('Erreur lors de la réinitialisation');
    } finally {
      setResettingMemory(false);
    }
  };

  if (loading) {
    return (
      <ProjectLayout projectId={id}>
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blabia-blue" />
        </div>
      </ProjectLayout>
    );
  }

  if (!project) return null;

  const isOwner = project.userId === user?.id;
  const canManage = isOwner || isAdmin;

  return (
    <ProjectLayout projectId={id}>
      {/* Navigation */}
      <Link to="/dashboard" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-5">
        ← Tableau de bord
      </Link>

      {/* En-tête projet */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900 break-words">{project.name}</h1>
              {project.status === 'archived' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 shrink-0">
                  Archivé
                </span>
              )}
            </div>
            {project.description && (
              <p className="text-gray-500 text-sm mt-1">{project.description}</p>
            )}
            {project.brief && (
              <div className="mt-2">
                <p className="text-xs text-gray-500 leading-relaxed line-clamp-2" style={briefExpanded ? { WebkitLineClamp: 'unset' } : {}}>
                  {project.brief}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <button onClick={() => setBriefExpanded(v => !v)}
                    className="text-xs text-blue-500 hover:text-blabia-blue font-medium transition">
                    {briefExpanded ? 'Réduire' : 'Voir tout'}
                  </button>
                  {(isAdmin || project.userId === user?.id) && (
                    <button onClick={() => setShowBrief(true)}
                      className="text-xs text-gray-400 hover:text-gray-600 transition">
                      Modifier le brief
                    </button>
                  )}
                </div>
              </div>
            )}
            {!project.brief && (isAdmin || project.userId === user?.id) && (
              <button onClick={() => setShowBrief(true)}
                className="mt-1 text-xs text-gray-400 hover:text-blue-500 transition">
                + Ajouter un brief projet
              </button>
            )}
            {/* Répertoire de dev (Évolution 7) */}
            <DevDirectoryRow project={project} isOwner={isAdmin || project.userId === user?.id}
              onSave={d => setProject(prev => ({ ...prev, devDirectory: d }))} />
            <p className="text-xs text-gray-400 mt-1">
              {project.sessionCount ?? 0} réunion{(project.sessionCount ?? 0) !== 1 ? 's' : ''} · Créé le {new Date(project.createdAt).toLocaleDateString('fr-FR')}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start flex-wrap">
            {project.hasTechnicalStack && (
              <button
                onClick={() => setShowStackPanel(true)}
                className="relative text-sm border border-emerald-200 text-emerald-700 hover:bg-emerald-50 px-3 py-2 rounded-lg transition min-h-[40px] flex items-center gap-1.5 font-medium"
              >
                🔧 Stack
                {pendingToolsCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none">
                    {pendingToolsCount}
                  </span>
                )}
              </button>
            )}
            <Link
              to={`/projects/${id}/plan`}
              className="text-sm border border-blue-200 text-blabia-blue hover:bg-blue-50 px-3 py-2 rounded-lg transition min-h-[40px] flex items-center gap-1.5 font-medium"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Plan
            </Link>
            {project.brief && (
              <button onClick={() => setShowGenTimeline(true)}
                className="text-sm border border-violet-200 text-violet-600 hover:bg-violet-50 px-3 py-2 rounded-lg transition min-h-[40px] flex items-center gap-1.5 font-medium">
                📅 Timeline IA
              </button>
            )}
            <button
              onClick={() => setShowRename(true)}
              className="text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-2 rounded-lg transition min-h-[40px]"
            >
              Modifier
            </button>
            <button
              onClick={handleArchive}
              disabled={archiving}
              className="text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-2 rounded-lg transition disabled:opacity-40 min-h-[40px]"
            >
              {archiving ? '…' : project.status === 'active' ? 'Archiver' : 'Réactiver'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Commande rapide ─────────────────────────────────────────────── */}
      <div className="mb-5">
        <form onSubmit={handleQuickCommand} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm shrink-0 pl-1">⚡</span>
            <input
              type="text"
              value={quickInput}
              onChange={e => setQuickInput(e.target.value)}
              placeholder="Pose une question ou tape / pour une commande"
              className="flex-1 text-sm outline-none text-gray-800 placeholder-gray-400 min-w-0"
              disabled={quickLoading}
            />
            <button
              type="submit"
              disabled={quickLoading || !quickInput.trim()}
              className="shrink-0 bg-blabia-blue text-white text-sm font-medium w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-40 transition hover:opacity-90"
              title="Envoyer"
            >
              {quickLoading ? '…' : '▶'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-gray-100">
            {QUICK_COMMANDS.map(c => (
              <button
                key={c.cmd}
                type="button"
                onClick={() => setQuickInput(c.placeholder || c.cmd)}
                className="text-xs bg-gray-50 hover:bg-blue-50 text-gray-500 hover:text-blabia-blue border border-gray-200 hover:border-blue-200 px-2 py-1 rounded-lg transition"
              >
                {c.cmd}
              </button>
            ))}
          </div>
          {quickHistory.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
              <span className="text-xs text-gray-400">Récent :</span>
              {quickHistory.map((h, i) => (
                <button key={i} type="button" onClick={() => setQuickInput(h)}
                  className="text-xs text-gray-400 hover:text-gray-600 bg-gray-50 border border-gray-100 hover:border-gray-200 px-2 py-0.5 rounded-lg transition truncate max-w-[160px]">
                  {h.length > 30 ? h.slice(0, 30) + '…' : h}
                </button>
              ))}
            </div>
          )}
        </form>

        {quickResult && (
          <div className="mt-2 bg-white rounded-xl border border-blue-100 shadow-sm">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-700">⚡ Résultat</span>
              <button onClick={() => setQuickResult(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            <div className="px-4 py-3 max-h-96 overflow-y-auto">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={QUICK_MD}>
                {quickResult.result}
              </ReactMarkdown>
            </div>
            {quickResult.milestonesCreated?.length > 0 && (
              <div className="px-4 pb-3 pt-3 border-t border-gray-100 flex items-center gap-3 flex-wrap">
                <span className="text-sm text-green-700">
                  ✅ {quickResult.milestonesCreated.length} étape{quickResult.milestonesCreated.length !== 1 ? 's' : ''} ajoutée{quickResult.milestonesCreated.length !== 1 ? 's' : ''} à la timeline
                </span>
                <Link to={`/projects/${id}/plan`} className="text-sm text-blabia-blue font-medium hover:underline">
                  Voir la timeline →
                </Link>
              </div>
            )}
            {quickResult.sources?.length > 0 && (
              <div className="px-4 pb-3 pt-2 border-t border-gray-100 space-y-1">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Sources web</p>
                {quickResult.sources.map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline truncate">
                    🌐 <span className="truncate">{s.title || s.url}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mémoire du projet */}
      {project.context && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 shadow-sm mb-5">
          <button
            onClick={() => setMemoryOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-3 text-left"
          >
            <span className="text-sm font-medium text-gray-500">Mémoire du projet</span>
            <span className="text-gray-400 text-xs">{memoryOpen ? '▲ Réduire' : '▼ Afficher'}</span>
          </button>
          {memoryOpen && (
            <div className="px-5 pb-4 border-t border-gray-100">
              <pre className="text-xs text-gray-500 whitespace-pre-wrap font-sans mt-3 leading-relaxed max-h-60 overflow-y-auto">
                {project.context}
              </pre>
              {isAdmin && (
                <button
                  onClick={handleResetMemory}
                  disabled={resettingMemory}
                  className="mt-3 text-xs text-red-500 hover:text-red-700 disabled:opacity-40 transition"
                >
                  {resettingMemory ? 'Réinitialisation…' : 'Réinitialiser la mémoire'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Section Membres du projet — visible propriétaire + admin */}
      {canManage && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Membres du projet</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {members.length} collaborateur{members.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Formulaire invitation */}
          <div className="px-5 py-4 border-b border-gray-100">
            <form onSubmit={handleInviteMember} className="flex gap-2">
              <input
                type="text"
                value={inviteInput}
                onChange={e => { setInviteInput(e.target.value); setInviteResult(null); }}
                placeholder="email@exemple.com ou @pseudo"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blabia-blue focus:border-transparent outline-none"
              />
              <button
                type="submit"
                disabled={inviting || !inviteInput.trim()}
                className="bg-blabia-blue hover:bg-blabia-blue text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50 shrink-0"
              >
                {inviting ? '…' : 'Inviter'}
              </button>
            </form>
            {inviteResult && (
              <p className={`text-xs mt-2 ${inviteResult.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
                {inviteResult.type === 'ok' ? '✓ ' : '⚠ '}{inviteResult.message}
              </p>
            )}
          </div>

          {/* Liste des membres */}
          {membersLoading ? (
            <div className="px-5 py-4 text-sm text-gray-400">Chargement…</div>
          ) : members.length === 0 ? (
            <div className="px-5 py-4 text-sm text-gray-400">Aucun collaborateur pour l'instant.</div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {members.map(m => (
                <li key={m.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {m.email}
                      {m.username && <span className="ml-1.5 text-xs text-gray-400">@{m.username}</span>}
                    </p>
                    <p className="text-xs text-gray-400 capitalize">{m.role}</p>
                  </div>
                  <button
                    onClick={() => handleRemoveMember(m.userId)}
                    disabled={removingMember === m.userId}
                    className="text-xs text-red-400 hover:text-red-600 transition disabled:opacity-40"
                  >
                    {removingMember === m.userId ? '…' : 'Retirer'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Onglet Sessions ──────────────────────────────────────────────── */}

      {/* ── ONGLET SESSIONS ─────────────────────────────────────────────────── */}
      {activeTab === 'sessions' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="font-semibold text-gray-900">Réunions</h2>
              {!sessionsLoading && (
                <p className="text-xs text-gray-400 mt-0.5">{sessions.length} réunion{sessions.length !== 1 ? 's' : ''}</p>
              )}
            </div>
            {project.status === 'active' && (
              <Link to={`/projects/${id}/meeting/new`} className="bg-blabia-blue hover:bg-blabia-blue text-white text-sm font-medium px-3 py-1.5 rounded-lg transition">
                + Nouvelle réunion
              </Link>
            )}
          </div>

          {sessionsLoading && <div className="flex items-center justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blabia-blue" /></div>}

          {!sessionsLoading && sessions.length > 0 && (
            <table className="hidden md:table w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">Tâche</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">Statut</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">Agents</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {buildSessionThreads(sessions).map(s => <SessionRow key={s.id} session={s} projectId={id} onViewDeliverable={setDeliverableSession} />)}
              </tbody>
            </table>
          )}
          {!sessionsLoading && sessions.length > 0 && (
            <div className="md:hidden p-4 space-y-3">
              {buildSessionThreads(sessions).map(s => <SessionRow key={s.id} session={s} projectId={id} onViewDeliverable={setDeliverableSession} />)}
            </div>
          )}
          {!sessionsLoading && sessions.length === 0 && (
            <div className="text-center py-10 px-5 text-gray-400">
              <p className="text-sm">Aucune réunion pour l'instant.</p>
              {project.status === 'active' && (
                <Link to={`/projects/${id}/meeting/new`} className="inline-block mt-2 text-blabia-blue hover:text-blabia-blue text-sm font-medium">
                  Lancer votre première réunion →
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Encart stats tokens ────────────────────────────────────────────── */}
      {activeTab === 'sessions' && stats && stats.totalTokens > 0 && (
        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl px-5 py-3 flex flex-wrap gap-4 items-center text-xs text-gray-500">
          <span>🔢 <strong className="text-gray-700">{stats.totalTokens.toLocaleString('fr-FR')}</strong> tokens consommés</span>
          <span>💬 <strong className="text-gray-700">{stats.sessionCount}</strong> réunion{stats.sessionCount !== 1 ? 's' : ''} avec données</span>
          <span>💶 Coût estimé : <strong className="text-gray-700">~€{stats.estimatedCost.toFixed(4)}</strong></span>
          <span className="text-gray-400 text-[10px] ml-auto">(sonnet-4-6 : $3/1M input · $15/1M output)</span>
        </div>
      )}

      {/* Zone de danger — visible propriétaire + admin uniquement */}
      {canManage && (
        <div className="mt-8 border-t border-red-100 pt-6">
          <p className="text-xs font-semibold text-red-400 uppercase tracking-widest mb-4">⚠️ Zone de danger</p>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between p-4 border border-amber-200 rounded-xl bg-amber-50">
              <div>
                <p className="text-sm font-medium text-amber-800">Réinitialiser la mémoire du projet</p>
                <p className="text-xs text-amber-600 mt-0.5">Efface tout l'historique des réunions, les résumés et remet les étapes à zéro.</p>
              </div>
              <button
                onClick={() => { setResetMemoryConfirmName(''); setShowResetMemoryModal(true); }}
                className="shrink-0 ml-4 px-3 py-1.5 text-sm border border-amber-400 text-amber-700 rounded-lg hover:bg-amber-100 transition"
              >
                🔄 Réinitialiser
              </button>
            </div>
            <div className="flex items-center justify-between p-4 border border-red-200 rounded-xl bg-red-50">
              <div>
                <p className="text-sm font-medium text-red-700">Supprimer le projet</p>
                <p className="text-xs text-red-500 mt-0.5">Action irréversible — supprime toutes les données.</p>
              </div>
              <button
                onClick={() => setShowDelete(true)}
                className="shrink-0 ml-4 px-3 py-1.5 text-sm border border-red-400 text-red-600 rounded-lg hover:bg-red-100 transition"
              >
                Supprimer…
              </button>
            </div>
          </div>
        </div>
      )}

      {showRename && (
        <RenameModal
          project={project}
          onSave={updated => { setProject(prev => ({ ...prev, ...updated })); setShowRename(false); }}
          onClose={() => setShowRename(false)}
        />
      )}
      {showBrief && (
        <BriefModal
          project={project}
          onSave={updated => { setProject(prev => ({ ...prev, ...updated })); setShowBrief(false); }}
          onClose={() => setShowBrief(false)}
        />
      )}
      {showDelete && (
        <DeleteProjectModal
          project={project}
          sessionCount={project.sessionCount ?? 0}
          onClose={() => setShowDelete(false)}
          onConfirm={handleDeleteProject}
          deleting={deleting}
        />
      )}
      {showResetMemoryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">🔄 Réinitialiser la mémoire du projet</h3>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1 text-sm text-amber-800">
              <p className="font-medium">Cette action va :</p>
              <ul className="list-disc pl-4 space-y-0.5 text-amber-700">
                <li>Effacer la mémoire contextuelle du projet</li>
                <li>Vider l'historique et les résumés de toutes les réunions</li>
                <li>Remettre toutes les étapes de la timeline à l'état initial</li>
              </ul>
            </div>
            <p className="text-sm text-gray-600">
              Pour confirmer, saisissez le nom du projet :{' '}
              <span className="font-semibold text-gray-900">{project.name}</span>
            </p>
            <input
              type="text"
              value={resetMemoryConfirmName}
              onChange={e => setResetMemoryConfirmName(e.target.value)}
              placeholder={project.name}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            />
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setShowResetMemoryModal(false); setResetMemoryConfirmName(''); }}
                disabled={resettingMemory}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button
                onClick={handleResetMemory}
                disabled={resettingMemory || resetMemoryConfirmName !== project.name}
                className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-medium transition disabled:opacity-40"
              >
                {resettingMemory ? 'Réinitialisation…' : '🔄 Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showGenTimeline && (
        <GenerateTimelineModal
          project={project}
          existingCount={0}
          onClose={() => setShowGenTimeline(false)}
          onAdded={() => setShowGenTimeline(false)}
        />
      )}

      {/* ── Modaux livrables depuis SessionRow ───────────────────────── */}
      {(() => {
        if (!deliverableSession) return null;
        const ik = getIntentionKey(deliverableSession);
        const dateStr = deliverableSession.createdAt
          ? new Date(deliverableSession.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
          : '';
        if (['summary','synthesis','memory','meeting'].includes(ik)) return (
          <SummaryDisplayModal
            title={deliverableSession.task}
            date={dateStr}
            content={deliverableSession.summary}
            onClose={() => setDeliverableSession(null)}
          />
        );
        if (['claude_code','technical'].includes(ik)) return (
          <ExportModal
            directContent={deliverableSession.summary}
            projectId={id}
            onClose={() => setDeliverableSession(null)}
          />
        );
        if (ik === 'timeline_steps') return (
          <TimelineStepsModal
            session={deliverableSession}
            projectId={id}
            onClose={() => setDeliverableSession(null)}
          />
        );
        return null;
      })()}

      {showStackPanel && (
        <StackPanel
          project={project}
          toolbox={userToolbox}
          overrides={stackOverrides}
          onSaveOverrides={handleSaveOverrides}
          onClose={() => setShowStackPanel(false)}
          onToolboxUpdate={newToolbox => setUserToolbox(newToolbox)}
          onPendingToolsChange={count => setPendingToolsCount(count)}
        />
      )}
    </ProjectLayout>
  );
}

