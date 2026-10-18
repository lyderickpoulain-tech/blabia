import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const [showDetails, setShowDetails] = useState(false); // tout le détail, replié (test « Gérard »)
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const header = {
    welcome:   { icon: Sparkles, tone: 'ai',     title: 'Bienvenue dans BlabIA' },
    principle: { icon: Workflow, tone: 'action', title: 'Comment ça marche' },
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
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {screen === 'welcome' && (
            <div className="text-center space-y-3">
              <p className="text-[15px] text-ink-soft">
                BlabIA vous aide à mener vos projets de l’idée à la réalisation : un site, un commerce, un événement, une association…
                <strong> Pas besoin de vous y connaître</strong> : une équipe d’assistants vous accompagne, et vous gardez toujours le dernier mot.
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
              {/* La promesse, en quatre temps (v5.1, test « Gérard ») ; tout le détail est replié */}
              <ol className="space-y-3">
                {[
                  ['Vous décrivez votre projet', 'Avec vos mots, comme à quelqu’un de confiance.'],
                  ['Une équipe d’assistants en discute avec vous, en réunions courtes', 'Ils proposent des idées concrètes et vous posent seulement les questions qui comptent.'],
                  ['Vous décidez', 'D’un clic, sur ce qu’on vous montre : vous dites ce qui vous plaît et ce qui ne vous plaît pas.'],
                  ['BlabIA fait le reste', 'Construire votre site, rédiger vos documents, faire les recherches, suivre ce qui reste à faire. Votre bras droit vous prévient quand il a du nouveau.'],
                ].map(([t, d], i) => (
                  <li key={t} className="flex gap-3">
                    <span className="w-8 h-8 rounded-full bg-action-light text-action text-sm font-extrabold inline-flex items-center justify-center shrink-0" aria-hidden="true">{i + 1}</span>
                    <span><span className="block text-[15px] font-extrabold text-ink">{t}</span><span className="block text-sm text-ink-muted">{d}</span></span>
                  </li>
                ))}
              </ol>
              <button type="button" onClick={() => setShowDetails(v => !v)} aria-expanded={showDetails}
                className="w-full min-h-[40px] text-sm font-bold text-action hover:underline">{showDetails ? 'Masquer le détail' : 'Tout savoir sur BlabIA'}</button>
              {showDetails && (<>
              <ul className="space-y-1.5">
                {[
                  'Un projet décrit votre objectif : le brief et vos documents de référence, que les assistants lisent avant chaque réunion.',
                  'Le plan enchaîne les réunions à tenir, dans l’ordre.',
                  'Chaque réunion fait avancer une étape ; vous tranchez les décisions qui vous reviennent.',
                  'Un contradicteur signale, seulement sur les choix à fort enjeu, ce qui mérite d’être challengé : vous en tenez compte ou l’écartez.',
                  'Les décisions sont inscrites au registre : les assistants ne reposent plus la question. Une décision remise en question se met à l’ordre du jour d’une réunion, qui la remplace.',
                  'Entre deux réunions, vous menez les actions décidées, dans l’ordre (avec un rappel par e-mail chaque semaine si vous le souhaitez) ; la réunion suivante commence par un point d’avancement. Une action peut aussi être confiée à un assistant ou traitée en réunion.',
                  'Pour un travail approfondi (recherche, analyse, rédaction), un assistant propose une mission à un assistant dédié : vous la lancez au niveau voulu (légère, standard, approfondie) et la réunion est reportée — une réunion « Reprendre : … » s’ajoute au plan et se tiendra avec le rapport. Rapport prêt : vous choisissez « Intégrer le CR au projet » (les assistants s’en serviront, l’action est cochée) ou « Ne pas intégrer » ; la mission disparaît ensuite de la liste.',
                  'Une réunion peut être préparée par les assistants sans vous : vous retournez à vos projets, et « Réunion préparée » s’affiche sur le projet quand leurs conclusions et les décisions qui vous reviennent sont prêtes. Une fois la réunion conclue, vous revenez au tableau de bord du projet.',
                  'La mémoire du projet ne perd rien : les réunions et missions anciennes sont résumées dans une synthèse, que vous pouvez lire et corriger (Paramètres › Mémoire du projet).',
                  'Au démarrage d’une réunion, BlabIA présélectionne le modèle (Sonnet ou Opus) et la recherche web selon son objectif, avec la mention « Recommandé » ; vous pouvez changer.',
                  'Toutes les réunions du plan tenues : « Faire le récapitulatif » rédige un bilan bref de tout le projet — le résultat obtenu et, point par point, la réponse aux objectifs de départ.',
                  'En réunion, l’animation cadre les échanges aux moments clés et fait le point à la demande (« Où en est-on ? ») ; le relevé en direct montre ce qui est acquis. Votre avis sur une bulle (bien vu, à côté de la plaque, trop technique, trop long) apprend aux assistants votre façon de travailler.',
                  'Tout ce qui attend votre réponse — questions des assistants de toutes les réunions, notes du bras droit, comptes rendus de mission, décisions remises en question — est dans « À trancher » : vous y répondez directement.',
                  'Entre les réunions, votre bras droit (le bouton « Votre bras droit », en bas à droite de chaque page) est votre interlocuteur en tête-à-tête : il connaît tout le projet, cite ses sources (« qu’avait-on décidé sur le prix ? »), vous propose la prochaine réunion et ne modifie rien sans vous. Vous pouvez lui confier une réunion : il la tient à votre place, dans le cadre que vous fixez (ce qu’il peut trancher, ce qui vous est réservé), puis vous rend une note de retour — ses décisions se contestent d’un clic. Pendant qu’il la tient, vous pouvez suivre en retrait (vue salle : une vignette par participant), lui glisser un mot ou reprendre la main ; la vue salle s’active aussi dans n’importe quelle réunion. Dites-lui « occupe-toi de la prochaine réunion » : il la tient aussitôt, dans votre cadre habituel (il tranche les détails, vous garde le budget et les choix structurants), et revient vers vous. Vous voulez tenir une réunion avant une autre ? Il propose de changer l’ordre du plan, d’un clic. Il suit aussi les réunions en cours et parle à votre niveau. Votre projet change en cours de route (« et si je vendais mes vinyles sur mon site ? », « je vais créer une appli ») ? Dites-le au bras droit : il explique ce que ça change et ce que ça coûte, puis propose la mise à jour (brief, réunions ajoutées au bon endroit du plan) ; rien ne bouge avant votre « D’accord ». Pour une question ponctuelle, la zone « Demander à BlabIA » du tableau de bord suffit.',
                  'Comptes rendus, décisions et actions s’exportent en PDF ou en Word ; un compte rendu se décline aussi en relevé de décisions, synthèse exécutive ou procès-verbal.',
                  'Projet informatique : le prompt d’une réunion Claude Code se lance depuis BlabIA ; Claude Code travaille dans votre dépôt GitHub avec votre abonnement Claude, et vous mettez en ligne d’un clic (Projet › Développements). Devant l’aperçu ou le site en ligne, « Donner votre avis » : ce qui vous plaît, ce qui ne vous plaît pas, ce que vous voudriez changer — Claude Code refait l’aperçu ou fait les retouches, ou vos remarques sont simplement notées pour les prochaines réunions.',
                  'Ce que fait l’IA, et ce qu’elle ne fait pas : les assistants sont des intelligences artificielles (Claude, d’Anthropic). Ils proposent, discutent, rédigent et construisent ; ils ne décident rien à votre place hors du cadre que vous fixez, ne dépensent rien et ne publient rien sans votre accord. Ils peuvent se tromper (un prix, un nom, un fait) : ce qui n’est pas vérifié est signalé « à confirmer ». Après la première réunion, BlabIA vous dit ce qu’il a compris de votre projet (« Votre vision ») : vous corrigez, vous validez, et c’est la référence de toutes les réunions.',
                  'Vous n’y connaissez rien ? Dites-le (« Je n’y connais rien », à la création ou dans les Paramètres du projet) : les assistants règlent la technique entre eux et ne vous parlent que de ce qui vous concerne — ce que ça change pour vous, ce que ça coûte par mois, ce que vous aurez à faire. Pour les outils d’un site, BlabIA vous propose les siens d’un clic, avec leur coût ; vous ne choisissez que le nom de votre adresse.',
                  'Une réunion ne s’arrête plus sans rien dire : une barre vous indique toujours la suite (une question vous attend, vos réponses sont prêtes, prête à conclure, ou à vous). Une réponse donnée dans « À trancher » relance la réunion : si votre bras droit la tenait, il la termine avec votre réponse et revient vers vous.',
                  'Qui paie l’IA ? BlabIA, par défaut. Si vous avez un compte développeur Anthropic (Claude Console), renseignez votre clé API dans Mon profil : l’IA de vos projets est facturée sur votre compte, au prix coûtant, et BlabIA prend le relais si elle ne fonctionne plus (crédit épuisé, clé révoquée). Votre abonnement Claude (Pro, Max) ne peut pas servir ici : Anthropic le réserve à Claude.ai et Claude Code.',
                  'Réagir plutôt que décrire : en réunion, le bouton « Illustrer » propose aussi « Comparer 3 maquettes » (trois versions nettement différentes de la même page) ; sous une question de style, « Voir ces choix en maquettes ». Vous répondez « Celle-ci », « Pas celle-là » (en disant pourquoi) ou « Mélanger » ; les assistants attendent votre réaction.',
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
              </>)}
            </div>
          )}

          {screen === 'chapters' && (
            <div className="space-y-3">
              {kind !== 'user' && (
                <div className="rounded-xl border border-action-border bg-action-light/40 p-4 text-center space-y-2">
                  <p className="text-[15px] font-bold text-ink">Le plus simple : commencer par votre projet.</p>
                  <Button variant="primary" onClick={() => { onClose(); navigate('/projects/new'); }}>Créer mon projet</Button>
                </div>
              )}
              <p className="text-sm text-ink-soft text-center">
                Ou faites la <strong>visite guidée</strong>, sur un projet exemple (un salon de thé à Lyon) : sans coût, l’exemple est supprimé à la fin.
              </p>
              {kind !== 'user' && (
                <p className="text-xs text-ink-muted text-center">
                  Pour essayer ensuite avec des assistants actifs : « Nouveau projet » → <strong>« Créer un projet de démo »</strong> (le même salon de thé, conservé, avec le coût habituel).
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
            <Button variant={kind === 'user' ? 'primary' : 'secondary'} onClick={() => onStart((todo.length ? todo : chapters).map(c => c.id))} autoFocus>
              <Play size={16} aria-hidden="true" /> {todo.length === chapters.length ? 'Commencer la visite' : todo.length ? 'Continuer la visite' : 'Tout revoir'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
