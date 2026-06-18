import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

// ── Badges rôle ───────────────────────────────────────────────────────────────

const ROLE_BADGE = {
  user:       { label: 'User',       cls: 'bg-gray-100 text-gray-500 border-gray-200'       },
  member:     { label: 'Member',     cls: 'bg-blue-50 text-blue-600 border-blue-200'         },
  admin:      { label: 'Admin',      cls: 'bg-blue-100 text-blue-800 border-blue-300'        },
  supervisor: { label: 'Supervisor', cls: 'bg-orange-100 text-orange-700 border-orange-300'  },
};

function RoleBadge({ role }) {
  const cfg = ROLE_BADGE[role] || ROLE_BADGE.member;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function InviteStatusBadge({ used }) {
  return used
    ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Utilisée</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">En attente</span>;
}

function CopyButton({ token }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/login?token=${token}`;
  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="text-xs text-blabia-blue hover:text-blue-800 transition" title={link}>
      {copied ? '✓ Copié' : 'Copier le lien'}
    </button>
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
      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:ring-2 focus:ring-blabia-blue outline-none disabled:opacity-50"
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
  const [tab, setTab] = useState('users');

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
    } catch {
      // silently fail
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchInvitations = async () => {
    setInvLoading(true);
    try {
      const { data } = await api.get('/admin/invitations');
      setInvitations(data);
    } catch {
      // silently fail
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
      const { data } = await api.post('/admin/invitations', { email: invEmail });
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
      alert(err.response?.data?.error || 'Erreur lors de la suppression');
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

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Administration</h1>
          <p className="text-gray-500 text-sm mt-1">Gérez les utilisateurs et les accès</p>
        </div>
        {tab === 'invitations' && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleTestEmail}
              disabled={testStatus === 'sending'}
              className="text-sm border border-gray-300 text-gray-600 hover:bg-gray-50 px-3 py-2 rounded-lg transition disabled:opacity-50"
            >
              {testStatus === 'sending' ? 'Envoi…' : '📧 Tester email'}
            </button>
            <button
              onClick={() => { setShowInvModal(true); setInvError(''); }}
              className="bg-blabia-blue text-white font-medium px-4 py-2 rounded-lg transition text-sm"
            >
              + Inviter
            </button>
          </div>
        )}
      </div>

      {/* Onglets */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {[
          { id: 'users',       label: '👥 Utilisateurs' },
          { id: 'invitations', label: '✉️ Invitations'   },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              tab === t.id
                ? 'border-blabia-blue text-blabia-blue'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Onglet Utilisateurs ───────────────────────────────────────────── */}
      {tab === 'users' && (
        <>
          {roleError && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between">
              {roleError}
              <button onClick={() => setRoleError('')} className="ml-4 font-bold">×</button>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full hidden md:table">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Email</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Rôle actuel</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Membre depuis</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {usersLoading ? (
                  <tr><td colSpan={4} className="text-center py-8 text-gray-400">Chargement…</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-gray-400">Aucun utilisateur</td></tr>
                ) : users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {u.email}
                      {u.id === me?.id && <span className="ml-2 text-xs text-gray-400">(vous)</span>}
                    </td>
                    <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      {u.id !== me?.id && (
                        <RoleDropdown
                          user={u}
                          requesterRole={me?.role}
                          onRoleChange={handleRoleChange}
                          updating={updatingId === u.id}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Cards mobile */}
            <div className="md:hidden divide-y divide-gray-100">
              {usersLoading ? (
                <p className="text-center text-gray-400 py-8">Chargement…</p>
              ) : users.map(u => (
                <div key={u.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{u.email}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(u.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {u.id !== me?.id ? (
                      <RoleDropdown
                        user={u}
                        requesterRole={me?.role}
                        onRoleChange={handleRoleChange}
                        updating={updatingId === u.id}
                      />
                    ) : (
                      <RoleBadge role={u.role} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-400 mt-3">
            {users.length} utilisateur{users.length !== 1 ? 's' : ''} ·{' '}
            {users.filter(u => u.role === 'supervisor').length} supervisor ·{' '}
            {users.filter(u => u.role === 'admin').length} admin ·{' '}
            {users.filter(u => u.role === 'member').length} member ·{' '}
            {users.filter(u => u.role === 'user').length} user
          </p>
        </>
      )}

      {/* ── Onglet Invitations ─────────────────────────────────────────────── */}
      {tab === 'invitations' && (
        <>
          {testStatus === 'ok' && (
            <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm flex justify-between">
              <span>✓ Email de test envoyé</span>
              <button onClick={() => setTestStatus('idle')} className="ml-4 font-bold">×</button>
            </div>
          )}
          {testStatus === 'error' && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between">
              <span>⚠ {testError}</span>
              <button onClick={() => setTestStatus('idle')} className="ml-4 font-bold">×</button>
            </div>
          )}
          {invSuccess && (
            <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm flex justify-between">
              {invSuccess}
              <button onClick={() => setInvSuccess('')} className="ml-4 font-bold">×</button>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full hidden md:table">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Email</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Statut</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Date</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Lien</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invLoading ? (
                  <tr><td colSpan={5} className="text-center py-8 text-gray-400">Chargement…</td></tr>
                ) : invitations.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-gray-400">Aucune invitation</td></tr>
                ) : invitations.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{inv.email}</td>
                    <td className="px-4 py-3"><InviteStatusBadge used={inv.used} /></td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(inv.createdAt)}</td>
                    <td className="px-4 py-3">{!inv.used && <CopyButton token={inv.token} />}</td>
                    <td className="px-4 py-3 text-right">
                      {!inv.used && (
                        <button onClick={() => handleDeleteInvitation(inv.id)} className="text-xs text-red-500 hover:text-red-700 transition">
                          Supprimer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Cards mobile */}
            <div className="md:hidden divide-y divide-gray-100">
              {invLoading ? (
                <p className="text-center text-gray-400 py-8 px-4">Chargement…</p>
              ) : invitations.length === 0 ? (
                <p className="text-center text-gray-400 py-8 px-4">Aucune invitation</p>
              ) : invitations.map(inv => (
                <div key={inv.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-medium text-gray-900 text-sm break-all">{inv.email}</p>
                    <InviteStatusBadge used={inv.used} />
                  </div>
                  <p className="text-xs text-gray-400 mb-3">{formatDate(inv.createdAt)}</p>
                  <div className="flex items-center gap-3">
                    {!inv.used && <CopyButton token={inv.token} />}
                    {!inv.used && (
                      <button onClick={() => handleDeleteInvitation(inv.id)} className="text-xs text-red-500 hover:text-red-700">
                        Supprimer
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Modal invitation */}
          {showInvModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Inviter quelqu'un</h2>
                <form onSubmit={handleCreateInvitation} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Adresse email</label>
                    <input
                      type="email"
                      required
                      value={invEmail}
                      onChange={e => setInvEmail(e.target.value)}
                      placeholder="invite@example.com"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blabia-blue focus:border-transparent outline-none"
                      autoFocus
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    L'invité recevra un lien d'inscription avec le rôle <strong>member</strong> par défaut. Vous pourrez modifier son rôle après inscription.
                  </p>
                  {invError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{invError}</div>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setShowInvModal(false)} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 transition text-sm font-medium">
                      Annuler
                    </button>
                    <button type="submit" disabled={submitting} className="flex-1 bg-blabia-blue text-white py-2.5 rounded-lg transition text-sm font-medium disabled:opacity-50">
                      {submitting ? 'Envoi…' : 'Envoyer l\'invitation'}
                    </button>
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
