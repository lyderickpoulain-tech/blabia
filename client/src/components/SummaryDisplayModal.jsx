import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const MD = {
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
};

export default function SummaryDisplayModal({ title, date, content, onClose }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    navigator.clipboard.writeText(text).catch(() => {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-gray-900 leading-snug">{title || 'Compte-rendu'}</h2>
            {date && <p className="text-xs text-gray-400 mt-0.5">{date}</p>}
          </div>
          <button
            onClick={handleCopy}
            className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
              copied
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            {copied ? '✓ Copié' : 'Copier'}
          </button>
          <button
            onClick={onClose}
            className="shrink-0 text-gray-400 hover:text-gray-600 text-xl w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition"
          >
            ✕
          </button>
        </div>

        {/* Corps scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {typeof content === 'string' ? (
            <article>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>{content}</ReactMarkdown>
            </article>
          ) : (
            <pre className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
              {JSON.stringify(content, null, 2)}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 pb-4 pt-3 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full border border-gray-200 text-gray-600 py-2 rounded-xl text-sm hover:bg-gray-50 transition font-medium"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
}
