import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Workflow, FolderPlus, FolderOpen, LayoutDashboard, Play, MessagesSquare, Flag,
  ScrollText, Coins, Shield, PartyPopper, ArrowLeft, ArrowRight, X, Check, Coffee,
} from 'lucide-react';
import { Button, IconButton, Badge } from './ui';

// Guide de prise en main (v5.1) : affiché à la première connexion, rejouable
// via « Guide » dans l'en-tête. Contenu adapté au rôle :
//  - admin / supervisor : tout + administration des comptes ;
//  - member : crée et mène ses projets ;
//  - user : collaborateur invité (ne crée pas de projet).

export const roleKind = role => (role === 'admin' || role === 'supervisor') ? 'admin' : role === 'user' ? 'user' : 'member';

const TONES = {
  action: 'bg-action-light text-action',
  ai:     'bg-ai-light text-ai',
  await:  'bg-await-light text-await',
  ok:     'bg-ok-light text-ok',
};

// ── Petites illustrations (composants de la charte, pas d'images) ───────────
function Flow() {
  const items = [
    { label: 'Projet',   tone: 'action' },
    { label: 'Plan',     tone: 'action' },
    { label: 'Réunions', tone: 'ai' },
    { label: 'Décisions', tone: 'ok' },
  ];
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {items.map((it, i) => (
        <span key={it.label} className="flex items-center gap-1.5">
          {i > 0 && <ArrowRight size={14} className="text-ink-faint" aria-hidden="true" />}
          <span className={`px-3 h-8 inline-flex items-center rounded-full text-xs font-extrabold ${TONES[it.tone]}`}>{it.label}</span>
        </span>
      ))}
    </div>
  );
}

function ColorLegend() {
  return (
    <div className="grid grid-cols-2 gap-1.5 text-xs">
      <Badge tone="action">Bleu · pour avancer</Badge>
      <Badge tone="await">Ambre · attend votre arbitrage</Badge>
      <Badge tone="ok">Vert · validé, décidé</Badge>
      <Badge tone="ai">Violet · produit par l'IA</Badge>
    </div>
  );
}

function Phases() {
  const phases = ['Préparation', 'Briefing', 'Échanges', 'Conclusion'];
  return (
    <ol className="flex items-center justify-center gap-1.5 text-[11px] font-bold">
      {phases.map((p, i) => (
        <li key={p} className="flex items-center gap-1.5">
          {i > 0 && <span className="w-4 h-px bg-line" aria-hidden="true" />}
          <span className={`px-2.5 h-7 inline-flex items-center rounded-full ${i === 1 ? 'bg-await-light text-await' : 'bg-white border border-line text-ink-muted'}`}>{p}</span>
        </li>
      ))}
    </ol>
  );
}

function DecisionMock() {
  return (
    <div className="bg-white border border-await-border rounded-xl p-3 text-left max-w-sm mx-auto">
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-await mb-1.5">Votre arbitrage</p>
      <p className="text-xs font-bold text-ink mb-2">Quel public viser en premier ?</p>
      <div className="flex flex-wrap gap-1.5">
        <span className="h-7 px-2.5 inline-flex items-center gap-1 rounded-lg border-2 border-action bg-action-light text-action text-[11px] font-extrabold"><Check size={12} aria-hidden="true" /> Particuliers</span>
        <span className="h-7 px-2.5 inline-flex items-center rounded-lg border-2 border-line text-ink-muted text-[11px] font-semibold">Entreprises</span>
        <span className="h-7 px-2.5 inline-flex items-center rounded-lg border-2 border-dashed border-ai-border text-ai text-[11px] font-semibold">Laisser les agents décider</span>
      </div>
    </div>
  );
}

function Bullets({ items }) {
  return (
    <ul className="space-y-1.5 text-left">
      {items.filter(Boolean).map((t, i) => (
        <li key={i} className="flex gap-2 text-sm text-ink-soft leading-snug">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-action shrink-0" aria-hidden="true" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

// ── Étapes ─────────────────────────────────────────────────────────────────
const STEPS = [
  {
    id: 'welcome', icon: Sparkles, tone: 'ai',
    title: 'Bienvenue dans BlabIA',
    body: kind => (
      <>
        <p className="text-sm text-ink-soft">
          BlabIA réunit une équipe d'<strong>agents IA spécialisés</strong> pour faire avancer vos projets, informatiques ou non.
          Vous lancez le sujet, ils débattent et proposent ; <strong>vous tranchez</strong> — et vous pouvez toujours les contredire.
        </p>
        <p className="text-sm text-ink-muted mt-3">
          {kind === 'admin' && 'Votre compte est administrateur : vous menez vos projets et vous gérez aussi les comptes de BlabIA.'}
          {kind === 'member' && 'Votre compte vous permet de créer vos projets et d’y inviter des collaborateurs.'}
          {kind === 'user' && 'Vous avez été invité à collaborer : vous retrouvez ici les projets partagés avec vous.'}
        </p>
        <p className="text-xs text-ink-faint mt-3">Deux minutes de visite. Vous pourrez la revoir à tout moment.</p>
      </>
    ),
  },
  {
    id: 'principle', icon: Workflow, tone: 'action',
    title: 'Le principe',
    visual: <Flow />,
    body: () => (
      <Bullets items={[
        'Un projet décrit votre objectif : c’est le brief, que les agents lisent avant chaque réunion.',
        'Le plan enchaîne les réunions à tenir, dans l’ordre.',
        'Chaque réunion fait avancer une étape et se conclut par un compte-rendu.',
        'Les décisions prises sont inscrites au registre : les agents ne reposent plus la question.',
      ]} />
    ),
  },
  {
    id: 'create', icon: FolderPlus, tone: 'action', roles: ['admin', 'member'],
    title: 'Créer un projet',
    body: () => (
      <Bullets items={[
        <>Dans <strong>Projets</strong>, cliquez sur <strong>Nouveau projet</strong>.</>,
        <>Soignez le <strong>brief</strong> (objectif, contexte, contraintes) : plus il est précis, moins les agents vous poseront de questions.</>,
        <>Réglez la <strong>façon de travailler</strong> : votre maîtrise du sujet, l’humour, et combien de questions vous voulez trancher.</>,
        <>BlabIA vous propose ensuite une équipe d’agents et un plan de réunions, que vous ajustez.</>,
      ]} />
    ),
  },
  {
    id: 'shared', icon: FolderOpen, tone: 'action', roles: ['user'],
    title: 'Vos projets partagés',
    body: () => (
      <Bullets items={[
        <>Les projets auxquels vous êtes invité apparaissent dans <strong>Projets</strong>.</>,
        'Le propriétaire du projet gère le brief, l’équipe d’agents et le plan.',
        'Vous participez aux réunions, consultez l’historique et le registre des décisions.',
        'Pour créer vos propres projets, demandez à un administrateur de faire évoluer votre compte.',
      ]} />
    ),
  },
  {
    id: 'dashboard', icon: LayoutDashboard, tone: 'action',
    title: 'Le tableau de bord du projet',
    visual: <ColorLegend />,
    body: () => (
      <Bullets items={[
        <>En haut, la <strong>prochaine étape</strong> : la réunion à tenir, prête à démarrer.</>,
        <>En ambre, ce qui <strong>attend votre arbitrage</strong> : décisions remises en question, outils à revoir, réunion restée ouverte.</>,
        <>La barre de gauche mène au Plan, à l’Historique, aux Décisions, aux Outils, à l’Équipe et aux Paramètres.</>,
        <>Une couleur, un sens : retenez la légende ci-dessus, elle vaut partout.</>,
      ]} />
    ),
  },
  {
    id: 'start', icon: Play, tone: 'action',
    title: 'Lancer une réunion',
    body: () => (
      <>
        <Bullets items={[
          <>Fixez l’<strong>objectif</strong>, choisissez le <strong>livrable</strong> (décisions, prompt Claude Code, revue des outils) et les <strong>agents</strong> invités.</>,
          <>Le bouton <strong>Suggérer</strong> choisit les agents utiles, et signale une compétence manquante.</>,
        ]} />
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-ai-border bg-ai-bg p-3 text-left">
          <Coffee size={18} className="text-ai shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-ink-soft">
            <strong>Préparer avant mon arrivée</strong> : les agents débattent d’abord entre eux, puis vous arrivez sur un briefing
            avec les seules décisions qui vous reviennent. Idéal pour gagner du temps.
          </p>
        </div>
      </>
    ),
  },
  {
    id: 'meeting', icon: MessagesSquare, tone: 'await',
    title: 'Pendant la réunion',
    visual: <><Phases /><div className="mt-3"><DecisionMock /></div></>,
    body: () => (
      <Bullets items={[
        <>Les agents vous soumettent des <strong>cartes de décision</strong> : choisissez une option, puis <strong>Valider</strong>.</>,
        <>Pas d’avis ? <strong>Laisser les agents décider</strong>, question par question.</>,
        <>Écrivez à tout moment pour réorienter le débat ou <strong>contredire un agent</strong> : c’est vous qui décidez.</>,
      ]} />
    ),
  },
  {
    id: 'close', icon: Flag, tone: 'ok',
    title: 'Conclure',
    body: () => (
      <Bullets items={[
        <>Quand le sujet est traité, cliquez sur <strong>Conclure la réunion</strong>.</>,
        'Relisez le compte-rendu rédigé par BlabIA : il est modifiable et sera mémorisé dans le projet.',
        'Cochez les décisions à inscrire au registre, gardez les réunions suggérées pour compléter le plan.',
        <>Une décision n’est plus valable ? Dans <strong>Décisions</strong>, remettez-la en question : elle sera retraitée à la prochaine réunion.</>,
      ]} />
    ),
  },
  {
    id: 'tools-cost', icon: Coins, tone: 'action', roles: ['admin', 'member'],
    title: 'Outils et coûts',
    body: () => (
      <Bullets items={[
        <>Déclarez une fois vos outils dans <strong>Mes outils</strong> : BlabIA s’en sert pour conseiller chaque projet et signale ce qui manque.</>,
        <>Vos agents sont gérés dans <strong>Agents</strong> : créez un expert une fois, invitez-le dans tous vos projets.</>,
        'Le coût réel de l’IA s’affiche sur chaque projet, détaillé par réunion dans l’Historique.',
      ]} />
    ),
  },
  {
    id: 'registry', icon: ScrollText, tone: 'ok', roles: ['user'],
    title: 'Décisions et historique',
    body: () => (
      <Bullets items={[
        <><strong>Historique</strong> : toutes les réunions tenues, avec leur compte-rendu.</>,
        <><strong>Décisions</strong> : ce qui a été tranché, et pourquoi. Vous pouvez remettre une décision en question.</>,
      ]} />
    ),
  },
  {
    id: 'admin', icon: Shield, tone: 'await', roles: ['admin'],
    title: 'Administration',
    body: () => (
      <Bullets items={[
        <>Dans <strong>Administration</strong>, invitez de nouvelles personnes et gérez les comptes.</>,
        <><strong>Membre</strong> : crée et mène ses propres projets. <strong>User</strong> : collaborateur, voit seulement les projets où il est invité.</>,
        <><strong>Admin</strong> : accès à tous les projets et à l’administration.</>,
      ]} />
    ),
  },
  {
    id: 'end', icon: PartyPopper, tone: 'ok',
    title: 'À vous de jouer',
    body: kind => (
      <p className="text-sm text-ink-soft">
        {kind === 'user'
          ? 'Ouvrez un projet partagé et rejoignez sa prochaine réunion.'
          : 'Créez votre premier projet, ou reprenez un projet existant là où vous l’aviez laissé.'}
        <br /><span className="text-ink-muted">Ce guide reste accessible via le bouton <strong>Guide</strong>, en haut de chaque page.</span>
      </p>
    ),
  },
];

export default function Tutorial({ role, onClose }) {
  const navigate = useNavigate();
  const kind = roleKind(role);
  const steps = useMemo(() => STEPS.filter(s => !s.roles || s.roles.includes(kind)), [kind]);
  const [i, setI] = useState(0);
  const step = steps[i];
  const last = i === steps.length - 1;

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && !last) setI(v => v + 1);
      if (e.key === 'ArrowLeft' && i > 0) setI(v => v - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [i, last, onClose]);

  const finish = (to) => { onClose(); if (to) navigate(to); };

  return (
    <div className="fixed inset-0 bg-ink/50 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="tuto-title"
        className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Bandeau illustré */}
        <div className="relative bg-canvas px-6 pt-6 pb-5 text-center border-b border-line">
          <IconButton size="sm" label="Fermer le guide" onClick={() => onClose()} className="!absolute top-2 right-2">
            <X size={18} aria-hidden="true" />
          </IconButton>
          <span className={`w-14 h-14 rounded-2xl inline-flex items-center justify-center ${TONES[step.tone]}`}>
            <step.icon size={28} aria-hidden="true" />
          </span>
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink-faint mt-3">Étape {i + 1} sur {steps.length}</p>
          <h2 id="tuto-title" className="text-xl font-extrabold text-ink mt-0.5">{step.title}</h2>
          {step.visual && <div className="mt-4">{step.visual}</div>}
        </div>

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto px-6 py-5 text-center" aria-live="polite">
          {step.body(kind)}
        </div>

        {/* Navigation */}
        <div className="border-t border-line px-5 py-3.5 flex items-center gap-2">
          {!last && (
            <Button size="sm" variant="ghost" onClick={() => onClose()} className="text-ink-faint">Passer le guide</Button>
          )}
          <div className="flex-1 flex justify-center gap-1.5" aria-hidden="true">
            {steps.map((s, k) => (
              <button key={s.id} type="button" tabIndex={-1} onClick={() => setI(k)}
                className={`h-2 rounded-full transition-all ${k === i ? 'w-5 bg-action' : 'w-2 bg-line hover:bg-action-border'}`} />
            ))}
          </div>
          {i > 0 && (
            <IconButton size="sm" label="Étape précédente" onClick={() => setI(i - 1)}><ArrowLeft size={18} aria-hidden="true" /></IconButton>
          )}
          {!last ? (
            <Button variant="primary" onClick={() => setI(i + 1)} autoFocus>
              Suivant <ArrowRight size={16} aria-hidden="true" />
            </Button>
          ) : kind === 'user' ? (
            <Button variant="primary" onClick={() => finish('/dashboard')} autoFocus>Voir mes projets</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => finish()}>Terminer</Button>
              <Button variant="primary" onClick={() => finish('/projects/new')} autoFocus>
                <FolderPlus size={16} aria-hidden="true" /> Créer un projet
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
