import { useState } from 'react';
import { Maximize2, ThumbsUp, ThumbsDown, Shuffle } from 'lucide-react';

// Trois maquettes à comparer (v5.1, étape B du test « Gérard ») : on réagit à ce qu'on voit
// plutôt que de décrire ce qu'on veut. « Celle-ci » part aussitôt aux agents ; « Pas celle-là »
// et « Mélanger » ouvrent la saisie pour dire pourquoi, avec vos mots.
// Aperçus sans script (sandbox="") : les maquettes de comparaison n'en ont pas besoin.

function wrap(html) {
  return /<html[\s>]/i.test(html) ? html : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${html}</body></html>`;
}

export default function ArtifactCompare({ message, disabled, openKey, onOpen, onChoose, onPrefill }) {
  const [chosen, setChosen] = useState(null);
  const items = message.artifacts;
  const choose = a => { setChosen(a.title); onChoose(`Je préfère la proposition « ${a.title} ».`); };
  return (
    <div className="mt-2 space-y-2">
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((a, i) => {
          const key = `${message.id}:${i}`;
          return (
            <figure key={key} className={`m-0 rounded-xl border bg-white overflow-hidden flex flex-col ${chosen === a.title ? 'border-ok ring-2 ring-ok-border' : openKey === key ? 'border-ai' : 'border-line'}`}>
              <div className="relative h-56 bg-canvas overflow-hidden">
                <iframe title={a.title} srcDoc={wrap(a.code)} sandbox="" referrerPolicy="no-referrer" tabIndex={-1}
                  className="absolute top-0 left-0 w-[200%] h-[200%] origin-top-left scale-50 border-0 pointer-events-none" />
              </div>
              <figcaption className="p-2.5 space-y-2 border-t border-line">
                <p className="text-[13px] font-extrabold text-ink">{a.title}</p>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" disabled={disabled} onClick={() => choose(a)}
                    className="h-9 px-2.5 rounded-lg bg-action text-white text-[13px] font-bold inline-flex items-center gap-1.5 disabled:opacity-40">
                    <ThumbsUp size={14} aria-hidden="true" /> Celle-ci
                  </button>
                  <button type="button" disabled={disabled} onClick={() => onPrefill(`La proposition « ${a.title} » ne me plaît pas : `)}
                    className="h-9 px-2.5 rounded-lg border border-line text-[13px] font-bold text-ink-soft inline-flex items-center gap-1.5 hover:border-await-border hover:text-await disabled:opacity-40">
                    <ThumbsDown size={14} aria-hidden="true" /> Pas celle-là
                  </button>
                  <button type="button" onClick={() => onOpen(key)} aria-label={`Agrandir « ${a.title} »`} title="Agrandir"
                    className="h-9 w-9 rounded-lg text-ink-muted hover:bg-muted-light inline-flex items-center justify-center ml-auto">
                    <Maximize2 size={15} aria-hidden="true" />
                  </button>
                </div>
              </figcaption>
            </figure>
          );
        })}
      </div>
      <button type="button" disabled={disabled}
        onClick={() => onPrefill(`J’aimerais un mélange : de « ${items[0].title} » je garde … et de « ${items[1].title} » je garde …`)}
        className="h-9 px-3 rounded-lg border border-ai-border bg-ai-bg text-[13px] font-bold text-ai inline-flex items-center gap-1.5 hover:bg-ai-light disabled:opacity-40">
        <Shuffle size={14} aria-hidden="true" /> Mélanger deux propositions
      </button>
    </div>
  );
}
