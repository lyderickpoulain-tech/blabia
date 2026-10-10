import { useState, useEffect } from 'react';
import { Mail, AtSign, Shield, Bell, Send } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { Button, Card } from '../components/ui';
import api from '../utils/api';
import { dayName } from '../components/RemindersToggle';

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;
const ROLE_LABEL = { user: 'Utilisateur (collaborateur invité)', member: 'Membre', admin: 'Administrateur', supervisor: 'Superviseur' };
const inputCls = 'h-11 px-3.5 border border-line rounded-[10px] text-sm text-ink bg-white outline-none focus:ring-2 focus:ring-action focus:border-transparent transition';

function Section({ icon: Icon, title, children }) {
  return (
    <section className="px-5 py-5">
      <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink mb-3">
        <Icon size={16} className="text-action" aria-hidden="true" /> {title}
      </h2>
      {children}
    </section>
  );
}

// Rappels hebdomadaires (v5.1) : jour d'envoi, commun à tous les projets où ils sont activés
function ReminderSettings() {
  const { user, patchUser } = useAuth();
  const [day, setDay] = useState(user?.reminderDay || 1);
  const [status, setStatus] = useState('');
  const save = async v => {
    setDay(v); setStatus('');
    try { await api.patch('/users/me/reminders', { reminderDay: v }); patchUser?.({ reminderDay: v }); setStatus('Enregistré.'); }
    catch { setStatus('Enregistrement impossible.'); }
  };
  const test = async () => {
    setStatus('Envoi…');
    try {
      const { data } = await api.post('/users/me/reminders/test');
      setStatus(data.sent ? `Rappel envoyé à ${user.email}.` : 'Rien à rappeler : aucun projet avec rappels activés et actions à faire.');
    } catch { setStatus('Envoi impossible.'); }
  };
  return (
    <Section icon={Bell} title="Rappels des actions">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="reminder-day" className="text-sm text-ink-soft">Chaque</label>
        <select id="reminder-day" value={day} onChange={e => save(Number(e.target.value))} className={`${inputCls} pr-8`}>
          {[1, 2, 3, 4, 5, 6, 7].map(d => <option key={d} value={d}>{dayName(d)}</option>)}
        </select>
        <span className="text-sm text-ink-soft">matin</span>
        <Button size="sm" variant="secondary" onClick={test} className="ml-auto">
          <Send size={14} aria-hidden="true" /> M'envoyer le rappel maintenant
        </Button>
      </div>
      <p className="text-xs text-ink-faint mt-2">Un e-mail par semaine avec les actions en retard, de la semaine et les prochaines, pour les projets où vous avez activé le rappel (page Actions ou Paramètres du projet).</p>
      {status && <p className="text-xs font-bold text-ink-soft mt-1" role="status">{status}</p>}
    </Section>
  );
}

export default function ProfilePage() {
  const { user, patchUser } = useAuth();
  const [username,   setUsername]   = useState(user?.username || '');
  const [saving,     setSaving]     = useState(false);
  const [saveResult, setSaveResult] = useState(null); // { type: 'ok'|'error', message }
  const [checking,   setChecking]   = useState(false);
  const [available,  setAvailable]  = useState(null); // true | false | null

  const val = username.trim();
  const formatOk  = val === '' || USERNAME_REGEX.test(val);
  const unchanged = val === (user?.username || '');

  // Disponibilité vérifiée en direct (après 500 ms sans frappe)
  useEffect(() => {
    if (!val || !USERNAME_REGEX.test(val) || val === user?.username) { setAvailable(null); return; }
    setChecking(true);
    const timer = setTimeout(async () => {
      try { const { data } = await api.get(`/users/check-username/${val}`); setAvailable(data.available); }
      catch { setAvailable(null); }
      finally { setChecking(false); }
    }, 500);
    return () => clearTimeout(timer);
  }, [val, user?.username]);

  const saveUsername = async (next) => {
    setSaving(true);
    setSaveResult(null);
    try {
      const { data } = await api.patch('/users/me/username', { username: next });
      patchUser?.({ username: data.username }); // en-tête et menus à jour sans reconnexion
      setUsername(data.username || '');
      setAvailable(null);
      setSaveResult({ type: 'ok', message: data.username ? `Pseudo @${data.username} enregistré.` : 'Pseudo supprimé.' });
    } catch (err) {
      setSaveResult({ type: 'error', message: err.response?.data?.error || 'Erreur lors de la sauvegarde' });
    } finally {
      setSaving(false);
    }
  };

  const canSave = !unchanged && val && formatOk && available === true && !saving;
  let indicator = null;
  if (val && !unchanged) {
    if (!formatOk) indicator = <span className="text-red-600">Format invalide (3 à 20 caractères : lettres, chiffres, - ou _)</span>;
    else if (checking) indicator = <span className="text-ink-faint">Vérification…</span>;
    else if (available === true) indicator = <span className="text-ok font-bold">✓ Disponible</span>;
    else if (available === false) indicator = <span className="text-red-600 font-bold">Déjà utilisé</span>;
  }

  return (
    <Layout>
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-extrabold text-ink mb-5">Mon profil</h1>
        <Card className="divide-y divide-line">
          <Section icon={Mail} title="E-mail">
            <p className="text-sm text-ink-soft">{user?.email}</p>
            <p className="text-xs text-ink-faint mt-0.5">Non modifiable</p>
          </Section>

          <Section icon={Shield} title="Rôle">
            <p className="text-sm text-ink-soft">{ROLE_LABEL[user?.role] ?? user?.role}</p>
          </Section>

          <Section icon={AtSign} title="Pseudo">
            <form onSubmit={e => { e.preventDefault(); if (canSave) saveUsername(val); }} className="space-y-2">
              <div className="flex items-center gap-1.5">
                <span className="text-ink-faint text-sm font-bold">@</span>
                <input type="text" value={username} maxLength={20} placeholder="monpseudo" aria-label="Pseudo"
                  onChange={e => { setUsername(e.target.value); setSaveResult(null); }}
                  className={`${inputCls} flex-1 ${!formatOk && val ? 'border-red-300' : ''}`} />
              </div>
              {indicator && <p className="text-xs">{indicator}</p>}
              <p className="text-xs text-ink-faint">Permet d'être invité sur des projets par pseudo plutôt que par e-mail.</p>
              {saveResult && (
                <p role="status" className={`text-xs font-bold ${saveResult.type === 'ok' ? 'text-ok' : 'text-red-600'}`}>{saveResult.message}</p>
              )}
              <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" variant="primary" disabled={!canSave}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
                {user?.username && (
                  <Button size="sm" variant="ghost" onClick={() => saveUsername('')} disabled={saving}>Supprimer le pseudo</Button>
                )}
              </div>
            </form>
          </Section>

          <ReminderSettings />
        </Card>
      </div>
    </Layout>
  );
}
