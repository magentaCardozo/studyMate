import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

/**
 * Rendu Markdown + mathématiques (KaTeX). Le HTML brut n'est jamais interprété
 * (comportement par défaut de react-markdown), ce qui protège contre l'injection.
 */
export function Markdown({ children, className = '' }: { children: string; className?: string }) {
  return (
    <div className={`markdown ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={{ a: ({ node: _n, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
