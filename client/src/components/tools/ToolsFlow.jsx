import { Fragment } from 'react';
import { ArrowRight, ArrowDown, User, Rocket } from 'lucide-react';
import { ToolCategoryIcon } from '../ui/icons';

// Les outils du projet racontés en deux parcours (remplace l'ancienne carte en toile) :
// ce qui se passe quand un visiteur ouvre le site, et quand une modification est mise en
// ligne. Chaque étape montre l'outil retenu — ou « à choisir » si le projet en a besoin.
// Une étape sans outil et sans besoin n'est pas affichée.

const VISIT = [
  { id: 'domain',   say: 'Le visiteur tape l’adresse du site' },
  { id: 'hosting',  say: 'L’hébergeur répond : c’est là que le site tourne' },
  { id: 'frontend', say: 'Les pages s’affichent dans son navigateur' },
  { id: 'backend',  say: 'Le serveur applique les règles et prépare les réponses' },
];
// Ce sur quoi le serveur s'appuie, au besoin
const SERVICES = ['database', 'auth', 'ai', 'messaging', 'payment', 'storage'];
const DELIVERY = [
  { id: 'devtools', say: 'Le code est écrit (Claude Code, depuis BlabIA)' },
  { id: 'git',      say: 'Il est rangé sur GitHub, avec tout l’historique' },
  { id: 'hosting',  say: 'L’hébergeur publie la nouvelle version' },
];
// Autour du site, sans être sur le chemin d'une visite
const AROUND = ['analytics', 'monitoring', 'nocode', 'organization'];

function ToolChips({ list, needed }) {
  if (!list.length) {
    return needed
      ? <span className="text-xs font-bold text-await">à choisir</span>
      : <span className="text-xs text-ink-faint">aucun</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {list.map(t => (
        <span key={t.id || t.name} title={t.status === 'suggested' ? 'Proposé, pas encore validé' : undefined}
          className={`text-xs font-bold rounded-full px-2 py-0.5 ${t.status === 'suggested' ? 'border border-dashed border-action-border text-action' : 'bg-action-light text-action'}`}>
          {t.name}
        </span>
      ))}
    </span>
  );
}

function Step({ cat, say, list, needed }) {
  return (
    <div className={`flex-1 min-w-[150px] rounded-xl border p-3 ${list.length ? 'border-line bg-white' : needed ? 'border-await-border bg-await-bg' : 'border-dashed border-line bg-canvas'}`}>
      <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-ink">
        <ToolCategoryIcon id={cat.id} size={15} className="shrink-0 text-ink-soft" /> {cat.label}
      </p>
      <p className="text-xs text-ink-muted mt-1 leading-snug">{say}</p>
      <div className="mt-2"><ToolChips list={list} needed={needed} /></div>
    </div>
  );
}

function Chain({ title, icon: Icon, steps }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-ink-muted mb-2">
        <Icon size={14} aria-hidden="true" /> {title}
      </p>
      <ol className="flex flex-col sm:flex-row sm:items-stretch gap-1.5">
        {steps.map((s, i) => (
          <Fragment key={s.cat.id + i}>
            {i > 0 && (
              <li aria-hidden="true" className="flex items-center justify-center text-ink-faint shrink-0">
                <ArrowRight size={16} className="hidden sm:block" /><ArrowDown size={16} className="sm:hidden" />
              </li>
            )}
            <li className="flex flex-1 min-w-0"><Step {...s} /></li>
          </Fragment>
        ))}
      </ol>
    </div>
  );
}

// catalog : { categories } ; tools : outils du projet ; needByCat : besoins identifiés par catégorie
export default function ToolsFlow({ catalog, tools, needByCat = {} }) {
  const catById = Object.fromEntries((catalog?.categories || []).map(c => [c.id, c]));
  const kept = (tools || []).filter(t => t.status !== 'refused');
  const listOf = id => kept.filter(t => t.category === id);
  const isNeeded = id => !!needByCat[id];
  const shown = id => catById[id] && (listOf(id).length > 0 || isNeeded(id));
  const stepsOf = chain => chain.filter(s => shown(s.id)).map(s => ({ cat: catById[s.id], say: s.say, list: listOf(s.id), needed: isNeeded(s.id) }));

  const visit = stepsOf(VISIT);
  const delivery = stepsOf(DELIVERY);
  const services = SERVICES.filter(shown);
  const around = AROUND.filter(shown);
  if (!visit.length && !delivery.length && !services.length && !around.length) return null;

  return (
    <section className="rounded-2xl border border-line bg-canvas p-4 space-y-4" aria-label="Comment les outils fonctionnent ensemble">
      {visit.length > 0 && <Chain title="Quand un visiteur ouvre le site" icon={User} steps={visit} />}

      {services.length > 0 && (
        <div>
          <p className="text-xs font-bold text-ink-muted mb-1.5">{shown('backend') ? 'Le serveur s’appuie au besoin sur :' : 'Le site s’appuie au besoin sur :'}</p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {services.map(id => (
              <li key={id} className={`rounded-xl border px-3 py-2 flex flex-wrap items-center gap-x-2 gap-y-1 ${listOf(id).length ? 'border-line bg-white' : 'border-await-border bg-await-bg'}`}>
                <span className="flex items-center gap-1.5 text-xs font-extrabold text-ink"><ToolCategoryIcon id={id} size={14} className="shrink-0 text-ink-soft" /> {catById[id].label}</span>
                <ToolChips list={listOf(id)} needed={isNeeded(id)} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {delivery.length > 0 && <Chain title="Quand vous mettez en ligne une modification" icon={Rocket} steps={delivery} />}

      {around.length > 0 && (
        <p className="text-xs text-ink-muted flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-bold">Autour du site :</span>
          {around.map(id => (
            <span key={id} className="inline-flex items-center gap-1">
              <ToolCategoryIcon id={id} size={13} className="text-ink-faint" /> {catById[id].label} : <ToolChips list={listOf(id)} needed={isNeeded(id)} />
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
