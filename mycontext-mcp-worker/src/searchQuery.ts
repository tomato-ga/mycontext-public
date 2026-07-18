const MAX_SEARCH_TERMS = 8;
const JAPANESE_WORD_SEGMENTER = new Intl.Segmenter("ja-JP", {
  granularity: "word"
});

const REQUEST_PREFIXES = [
  "教えて",
  "知りたい",
  "調べて",
  "探して",
  "確認して",
  "まとめて",
  "説明して"
];

const REQUEST_SUFFIXES = [
  "について",
  "に関する",
  "に関して",
  "を教えて",
  "を知りたい",
  "を調べて",
  "を探して",
  "とは何か",
  "とは"
];

const COMPOUND_SUFFIXES = [
  "チェックリスト",
  "チェックポイント",
  "づくり",
  "活用",
  "利用",
  "一覧",
  "時代",
  "対策",
  "目標",
  "経験",
  "実績",
  "背景",
  "強み",
  "弱み",
  "理由",
  "方針",
  "方法",
  "仕事",
  "構想",
  "役割",
  "者"
];

const QUERY_STOP_WORDS = new Set([
  "こと",
  "もの",
  "ため",
  "これ",
  "それ",
  "どれ",
  "情報",
  "内容",
  "詳細",
  "関連",
  "関係",
  "教えて",
  "知りたい",
  "調べて",
  "探して",
  "確認して",
  "まとめて",
  "説明して",
  "活用",
  "利用",
  "一覧",
  "時代",
  "対策",
  "仕事",
  "構想",
  "どんな",
  "ある",
  "何",
  "本人",
  "含めて",
  "含む",
  "必要",
  "する",
  "教え",
  "知",
  "たい",
  "探",
  "確認",
  "に関する",
  "について",
  "どんなもの"
]);

const TERM_ALIASES: Record<string, readonly string[]> = {
  "能力": ["スキルマップ", "スキル"],
  "事業": ["起業", "経営"],
  "会社経営": ["経営", "起業"],
  "考える": ["考え"],
  "検索": ["SEO", "AEO"],
  "生成AI": ["AI"],
  "Webメディア": ["ウェブメディア"]
};

const SYNONYM_GROUPS = [
  ["個人開発", "個人プロダクト", "一人開発"],
  ["AIエージェント", "AI agent", "エージェント"],
  ["収益化", "事業化", "マネタイズ", "収益"],
  ["編集", "編集者", "コンテンツ制作"],
  ["業務自動化", "自動化", "オートメーション"]
] as const;

export interface SearchQueryPlan {
  phrase: string;
  terms: string[];
  synonymTerms: string[];
}

export function buildSearchQueryPlan(query: string): SearchQueryPlan {
  const phrase = normalizeSearchText(query);
  const terms = extractSearchTerms(phrase);
  return {
    phrase,
    terms,
    synonymTerms: expandSynonyms(terms)
  };
}

export function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function extractSearchTerms(query: string): string[] {
  let working = normalizeSearchText(query);
  for (const prefix of REQUEST_PREFIXES) {
    if (working.startsWith(prefix)) {
      working = working.slice(prefix.length).trim();
    }
  }
  for (const suffix of REQUEST_SUFFIXES) {
    if (working.endsWith(suffix)) {
      working = working.slice(0, -suffix.length).trim();
    }
  }

  const coarseParts = working
    .split(/[\s\u3000・、。,.!?！？:：;；/／|｜()[\]{}「」『』【】〈〉《》]+/u)
    .flatMap(splitJapaneseConnectors)
    .map(cleanTerm)
    .filter(isUsefulTerm);

  const expanded: string[] = [];
  for (const part of coarseParts) {
    for (const term of deriveTerms(part)) {
      expanded.push(term, ...(TERM_ALIASES[term] ?? []));
    }
  }
  for (const part of segmentJapaneseWords(working)) {
    if (expanded.some((term) =>
      term !== part &&
      term.includes(part) &&
      !/[ぁ-ん]/u.test(term)
    )) {
      continue;
    }
    expanded.push(part, ...(TERM_ALIASES[part] ?? []));
  }

  return rankTerms(uniqueTerms(expanded)).slice(0, MAX_SEARCH_TERMS);
}

export function expandSynonyms(terms: string[]): string[] {
  const expanded: string[] = [];
  for (const term of terms) {
    const normalizedTerm = term.toLocaleLowerCase("ja");
    const group = SYNONYM_GROUPS.find((candidate) =>
      candidate.some((value) => value.toLocaleLowerCase("ja") === normalizedTerm)
    );
    if (group === undefined) continue;
    for (const synonym of group) {
      if (synonym.toLocaleLowerCase("ja") !== normalizedTerm) {
        expanded.push(synonym);
      }
    }
  }
  return uniqueTerms(expanded).slice(0, MAX_SEARCH_TERMS);
}

function splitJapaneseConnectors(value: string): string[] {
  return value.split(
    /(?:について|に関する|に関して|という|として|する|して|した|から|まで|より|ので|の|を|が|は|へ|で|と|や|も)+/u
  );
}

function cleanTerm(value: string): string {
  return value
    .replace(/^[\-—–~〜]+|[\-—–~〜]+$/gu, "")
    .trim();
}

function isUsefulTerm(value: string): boolean {
  if (value.length < 2 || QUERY_STOP_WORDS.has(value)) return false;
  if (/^\d+$/u.test(value)) return false;
  return true;
}

function splitCompoundSuffix(value: string): { base: string; suffix: string } | null {
  for (const suffix of COMPOUND_SUFFIXES) {
    if (!value.endsWith(suffix)) continue;
    const base = value.slice(0, -suffix.length);
    if (base.length >= 2) {
      return { base, suffix };
    }
  }
  return null;
}

function deriveTerms(value: string): string[] {
  let normalized = value;
  for (const prefix of ["保有", "必要な"]) {
    if (normalized.startsWith(prefix) && normalized.length - prefix.length >= 2) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }
  const compound = splitCompoundSuffix(normalized);
  if (compound === null) return [normalized];
  return [compound.base, compound.suffix];
}

function uniqueTerms(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeSearchText(value);
    const key = normalized.toLocaleLowerCase("ja");
    if (!isUsefulTerm(normalized) || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function segmentJapaneseWords(value: string): string[] {
  return Array.from(JAPANESE_WORD_SEGMENTER.segment(value))
    .filter((segment) => segment.isWordLike)
    .map((segment) => cleanTerm(segment.segment))
    .filter(isUsefulTerm);
}

function rankTerms(terms: string[]): string[] {
  return terms
    .map((term, index) => ({ term, index, score: termScore(term) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ term }) => term);
}

function termScore(term: string): number {
  let score = Math.min(term.length, 8);
  if (/[A-Za-z0-9]/u.test(term)) score += 2;
  if (TERM_ALIASES[term] !== undefined) score += 1;
  return score;
}
