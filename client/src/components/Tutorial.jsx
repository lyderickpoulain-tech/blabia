import { useEffect, useState } from 'react';
import { Sparkles, Workflow, Map as MapIcon, ArrowRight, ArrowLeft, X, Check, Play } from 'lucide-react';
import { Button, IconButton, Badge } from './ui';
import { chaptersFor, roleKind } from '../tour/chapters';

// Guide de prise en main (v5.1) : introduction courte (accueil + principe), puis
// les chapitres de la visite guidée, qui se déroule sur les vraies pages avec un
// projet exemple (tour/). Ouvert d'office à la première connexion, puis via le
// bouton « Guide » de l'en-tête (directement sur les chapitres).

const TONES = {
  action: 'bg-action-light text-action',
  ai:     'bg-ai-light text-ai',
  ok:     'bg-ok-light text-ok',
};

function Flow() {
  const items = [
    { label: 'Projet',    tone: 'action' },
    { label: 'Plan',      tone: 'action' },
    { label: 'Réunions',  tone: 'ai' },
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
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 justify-items-center">
      <Badge tone="action">Bleu · pour avancer</Badge>
      <Badge tone="await">Ambre · attend votre arbitrage</Badge>
      <Badge tone="ok">Vert · validé, décidé</Badge>
      <Badge tone="ai">Violet · produit par l'IA</Badge>
    </div>
  );
}

const SCREENS = ['welcome', 'principle', 'chapters'];

export default function Tutorial({ role, tourProgress = {}, initialScreen = 'welcome', onClose, onStart }) {
  const kind = roleKind(role);
  const [screen, setScreen] = useState(initialScreen);
  const idx = SCREENS.indexOf(screen);
  const chapters = chaptersFor(role);
  const todo = chapters.filter(c => !tourProgress?.[c.id]);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const header = {
    welcome:   { icon: Sparkles, tone: 'ai',     title: 'Bienvenue dans BlabIA' },
    principle: { icon: Workflow, tone: 'action', title: 'Le principe' },
    chapters:  { icon: MapIcon,  tone: 'ok',     title: 'Visite guidée' },
  }[screen];

  return (
    <div className="fixed inset-0 bg-ink/50 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="tuto-title"
        className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden">

        <div className="relative bg-canvas px-6 pt-6 pb-5 text-center border-b border-line">
          <IconButton size="sm" label="Fermer le guide" onClick={onClose} className="!absolute top-2 right-2">
            <X size={18} aria-hidden="true" />
          </IconButton>
          <span className={`w-14 h-14 rounded-2xl inline-flex items-center justify-center ${TONES[header.tone]}`}>
            <header.icon size={28} aria-hidden="true" />
          </span>
          <h2 id="tuto-title" className="text-xl font-extrabold text-ink mt-3">{header.title}</h2>
          {screen === 'principle' && <div className="mt-4"><Flow /></div>}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {screen === 'welcome' && (
            <div className="text-center space-y-3">
              <p className="text-sm text-ink-soft">
                BlabIA réunit une équipe d'<strong>agents IA spécialisés</strong> pour faire avancer vos projets, informatiques ou non.
                Vous lancez le sujet, ils débattent et proposent ; <strong>vous tranchez</strong>, et vous pouvez toujours les contredire.
              </p>
              <p className="text-sm text-ink-muted">
                {kind === 'admin' && 'Votre compte est administrateur : vous menez vos projets et vous gérez aussi les comptes de BlabIA.'}
                {kind === 'member' && 'Votre compte vous permet de créer vos projets et d’y inviter des collaborateurs.'}
                {kind === 'user' && 'Vous avez été invité à collaborer : vous retrouvez ici les projets partagés avec vous.'}
              </p>
            </div>
          )}

          {screen === 'principle' && (
            <div className="space-y-4">
              <ul className="space-y-1.5">
                {[
                  'Un projet décrit votre objectif : le brief et vos documents de référence, que les agents lisent avant chaque réunion.',
                  'Le plan enchaîne les réunions à tenir, dans l’ordre.',
                  'Chaque réunion fait avancer une étape ; vous tranchez les décisions qui vous reviennent.',
                  'Un contradicteur signale, seulement sur les choix à fort enjeu, ce qui mérite d’être challengé : vous en tenez compte ou l’écartez.',
                  'Les décisions sont inscrites au registre : les agents ne reposent plus la question. Une décision remise en question se met à l’ordre du jour d’une réunion, qui la remplace.',
                  'Entre deux réunions, vous menez les actions décidées, dans l’ordre (avec un rappel par e-mail chaque semaine si vous le souhaitez) ; la réunion suivante commence par un point d’avancement. Une action peut aussi être confiée à un agent ou traitée en réunion.',
                  'Pour un travail approfondi (recherche, analyse, rédaction), un agent propose une mission à un sous-agent : vous la lancez au niveau voulu (légère, standard, approfondie), le rapport rejoint les documents.',
                  'La mémoire du projet ne perd rien : les réunions et missions anciennes sont résumées dans une synthèse, que vous pouvez lire et corriger (Paramètres › Mémoire du projet).',
                  'Comptes rendus, décisions et actions s’exportent en PDF ou en Word.',
                  'Projet informatique : le prompt d’une réunion Claude Code se lance depuis BlabIA ; Claude Code travaille dans votre dépôt GitHub avec votre abonnement Claude, et vous mettez en ligne d’un clic (Projet › Développements).',
                  'Site web à créer de zéro : BlabIA crée le dépôt GitHub et prévoit les réunions dans l’ordre — définir le site, son style, puis le construire. La mise en ligne est automatique (Projet › Outils, « Mettre le site en ligne ») : d’abord à une adresse de test gratuite, puis à votre nom de domaine. Pour ajouter un service plus tard (e-mails, paiement…), tenez une réunion « Ajouter un service ». Un guide pas à pas relie ensuite tous les outils, une section par outil à déplier (ceux déjà en place sont repliés ; il indique s’il a été vérifié en ligne, avec ses sources), et une discussion sous le guide répond aux questions et aux messages d’erreur (Projet › Outils).',
                ].map(t => (
                  <li key={t} className="flex gap-2 text-sm text-ink-soft leading-snug">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-action shrink-0" aria-hidden="true" />{t}
                  </li>
                ))}
              </ul>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider text-ink-faint text-center mb-2">Une couleur, un sens</p>
                <ColorLegend />
              </div>
            </div>
          )}

          {screen === 'chapters' && (
            <div className="space-y-3">
              <p className="text-sm text-ink-soft text-center">
                La visite se déroule sur les vraies pages, avec un <strong>projet exemple</strong> : un salon de thé à Lyon.
                Les agents ne sont pas sollicités (aucun coût) et l'exemple est supprimé à la fin.
              </p>
              {kind !== 'user' && (
                <p className="text-xs text-ink-muted text-center">
                  Pour essayer ensuite avec des agents actifs : « Nouveau projet » → <strong>« Créer un projet de démo »</strong> (le même salon de thé, conservé, avec le coût habituel).
                </p>
              )}
              <ol className="space-y-1.5">
                {chapters.map((c, i) => {
                  const done = !!tourProgress?.[c.id];
                  return (
                    <li key={c.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
                      <span className={`w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-extrabold shrink-0 ${done ? 'bg-ok-light text-ok' : 'bg-muted-light text-ink-muted'}`}>
                        {done ? <Check size={14} strokeWidth={3} aria-label="Fait" /> : i + 1}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-ink">{c.label}</span>
                        <span className="block text-[11px] text-ink-faint">{c.steps.length} étapes{done ? ' · déjà vu' : ''}</span>
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => onStart(chapters.slice(i).map(x => x.id))} aria-label={`Lancer la visite à partir du chapitre ${c.label}`}>
                        <Play size={14} aria-hidden="true" /> {done ? 'Revoir' : 'Lancer'}
                      </Button>
                    </li>
                  );
                })}
              </ol>
              {isMobile && (
                <p className="text-xs text-await bg-await-bg border border-await-border rounded-[10px] px-3 py-2">
                  Sur téléphone, la visite fonctionne mais s'apprécie mieux sur un écran plus large.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-line px-5 py-3.5 flex items-center gap-2">
          {screen === 'chapters' ? (
            <Button size="sm" variant="ghost" onClick={() => setScreen('welcome')} className="text-ink-faint">Revoir l'introduction</Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={onClose} className="text-ink-faint">Plus tard</Button>
          )}
          <div className="flex-1 flex justify-center gap-1.5" aria-hidden="true">
            {SCREENS.map((s, k) => <span key={s} className={`h-2 rounded-full ${k === idx ? 'w-5 bg-action' : 'w-2 bg-line'}`} />)}
          </div>
          {idx > 0 && screen !== 'chapters' && (
            <IconButton size="sm" label="Écran précédent" onClick={() => setScreen(SCREENS[idx - 1])}><ArrowLeft size={18} aria-hidden="true" /></IconButton>
          )}
          {screen !== 'chapters' ? (
            <Button variant="primary" onClick={() => setScreen(SCREENS[idx + 1])} autoFocus>
              Suivant <ArrowRight size={16} aria-hidden="true" />
            </Button>
          ) : (
            <Button variant="primary" onClick={() => onStart((todo.length ? todo : chapters).map(c => c.id))} autoFocus>
              <Play size={16} aria-hidden="true" /> {todo.length === chapters.length ? 'Commencer la visite' : todo.length ? 'Continuer la visite' : 'Tout revoir'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
