import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import api from '../utils/api';

function StatusBadge({ used }) {
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
    <button
      onClick={copy}
      className="text-xs text-blue-600 hover:text-blue-800 transition"
      title={link}
    >
      {copied ? '✓ Copié' : 'Copier le lien'}
    </button>
  );
}

export default function AdminInvitations() {
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchInvitations = async () => {
    try {
      const { data } = await api.get('/admin/invitations');
      setInvitations(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInvitations(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { data } = await api.post('/admin/invitations', { email });
      setInvitations(prev => [data, ...prev]);
      setSuccess(`Invitation envoyée à ${email}`);
      setEmail('');
      setShowModal(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la création');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette invitation ?')) return;
    try {
      await api.delete(`/admin/invitations/${id}`);
      setInvitations(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors de la suppression');
    }
  };

  const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invitations</h1>
          <p className="text-gray-500 text-sm mt-1">Gérez les accès à BlabIA</p>
        </div>
        <button
          onClick={() => { setShowModal(true); setError(''); }}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition text-sm"
        >
          + Inviter quelqu'un
        </button>
      </div>

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm flex justify-between">
          {success}
          <button onClick={() => setSuccess('')} className="ml-4 font-bold">×</button>
        </div>
      )}

      {/* Table desktop */}
      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
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
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Chargement…</td></tr>
            ) : invitations.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Aucune invitation</td></tr>
            ) : invitations.map(inv => (
              <tr key={inv.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{inv.email}</td>
                <td className="px-4 py-3"><StatusBadge used={inv.used} /></td>
                <td className="px-4 py-3 text-sm text-gray-500">{formatDate(inv.createdAt)}</td>
                <td className="px-4 py-3">
                  {!inv.used && <CopyButton token={inv.token} />}
                </td>
                <td className="px-4 py-3 text-right">
                  {!inv.used && (
                    <button
                      onClick={() => handleDelete(inv.id)}
                      className="text-xs text-red-500 hover:text-red-700 transition"
                    >
                      Supprimer
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards mobile */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <p className="text-center text-gray-400 py-8">Chargement…</p>
        ) : invitations.length === 0 ? (
          <p className="text-center text-gray-400 py-8">Aucune invitation</p>
        ) : invitations.map(inv => (
          <div key={inv.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-start justify-between mb-2">
              <p className="font-medium text-gray-900 text-sm break-all">{inv.email}</p>
              <StatusBadge used={inv.used} />
            </div>
            <p className="text-xs text-gray-400 mb-3">{formatDate(inv.createdAt)}</p>
            <div className="flex items-center gap-3">
              {!inv.used && <CopyButton token={inv.token} />}
              {!inv.used && (
                <button
                  onClick={() => handleDelete(inv.id)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Supprimer
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal création */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Inviter quelqu'un</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Adresse email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="invite@example.com"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  autoFocus
                />
              </div>
              <p className="text-xs text-gray-500">
                Un email sera envoyé avec un lien d'inscription. Si aucun SMTP n'est configuré, le lien apparaîtra dans la console du serveur.
              </p>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 transition text-sm font-medium"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg transition text-sm font-medium disabled:opacity-50"
                >
                  {submitting ? 'Envoi…' : 'Envoyer l\'invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
