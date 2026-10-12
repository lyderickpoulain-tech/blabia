import { useEffect, useState } from 'react';
import { Palette, TriangleAlert, Maximize2, Code2, Download, Check, X } from 'lucide-react';

// v5.0 phase 5 : illustration produite par un agent, à la demande de l'humain.
// artifact : { kind: 'mermaid' | 'html' | 'svg', title, code }
// Tout aperçu est isolé dans une iframe sandboxée (srcdoc) :
// - html : sandbox="allow-scripts" SANS allow-same-origin (pas d'accès à BlabIA) ;
// - svg / schéma mermaid (rendu en SVG, securityLevel strict) : sandbox="" (aucun script).

const KIND_LABEL = { mermaid: 'Schéma', html: 'Maquette', svg: 'Visuel' };

let mermaidPromise = null;
function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default', fontFamily: 'inherit' });
      return mermaid;
    });
  }
  return mermaidPromise;
}

let renderSeq = 0;

function wrapSvgDocument(svg) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#fff}body{display:flex;align-items:center;justify-content:center}svg{max-width:100%;max-height:100%;height:auto}</style></head><body>${svg}</body></html>`;
}

function wrapHtmlDocument(html) {
  return /<html[\s>]/i.test(html) ? html : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${html}</body></html>`;
}

function slug(s) {
  return (s || 'illustration').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'illustration';
}

function useArtifactDocument(artifact) {
  const [state, setState] = useState({ doc: null, svg: null, error: '' });
  useEffect(() => {
    let cancelled = false;
    if (artifact.kind === 'html') {
      setState({ doc: wrapHtmlDocument(artifact.code), svg: null, error: '' });
    } else if (artifact.kind === 'svg') {
      setState({ doc: wrapSvgDocument(artifact.code), svg: artifact.code, error: '' });
    } else {
      loadMermaid()
        .then(m => m.render(`blabia-art-${++renderSeq}`, artifact.code))
        .then(({ svg }) => { if (!cancelled) setState({ doc: wrapSvgDocument(svg), svg, error: '' }); })
        .catch(() => { if (!cancelled) setState({ doc: null, svg: null, error: 'Le schéma n\'a pas pu être dessiné (syntaxe invalide). Le code reste consultable.' }); });
    }
    return () => { cancelled = true; };
  }, [artifact.kind, artifact.code]);
  return state;
}

function Frame({ artifact, doc, className }) {
  return (
    <iframe
      title={artifact.title}
      srcDoc={doc}
      sandbox={artifact.kind === 'html' ? 'allow-scripts' : ''}
      referrerPolicy="no-referrer"
      className={className}
    />
  );
}

export default function ArtifactCard({ artifact, tall = false }) {
  const { doc, svg, error } = useArtifactDocument(artifact);
  const [showCode, setShowCode]     = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [copied, setCopied]         = useState(false);

  const download = () => {
    const isMermaidSvg = artifact.kind === 'mermaid' && svg;
    const content  = artifact.kind === 'html' ? wrapHtmlDocument(artifact.code) : isMermaidSvg ? svg : artifact.code;
    const ext      = artifact.kind === 'html' ? 'html' : (artifact.kind === 'svg' || isMermaidSvg) ? 'svg' : 'mmd';
    const type     = ext === 'html' ? 'text/html' : ext === 'svg' ? 'image/svg+xml' : 'text/plain';
    const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug(artifact.title)}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(artifact.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className={`border border-line rounded-xl bg-white overflow-hidden max-w-full ${tall ? "" : "mt-2"}`}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50">
        <Palette size={16} strokeWidth={1.75} className="text-ai shrink-0" aria-hidden="true" />
        <span className="text-sm font-medium text-gray-800 flex-1 truncate">{artifact.title}</span>
        <span className="text-[10px] text-gray-400 shrink-0">{KIND_LABEL[artifact.kind]}</span>
      </div>

      {error ? (
        <p className="text-xs text-amber-800 bg-amber-50 px-3 py-2 flex items-start gap-1.5"><TriangleAlert size={14} className="shrink-0 mt-px" aria-hidden="true" /> {error}</p>
      ) : doc ? (
        <Frame artifact={artifact} doc={doc} className={`w-full bg-white block ${tall ? "h-[calc(100vh-230px)] min-h-[300px]" : "h-72"}`} />
      ) : (
        <div className="h-72 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-blabia-blue border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      <div className="flex flex-wrap gap-3 px-3 py-2 border-t border-gray-100 text-xs">
        {doc && <button onClick={() => setFullscreen(true)} className="text-blabia-blue hover:underline inline-flex items-center gap-1"><Maximize2 size={13} aria-hidden="true" /> Plein écran</button>}
        <button onClick={() => setShowCode(s => !s)} className="text-gray-600 hover:underline"><span className="inline-flex items-center gap-1"><Code2 size={13} aria-hidden="true" /> {showCode ? 'Masquer le code' : 'Voir le code'}</span></button>
        <button onClick={download} className="text-gray-600 hover:underline inline-flex items-center gap-1"><Download size={13} aria-hidden="true" /> Télécharger</button>
      </div>

      {showCode && (
        <div className="relative border-t border-gray-100">
          <button onClick={copyCode} className="absolute top-2 right-2 text-[10px] bg-white/90 border border-gray-200 rounded px-1.5 py-0.5 text-gray-600">
            {copied ? <span className="inline-flex items-center gap-1"><Check size={11} aria-hidden="true" /> Copié</span> : 'Copier'}
          </button>
          <pre className="text-[11px] leading-relaxed bg-gray-900 text-green-200 p-3 overflow-auto max-h-64 whitespace-pre">{artifact.code}</pre>
        </div>
      )}

      {fullscreen && doc && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex flex-col p-3 sm:p-6" onClick={() => setFullscreen(false)}>
          <div className="flex items-center gap-2 text-white mb-2" onClick={e => e.stopPropagation()}>
            <span className="text-sm font-medium flex-1 truncate inline-flex items-center gap-1.5"><Palette size={15} strokeWidth={1.75} aria-hidden="true" /> {artifact.title}</span>
            <button onClick={download} className="text-xs border border-white/40 rounded-lg px-2 py-1 hover:bg-white/10 inline-flex items-center gap-1"><Download size={13} aria-hidden="true" /> Télécharger</button>
            <button onClick={() => setFullscreen(false)} className="px-2" aria-label="Fermer"><X size={22} /></button>
          </div>
          <div className="flex-1 bg-white rounded-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <Frame artifact={artifact} doc={doc} className="w-full h-full block" />
          </div>
        </div>
      )}
    </div>
  );
}
