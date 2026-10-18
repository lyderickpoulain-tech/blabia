import { useEffect, useRef, useState } from 'react';
import { Upload, FileText, Trash2, Eye, X } from 'lucide-react';
import api from '../../utils/api';
import { useProject, PageHeader } from '../../components/project/ProjectShell';
import { Button, IconButton, Card } from '../../components/ui';

// Documents de référence du projet (v5.1) : texte extrait au dépôt (sans IA),
// lu par les assistants à chaque réunion quand « Lu en réunion » est activé.

const ACCEPT = '.pdf,.docx,.xlsx,.csv,.txt,.md';
const PROMPT_BUDGET = 40_000; // services/documents.js (PROMPT_TOTAL_CHARS)
const fmtSize = b => b >= 1_000_000 ? `${(b / 1_000_000).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(b / 1000))} Ko`;
const fmtNum = n => n.toLocaleString('fr-FR');

function Switch({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} title={label} onClick={() => onChange(!checked)}
      className={`relative inline-flex w-11 h-6 shrink-0 rounded-full transition-colors ${checked ? 'bg-action' : 'bg-line'}`}>
      <span className={`inline-block w-4 h-4 mt-1 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function PreviewModal({ projectId, doc, onClose }) {
  const [content, setContent] = useState(null);
  useEffect(() => {
    api.get(`/projects/${projectId}/documents/${doc.id}`).then(({ data }) => setContent(data.content)).catch(() => setContent(''));
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [projectId, doc.id, onClose]);
  return (
    <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-label={doc.name} className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[88vh] flex flex-col">
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-line">
          <FileText size={18} className="text-action shrink-0" aria-hidden="true" />
          <h2 className="flex-1 min-w-0 text-base font-extrabold text-ink truncate">{doc.name}</h2>
          <IconButton size="sm" label="Fermer" onClick={onClose}><X size={18} aria-hidden="true" /></IconButton>
        </div>
        <p className="px-5 py-2 text-xs text-ink-muted bg-canvas border-b border-line">Texte extrait du fichier : c'est ce que les assistants lisent.</p>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {content === null
            ? <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-action border-t-transparent rounded-full animate-spin" /></div>
            : <pre className="whitespace-pre-wrap font-sans text-sm text-ink-soft leading-relaxed">{content}</pre>}
        </div>
      </div>
    </div>
  );
}

export default function ProjectDocuments() {
  const { project } = useProject();
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);

  const load = () => api.get(`/projects/${project.id}/documents`)
    .then(({ data }) => setDocs(data))
    .catch(() => setError('Impossible de charger les documents.'));
  useEffect(() => { load(); }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadFiles = async files => {
    setError('');
    setUploading(true);
    for (const file of files) {
      const form = new FormData();
      form.append('file', file);
      try {
        const { data } = await api.post(`/projects/${project.id}/documents`, form);
        if (data.truncated) setError(`« ${file.name} » est très long : seul le début a été conservé.`);
      } catch (err) {
        setError(`« ${file.name} » : ${err.response?.data?.error || 'dépôt impossible.'}`);
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    load();
  };

  const patch = async (doc, body) => {
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, ...body } : d)); // affichage immédiat
    try { await api.patch(`/projects/${project.id}/documents/${doc.id}`, body); } catch { setError('Modification impossible.'); load(); }
  };
  const remove = async doc => {
    if (!confirm(`Supprimer « ${doc.name} » ? Les assistants ne le liront plus.`)) return;
    try { await api.delete(`/projects/${project.id}/documents/${doc.id}`); load(); } catch { setError('Suppression impossible.'); }
  };

  const activeChars = (docs || []).filter(d => d.enabled).reduce((t, d) => t + d.charCount, 0);

  return (
    <>
      <PageHeader title="Documents" subtitle="Vos documents de référence (cahier des charges, devis, étude, règlement…) : les assistants les lisent à chaque réunion et les citent." />

      <div className="space-y-5">
        <div data-tour="docs-drop"
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) uploadFiles([...e.dataTransfer.files]); }}
          className={`rounded-2xl border-2 border-dashed px-5 py-6 text-center transition ${dragging ? 'border-action bg-action-light' : 'border-line bg-white'}`}>
          <Upload size={24} className="mx-auto text-action mb-2" aria-hidden="true" />
          <p className="text-sm font-bold text-ink">Déposez un fichier ici, ou</p>
          <Button variant="primary" size="sm" className="mt-2" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? 'Lecture du fichier…' : 'Choisir un fichier'}
          </Button>
          <input ref={fileRef} type="file" accept={ACCEPT} multiple className="hidden" aria-label="Choisir un fichier"
            onChange={e => e.target.files.length && uploadFiles([...e.target.files])} />
          <p className="text-xs text-ink-faint mt-2">PDF, Word, Excel, CSV, texte · 20 Mo et 10 documents au maximum · les PDF scannés (images) ne sont pas lisibles</p>
        </div>

        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

        {docs === null && !error && (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-action border-t-transparent rounded-full animate-spin" /></div>
        )}

        {docs?.length > 0 && (
          <section data-tour="docs-list" className="space-y-2">
            <p className="text-xs text-ink-muted">
              Lu en réunion : {fmtNum(activeChars)} caractères
              {activeChars > PROMPT_BUDGET && <span className="text-await font-bold"> · au-delà de {fmtNum(PROMPT_BUDGET)}, les assistants lisent le début de chaque document</span>}
            </p>
            {docs.map(d => (
              <Card key={d.id} className={`p-3.5 flex items-start gap-3 ${d.enabled ? '' : 'opacity-70'}`}>
                <span className={`w-9 h-9 rounded-lg inline-flex items-center justify-center shrink-0 ${d.enabled ? 'bg-action-light text-action' : 'bg-muted-light text-ink-muted'}`}>
                  <FileText size={18} aria-hidden="true" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-extrabold text-ink truncate">{d.name}</p>
                  <p className="text-[11px] text-ink-faint">
                    {fmtSize(d.sizeBytes)} · {fmtNum(d.charCount)} caractères · ajouté le {new Date(d.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </p>
                  {d.excerpt && <p className="text-xs text-ink-muted mt-1 line-clamp-2">{d.excerpt}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="hidden sm:inline text-xs font-semibold text-ink-muted mr-1">Lu en réunion</span>
                  <Switch checked={d.enabled} onChange={v => patch(d, { enabled: v })} label="Lu en réunion" />
                  <IconButton size="sm" label="Aperçu du texte" onClick={() => setPreview(d)}><Eye size={16} aria-hidden="true" /></IconButton>
                  <IconButton size="sm" label="Supprimer" className="hover:!text-red-600" onClick={() => remove(d)}><Trash2 size={15} aria-hidden="true" /></IconButton>
                </div>
              </Card>
            ))}
          </section>
        )}

        {docs?.length === 0 && (
          <p className="text-sm text-ink-faint text-center">Aucun document pour l'instant.</p>
        )}
      </div>

      {preview && <PreviewModal projectId={project.id} doc={preview} onClose={() => setPreview(null)} />}
    </>
  );
}
