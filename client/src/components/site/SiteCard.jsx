import { useCallback, useEffect, useState } from 'react';
import { Clock, Download, ExternalLink, Globe, RotateCcw, Rocket, Wand2 } from 'lucide-react';
import { downloadFile } from '../../utils/download';
import { Button, Card, SectionLabel } from '../ui';
import Markdown from '../Markdown';
import api from '../../utils/api';
import { notifyError } from '../../utils/notify';
import { useAuth } from '../../contexts/AuthContext';
import { formatUSD } from '../../utils/cost';

// BlabIA + : « Votre site », sur « Mon projet » d'un projet dont le dossier décrit un site.
// BlabIA construit le vrai site à partir du dossier (environ sept minutes), le montre en
// aperçu, puis le retouche à la demande. Aucun compte à ouvrir, aucun réglage.

const POLL_MS = 5000;
const STAGES = {
  starting: 'Je prépare la construction.',
  reading: 'Je lis votre dossier.',
  writing: 'J’écris les pages, le style et les textes.',
  saving: 'Je vérifie les pages et je range le site.',
};

function elapsed(from, now) {
  const s = Math.max(0, Math.round((now - new Date(from).getTime()) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`;
}

// Adresse au nom du porteur. Il achète son nom chez le vendeur de son choix et ajoute une ligne
// que BlabIA lui dicte ; BlabIA vérifie, active le certificat, et le site y répond.
const SELLERS = [
  ['OVHcloud', 'Espace client › « Noms de domaine » › votre nom › « Zone DNS » › « Ajouter une entrée » › « CNAME ». Pour l’adresse courte : onglet « Redirection » › vers l’adresse en www.'],
  ['Gandi', '« Noms de domaine » › votre nom › « Enregistrements DNS » › « Ajouter » › type « CNAME ». Pour l’adresse courte : « Redirections web » › vers l’adresse en www.'],
  ['Cloudflare', '« Domaines » › votre nom › « DNS » › « Ajouter un enregistrement » › type « CNAME », et décochez le nuage orange (« DNS uniquement »). Pour l’adresse courte : « Règles » › « Règles de redirection » › vers l’adresse en www.'],
  ['Autre vendeur', 'Cherchez « zone DNS » ou « enregistrements DNS » dans votre espace client, ajoutez un enregistrement de type CNAME, puis une redirection de l’adresse courte vers l’adresse en www.'],
];

function OwnDomain({ projectId, pub, onChanged, isDemo }) {
  const [host, setHost] = useState('');
  const [busy, setBusy] = useState(false);
  const d = pub.customDomain;
  const call = async (method, body, message) => {
    setBusy(true);
    try { const { data } = await api[method](`/projects/${projectId}/site/domain`, method === 'delete' ? undefined : body); onChanged(data); }
    catch (err) { notifyError(err, message); }
    setBusy(false);
  };
  if (!d) {
    return (
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-ink-soft">Utiliser une adresse à votre nom (par exemple www.mon-site.fr)</summary>
        <div className="mt-2 space-y-2">
          <p className="text-xs text-ink-muted">Achetez d’abord votre nom chez le vendeur de votre choix (OVHcloud, Gandi, Cloudflare… ; comptez environ 10 € par an). Puis indiquez-le ici : BlabIA vous dira la ligne à ajouter chez ce vendeur.</p>
          <div className="flex flex-wrap gap-2">
            <label htmlFor="own-domain" className="sr-only">Votre adresse</label>
            <input id="own-domain" value={host} onChange={e => setHost(e.target.value)} placeholder="www.mon-site.fr"
              className="min-w-0 flex-1 px-2.5 py-1.5 border border-line rounded-lg text-sm text-ink bg-white outline-none focus:ring-2 focus:ring-action" />
            <Button size="sm" variant="secondary" onClick={() => call('post', { hostname: host }, 'Cette adresse n’a pas pu être enregistrée')} disabled={!host.trim() || busy || isDemo}>Utiliser cette adresse</Button>
          </div>
        </div>
      </details>
    );
  }
  if (d.status === 'active') {
    return (
      <p className="text-sm text-ink">
        Votre adresse à votre nom fonctionne : <a href={d.url} target="_blank" rel="noopener noreferrer" className="font-bold text-action underline break-all">{d.url}</a>{' '}
        <button type="button" onClick={() => call('delete', null, 'L’adresse n’a pas pu être retirée')} disabled={busy} className="text-xs text-ink-muted underline">Ne plus l’utiliser</button>
      </p>
    );
  }
  return (
    <div className="rounded-xl border border-await-border bg-await-bg p-3 space-y-2 text-sm" data-tour="pw-site-domain">
      <p className="font-bold text-ink">Dernière étape pour {d.hostname}</p>
      <p className="text-ink-soft">Chez le vendeur de votre nom, ajoutez cette ligne :</p>
      <div className="overflow-x-auto">
        <table className="text-sm border border-line bg-white rounded-lg">
          <thead><tr className="text-left text-xs text-ink-muted"><th className="px-3 py-1.5">Type</th><th className="px-3 py-1.5">Nom</th><th className="px-3 py-1.5">Cible (ou valeur)</th></tr></thead>
          <tbody><tr className="font-mono"><td className="px-3 py-1.5">{d.record.type}</td><td className="px-3 py-1.5">{d.record.name}</td><td className="px-3 py-1.5">{d.record.target}</td></tr></tbody>
        </table>
      </div>
      <p className="text-ink-soft">Et pour que <strong>{d.apex}</strong> (sans www) fonctionne aussi, demandez à ce vendeur une redirection de {d.apex} vers https://{d.hostname}.</p>
      <details>
        <summary className="cursor-pointer font-semibold text-ink-soft">Où cliquer, selon votre vendeur</summary>
        <ul className="mt-2 space-y-1.5">
          {SELLERS.map(([name, how]) => <li key={name}><strong>{name} :</strong> {how}</li>)}
        </ul>
      </details>
      <p className="text-xs text-ink-muted">BlabIA vérifie tout seul. Selon le vendeur, cela prend de quelques minutes à quelques heures ; cette page vous dira quand c’est prêt.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => onChanged(null)} disabled={busy}>Vérifier maintenant</Button>
        <button type="button" onClick={() => call('delete', null, 'L’adresse n’a pas pu être retirée')} disabled={busy} className="text-xs text-ink-muted underline">Annuler cette adresse</button>
      </div>
    </div>
  );
}

// Lot 3 : mettre le site en ligne, à une adresse du type « mon-site.sites-blabia.com »
function Publication({ projectId, pub, onChanged, isDemo }) {
  const [slug, setSlug] = useState(pub.suggestedSlug || '');
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  if (!pub.available) return null;
  const call = async (path, body, message) => {
    setBusy(true);
    try { const { data } = await api.post(`/projects/${projectId}/site/${path}`, body); onChanged(data); setConfirmOff(false); }
    catch (err) { notifyError(err, message); }
    setBusy(false);
  };
  if (pub.online) {
    return (
      <div className="rounded-xl border border-ok-border bg-ok-light/50 p-3 space-y-2" data-tour="pw-site-online">
        <p className="text-sm font-bold text-ink flex items-center gap-1.5"><Rocket size={15} className="text-ok" aria-hidden="true" /> Votre site est en ligne</p>
        <a href={pub.url} target="_blank" rel="noopener noreferrer" className="block text-[15px] font-bold text-action underline break-all">{pub.url}</a>
        <p className="text-xs text-ink-muted">Tout le monde peut le voir à cette adresse. Google le découvrira : son plan lui est déjà préparé.</p>
        <OwnDomain projectId={projectId} pub={pub} onChanged={onChanged} isDemo={isDemo} />
        <div className="flex flex-wrap items-center gap-2">
          {!pub.upToDate && <Button size="sm" variant="primary" onClick={() => call('publish', {}, 'La mise à jour n’a pas pu se faire')} disabled={busy || isDemo}>Mettre en ligne la dernière version</Button>}
          {confirmOff ? (
            <>
              <span className="text-xs font-semibold text-ink">Retirer le site d’Internet ?</span>
              <Button size="sm" variant="danger" onClick={() => call('unpublish', {}, 'Le site n’a pas pu être retiré')} disabled={busy}>Oui, le retirer</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmOff(false)}>Non</Button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmOff(true)} className="text-xs font-semibold text-ink-muted hover:text-ink underline">Retirer d’Internet</button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-line p-3 space-y-2">
      <p className="text-sm font-bold text-ink">Mettre votre site sur Internet</p>
      <label htmlFor="site-slug" className="block text-xs text-ink-muted">Son adresse (vous pourrez avoir plus tard une adresse à votre nom) :</label>
      <div className="flex flex-wrap items-center gap-1 text-sm">
        <span className="text-ink-muted">https://</span>
        <input id="site-slug" value={slug} onChange={e => setSlug(e.target.value.toLowerCase())} maxLength={40}
          className="min-w-0 flex-1 px-2 py-1.5 border border-line rounded-lg text-sm text-ink bg-white outline-none focus:ring-2 focus:ring-action" />
        <span className="text-ink-muted">.{pub.domain}</span>
      </div>
      <Button size="sm" variant="primary" onClick={() => call('publish', { slug }, 'Le site n’a pas pu être mis en ligne')} disabled={!slug.trim() || busy || isDemo}>
        <Rocket size={15} aria-hidden="true" /> Mettre mon site en ligne
      </Button>
    </div>
  );
}

export default function SiteCard({ projectId, dossierVersion, isDemo }) {
  const { user } = useAuth();
  const [site, setSite] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(() => api.get(`/projects/${projectId}/site`).then(({ data }) => setSite(data)), [projectId]);
  useEffect(() => { load().catch(() => setSite({ last: null, ready: null })); }, [load]);
  const building = site?.last?.status === 'building';
  useEffect(() => {
    if (!building) return undefined;
    const poll = setInterval(() => load().catch(() => {}), POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [building, load]);

  if (!site) return null;
  const { last, ready } = site;
  const failed = last?.status === 'failed';

  const run = async (path, body, message) => {
    setBusy(true);
    try { const { data } = await api.post(`/projects/${projectId}/site/${path}`, body); setSite(data); if (path === 'retouch') setText(''); }
    catch (err) { notifyError(err, message); }
    setBusy(false);
  };
  const build = () => run('build', {}, 'La construction n’a pas pu démarrer');
  const retouch = t => run('retouch', { text: t }, 'La retouche n’a pas pu démarrer');
  const retry = () => (last?.kind === 'retouch' ? retouch(last.request) : build());
  const newerDossier = ready && dossierVersion > ready.baseVersion;

  return (
    <Card className="p-5 space-y-3" data-tour="pw-site">
      <SectionLabel className="flex items-center gap-1.5"><Globe size={14} aria-hidden="true" /> Votre site</SectionLabel>

      {!last && (
        <>
          <p className="text-[15px] text-ink">Votre dossier décrit un site : BlabIA peut le construire pour de vrai, à partir de ce dossier, en sept minutes environ. Vous le verrez sur votre téléphone avant de décider quoi que ce soit.</p>
          <Button variant="primary" onClick={build} disabled={busy || isDemo}><Globe size={16} aria-hidden="true" /> Construire mon site</Button>
        </>
      )}

      {building && (
        <div role="status" aria-live="polite" className="space-y-2">
          <p className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <span className="w-5 h-5 border-2 border-ai border-t-transparent rounded-full animate-spin" aria-hidden="true" />
            {last.kind === 'retouch' ? 'La retouche de votre site est en cours' : 'Votre site se construit'}
          </p>
          <p className="text-sm text-ink-soft">{STAGES[last.stage] || STAGES.starting}</p>
          <p className="text-xs text-ink-muted flex items-center gap-1.5"><Clock size={13} aria-hidden="true" /> Depuis {elapsed(last.createdAt, now)}. Cela prend en général cinq à dix minutes. Vous pouvez quitter cette page.</p>
        </div>
      )}

      {failed && (
        <div className="rounded-xl border border-await-border bg-await-bg p-3 space-y-2" role="alert">
          <p className="text-sm font-semibold text-ink">{last.error}</p>
          <Button size="sm" variant="primary" onClick={retry} disabled={busy || isDemo}><RotateCcw size={15} aria-hidden="true" /> Réessayer</Button>
        </div>
      )}

      {ready && !building && (
        <div className="space-y-3">
          <p className="text-[15px] text-ink">
            {last?.id === ready.id && ready.kind === 'retouch' ? `Retouche faite : « ${ready.request} ».` : 'Votre site est prêt.'}{' '}
            {site.publication?.online
              ? 'Chaque retouche s’essaie d’abord ici, à une adresse que vous seul connaissez ; vous la mettez ensuite en ligne.'
              : 'Ouvrez-le, sur votre ordinateur ou sur votre téléphone : c’est une adresse d’essai, que vous seul connaissez.'}
          </p>
          <a href={ready.previewPath} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-[10px] font-bold bg-action text-white hover:bg-action-dark">
            <ExternalLink size={16} aria-hidden="true" /> {site.publication?.online ? 'Voir la version d’essai' : 'Voir mon site'}
          </a>
          {ready.report && (
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold text-ink-soft">Ce qui reste à faire de votre côté</summary>
              <div className="mt-2 text-ink-soft"><Markdown>{ready.report}</Markdown></div>
            </details>
          )}
          <div>
            <label htmlFor="site-retouch" className="text-sm font-bold text-ink">Que voulez-vous changer sur votre site ?</label>
            <textarea id="site-retouch" value={text} onChange={e => setText(e.target.value)} rows={2}
              placeholder="Par exemple : mettez le titre plus grand sur la page d’accueil."
              className="mt-1 w-full px-3 py-2 border border-line rounded-[10px] text-sm text-ink bg-white outline-none focus:ring-2 focus:ring-action" />
            <Button size="sm" variant="secondary" className="mt-1.5" onClick={() => retouch(text.trim())} disabled={!text.trim() || busy || isDemo}>
              <Wand2 size={15} aria-hidden="true" /> Retoucher le site
            </Button>
          </div>
          {site.publication && <Publication projectId={projectId} pub={site.publication} onChanged={data => (data ? setSite(data) : load().catch(() => {}))} isDemo={isDemo} />}
          <p className="text-sm">
            <button type="button" onClick={() => downloadFile(`/projects/${projectId}/site/download`, 'mon-site.zip').catch(err => notifyError(err, 'Le téléchargement n’a pas pu se faire'))}
              className="inline-flex items-center gap-1.5 font-semibold text-action hover:underline">
              <Download size={15} aria-hidden="true" /> Télécharger mon site
            </button>
            <span className="block text-xs text-ink-muted">Pour le mettre en ligne ailleurs, où vous voulez : tout le site dans un fichier, avec le mode d’emploi.</span>
          </p>
          {newerDossier && (
            <p className="text-sm text-ink-soft">
              Votre dossier a changé depuis la construction du site.{' '}
              <button type="button" onClick={build} disabled={busy || isDemo} className="font-bold text-action hover:underline">Reconstruire le site avec la dernière version</button>
            </p>
          )}
        </div>
      )}
      {isDemo && <p className="text-xs text-await font-semibold">Projet exemple : créez votre projet pour construire un site.</p>}
      {user?.advancedMode && ready?.costUSD != null && (
        <p className="text-xs text-ink-faint">Mode avancé : dernière construction {formatUSD(ready.costUSD)} ({ready.model}).</p>
      )}
    </Card>
  );
}
