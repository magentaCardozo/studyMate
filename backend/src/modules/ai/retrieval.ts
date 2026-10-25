import type { SourceBlock } from './provider';

const STOPWORDS = new Set(
  (
    'le la les un une des du de d l et ou en au aux a à est sont ce ces cet cette qui que quoi dont où pour par sur dans avec sans ne pas plus moins se sa son ses leur leurs il elle ils elles on nous vous je tu me te mon ma mes ton ta tes y comme mais donc or ni car si quel quelle quels quelles comment pourquoi quand être avoir fait faire peut entre très tout tous toute toutes ' +
    'the a an and or of to in on for with without is are was were be been this that these those it its as by from at what which who how why when can do does explain expliquer explique donne moi'
  ).split(/\s+/),
);

export function tokenize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    .map((t) => (t.length > 5 ? t.replace(/(s|x)$/, '') : t));
}

/**
 * Recherche lexicale BM25 sur les passages autorisés. Pas de vecteurs d'embeddings
 * dans cette version : la recherche est déterministe, locale et sans coût.
 */
export function rankBlocks(query: string, blocks: SourceBlock[], k = 8) {
  const q = [...new Set(tokenize(query))];
  if (!q.length || !blocks.length) return [];
  const docs = blocks.map((b) => tokenize(`${b.title} ${b.text}`));
  const avgLen = docs.reduce((n, d) => n + d.length, 0) / docs.length || 1;
  const df = new Map<string, number>();
  for (const term of q) df.set(term, docs.filter((d) => d.includes(term)).length);
  const k1 = 1.4, b = 0.75, N = docs.length;
  const scored = docs.map((d, i) => {
    let score = 0;
    for (const term of q) {
      const tf = d.filter((t) => t === term).length;
      if (!tf) continue;
      const n = df.get(term) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * d.length) / avgLen)));
    }
    return { block: blocks[i], score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b2) => b2.score - a.score).slice(0, k);
}
