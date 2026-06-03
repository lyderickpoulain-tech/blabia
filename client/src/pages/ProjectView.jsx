import { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import ProjectLayout from '../components/ProjectLayout';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

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
          <span className="ml-auto text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
            {selected.filter(x => x !== 'Autre').length + (autreChecked && autreText ? 1 : 0)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {category.options.map(option => (
          <label key={option} className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border cursor-pointer transition select-none text-xs font-medium ${
            selected.includes(option) ? 'bg-blue-50 border-blue-300 text-blue-800' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
          }`}>
            <input type="checkbox" checked={selected.includes(option)} onChange={() => onToggle(category.id, option)} className="w-3 h-3 accent-blue-600 shrink-0" />
            {option}
          </label>
        ))}
        {category.hasAutre && (
          <label className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border cursor-pointer transition select-none text-xs font-medium ${
            autreChecked ? 'bg-blue-50 border-blue-300 text-blue-800' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
          }`}>
            <input type="checkbox" checked={autreChecked} onChange={() => onToggle(category.id, 'Autre')} className="w-3 h-3 accent-blue-600 shrink-0" />
            Autre
          </label>
        )}
      </div>
      {category.hasAutre && autreChecked && (
        <input type="text" value={autreText} onChange={e => onAutreChange(category.id, e.target.value)}
          placeholder={category.autrePlaceholder}
          className="mt-2 w-full px-3 py-1.5 text-xs border border-blue-200 bg-blue-50 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
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
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
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
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg transition text-sm font-medium disabled:opacity-50">
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
          <strong>{sessionCount} session{sessionCount !== 1 ? 's' : ''}</strong>.
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
  return status === 'complete'
    ? <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Complète</span>
    : <span className="inline-flex items-center gap-1 text-xs font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Interrompue</span>;
}

function CodeStatusBadge({ session }) {
  if (!session.hasCode) return null;
  if (session.codeStatus === 'implemented')
    return <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full ml-1">✅ Implémenté</span>;
  if (session.codeStatus === 'not_generated')
    return <span className="inline-flex items-center gap-1 text-xs font-medium bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full ml-1">❌ Non généré</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-medium bg-orange-50 text-orange-600 border border-orange-200 px-2 py-0.5 rounded-full ml-1">⏳ En attente</span>;
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

function SessionRow({ session, projectId }) {
  const truncated = session.task.length > 50 ? session.task.substring(0, 50) + '…' : session.task;
  const date = new Date(session.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const isComplete = session.status === 'complete';
  const depth = session.depth ?? 0;
  const isContinuation = depth > 0;

  const inner = (
    <>
      {/* Desktop */}
      <tr className={`hidden md:table-row ${isComplete ? 'hover:bg-gray-50 cursor-pointer' : 'opacity-70'}`}>
        <td className="px-4 py-3 text-sm text-gray-800 max-w-xs">
          <div className="flex items-center gap-1.5" style={{ paddingLeft: depth * 16 }}>
            {isContinuation && <span className="text-gray-300 text-xs shrink-0">↳</span>}
            <span className="truncate block">{truncated}</span>
          </div>
        </td>
        <td className="px-4 py-3"><SessionStatusBadge status={session.status} /><CodeStatusBadge session={session} /></td>
        <td className="px-4 py-3 text-sm text-gray-500">{session.agentCount ?? '–'} agents</td>
        <td className="px-4 py-3 text-sm text-gray-400">{date}</td>
        <td className="px-4 py-3 text-right">
          {isComplete && (
            <span className="text-xs text-blue-600 font-medium">Relire →</span>
          )}
        </td>
      </tr>

      {/* Mobile */}
      <div
        className={`md:hidden bg-white rounded-xl border p-4 shadow-sm ${isComplete ? 'border-gray-200 hover:shadow-md' : 'border-orange-100 opacity-75'} transition`}
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
        {isComplete && <p className="text-xs text-blue-600 font-medium mt-2">Relire la session →</p>}
      </div>
    </>
  );

  if (!isComplete) return <>{inner}</>;
  return (
    <Link to={`/projects/${projectId}/session/${session.id}`} className="contents">
      {inner}
    </Link>
  );
}

export default function ProjectView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [project, setProject]           = useState(null);
  const [loading, setLoading]           = useState(true);
  const [sessions, setSessions]         = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [showRename, setShowRename]     = useState(false);
  const [archiving, setArchiving]       = useState(false);
  const [memoryOpen, setMemoryOpen]     = useState(false);
  const [resettingMemory, setResettingMemory] = useState(false);
  const [showDelete, setShowDelete]     = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [members, setMembers]           = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [inviteEmail, setInviteEmail]   = useState('');
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
  // ── Stack technique ────────────────────────────────────────────────────────
  const [projectStack, setProjectStack] = useState({});
  const [stackLoading, setStackLoading] = useState(false);
  const [savingStack, setSavingStack]   = useState(false);
  const [savedStack, setSavedStack]     = useState(false);
  const [stackError, setStackError]     = useState('');
  const [userGlobalStack, setUserGlobalStack] = useState({});
  const stackTimerRef = useRef(null);
  const isFirstStackLoad = useRef(true);

  // Charger le stack projet + stack global utilisateur
  useEffect(() => {
    setStackLoading(true);
    Promise.all([
      api.get(`/users/me/tech-stack`),
    ]).then(([userRes]) => {
      setUserGlobalStack(userRes.data || {});
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
        // Initialiser la stack projet depuis les données du projet
        if (data.techStack && typeof data.techStack === 'object') {
          setProjectStack(data.techStack);
          isFirstStackLoad.current = false;
        } else if (data.techStack) {
          try { setProjectStack(JSON.parse(data.techStack)); isFirstStackLoad.current = false; } catch {}
        }
        // Charger les membres si owner ou admin
        if (data.userId === user?.id || user?.role === 'admin') {
          setMembersLoading(true);
          api.get(`/projects/${id}/members`)
            .then(({ data: m }) => setMembers(m))
            .catch(() => {})
            .finally(() => setMembersLoading(false));
        }
      })
      .catch(() => navigate('/dashboard'))
      .finally(() => setLoading(false));

    api.get(`/projects/${id}/sessions`)
      .then(({ data }) => setSessions(data))
      .catch(() => {})
      .finally(() => setSessionsLoading(false));

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
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteResult(null);
    try {
      const { data } = await api.post(`/projects/${id}/members`, { email: inviteEmail.trim() });
      if (data.type === 'added') {
        setMembers(prev => [...prev, data.member]);
        setInviteResult({ type: 'ok', message: `${data.member.email} ajouté comme collaborateur.` });
      } else {
        setInviteResult({ type: 'ok', message: `Invitation envoyée à ${data.email}.` });
      }
      setInviteEmail('');
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
    if (!confirm('Réinitialiser la mémoire du projet ? Cette action est irréversible.')) return;
    setResettingMemory(true);
    try {
      await api.delete(`/projects/${id}/context`);
      setProject(prev => ({ ...prev, context: null }));
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
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
            <p className="text-xs text-gray-400 mt-2">
              {project.sessionCount ?? 0} session{(project.sessionCount ?? 0) !== 1 ? 's' : ''} · Créé le {new Date(project.createdAt).toLocaleDateString('fr-FR')}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start flex-wrap">
            <Link
              to={`/projects/${id}/plan`}
              className="text-sm border border-blue-200 text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg transition min-h-[40px] flex items-center gap-1.5 font-medium"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Plan
            </Link>
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
                type="email"
                value={inviteEmail}
                onChange={e => { setInviteEmail(e.target.value); setInviteResult(null); }}
                placeholder="email@exemple.com"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
              <button
                type="submit"
                disabled={inviting || !inviteEmail.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50 shrink-0"
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
                    <p className="text-sm font-medium text-gray-800">{m.email}</p>
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

      {/* ── Onglets Sessions / Stack / Agents ───────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-1">
        {[
          { id: 'sessions', label: 'Sessions' },
          { id: 'stack',    label: 'Stack' },
          { id: 'agents',   label: 'Agents' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── ONGLET SESSIONS ─────────────────────────────────────────────────── */}
      {activeTab === 'sessions' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="font-semibold text-gray-900">Sessions</h2>
              {!sessionsLoading && (
                <p className="text-xs text-gray-400 mt-0.5">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</p>
              )}
            </div>
            {project.status === 'active' && (
              <Link to={`/projects/${id}/session/new`} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition">
                + Nouvelle session
              </Link>
            )}
          </div>

          {sessionsLoading && <div className="flex items-center justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" /></div>}

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
                {buildSessionThreads(sessions).map(s => <SessionRow key={s.id} session={s} projectId={id} />)}
              </tbody>
            </table>
          )}
          {!sessionsLoading && sessions.length > 0 && (
            <div className="md:hidden p-4 space-y-3">
              {buildSessionThreads(sessions).map(s => <SessionRow key={s.id} session={s} projectId={id} />)}
            </div>
          )}
          {!sessionsLoading && sessions.length === 0 && (
            <div className="text-center py-10 px-5 text-gray-400">
              <p className="text-sm">Aucune session pour l'instant.</p>
              {project.status === 'active' && (
                <Link to={`/projects/${id}/session/new`} className="inline-block mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium">
                  Lancer votre première session →
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ONGLET STACK ────────────────────────────────────────────────────── */}
      {activeTab === 'stack' && (() => {
        // Agréger les outils suggérés/manquants depuis toutes les sessions
        const allSuggested = [...new Set(
          sessions.flatMap(s => {
            const st = s.suggestedTools
              ? (typeof s.suggestedTools === 'string' ? JSON.parse(s.suggestedTools) : s.suggestedTools)
              : null;
            return st?.suggestedTools || [];
          })
        )];
        const allMissing = [...new Set(
          sessions.flatMap(s => {
            const st = s.suggestedTools
              ? (typeof s.suggestedTools === 'string' ? JSON.parse(s.suggestedTools) : s.suggestedTools)
              : null;
            return st?.missingTools || [];
          })
        )];

        return (
          <div className="space-y-5">
            {/* En-tête stack */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-900">Stack technique du projet</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Surcharge votre environnement global pour ce projet. Sauvegarde automatique.</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {savingStack && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                      Sauvegarde…
                    </span>
                  )}
                  {savedStack && !savingStack && (
                    <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">✓ Sauvegardée</span>
                  )}
                  <button
                    onClick={() => { setProjectStack({ ...userGlobalStack }); isFirstStackLoad.current = false; }}
                    className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 px-2.5 py-1 rounded-lg transition"
                  >
                    ↺ Réinitialiser depuis mon environnement global
                  </button>
                </div>
              </div>
              {stackError && <p className="text-xs text-red-600 mt-2">⚠️ {stackError}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {CATEGORIES.map(cat => (
                <CategoryCard key={cat.id} category={cat} stack={projectStack} onToggle={toggleStackOption} onAutreChange={setStackAutre} />
              ))}
            </div>

            {/* Section 2 — Outils préconisés */}
            {allSuggested.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h3 className="font-semibold text-gray-900 mb-1">Outils préconisés par les agents</h3>
                <p className="text-xs text-gray-400 mb-3">Extraits automatiquement des sessions.</p>
                <div className="flex flex-wrap gap-2">
                  {allSuggested.map(tool => (
                    <div key={tool} className="flex items-center gap-1.5 bg-violet-50 border border-violet-200 rounded-lg px-3 py-1.5">
                      <span className="text-xs font-medium text-violet-800">{tool}</span>
                      <button
                        onClick={() => addToolToStack(tool)}
                        className="text-xs text-violet-600 hover:text-violet-800 font-semibold transition"
                        title="Ajouter à ma stack"
                      >
                        + Ajouter
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section 3 — Outils manquants */}
            {allMissing.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h3 className="font-semibold text-gray-900 mb-1">Outils manquants identifiés</h3>
                <p className="text-xs text-gray-400 mb-3">Fonctionnalités ou outils mentionnés comme nécessaires.</p>
                <div className="flex flex-wrap gap-2">
                  {allMissing.map(tool => (
                    <div key={tool} className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5">
                      <span className="text-xs font-medium text-orange-800">{tool}</span>
                      <button
                        onClick={() => addToolToStack(tool)}
                        className="text-xs text-orange-600 hover:text-orange-800 font-semibold transition"
                        title="Ajouter à ma stack"
                      >
                        + Ajouter
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {allSuggested.length === 0 && allMissing.length === 0 && sessions.length > 0 && (
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 text-center text-xs text-gray-400">
                Les outils suggérés apparaîtront ici après chaque session complète.
              </div>
            )}
          </div>
        );
      })()}

      {/* ── ONGLET AGENTS ────────────────────────────────────────────────── */}
      {activeTab === 'agents' && (() => {
        const activeAgents   = projectAgents.filter(a => a.enabled);
        const inactiveAgents = projectAgents.filter(a => !a.enabled);
        return (
          <div className="space-y-5">
            {/* En-tête */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-gray-900">Agents du projet</h2>
                <p className="text-xs text-gray-400 mt-0.5">Activez les agents pour ce projet et réordonnez par glisser-déposer.</p>
              </div>
              <button onClick={() => setShowCreateAgent(v => !v)} className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 rounded-xl transition">
                + Créer un agent
              </button>
            </div>

            {/* Formulaire de création inline */}
            {showCreateAgent && (
              <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Nouvel agent pour ce projet</h3>
                <form onSubmit={handleCreateAgent} className="space-y-3">
                  <div className="flex items-end gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Emoji</label>
                      <input type="text" value={newAgentForm.emoji} onChange={e => setNewAgentForm(p => ({ ...p, emoji: e.target.value }))} maxLength={2} className="w-12 text-center text-xl px-1 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Nom <span className="text-red-400">*</span></label>
                      <input type="text" required value={newAgentForm.name} onChange={e => setNewAgentForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex : Juriste…" className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Rôle <span className="text-red-400">*</span></label>
                    <input type="text" required value={newAgentForm.role} onChange={e => setNewAgentForm(p => ({ ...p, role: e.target.value }))} placeholder="Ex : Analyse les aspects juridiques" className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Prompt système <span className="text-red-400">*</span></label>
                    <textarea required rows={4} value={newAgentForm.systemPrompt} onChange={e => setNewAgentForm(p => ({ ...p, systemPrompt: e.target.value }))} placeholder="Tu es un expert en…" className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
                  </div>
                  {createAgentError && <p className="text-xs text-red-600">⚠️ {createAgentError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setShowCreateAgent(false)} className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-xl text-sm hover:bg-gray-50 transition">Annuler</button>
                    <button type="submit" disabled={creatingAgent} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-xl text-sm font-medium transition disabled:opacity-50">
                      {creatingAgent ? 'Création…' : 'Créer et ajouter'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {agentsLoading && <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" /></div>}

            {/* Agents actifs — draggable */}
            {!agentsLoading && activeAgents.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Actifs — {activeAgents.length}</p>
                </div>
                <ul className="divide-y divide-gray-50">
                  {activeAgents.map(agent => (
                    <li key={agent.id} draggable
                      onDragStart={() => handleAgentDragStart(agent.id)}
                      onDragOver={e => handleAgentDragOver(e, agent.id)}
                      onDrop={e => handleAgentDrop(e, agent.id)}
                      onDragEnd={handleAgentDragEnd}
                      className={`flex items-center gap-3 px-5 py-3 transition cursor-grab active:cursor-grabbing ${
                        dragOverAgentId === agent.id && draggedAgentId !== agent.id ? 'bg-blue-50 border-l-2 border-l-blue-400' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-gray-300 shrink-0 select-none text-sm">⠿</span>
                      <span className="text-xl shrink-0">{agent.emoji || '🤖'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium text-gray-800">{agent.name}</p>
                          {agent.isDefault && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Défaut</span>}
                          {agent.source === 'suggestion' && <span className="text-xs bg-violet-100 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded-full">Suggéré</span>}
                        </div>
                        <p className="text-xs text-gray-400 truncate">{agent.role}</p>
                      </div>
                      <button onClick={() => toggleAgent(agent)} className="shrink-0 w-9 h-5 rounded-full bg-blue-500 transition-colors relative" title="Désactiver">
                        <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-white rounded-full shadow" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Agents disponibles — inactifs */}
            {!agentsLoading && inactiveAgents.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Disponibles — {inactiveAgents.length}</p>
                </div>
                <ul className="divide-y divide-gray-50">
                  {inactiveAgents.map(agent => (
                    <li key={agent.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition">
                      <span className="text-xl shrink-0">{agent.emoji || '🤖'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium text-gray-500">{agent.name}</p>
                          {agent.isDefault && <span className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">Défaut</span>}
                        </div>
                        <p className="text-xs text-gray-400 truncate">{agent.role}</p>
                      </div>
                      <button onClick={() => toggleAgent(agent)} className="shrink-0 w-9 h-5 rounded-full bg-gray-200 transition-colors relative" title="Activer">
                        <span className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!agentsLoading && activeAgents.length === 0 && inactiveAgents.length === 0 && (
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-8 text-center text-xs text-gray-400">Aucun agent disponible.</div>
            )}
          </div>
        );
      })()}

      {/* Zone de danger — visible propriétaire + admin uniquement */}
      {canManage && (
        <div className="mt-8 border-t border-gray-200 pt-6">
          <button
            onClick={() => setShowDelete(true)}
            className="text-sm text-red-500 hover:text-red-700 transition"
          >
            Supprimer le projet…
          </button>
        </div>
      )}

      {showRename && (
        <RenameModal
          project={project}
          onSave={updated => { setProject(prev => ({ ...prev, ...updated })); setShowRename(false); }}
          onClose={() => setShowRename(false)}
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
    </ProjectLayout>
  );
}
