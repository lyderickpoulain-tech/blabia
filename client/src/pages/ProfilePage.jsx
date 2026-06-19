import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import api from '../utils/api';

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;

const ROLE_LABEL = {
  user:       'Utilisateur',
  member:     'Membre',
  admin:      'Administrateur',
  supervisor: 'Superviseur',
};

export default function ProfilePage() {
  const { user, login } = useAuth();

  const [username,    setUsername]    = useState(user?.username || '');
  const [saving,      setSaving]      = useState(false);
  const [saveResult,  setSaveResult]  = useState(null); // { type: 'ok'|'error', message }
  const [checking,    setChecking]    = useState(false);
  const [available,   setAvailable]   = useState(null); // true | false | null

  // Validation format
  const formatOk = username.trim() === '' || USERNAME_REGEX.test(username.trim());
  const unchanged = username.trim() === (user?.username || '');

  // Vérification disponibilité en temps réel (debounce 500ms)
  useEffect(() => {
    const val = username.trim();
    if (!val || !USERNAME_REGEX.test(val) || val === user?.username) {
      setAvailable(null);
      return;
    }
    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/users/check-username/${val}`);
        setAvailable(data.available);
      } catch {
        setAvailable(null);
      } finally {
        setChecking(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [username, user?.username]);

  const handleSave = async (e) => {
    e.preventDefault();
    const val = username.trim();
    if (!val) return;
    if (!USERNAME_REGEX.test(val)) return;
    setSaving(true);
    setSaveResult(null);
    try {
      await api.patch('/users/me/username', { username: val });
      setSaveResult({ type: 'ok', message: `Pseudo @${val} enregistré.` });
      // Rafraîchir le profil dans le contexte sans re-login
      setAvailable(null);
    } catch (err) {
      setSaveResult({ type: 'error', message: err.response?.data?.error || 'Erreur lors de la sauvegarde' });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      await api.patch('/users/me/username', { username: '' });
      setUsername('');
      setSaveResult({ type: 'ok', message: 'Pseudo supprimé.' });
    } catch (err) {
      setSaveResult({ type: 'error', message: err.response?.data?.error || 'Erreur' });
    } finally {
      setSaving(false);
    }
  };

  // Indicateur disponibilité
  let availabilityIndicator = null;
  const val = username.trim();
  if (val && val !== user?.username) {
    if (!formatOk) {
      availabilityIndicator = <span className="text-xs text-red-500">Format invalide (3-20 car., lettres, chiffres, - ou _)</span>;
    } else if (checking) {
      availabilityIndicator = <span className="text-xs text-gray-400">Vérification…</span>;
    } else if (available === true) {
      availabilityIndicator = <span className="text-xs text-green-600">✓ Disponible</span>;
    } else if (available === false) {
      availabilityIndicator = <span className="text-xs text-red-500">✗ Déjà utilisé</span>;
    }
  }

  const canSave = !unchanged && formatOk && (available === true || val === '') && !saving;

  return (
    <Layout>
      <div className="max-w-lg mx-auto py-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Mon profil</h1>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">

          {/* Email (non modifiable) */}
          <div className="px-6 py-5">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Email</label>
            <p className="text-sm text-gray-700">{user?.email}</p>
            <p className="text-xs text-gray-400 mt-0.5">Non modifiable</p>
          </div>

          {/* Rôle */}
          <div className="px-6 py-5">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Rôle</label>
            <p className="text-sm text-gray-700">{ROLE_LABEL[user?.role] ?? user?.role}</p>
          </div>

          {/* Pseudo */}
          <div className="px-6 py-5">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pseudo</label>
            <form onSubmit={handleSave} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm font-medium shrink-0">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={e => { setUsername(e.target.value); setSaveResult(null); }}
                  placeholder="monpseudo"
                  maxLength={20}
                  className={`flex-1 px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 transition ${
                    !formatOk && val ? 'border-red-300 focus:ring-red-400' : 'border-gray-300 focus:ring-blabia-blue'
                  }`}
                />
              </div>

              {availabilityIndicator && <div>{availabilityIndicator}</div>}

              <p className="text-xs text-gray-400">
                3 à 20 caractères. Lettres, chiffres, tiret (-) et underscore (_) uniquement.
                Permet d'être invité sur des projets par pseudo plutôt que par email.
              </p>

              {saveResult && (
                <p className={`text-xs font-medium ${saveResult.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
                  {saveResult.type === 'ok' ? '✓ ' : '⚠ '}{saveResult.message}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!canSave}
                  className="px-4 py-2 bg-blabia-blue text-white text-sm font-medium rounded-lg transition disabled:opacity-40"
                >
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                {user?.username && (
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={saving}
                    className="px-4 py-2 border border-gray-200 text-gray-500 text-sm rounded-lg hover:bg-gray-50 transition disabled:opacity-40"
                  >
                    Supprimer le pseudo
                  </button>
                )}
              </div>
            </form>
          </div>

        </div>
      </div>
    </Layout>
  );
}
