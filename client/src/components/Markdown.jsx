import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Trois densités visuelles reprises à l'identique des composants qu'elles
// remplacent : "default" (modales de livrable), "compact" (résultats de
// commande rapide), "mini" (panneaux latéraux).
const SIZE_VARIANTS = {
  default: {
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
    code: ({ inline, children }) => inline
      ? <code className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-xs font-mono">{children}</code>
      : <pre className="bg-gray-900 text-gray-100 p-4 rounded-xl overflow-x-auto text-xs font-mono mb-3"><code>{children}</code></pre>,
  },

  compact: {
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
    code: ({ inline, children }) => inline
      ? <code className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-xs font-mono">{children}</code>
      : <pre className="bg-gray-900 text-gray-100 p-3 rounded-xl overflow-x-auto text-xs font-mono mb-2"><code>{children}</code></pre>,
  },

  mini: {
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
};

export default function Markdown({ children, size = 'default' }) {
  const components = SIZE_VARIANTS[size] || SIZE_VARIANTS.default;
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}
