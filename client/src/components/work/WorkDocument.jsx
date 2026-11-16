import { useState } from 'react';
import { MessageSquarePlus, Trash2, TriangleAlert } from 'lucide-react';
import Markdown from '../Markdown';
import ArtifactCard from '../meeting/ArtifactCard';
import { Button, Card } from '../ui';

// v6 : la version du projet, partie par partie (« ## Titre »), chacune commentable.
// « (à vérifier) » devient une pastille ; les blocs svg / html / mermaid s'affichent dans
// l'iframe isolée habituelle (ArtifactCard, mêmes règles de sécurité).

const VERIFY = '#a-verifier';
export const markVerify = md => String(md || '').replace(/\(\s*à vérifier\s*\)/gi, `[à vérifier](${VERIFY})`);
export const countVerify = md => (String(md || '').match(/\(\s*à vérifier\s*\)/gi) || []).length;

export function splitSections(markdown) {
  const parts = [];
  let current = { title: null, lines: [] };
  for (const line of String(markdown || '').split(/\r?\n/)) {
    const m = line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (m) {
      if (current.title || current.lines.join('').trim()) parts.push(current);
      current = { title: m[1], lines: [] };
    } else current.lines.push(line);
  }
  if (current.title || current.lines.join('').trim()) parts.push(current);
  return parts.map(p => ({ title: p.title, body: p.lines.join('\n').trim() }));
}

function VerifyLink({ href, children }) {
  if (href === VERIFY) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-await-light text-await text-[11px] font-extrabold px-2 py-0.5 align-middle"
        title="Ce point n’a pas pu être vérifié : il reste dans votre projet, à vérifier avant de vous en servir.">
        <TriangleAlert size={11} aria-hidden="true" /> {children}
      </span>
    );
  }
  return <a href={href} target="_blank" rel="noopener noreferrer" className="text-action underline break-words">{children}</a>;
}

const DRAWING_KINDS = { svg: 'svg', html: 'html', mermaid: 'mermaid' };
function Drawing({ node, children }) {
  const code = node?.children?.[0];
  const lang = String(code?.properties?.className?.[0] || '').replace('language-', '');
  const text = code?.children?.map(c => c.value || '').join('') || '';
  if (DRAWING_KINDS[lang]) {
    return <div className="my-3"><ArtifactCard artifact={{ kind: DRAWING_KINDS[lang], title: 'Illustration', code: text }} hideCode /></div>;
  }
  return <pre className="bg-canvas border border-line rounded-xl p-3 overflow-x-auto text-sm whitespace-pre-wrap my-3">{text || children}</pre>;
}

const COMPONENTS = { a: VerifyLink, pre: Drawing };

function CommentBox({ onSave, onCancel }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-3 space-y-2">
      <label className="sr-only" htmlFor="work-comment">Votre remarque</label>
      <textarea id="work-comment" value={text} onChange={e => setText(e.target.value)} rows={3} autoFocus
        placeholder="Ce que vous voulez changer ici, avec vos mots."
        className="w-full px-3 py-2 border border-line rounded-[10px] text-sm text-ink bg-white outline-none focus:ring-2 focus:ring-action" />
      <div className="flex gap-2">
        <Button size="sm" variant="primary" disabled={!text.trim() || busy}
          onClick={async () => { setBusy(true); try { await onSave(text.trim()); } finally { setBusy(false); } }}>
          Enregistrer ma remarque
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Annuler</Button>
      </div>
    </div>
  );
}

export default function WorkDocument({ content, comments = [], onComment, onDeleteComment, readOnly = false }) {
  const [open, setOpen] = useState(null); // titre de la partie en cours de commentaire
  const sections = splitSections(content);
  return (
    <div className="space-y-4">
      {sections.map((s, i) => {
        const key = s.title || `intro-${i}`;
        const mine = comments.filter(c => c.status === 'open' && (c.section || null) === (s.title || null));
        return (
          <Card key={key} as="section" className="p-5 sm:p-6" aria-label={s.title || 'Introduction'}>
            {s.title && <h2 className="text-lg font-extrabold text-ink mb-3">{s.title}</h2>}
            <Markdown components={COMPONENTS}>{markVerify(s.body)}</Markdown>
            {mine.map(c => (
              <div key={c.id} className="mt-3 rounded-xl bg-action-light/60 border border-action/20 px-3 py-2 text-sm text-ink flex items-start gap-2">
                <p className="flex-1"><span className="font-bold">Votre remarque :</span> {c.content}<span className="block text-xs text-ink-muted mt-0.5">Elle sera prise en compte dans la prochaine version.</span></p>
                {onDeleteComment && (
                  <button type="button" onClick={() => onDeleteComment(c.id)} className="text-ink-muted hover:text-red-700 p-1" aria-label="Retirer cette remarque" title="Retirer cette remarque">
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
            {!readOnly && onComment && (open === key ? (
              <CommentBox onCancel={() => setOpen(null)} onSave={async text => { await onComment(s.title, text); setOpen(null); }} />
            ) : (
              <button type="button" onClick={() => setOpen(key)}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-action hover:underline">
                <MessageSquarePlus size={15} aria-hidden="true" /> Commenter cette partie
              </button>
            ))}
          </Card>
        );
      })}
    </div>
  );
}
