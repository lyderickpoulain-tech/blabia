import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Rocket, Link2, RefreshCw, Globe, Database, KeyRound, CheckCircle2, AlertTriangle, ExternalLink, Loader2, Github, Unplug } from 'lucide-react';
import api from '../../utils/api';
import { notifyError, notifySuccess } from '../../utils/notify';
import { Button, Card, Badge } from '../ui';

// Mise en ligne automatique par Railway (v5.1, connecteur « un clic par outil ») :
// 1. l'utilisateur autorise BlabIA sur son compte Railway ; 2. BlabIA crée le projet, les
// services (un par dossier du dépôt), la base, les adresses et les variables ; 3. restent les
// clés de services tiers, collées ici et transmises à Railway sans être conservées.
const STATUS = {
  SUCCESS:      { label: 'En ligne', tone: 'ok' },
  DEPLOYING:    { label: 'Démarrage…', tone: 'action', busy: true },
  BUILDING:     { label: 'Construction…', tone: 'action', busy: true },
  INITIALIZING: { label: 'Préparation…', tone: 'action', busy: true },
  QUEUED:       { label: 'En file d’attente', tone: 'action', busy: true },
  WAITING:      { label: 'En attente', tone: 'action', busy: true },
  FAILED:       { label: 'Échec', tone: 'await' },
  CRASHED:      { label: 'Arrêté (erreur)', tone: 'await' },
  REMOVED:      { label: 'Retiré', tone: 'muted' },
  SLEEPING:     { label: 'En veille', tone: 'muted' },
  NONE:         { label: 'Pas encore déployé', tone: 'muted' },
};
const KIND_LABEL = { site: 'Le site (pages)', server: 'Le serveur' };
const AUTO_LABEL = { secret: 'générée', database: 'reliée à la base', link: 'adresse reliée', fixed: 'réglée' };

function MissingVariable({ service, name, onSaved }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async e => {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    try {
      const { data } = await onSaved(service.id, name, value.trim());
      if (data) setValue('');
    } finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2">
      <label className="text-xs font-mono font-bold text-ink-soft min-w-[160px]" htmlFor={`var-${service.id}-${name}`}>{name}</label>
      <input id={`var-${service.id}-${name}`} type="password" autoComplete="off" value={value} onChange={e => setValue(e.target.value)}
        placeholder="Collez la clé ici" className="flex-1 min-w-[180px] h-9 text-sm border border-line rounded-[10px] px-3 bg-white outline-none focus:ring-2 focus:ring-action" />
      <Button size="sm" variant="primary" type="submit" disabled={busy || !value.trim()}>{busy ? '…' : 'Envoyer à Railway'}</Button>
    </form>
  );
}

export default function RailwayConnector({ project, onDone }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null); // { message, kind }

  const load = useCallback(() => api.get(`/projects/${project.id}/railway`).then(({ data }) => setInfo(data)).catch(() => setInfo(null)), [project.id]);
  const loadStatus = useCallback(() => api.get(`/projects/${project.id}/railway/status`).then(({ data }) => setStatus(data.services)).catch(() => {}), [project.id]);
  useEffect(() => { load(); }, [load]);

  // Retour de Railway après l'autorisation
  useEffect(() => {
    const r = new URLSearchParams(location.search).get('railway');
    if (!r) return;
    if (r === 'ok') notifySuccess('Compte Railway connecté.');
    else if (r === 'refus') notifyError(null, 'Autorisation Railway annulée.');
    else notifyError(null, 'La connexion à Railway a échoué. Réessayez.');
    navigate(location.pathname, { replace: true });
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasSetup = !!info?.setup?.services?.length;
  useEffect(() => { if (hasSetup && info?.isOwner) loadStatus(); }, [hasSetup, info?.isOwner, loadStatus]);
  // Suivi automatique tant qu'un déploiement est en cours
  const deploying = (status || []).some(s => STATUS[s.status]?.busy);
  useEffect(() => {
    if (!deploying) return undefined;
    const t = setInterval(loadStatus, 15000);
    return () => clearInterval(t);
  }, [deploying, loadStatus]);

  if (!info || !info.repo) return null; // sans dépôt GitHub : rien à mettre en ligne

  const connect = async () => {
    try { window.location.href = (await api.post(`/projects/${project.id}/railway/connect`)).data.url; }
    catch (err) { notifyError(err, 'Connexion à Railway impossible.'); }
  };
  const disconnect = async () => {
    if (!confirm('Retirer l’accès de BlabIA à votre compte Railway ? Le site reste en ligne ; BlabIA ne pourra plus le mettre à jour ni le surveiller.')) return;
    try { await api.delete(`/projects/${project.id}/railway/connection`); load(); } catch (err) { notifyError(err, 'Opération impossible.'); }
  };
  const runSetup = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post(`/projects/${project.id}/railway/setup`);
      setInfo(i => ({ ...i, setup: data.setup }));
      notifySuccess('Site envoyé sur Railway : la construction commence.');
      loadStatus();
      onDone?.();
    } catch (err) {
      setError({ message: err.response?.data?.error || 'La mise en ligne a échoué.', kind: err.response?.data?.kind });
      if (err.response?.data?.kind === 'auth') load();
      else load(); // la progression a pu être enregistrée (projet Railway créé)
    } finally { setBusy(false); }
  };
  const sendVariable = async (serviceId, name, value) => {
    try {
      const res = await api.post(`/projects/${project.id}/railway/variables`, { serviceId, name, value });
      setInfo(i => ({ ...i, setup: res.data.setup }));
      notifySuccess(`${name} envoyée à Railway : le service redémarre.`);
      setTimeout(loadStatus, 3000);
      return res;
    } catch (err) { notifyError(err, 'La clé n’a pas pu être envoyée.'); return {}; }
  };

  const setup = info.setup;
  const siteUrl = setup?.siteUrl;
  const statusOf = id => (status || []).find(s => s.id === id);

  return (
    <Card className="p-5 space-y-4" data-tour="tools-railway">
      <div className="flex flex-wrap items-start gap-3">
        <Rocket size={20} className="text-action shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-[220px]">
          <h2 className="text-base font-extrabold text-ink">Mise en ligne automatique</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            BlabIA met le site en ligne chez Railway à votre place : services, base de données, adresses et réglages. Vous n’avez qu’à autoriser BlabIA sur votre compte.
          </p>
        </div>
        {info.connected && info.isOwner && (
          <button type="button" onClick={disconnect} className="text-xs font-bold text-ink-muted hover:text-ink inline-flex items-center gap-1">
            <Unplug size={13} aria-hidden="true" /> {info.email ? `Railway : ${info.email}` : 'Déconnecter Railway'}
          </button>
        )}
      </div>

      {!info.configured && (
        <p className="text-sm text-ink-muted bg-canvas border border-line rounded-xl px-3.5 py-2.5">
          Le connecteur Railway n’est pas encore activé sur ce serveur BlabIA. En attendant, suivez le guide de mise en place ci-dessous.
        </p>
      )}

      {info.configured && !info.isOwner && <p className="text-sm text-ink-muted">Seul le propriétaire du projet peut mettre le site en ligne.</p>}

      {/* 1. Autoriser BlabIA */}
      {info.configured && info.isOwner && !info.connected && (
        <div className="rounded-xl border border-line bg-white p-4 space-y-2">
          <p className="text-sm font-bold text-ink">1. Autorisez BlabIA sur votre compte Railway</p>
          <p className="text-sm text-ink-soft">
            Pas encore de compte ? Railway en crée un en un clic avec votre compte GitHub. L’écran d’autorisation est en anglais : choisissez votre espace de travail (« workspace »), puis cliquez sur le bouton d’acceptation.
          </p>
          <Button variant="primary" onClick={connect}><Link2 size={16} aria-hidden="true" /> Connecter mon compte Railway</Button>
        </div>
      )}

      {/* 2. Plan puis mise en ligne */}
      {info.configured && info.isOwner && info.connected && !hasSetup && (
        <div className="rounded-xl border border-line bg-white p-4 space-y-3">
          <p className="text-sm font-bold text-ink">2. Mettez le site en ligne</p>
          {!info.plan?.services?.length ? (
            <p className="text-sm text-ink-soft">Le dépôt ne contient pas encore de site : lancez d’abord un développement (réunion « Construire la première version »), puis revenez ici.</p>
          ) : (
            <>
              <p className="text-sm text-ink-soft">Voici ce que BlabIA va créer chez Railway :</p>
              <ul className="space-y-1.5">
                {info.plan.services.map(s => (
                  <li key={s.name} className="text-sm text-ink-soft flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Globe size={15} className="text-ink-faint" aria-hidden="true" />
                    <strong className="text-ink">{KIND_LABEL[s.kind] || s.name}</strong>
                    <span className="text-xs text-ink-faint">(dossier {s.rootDirectory ? `/${s.rootDirectory}` : 'racine'}, avec son adresse publique)</span>
                    {Object.entries(s.auto).length > 0 && (
                      <span className="basis-full pl-6 text-xs text-ink-muted">
                        Réglages faits par BlabIA : {Object.entries(s.auto).map(([n, a]) => `${n} (${AUTO_LABEL[a.kind]})`).join(', ')}
                      </span>
                    )}
                    {s.missing.length > 0 && (
                      <span className="basis-full pl-6 text-xs text-await font-bold">À fournir ensuite : {s.missing.join(', ')}</span>
                    )}
                  </li>
                ))}
                {info.plan.needsDatabase && (
                  <li className="text-sm text-ink-soft flex items-center gap-2"><Database size={15} className="text-ink-faint" aria-hidden="true" /> <strong className="text-ink">Une base de données PostgreSQL</strong>, reliée au serveur</li>
                )}
              </ul>
              <p className="text-xs text-ink-muted">Railway facture l’hébergement sur votre compte (un essai gratuit, puis quelques euros par mois selon l’usage).</p>
              <Button variant="primary" onClick={runSetup} disabled={busy}>
                {busy ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Mise en ligne… (jusqu’à une minute)</> : <><Rocket size={16} aria-hidden="true" /> Mettre le site en ligne</>}
              </Button>
            </>
          )}
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-await-border bg-await-bg px-3.5 py-3 space-y-2">
          <p className="text-sm font-bold text-await flex items-start gap-1.5"><AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden="true" /> {error.message}</p>
          {error.kind === 'github' && (
            <>
              <p className="text-sm text-ink-soft">Railway doit pouvoir lire votre code. Ouvrez la page ci-dessous, choisissez votre compte GitHub, autorisez le dépôt <strong>{info.repo}</strong> (« Only select repositories »), puis revenez cliquer sur « Réessayer ».</p>
              <div className="flex flex-wrap gap-2">
                <a href="https://github.com/apps/railway-app/installations/new" target="_blank" rel="noopener noreferrer"
                  className="h-9 px-3 inline-flex items-center gap-1.5 rounded-[10px] text-[13px] font-bold bg-white text-ink-soft border border-line hover:bg-canvas">
                  <Github size={15} aria-hidden="true" /> Autoriser Railway sur GitHub <ExternalLink size={12} aria-hidden="true" />
                </a>
                <Button size="sm" variant="primary" onClick={runSetup} disabled={busy}><RefreshCw size={14} aria-hidden="true" /> Réessayer</Button>
              </div>
            </>
          )}
          {error.kind !== 'github' && error.kind !== 'auth' && error.kind !== 'empty' && (
            <Button size="sm" variant="secondary" onClick={runSetup} disabled={busy}><RefreshCw size={14} aria-hidden="true" /> Réessayer</Button>
          )}
        </div>
      )}

      {/* 3. Site en ligne : état des services et clés à fournir */}
      {hasSetup && (
        <div className="space-y-3">
          {siteUrl && (
            <a href={siteUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-ok hover:underline break-all">
              <Globe size={15} aria-hidden="true" /> {siteUrl.replace(/^https:\/\//, '')} <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
          <ul className="space-y-2">
            {setup.services.map(svc => {
              const st = statusOf(svc.id);
              const meta = STATUS[st?.status] || (status ? STATUS.NONE : null);
              const missing = (svc.missing || []).filter(n => !(svc.provided || []).includes(n));
              return (
                <li key={svc.id} className="rounded-xl border border-line bg-white p-3.5 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm text-ink">{KIND_LABEL[svc.kind] || svc.name}</strong>
                    <span className="text-xs text-ink-faint">dossier {svc.dir === '(racine)' ? 'racine' : `/${svc.dir}`}</span>
                    {meta && <Badge tone={meta.tone}>{meta.busy && <Loader2 size={11} className="animate-spin" aria-hidden="true" />}{meta.label}</Badge>}
                    {svc.domain && <a href={`https://${svc.domain}`} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-action hover:underline break-all">{svc.domain}</a>}
                  </div>
                  {svc.auto?.length > 0 && <p className="text-xs text-ink-muted flex items-start gap-1"><CheckCircle2 size={13} className="text-ok shrink-0 mt-px" aria-hidden="true" /> Réglé par BlabIA : {svc.auto.join(', ')}</p>}
                  {missing.length > 0 && (
                    <div className="rounded-lg bg-await-bg border border-await-border p-3 space-y-2">
                      <p className="text-xs font-bold text-await flex items-center gap-1"><KeyRound size={13} aria-hidden="true" /> Clés de services tiers à fournir ({missing.length})</p>
                      <p className="text-xs text-ink-soft">Ce sont des clés que vous obtenez chez le service concerné (ex. Resend, Anthropic). BlabIA les transmet à Railway sans les garder. Où les trouver ? Demandez-le dans la discussion du guide ci-dessous.</p>
                      {missing.map(n => <MissingVariable key={n} service={svc} name={n} onSaved={sendVariable} />)}
                    </div>
                  )}
                  {st?.logs && (
                    <details className="text-xs">
                      <summary className="cursor-pointer font-bold text-await">Voir le journal d’erreur</summary>
                      <pre className="mt-2 bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto max-h-64 whitespace-pre-wrap">{st.logs}</pre>
                      <p className="mt-1 text-ink-muted">Copiez ce journal dans la discussion du guide ci-dessous : BlabIA vous dira quoi corriger.</p>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={loadStatus}><RefreshCw size={14} aria-hidden="true" /> Actualiser l’état</Button>
            {info.isOwner && info.connected && (
              <Button size="sm" variant="ghost" onClick={runSetup} disabled={busy}>
                {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Rocket size={14} aria-hidden="true" />} Revérifier la mise en ligne
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
