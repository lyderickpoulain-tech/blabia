import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users, Mail, MailCheck, UserPlus, Trash2, Copy, Check, X } from 'lucide-react';
import Layout from '../components/Layout';
import { Button, IconButton, Badge, Card } from '../components/ui';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { notifyError } from '../utils/notify';

// ── Badges rôle ───────────────────────────────────────────────────────────────

const ROLE_BADGE = {
  user:       { label: 'Utilisateur',    tone: 'muted'  },
  member:     { label: 'Membre',         tone: 'action' },
  admin:      { label: 'Administrateur', tone: 'ai'     },
  supervisor: { label: 'Superviseur',    tone: 'await'  },
};

function RoleBadge({ role }) {
  const cfg = ROLE_BADGE[role] || ROLE_BADGE.member;
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}

function InviteStatusBadge({ used }) {
  return used ? <Badge tone="muted">Utilisée</Badge> : <Badge tone="ok">En attente</Badge>;
}

function CopyButton({ token }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/login?token=${token}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch (err) { notifyError(err, 'Copie impossible : sélectionnez le lien à la main.'); }
  };
  return (
    <button onClick={copy} title={link} className="inline-flex items-center gap-1 text-xs font-bold text-action hover:underline">
      {copied ? <><Check size={13} aria-hidden="true" /> Copié</> : <><Copy size={13} aria-hidden="true" /> Copier le lien</>}
    </button>
  );
}

function Notice({ tone, onClose, children }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`mb-4 flex items-start justify-between gap-3 px-4 py-3 rounded-xl border text-sm ${
      tone === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-ok-light/60 border-ok-border text-ok'}`}>
      <span>{children}</span>
      <button onClick={onClose} aria-label="Fermer" className="shrink-0"><X size={15} aria-hidden="true" /></button>
    </div>
  );
}

// ── Dropdown changement de rôle ───────────────────────────────────────────────

function RoleDropdown({ user: target, requesterRole, onRoleChange, updating }) {
  // Rôles disponibles selon qui fait la demande
  const availableRoles = requesterRole === 'supervisor'
    ? ['user', 'member', 'admin', 'supervisor']
    : ['user', 'member', 'admin']; // admin ne peut pas attribuer supervisor

  // Protéger le compte supervisor principal
  const PROTECTED_EMAIL = 'contact@rasia-editions.fr';
  if (target.email === PROTECTED_EMAIL) {
    return <RoleBadge role={target.role} />;
  }

  return (
    <select
      value={target.role}
      disabled={updating}
      onChange={e => onRoleChange(target.id, e.target.value)}
      aria-label={`Rôle de ${target.email}`}
      className="text-xs h-8 border border-line rounded-lg px-2 bg-white text-ink-soft focus:ring-2 focus:ring-action outline-none disabled:opacity-50"
    >
      {availableRoles.map(r => (
        <option key={r} value={r}>{ROLE_BADGE[r]?.label ?? r}</option>
      ))}
    </select>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('onglet') === 'invitations' ? 'invitations' : 'users';
  const setTab = t => setParams(t === 'users' ? {} : { onglet: t }, { replace: true });

  // État utilisateurs
  const [users, setUsers]           = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [roleError, setRoleError]   = useState('');

  // État invitations
  const [invitations, setInvitations] = useState([]);
  const [invLoading, setInvLoading]   = useState(false);
  const [showInvModal, setShowInvModal] = useState(false);
  const [invEmail, setInvEmail]       = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [invError, setInvError]       = useState('');
  const [invSuccess, setInvSuccess]   = useState('');
  const [testStatus, setTestStatus]   = useState('idle');
  const [testError, setTestError]     = useState('');

  const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });

  // ── Chargement ──────────────────────────────────────────────────────────────

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const { data } = await api.get('/admin/users');
      setUsers(data);
    } catch (err) {
      notifyError(err, 'Impossible de charger les comptes.');
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchInvitations = async () => {
    setInvLoading(true);
    try {
      const { data } = await api.get('/admin/invitations');
      setInvitations(data);
    } catch (err) {
      notifyError(err, 'Impossible de charger les invitations.');
    } finally {
      setInvLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);
  useEffect(() => { if (tab === 'invitations') fetchInvitations(); }, [tab]);

  // ── Changement de rôle ──────────────────────────────────────────────────────

  const handleRoleChange = async (userId, newRole) => {
    setUpdatingId(userId);
    setRoleError('');
    try {
      await api.put(`/admin/users/${userId}/role`, { role: newRole });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err) {
      setRoleError(err.response?.data?.error || 'Erreur lors de la mise à jour du rôle');
    } finally {
      setUpdatingId(null);
    }
  };

  // ── Invitations ─────────────────────────────────────────────────────────────

  const handleCreateInvitation = async (e) => {
    e.preventDefault();
    setInvError('');
    setSubmitting(true);
    try {
      const body = invEmail.startsWith('@')
        ? { username: invEmail.slice(1) }
        : { email: invEmail };
      const { data } = await api.post('/admin/invitations', body);
      setInvitations(prev => [data, ...prev]);
      setInvSuccess(`Invitation envoyée à ${invEmail}`);
      setInvEmail('');
      setShowInvModal(false);
    } catch (err) {
      setInvError(err.response?.data?.error || 'Erreur lors de la création');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteInvitation = async (id) => {
    if (!confirm('Supprimer cette invitation ?')) return;
    try {
      await api.delete(`/admin/invitations/${id}`);
      setInvitations(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      notifyError(err, 'Erreur lors de la suppression');
    }
  };

  const handleTestEmail = async () => {
    setTestStatus('sending');
    setTestError('');
    try {
      await api.post('/admin/test-email');
      setTestStatus('ok');
      setTimeout(() => setTestStatus('idle'), 5000);
    } catch (err) {
      setTestError(err.response?.data?.error || 'Erreur d\'envoi');
      setTestStatus('error');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const counts = ['supervisor', 'admin', 'member', 'user'].map(r => [r, users.filter(u => u.role === r).length]).filter(([, n]) => n);
  const thCls = 'text-left text-[11px] font-extrabold uppercase tracking-wider text-ink-muted px-4 py-3';

  return (
    <Layout>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Administration</h1>
          <p className="text-sm text-ink-muted mt-1">Les comptes, leurs rôles et les invitations.</p>
        </div>
        {tab === 'invitations' && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={handleTestEmail} disabled={testStatus === 'sending'}>
              <MailCheck size={15} aria-hidden="true" /> {testStatus === 'sending' ? 'Envoi…' : 'Tester l’e-mail'}
            </Button>
            <Button size="sm" variant="primary" onClick={() => { setShowInvModal(true); setInvError(''); }}>
              <UserPlus size={15} aria-hidden="true" /> Inviter
            </Button>
          </div>
        )}
      </div>

      {/* Onglets */}
      <div data-tour="admin-tabs" role="tablist" className="inline-flex bg-white border border-line rounded-[10px] p-1 gap-1 mb-5">
        {[{ id: 'users', label: 'Comptes', icon: Users }, { id: 'invitations', label: 'Invitations', icon: Mail }].map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm transition ${tab === t.id ? 'bg-action-light text-action font-extrabold' : 'text-ink-muted font-semibold hover:bg-canvas'}`}>
            <t.icon size={15} aria-hidden="true" /> {t.label}
          </button>
        ))}
      </div>

      {/* ── Comptes ───────────────────────────────────────────────────────── */}
      {tab === 'users' && (
        <>
          {roleError && <Notice tone="error" onClose={() => setRoleError('')}>{roleError}</Notice>}

          <Card data-tour="admin-users" className="overflow-hidden">
            <table className="w-full hidden md:table">
              <thead className="bg-canvas border-b border-line">
                <tr><th className={thCls}>Compte</th><th className={thCls}>Rôle</th><th className={thCls}>Depuis le</th><th className={thCls}>Modifier le rôle</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {usersLoading ? (
                  <tr><td colSpan={4} className="text-center py-8 text-ink-faint">Chargement…</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-ink-faint">Aucun compte</td></tr>
                ) : users.map(u => (
                  <tr key={u.id} className="hover:bg-canvas/60">
                    <td className="px-4 py-3 text-sm">
                      <span className="font-bold text-ink">{u.email}</span>
                      {u.username && <span className="ml-1.5 text-xs text-ink-faint">@{u.username}</span>}
                      {u.id === me?.id && <span className="ml-2 text-xs text-ink-faint">(vous)</span>}
                    </td>
                    <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                    <td className="px-4 py-3 text-sm text-ink-muted">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      {u.id !== me?.id && <RoleDropdown user={u} requesterRole={me?.role} onRoleChange={handleRoleChange} updating={updatingId === u.id} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="md:hidden divide-y divide-line">
              {usersLoading ? <p className="text-center text-ink-faint py-8">Chargement…</p> : users.map(u => (
                <div key={u.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink truncate">{u.email}</p>
                    <p className="text-xs text-ink-faint mt-0.5">{formatDate(u.createdAt)}</p>
                  </div>
                  {u.id !== me?.id
                    ? <RoleDropdown user={u} requesterRole={me?.role} onRoleChange={handleRoleChange} updating={updatingId === u.id} />
                    : <RoleBadge role={u.role} />}
                </div>
              ))}
            </div>
          </Card>

          <p className="text-xs text-ink-faint mt-3">
            {users.length} compte{users.length !== 1 ? 's' : ''}{counts.length > 0 && ' · '}{counts.map(([r, n]) => `${n} ${ROLE_BADGE[r].label.toLowerCase()}`).join(' · ')}
          </p>
          <ul className="mt-3 text-xs text-ink-muted space-y-0.5">
            <li><strong className="text-ink-soft">Membre</strong> : crée et mène ses propres projets.</li>
            <li><strong className="text-ink-soft">Utilisateur</strong> : collaborateur, voit seulement les projets où il est invité.</li>
            <li><strong className="text-ink-soft">Administrateur</strong> : tous les projets et l’administration.</li>
          </ul>
        </>
      )}

      {/* ── Invitations ───────────────────────────────────────────────────── */}
      {tab === 'invitations' && (
        <>
          {testStatus === 'ok' && <Notice tone="ok" onClose={() => setTestStatus('idle')}>E-mail de test envoyé.</Notice>}
          {testStatus === 'error' && <Notice tone="error" onClose={() => setTestStatus('idle')}>{testError}</Notice>}
          {invSuccess && <Notice tone="ok" onClose={() => setInvSuccess('')}>{invSuccess}</Notice>}

          <Card className="overflow-hidden">
            <table className="w-full hidden md:table">
              <thead className="bg-canvas border-b border-line">
                <tr><th className={thCls}>Invité</th><th className={thCls}>Statut</th><th className={thCls}>Date</th><th className={thCls}>Lien</th><th className="px-4 py-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {invLoading ? (
                  <tr><td colSpan={5} className="text-center py-8 text-ink-faint">Chargement…</td></tr>
                ) : invitations.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-ink-faint">Aucune invitation</td></tr>
                ) : invitations.map(inv => (
                  <tr key={inv.id} className="hover:bg-canvas/60">
                    <td className="px-4 py-3 text-sm font-bold text-ink">{inv.email}</td>
                    <td className="px-4 py-3"><InviteStatusBadge used={inv.used} /></td>
                    <td className="px-4 py-3 text-sm text-ink-muted">{formatDate(inv.createdAt)}</td>
                    <td className="px-4 py-3">{!inv.used && <CopyButton token={inv.token} />}</td>
                    <td className="px-4 py-3 text-right">
                      {!inv.used && (
                        <IconButton size="sm" label="Supprimer l’invitation" className="hover:!text-red-600" onClick={() => handleDeleteInvitation(inv.id)}>
                          <Trash2 size={15} aria-hidden="true" />
                        </IconButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="md:hidden divide-y divide-line">
              {invLoading ? <p className="text-center text-ink-faint py-8 px-4">Chargement…</p>
                : invitations.length === 0 ? <p className="text-center text-ink-faint py-8 px-4">Aucune invitation</p>
                : invitations.map(inv => (
                  <div key={inv.id} className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-bold text-ink text-sm break-all">{inv.email}</p>
                      <InviteStatusBadge used={inv.used} />
                    </div>
                    <p className="text-xs text-ink-faint mb-2">{formatDate(inv.createdAt)}</p>
                    {!inv.used && (
                      <div className="flex items-center gap-3">
                        <CopyButton token={inv.token} />
                        <button onClick={() => handleDeleteInvitation(inv.id)} className="text-xs font-bold text-red-600">Supprimer</button>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </Card>

          {showInvModal && (
            <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div role="dialog" aria-modal="true" aria-labelledby="inv-title" className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                <h2 id="inv-title" className="text-lg font-extrabold text-ink mb-4">Inviter quelqu’un</h2>
                <form onSubmit={handleCreateInvitation} className="space-y-4">
                  <label className="block">
                    <span className="block text-sm font-bold text-ink-soft mb-1">E-mail ou @pseudo</span>
                    <input type="text" required value={invEmail} onChange={e => setInvEmail(e.target.value)} autoFocus
                      placeholder="invite@exemple.com ou @pseudo"
                      className="w-full h-11 px-3.5 border border-line rounded-[10px] text-sm text-ink outline-none focus:ring-2 focus:ring-action focus:border-transparent" />
                  </label>
                  <p className="text-xs text-ink-muted">L’invité reçoit un lien d’inscription avec le rôle <strong>Membre</strong>. Vous pourrez changer son rôle après son inscription.</p>
                  {invError && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-[10px] text-sm">{invError}</div>}
                  <div className="flex gap-2 pt-1">
                    <Button variant="secondary" className="flex-1" onClick={() => setShowInvModal(false)}>Annuler</Button>
                    <Button type="submit" variant="primary" className="flex-1" disabled={submitting}>{submitting ? 'Envoi…' : 'Envoyer l’invitation'}</Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
