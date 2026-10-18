import { useState, useEffect } from 'react';
import { Mail, AtSign, Shield, Bell, Send, Github, Check, Wrench, ChevronRight, KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { Button, Card } from '../components/ui';
import api from '../utils/api';
import { dayName } from '../components/RemindersToggle';
import { notifyError, notifySuccess } from '../utils/notify';
import { formatUSD } from '../utils/cost';
import { startGitHubConnect, useGitHubReturn } from '../utils/github';

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

// « Apportez votre clé API » (v5.1, 17/10/2026) : l'IA de vos projets facturée sur votre compte
// Anthropic, au prix coûtant ; BlabIA prend le relais si la clé ne fonctionne plus
const KEY_STATUS = {
  ok:        { tone: 'text-ok',    text: 'Active : l’IA de vos projets est facturée sur votre compte Anthropic.' },
  no_credit: { tone: 'text-await', text: 'Crédit épuisé sur votre compte Anthropic : BlabIA a pris le relais. Nouvel essai toutes les heures.' },
  invalid:   { tone: 'text-await', text: 'Anthropic refuse cette clé (révoquée ?) : BlabIA a pris le relais. Remplacez-la pour l’utiliser de nouveau.' },
};
function ApiKeySettings() {
  const [key, setKey] = useState(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/users/me').then(({ data }) => setKey(data.anthropicKey)).catch(() => setKey({ configured: false })); }, []);
  const save = async e => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.put('/users/me/anthropic-key', { apiKey: value.trim() });
      setKey(data.anthropicKey); setValue('');
      notifySuccess(data.anthropicKey.status === 'ok' ? 'Clé vérifiée et enregistrée.' : 'Clé enregistrée, mais votre compte Anthropic n’a plus de crédit.');
    } catch (err) { notifyError(err, 'La clé n’a pas pu être enregistrée.'); }
    setBusy(false);
  };
  const remove = async () => {
    if (!confirm('Retirer votre clé ? L’IA de vos projets repassera sur le compte de BlabIA.')) return;
    try { const { data } = await api.delete('/users/me/anthropic-key'); setKey(data.anthropicKey); }
    catch (err) { notifyError(err, 'La clé n’a pas pu être retirée.'); }
  };
  if (!key) return null;
  const status = key.configured ? KEY_STATUS[key.status] || KEY_STATUS.ok : null;
  const month = key.monthUSD || { user: 0, blabia: 0 };
  return (
    <Section icon={KeyRound} title="Votre clé API Anthropic (facultatif)">
      <p className="text-sm text-ink-soft">Si vous avez un compte développeur Anthropic (Claude Console), BlabIA peut utiliser votre clé : l’IA de vos projets (réunions, bras droit, missions) est alors facturée directement sur votre compte, au prix coûtant. Sans clé, ou si elle ne fonctionne plus, BlabIA prend le relais.</p>
      <p className="text-xs text-ink-faint mt-1.5">Ce n’est pas votre abonnement Claude (Pro, Max) : Anthropic le réserve à Claude.ai et Claude Code. Il continue de servir aux développements (Projet › Développements).</p>
      {key.configured && (
        <div className="mt-3 space-y-1">
          <p className="text-sm text-ink">Clé enregistrée, se termine par <strong className="font-mono">…{key.last4}</strong></p>
          <p className={`text-xs font-bold ${status.tone}`} role="status">{status.text}</p>
        </div>
      )}
      <form onSubmit={save} className="mt-3 flex flex-wrap gap-2">
        <label htmlFor="anthropic-key" className="sr-only">Clé API Anthropic</label>
        <input id="anthropic-key" type="password" autoComplete="off" spellCheck={false} value={value} onChange={e => setValue(e.target.value)}
          placeholder={key.configured ? 'Remplacer par une autre clé (sk-ant-…)' : 'sk-ant-…'} className={`${inputCls} flex-1 min-w-[220px] font-mono`} />
        <Button type="submit" size="sm" variant="primary" disabled={busy || !value.trim()}>{busy ? 'Vérification…' : 'Vérifier et enregistrer'}</Button>
        {key.configured && <Button size="sm" variant="ghost" onClick={remove} disabled={busy}>Retirer</Button>}
      </form>
      <p className="text-xs text-ink-faint mt-2">
        Ce mois-ci, l’IA de vos projets : {formatUSD(month.user)} sur votre clé · {formatUSD(month.blabia)} sur le compte BlabIA.
        La clé est vérifiée auprès d’Anthropic, puis conservée chiffrée ; elle n’est plus jamais affichée.
      </p>
    </Section>
  );
}

// Compte GitHub (v5.1) : pour lancer les développements Claude Code depuis BlabIA
function GitHubSettings() {
  const [gh, setGh] = useState(null);
  const load = () => api.get('/github').then(({ data }) => setGh(data)).catch(err => notifyError(err, 'Impossible de lire la connexion GitHub.'));
  useEffect(() => { load(); }, []);
  useGitHubReturn(() => load());
  if (!gh?.configured) return null; // fonctionnalité non configurée sur ce serveur
  const disconnect = async () => {
    if (!confirm('Déconnecter votre compte GitHub de BlabIA ? Les développements ne pourront plus être lancés ni suivis.')) return;
    try { await api.delete('/github'); load(); } catch (err) { notifyError(err, 'Déconnexion impossible.'); }
  };
  return (
    <Section icon={Github} title="GitHub">
      {gh.connected ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-ink-soft flex-1">Connecté : <strong>{gh.login}</strong></p>
          {gh.manageUrl && <a className="text-xs font-bold text-action underline" href={gh.manageUrl} target="_blank" rel="noreferrer">Choisir les dépôts</a>}
          <Button size="sm" variant="ghost" onClick={disconnect}>Déconnecter</Button>
        </div>
      ) : (
        <Button size="sm" variant="primary" onClick={() => startGitHubConnect('/profile')}><Github size={15} aria-hidden="true" /> Connecter GitHub</Button>
      )}
      <p className="text-xs text-ink-faint mt-2">Permet de lancer depuis BlabIA les prompts de vos réunions Claude Code : Claude Code travaille dans votre dépôt GitHub, avec votre abonnement Claude (Projet › Développements).</p>
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
    else if (available === true) indicator = <span className="text-ok font-bold inline-flex items-center gap-1"><Check size={14} aria-hidden="true" /> Disponible</span>;
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
          {user?.role !== 'user' && <ApiKeySettings />}
          {user?.role !== 'user' && <GitHubSettings />}
          {/* Outils habituels (v5.1) : facultatif — sans eux, BlabIA propose son pack recommandé */}
          {user?.role !== 'user' && (
            <Section icon={Wrench} title="Mes outils habituels (facultatif)">
              <p className="text-sm text-ink-soft">Les outils que vous utilisez déjà (hébergeur, e-mails, organisation…). BlabIA en pré-remplit vos nouveaux projets et les assistants en tiennent compte. Sans rien renseigner, BlabIA propose son pack recommandé, avec la mise en ligne automatique.</p>
              <Link to="/outils" className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-action hover:underline">
                Voir ou modifier mes outils <ChevronRight size={15} aria-hidden="true" />
              </Link>
            </Section>
          )}
        </Card>
      </div>
    </Layout>
  );
}
