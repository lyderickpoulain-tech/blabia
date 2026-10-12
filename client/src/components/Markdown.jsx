import { useState } from 'react';
import { Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ── Composants partagés entre variantes ────────────────────────────────────────

function ExternalLink({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blabia-blue underline hover:text-blabia-blue-dark break-words">
      {children}
    </a>
  );
}

function CodeBlock({ inline, children }) {
  const [copied, setCopied] = useState(false);
  const text = String(children).replace(/\n$/, '');

  if (inline) {
    return <code className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-xs font-mono">{children}</code>;
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative group mb-3">
      <pre className="bg-gray-900 text-gray-100 p-4 pr-16 rounded-xl overflow-x-auto text-xs font-mono"><code>{children}</code></pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-2 py-1 rounded-lg transition opacity-0 group-hover:opacity-100"
      >
        {copied ? <span className="inline-flex items-center gap-1"><Check size={11} aria-hidden="true" /> Copié</span> : 'Copier'}
      </button>
    </div>
  );
}

// Tableau : bordures légères, en-tête en gras, lignes alternées, scroll horizontal
function Table({ children }) {
  return (
    <div className="mb-3 overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  );
}
const TableHead = ({ children }) => <thead className="bg-gray-50">{children}</thead>;
const TableRow   = ({ children, isHeader }) => (
  <tr className={!isHeader ? 'odd:bg-white even:bg-gray-50' : ''}>{children}</tr>
);
const TableTh = ({ children }) => (
  <th className="text-left font-semibold text-gray-700 px-3 py-1.5 border-b border-gray-200 whitespace-nowrap">{children}</th>
);
const TableTd = ({ children }) => (
  <td className="px-3 py-1.5 border-b border-gray-100 text-gray-700 align-top">{children}</td>
);

const SHARED = {
  a: ExternalLink,
  code: CodeBlock,
  table: Table,
  thead: TableHead,
  tr: TableRow,
  th: TableTh,
  td: TableTd,
};

// Quatre densités visuelles : "default" (modales de livrable), "compact"
// (résultats de commande rapide), "mini" (panneaux latéraux), "bubble"
// (messages de réunion — titres rendus en gras, pas de gros titres dans une
// conversation).
const SIZE_VARIANTS = {
  default: {
    ...SHARED,
    h1: ({ children }) => <h1 className="text-xl font-bold text-gray-900 mb-3 mt-6 first:mt-0">{children}</h1>,
    h2: ({ children }) => <h2 className="text-base font-bold text-gray-800 mb-2 mt-5 pb-1 border-b border-gray-200">{children}</h2>,
    h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-800 mb-2 mt-4">{children}</h3>,
    p:  ({ children }) => <p className="text-sm text-gray-700 mb-3 leading-relaxed last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="mb-3 space-y-1 list-none">{children}</ul>,
    ol: ({ children }) => <ol className="mb-3 space-y-1 list-decimal list-inside text-sm text-gray-700">{children}</ol>,
    li: ({ children }) => (
      <li className="flex items-start gap-2 text-sm text-gray-700 leading-relaxed">
        <span className="text-blue-400 font-bold mt-0.5 shrink-0 text-xs">▸</span>
        <span>{children}</span>
      </li>
    ),
    strong:     ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
    em:         ({ children }) => <em className="italic text-gray-600">{children}</em>,
    hr:         () => <hr className="my-4 border-gray-200" />,
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-blue-300 pl-4 py-0.5 my-3 text-gray-600 italic bg-blue-50 rounded-r-lg text-sm">
        {children}
      </blockquote>
    ),
  },

  compact: {
    ...SHARED,
    h1: ({ children }) => <h1 className="text-base font-bold text-gray-900 mb-2 mt-4 first:mt-0">{children}</h1>,
    h2: ({ children }) => <h2 className="text-sm font-bold text-gray-800 mb-2 mt-3 pb-1 border-b border-gray-200">{children}</h2>,
    h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-800 mb-1.5 mt-3">{children}</h3>,
    p:  ({ children }) => <p className="text-sm text-gray-700 mb-2 leading-relaxed last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="mb-2 space-y-0.5 list-none">{children}</ul>,
    ol: ({ children }) => <ol className="mb-2 space-y-0.5 list-decimal list-inside text-sm text-gray-700">{children}</ol>,
    li: ({ children }) => (
      <li className="flex items-start gap-2 text-sm text-gray-700 leading-relaxed">
        <span className="text-blue-400 font-bold mt-0.5 shrink-0 text-xs">▸</span>
        <span>{children}</span>
      </li>
    ),
    strong:     ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
    em:         ({ children }) => <em className="italic text-gray-600">{children}</em>,
    hr:         () => <hr className="my-3 border-gray-200" />,
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-blue-300 pl-3 py-0.5 my-2 text-gray-600 italic bg-blue-50 rounded-r-lg text-sm">
        {children}
      </blockquote>
    ),
  },

  mini: {
    a: ExternalLink,
    h2: ({ children }) => <h2 className="text-xs font-bold text-gray-800 mt-3 mb-1">{children}</h2>,
    h3: ({ children }) => <h3 className="text-xs font-semibold text-gray-700 mt-2 mb-1">{children}</h3>,
    p:  ({ children }) => <p className="text-xs text-gray-600 mb-1.5 leading-relaxed last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="mb-1.5 space-y-0.5">{children}</ul>,
    li: ({ children }) => (
      <li className="flex items-start gap-1.5 text-xs text-gray-600">
        <span className="text-blue-400 shrink-0 mt-0.5">▸</span>
        <span>{children}</span>
      </li>
    ),
    strong: ({ children }) => <strong className="font-semibold text-gray-800">{children}</strong>,
  },

  // Synthèses produites par l'IA (préparation, briefing) : titres violets sans
  // trait, puces violettes — couleur « ai » de la refonte UX v5.1
  synthesis: {
    ...SHARED,
    h1: ({ children }) => <h3 className="text-xs font-extrabold uppercase tracking-wider text-ai mt-4 mb-1.5 first:mt-0">{children}</h3>,
    h2: ({ children }) => <h3 className="text-xs font-extrabold uppercase tracking-wider text-ai mt-4 mb-1.5 first:mt-0">{children}</h3>,
    h3: ({ children }) => <h4 className="text-sm font-bold text-ink mt-3 mb-1">{children}</h4>,
    p:  ({ children }) => <p className="text-sm text-ink-soft mb-2 leading-relaxed last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="mb-2 space-y-1 list-none">{children}</ul>,
    ol: ({ children }) => <ol className="mb-2 space-y-1 list-decimal list-inside text-sm text-ink-soft">{children}</ol>,
    li: ({ children }) => (
      <li className="flex items-start gap-2 text-sm text-ink-soft leading-relaxed">
        <span className="w-1.5 h-1.5 rounded-full bg-ai mt-[0.55em] shrink-0" aria-hidden="true" />
        <span>{children}</span>
      </li>
    ),
    strong: ({ children }) => <strong className="font-bold text-ink">{children}</strong>,
    em:     ({ children }) => <em className="italic">{children}</em>,
    hr:     () => <hr className="my-3 border-ai-border" />,
  },

  // Bulles de conversation (ConversationFeed) : pas de gros titres, le reste
  // du sous-ensemble markdown autorisé (gras, listes, tableaux, liens, code)
  // suit le même rendu que "compact".
  bubble: {
    ...SHARED,
    h1: ({ children }) => <p className="font-bold mb-1">{children}</p>,
    h2: ({ children }) => <p className="font-bold mb-1">{children}</p>,
    h3: ({ children }) => <p className="font-bold mb-1">{children}</p>,
    p:  ({ children }) => <p className="mb-2 leading-relaxed last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="mb-2 space-y-0.5 list-none">{children}</ul>,
    ol: ({ children }) => <ol className="mb-2 space-y-0.5 list-decimal list-inside">{children}</ol>,
    li: ({ children }) => (
      <li className="flex items-start gap-1.5 leading-relaxed">
        <span className="opacity-60 font-bold mt-0.5 shrink-0 text-xs">▸</span>
        <span>{children}</span>
      </li>
    ),
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em:     ({ children }) => <em className="italic">{children}</em>,
  },
};

export default function Markdown({ children, size = 'default' }) {
  const components = SIZE_VARIANTS[size] || SIZE_VARIANTS.default;
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={components}>
      {children}
    </ReactMarkdown>
  );
}
