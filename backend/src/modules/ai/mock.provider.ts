import type { AiProvider, ChatTurn, ProviderResult, QuizRequest, SourceBlock } from './provider';
import type { AnswerOutput, FlashcardsOutput, GeneratedQuestion, QuizOutput, SummaryOutput } from './schemas';
import { rankBlocks, tokenize } from './retrieval';

/**
 * ADAPTATEUR DE DÉMONSTRATION — aucun modèle de langage.
 *
 * Il produit des résumés, cartes et quiz par simple extraction de phrases du
 * document (définitions, formules, exemples). Il permet de développer et de
 * tester l'application sans clé d'API. Le contenu est toujours marqué
 * « mode démonstration » et ne contient aucune explication inventée.
 */

interface Sentence {
  text: string;
  source: string;
}

const DEF_RE = /^(.{2,80}?)\s+(?:est|sont|désigne|désignent|se définit comme|correspond à|représente|is|are|refers to)\s+(.{8,})$/i;
const CALLED_RE = /^(?:on appelle|on nomme|we call)\s+(.{2,60}?)\s+(.{8,})$/i;
const EXAMPLE_RE = /\b(par exemple|exemple|ex\s*:|for example|e\.g\.)/i;
const MISTAKE_RE = /\b(attention|erreur|ne pas confondre|piège|à éviter|common mistake|attention à)\b/i;

function sentences(blocks: SourceBlock[]): Sentence[] {
  const out: Sentence[] = [];
  for (const b of blocks) {
    for (const line of b.text.split(/\n+/)) {
      const clean = line.replace(/^[#>*\-\d.)\s]+/, '').trim();
      if (!clean) continue;
      for (const s of clean.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý])/)) {
        const t = s.trim();
        if (t.length >= 12 && t.length <= 500) out.push({ text: t, source: b.id });
      }
    }
  }
  return out;
}

function formulas(blocks: SourceBlock[]): Sentence[] {
  const out: Sentence[] = [];
  for (const b of blocks)
    for (const line of b.text.split(/\n+/)) {
      const t = line.trim();
      const proseWords = t.replace(/\$[^$]*\$/g, '').split(/\s+/).filter((w) => /^[A-Za-zÀ-ÿ']{4,}$/.test(w)).length;
      if (t.length < 120 && proseWords <= 6 && /[=≤≥<>∫∑√]/.test(t) && /[a-zA-Z0-9]/.test(t) && !/https?:/.test(t)) out.push({ text: t.replace(/^[-*\s]+/, ''), source: b.id });
    }
  return out;
}

function definitions(blocks: SourceBlock[]) {
  const defs: { term: string; definition: string; source: string; sentence: string }[] = [];
  for (const s of sentences(blocks)) {
    const m = DEF_RE.exec(s.text) ?? CALLED_RE.exec(s.text);
    if (!m) continue;
    let term = m[1].replace(/^(le|la|les|l'|un|une|des|the|a|an)\s+/i, '').replace(/[,:;]$/, '').trim();
    const words = term.split(/\s+/);
    if (words.length > 6 || /^(il|elle|ils|elles|ce|cela|ceci|on|it|this|which|qui)$/i.test(term)) continue;
    term = term.charAt(0).toUpperCase() + term.slice(1);
    const definition = m[2].replace(/\.$/, '').trim();
    // « X est noté … », « X est dite … » : notation ou propriété, pas une définition.
    if (/^(noté|notée|notés|dit|dite|dits|appelé|appelée|égal|égale|défini|définie|une fonction|un nombre)(?=[\s,.;:]|$)/i.test(definition) || /^(une?|des)\s/i.test(m[1]) && words.length === 1) continue;
    if (!defs.some((d) => d.term.toLowerCase() === term.toLowerCase())) defs.push({ term, definition, source: s.source, sentence: s.text });
  }
  return defs;
}

function keyTerms(blocks: SourceBlock[], n: number) {
  const freq = new Map<string, number>();
  for (const b of blocks) for (const t of tokenize(b.text)) if (t.length >= 6 && !/^\d+$/.test(t)) freq.set(t, (freq.get(t) ?? 0) + 1);
  return [...freq.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t);
}

const usage = (blocks: SourceBlock[]) => ({ inputTokens: 0, outputTokens: 0, model: 'demo-extractive' });
const DEMO_NOTE = 'Mode démonstration : contenu obtenu par extraction de phrases du document, sans modèle de langage. Configurez un fournisseur d’IA pour des explications complètes.';

function shuffle<T>(arr: T[], seed: number) {
  const a = [...arr];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class MockProvider implements AiProvider {
  readonly name = 'demo';
  readonly model = 'demo-extractive';
  readonly external = false;

  async summarize(blocks: SourceBlock[], opts: { length: 'brief' | 'standard' | 'detailed'; title: string }): Promise<ProviderResult<SummaryOutput>> {
    const size = { brief: 3, standard: 6, detailed: 12 }[opts.length];
    const all = sentences(blocks);
    const defs = definitions(blocks);
    const terms = keyTerms(blocks, size + 2);
    const heading = blocks.flatMap((b) => b.text.split('\n')).find((l) => /^#{1,3}\s+\S/.test(l.trim()));
    const output: SummaryOutput = {
      mainTopic: heading ? heading.replace(/^#+\s*/, '').trim() : opts.title,
      keyConcepts: terms
        .map((t) => {
          const s = all.find((x) => tokenize(x.text).includes(t));
          return s ? { term: s.text.match(new RegExp(`\\b(${t}\\w*)`, 'i'))?.[1] ?? t, explanation: s.text, sources: [s.source] } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
        .slice(0, size),
      definitions: defs.slice(0, size * 2).map((d) => ({ term: d.term, definition: d.definition, sources: [d.source] })),
      formulas: formulas(blocks).slice(0, size * 2).map((f) => ({ expression: f.text, description: 'Formule relevée dans le document.', sources: [f.source] })),
      explanations: [],
      examples: all.filter((s) => EXAMPLE_RE.test(s.text)).slice(0, size).map((s, i) => ({ title: `Exemple ${i + 1}`, content: s.text, sources: [s.source] })),
      commonMistakes: all.filter((s) => MISTAKE_RE.test(s.text)).slice(0, Math.ceil(size / 2)).map((s) => ({ mistake: s.text, correction: 'Voir le passage cité dans le document.', sources: [s.source] })),
      recap: all.slice(0, Math.min(3, all.length)).map((s) => s.text).join(' '),
      selfAssessment: defs.slice(0, Math.min(5, size)).map((d) => `Pouvez-vous expliquer ce qu’est « ${d.term} » avec vos propres mots ?`),
      additionalExplanations: [],
      limitations: [DEMO_NOTE],
      insufficientSource: all.length < 3,
    };
    if (output.insufficientSource) output.limitations.push('Le document contient trop peu de texte pour produire un résumé fiable.');
    return { output, usage: usage(blocks) };
  }

  async flashcards(blocks: SourceBlock[], opts: { count: number }): Promise<ProviderResult<FlashcardsOutput>> {
    const cards: FlashcardsOutput['cards'] = [];
    for (const d of definitions(blocks)) cards.push({ question: `Qu’est-ce que « ${d.term} » ?`, answer: d.definition, sources: [d.source], difficulty: 2, tags: ['définition'] });
    for (const f of formulas(blocks)) {
      const [left, ...right] = f.text.split('=');
      if (left.trim() && right.join('=').trim()) cards.push({ question: `Complétez la formule : ${left.trim()} = …`, answer: f.text, sources: [f.source], difficulty: 2, tags: ['formule'] });
    }
    const all = sentences(blocks);
    for (const t of keyTerms(blocks, opts.count)) {
      if (cards.length >= opts.count) break;
      const s = all.find((x) => tokenize(x.text).includes(t) && !cards.some((c) => c.answer.includes(x.text)));
      const word = s?.text.match(new RegExp(`\\b(${t}\\w*)`, 'i'))?.[1];
      if (s && word) cards.push({ question: `Complétez : ${s.text.replace(word, '_____')}`, answer: word, sources: [s.source], difficulty: 1, tags: ['texte à trous'] });
    }
    return { output: { cards: cards.slice(0, opts.count), limitations: [DEMO_NOTE] }, usage: usage(blocks) };
  }

  async quiz(blocks: SourceBlock[], opts: QuizRequest): Promise<ProviderResult<QuizOutput>> {
    const defs = definitions(blocks);
    const all = sentences(blocks);
    const terms = keyTerms(blocks, 20);
    const questions: GeneratedQuestion[] = [];
    const types = opts.types.length ? opts.types : ['SINGLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK'];
    const blank = { options: [], matchRight: [], correctIndices: [], correctBoolean: false, acceptedAnswers: [], uncertain: false, difficulty: 'medium' as const };
    let i = 0;
    const seed = blocks.reduce((n, b) => n + b.text.length, 0);
    for (let guard = 0; questions.length < opts.count && guard < opts.count * 4; guard++) {
      const type = types[guard % types.length];
      const d = defs[i % Math.max(1, defs.length)];
      i++;
      if (type === 'SINGLE_CHOICE' && defs.length >= 3 && d) {
        const distract = shuffle(defs.filter((x) => x !== d), seed + i).slice(0, 3).map((x) => x.term);
        const options = shuffle([d.term, ...distract], seed + i * 7);
        questions.push({ ...blank, type: 'SINGLE_CHOICE', question: `Quelle notion correspond à la définition suivante : « ${d.definition} » ?`, options, correctIndices: [options.indexOf(d.term)], explanation: `D’après le document : « ${d.sentence} »`, sources: [d.source], topic: d.term });
      } else if (type === 'TRUE_FALSE' && defs.length >= 2 && d) {
        const truthful = (i + seed) % 2 === 0;
        const other = defs.find((x) => x !== d)!;
        questions.push({ ...blank, type: 'TRUE_FALSE', question: `Vrai ou faux : « ${d.term} » désigne ${truthful ? d.definition : other.definition}.`, options: ['Vrai', 'Faux'], correctBoolean: truthful, explanation: `D’après le document : « ${d.sentence} »`, sources: [d.source], topic: d.term });
      } else if (type === 'MATCHING' && defs.length >= 3) {
        const pairs = shuffle(defs, seed + i).slice(0, 4);
        const right = shuffle(pairs.map((p) => p.definition), seed + i * 3);
        questions.push({ ...blank, type: 'MATCHING', question: 'Associez chaque notion à sa définition.', options: pairs.map((p) => p.term), matchRight: right, correctIndices: pairs.map((p) => right.indexOf(p.definition)), explanation: pairs.map((p) => `${p.term} : ${p.definition}`).join(' — '), sources: [...new Set(pairs.map((p) => p.source))], topic: 'Définitions' });
      } else if (type === 'MULTIPLE_CHOICE' && defs.length >= 4) {
        const picks = shuffle(defs, seed + i).slice(0, 4);
        const trueOnes = picks.slice(0, 2);
        const falseOnes = picks.slice(2).map((p, k) => ({ text: `« ${p.term} » désigne ${picks[(k + 3) % 4].definition}`, ok: false }));
        const options = shuffle([...trueOnes.map((p) => ({ text: `« ${p.term} » désigne ${p.definition}`, ok: true })), ...falseOnes], seed + i * 5);
        questions.push({ ...blank, type: 'MULTIPLE_CHOICE', question: 'Quelles affirmations sont conformes au document ?', options: options.map((o) => o.text), correctIndices: options.map((o, k) => (o.ok ? k : -1)).filter((k) => k >= 0), explanation: trueOnes.map((p) => p.sentence).join(' '), sources: [...new Set(picks.map((p) => p.source))], topic: 'Définitions' });
      } else if (type === 'SHORT_ANSWER' && d) {
        questions.push({ ...blank, type: 'SHORT_ANSWER', question: `Quel terme du cours correspond à : « ${d.definition} » ?`, acceptedAnswers: [d.term], explanation: `D’après le document : « ${d.sentence} »`, sources: [d.source], topic: d.term });
      } else {
        // Texte à trous à partir d'un terme clé.
        const t = terms[i % Math.max(1, terms.length)];
        const s = t ? all.find((x) => tokenize(x.text).includes(t) && !questions.some((q) => q.explanation.includes(x.text))) : undefined;
        const word = s?.text.match(new RegExp(`\\b(${t}\\w*)`, 'i'))?.[1];
        if (s && word) questions.push({ ...blank, type: 'FILL_BLANK', question: `Complétez : ${s.text.replace(word, '___')}`, acceptedAnswers: [word], explanation: `Phrase du document : « ${s.text} »`, sources: [s.source], topic: word });
      }
    }
    return { output: { questions, limitations: [DEMO_NOTE] }, usage: usage(blocks) };
  }

  async answer(question: string, blocks: SourceBlock[], _history: ChatTurn[], opts: { scopeLabel: string }): Promise<ProviderResult<AnswerOutput>> {
    if (!blocks.length) {
      return {
        output: {
          answer: 'Le mode démonstration ne répond qu’à partir de vos documents. Sélectionnez une leçon, un dossier, une matière ou des documents, ou configurez un fournisseur d’IA pour les questions générales.',
          citations: [],
          groundedInSources: false,
          generalKnowledgeUsed: false,
          uncertainty: 'Aucune source sélectionnée.',
          followUpQuestion: '',
        },
        usage: usage(blocks),
      };
    }
    const hits = rankBlocks(question, blocks, 3);
    if (!hits.length) {
      return {
        output: { answer: `Je n’ai trouvé aucun passage correspondant à votre question dans : ${opts.scopeLabel}.`, citations: [], groundedInSources: false, generalKnowledgeUsed: false, uncertainty: 'Aucun passage pertinent.', followUpQuestion: 'Pouvez-vous reformuler avec les termes employés dans le cours ?' },
        usage: usage(blocks),
      };
    }
    const quote = (t: string) => (t.length > 600 ? t.slice(0, 600).replace(/\s\S*$/, '') + '…' : t);
    const answer = ['Voici les passages de vos sources les plus proches de votre question :', '', ...hits.map((h) => `> ${quote(h.block.text.replace(/^#+\s*/gm, '')).replace(/\n+/g, ' ')} [${h.block.id}]`), '', `_${DEMO_NOTE}_`].join('\n');
    return {
      output: { answer, citations: hits.map((h) => h.block.id), groundedInSources: true, generalKnowledgeUsed: false, uncertainty: 'Passages extraits sans interprétation.', followUpQuestion: 'Essayez d’expliquer ces passages avec vos propres mots.' },
      usage: usage(blocks),
    };
  }
}
