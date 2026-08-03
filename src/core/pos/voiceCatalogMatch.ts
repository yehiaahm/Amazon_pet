/**
 * Smart English voice → catalog matching for POS.
 * Tolerates speech-recognition errors, synonyms, and partial intent
 * (“I need some cat food” → Cat Food).
 */

export type VoiceCatalogItem = {
  id: string;
  name: string;
  sku?: string;
  type: 'PRODUCT' | 'SERVICE';
  price: number;
  cost: number;
  stock: number | null;
};

export type VoiceMatch = {
  item: VoiceCatalogItem;
  quantity: number;
  score: number;
  phrase: string;
};

const QTY_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  a: 1,
  an: 1,
  couple: 2,
  few: 3,
  pair: 2,
};

/** Words that carry no product meaning — strip before matching. */
const FILLER =
  /\b(please|pls|add|get|give|me|i|want|need|can|have|the|a|an|some|of|for|to|my|this|that|also|then|plus|just|like|uh|um|okay|ok|yeah|yes|and then|would|could|will|buy|take|put|cart|bill)\b/g;

/** Common ASR mishearings → intended pet-retail tokens. */
const ASR_FIX: Record<string, string> = {
  cats: 'cat',
  dogs: 'dog',
  puppies: 'puppy',
  kittens: 'kitten',
  foods: 'food',
  foode: 'food',
  feud: 'food',
  foot: 'food',
  ford: 'food',
  forrd: 'food',
  kibbel: 'kibble',
  kibbles: 'kibble',
  shampo: 'shampoo',
  champoo: 'shampoo',
  shampooo: 'shampoo',
  liter: 'litter',
  letter: 'litter',
  litre: 'litter',
  later: 'litter',
  lidder: 'litter',
  coller: 'collar',
  color: 'collar',
  colour: 'collar',
  leech: 'leash',
  lease: 'leash',
  leashs: 'leash',
  toys: 'toy',
  boal: 'bowl',
  bole: 'bowl',
  beds: 'bed',
  cages: 'cage',
  treats: 'treat',
  snack: 'snack',
  snacks: 'snack',
  vitamins: 'vitamin',
  medicin: 'medicine',
  meds: 'medicine',
  grooming: 'grooming',
  groomin: 'grooming',
  growing: 'grooming',
  bathing: 'bath',
  whiskers: 'whiskas',
  whiskey: 'whiskas',
  frisky: 'friskies',
  friskies: 'friskies',
  pedigree: 'pedigree',
  pedegree: 'pedigree',
  purina: 'purina',
  sheba: 'sheba',
  hills: 'hills',
  royal: 'royal',
  canin: 'canin',
  canine: 'canin',
  essential: 'essentials',
  essentials: 'essentials',
};

const SYNONYM_GROUPS: string[][] = [
  ['cat', 'kitten', 'feline'],
  ['dog', 'puppy', 'canine'],
  ['bird'],
  ['fish', 'aquarium'],
  ['rabbit', 'bunny'],
  ['hamster'],
  ['turtle', 'tortoise'],
  ['food', 'feed', 'meal', 'kibble', 'diet', 'chow'],
  ['water'],
  ['shampoo', 'wash'],
  ['soap'],
  ['litter', 'sand'],
  ['collar'],
  ['leash', 'lead'],
  ['toy'],
  ['bed', 'cushion', 'mat'],
  ['cage', 'kennel', 'carrier', 'crate'],
  ['bowl', 'feeder', 'dish'],
  ['brush', 'comb'],
  ['vitamin', 'supplement'],
  ['medicine', 'medication', 'treatment', 'meds'],
  ['clipper', 'scissors', 'nail'],
  ['towel'],
  ['bag', 'pack'],
  ['can', 'tin', 'wet'],
  ['dry'],
  ['diaper', 'pad', 'pee'],
  ['spray', 'deodorant', 'freshener'],
  ['clean', 'cleaning', 'hygiene'],
  ['treat', 'snack'],
  ['milk'],
  ['oil'],
  ['grooming', 'groom', 'haircut', 'trim'],
  ['bath', 'bathing'],
  ['service'],
  ['appointment', 'booking'],
  ['small', 'mini', 'xs'],
  ['medium', 'med'],
  ['large', 'xl', 'big'],
  ['kg', 'kilo', 'kilogram'],
  ['gram', 'grams'],
  ['royal'],
  ['canin'],
  ['whiskas'],
  ['friskies'],
  ['pedigree'],
  ['sheba'],
  ['purina'],
  ['hills', 'science'],
  ['essentials'],
];

const SYNONYM_MAP: Map<string, string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const group of SYNONYM_GROUPS) {
    const unique = Array.from(new Set(group.map(normalizeText).filter(Boolean)));
    for (const token of unique) {
      map.set(token, Array.from(new Set([...(map.get(token) || []), ...unique])));
    }
  }
  return map;
})();

export function normalizeText(input: string): string {
  return (input || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const normalizeArabic = normalizeText;

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const cur =
        a[i - 1] === b[j - 1]
          ? row[j - 1]
          : 1 + Math.min(row[j - 1], prev, row[j]);
      row[j - 1] = prev;
      prev = cur;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Fix ASR noise then expand synonyms. */
function canonicalizeToken(raw: string): string[] {
  const t = normalizeText(raw);
  if (!t) return [];
  const fixed = ASR_FIX[t] || t;
  const out = new Set<string>([fixed, t]);
  for (const s of SYNONYM_MAP.get(fixed) || []) out.add(s);
  for (const s of SYNONYM_MAP.get(t) || []) out.add(s);
  // light plural strip
  if (fixed.length > 3 && fixed.endsWith('s')) {
    const stem = fixed.slice(0, -1);
    out.add(stem);
    for (const s of SYNONYM_MAP.get(stem) || []) out.add(s);
  }
  return Array.from(out);
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

export function expandTokens(tokens: string[]): string[] {
  const out = new Set<string>();
  for (const t of tokens) {
    for (const c of canonicalizeToken(t)) out.add(c);
  }
  return Array.from(out);
}

function extractQuantity(tokens: string[]): { qty: number; rest: string[] } {
  if (tokens.length === 0) return { qty: 1, rest: tokens };

  const first = tokens[0];
  if (/^\d+$/.test(first)) {
    const n = parseInt(first, 10);
    if (n > 0 && n < 1000) return { qty: n, rest: tokens.slice(1) };
  }
  if (QTY_WORDS[first] != null) {
    return { qty: QTY_WORDS[first], rest: tokens.slice(1) };
  }

  // “cat food times two” / “cat food x2”
  for (let i = 0; i < tokens.length - 1; i++) {
    if ((tokens[i] === 'x' || tokens[i] === 'times') && /^\d+$/.test(tokens[i + 1])) {
      const n = parseInt(tokens[i + 1], 10);
      if (n > 0 && n < 1000) {
        return { qty: n, rest: [...tokens.slice(0, i), ...tokens.slice(i + 2)] };
      }
    }
  }

  const last = tokens[tokens.length - 1];
  if (/^\d+$/.test(last) || QTY_WORDS[last] != null) {
    const n = /^\d+$/.test(last) ? parseInt(last, 10) : QTY_WORDS[last];
    if (n > 0 && n < 1000) return { qty: n, rest: tokens.slice(0, -1) };
  }

  return { qty: 1, rest: tokens };
}

/** How well one spoken token matches one catalog token (0–1). */
function tokenMatchScore(spoken: string, catalog: string): number {
  const spokenForms = canonicalizeToken(spoken);
  const catalogForms = canonicalizeToken(catalog);

  let best = 0;
  for (const s of spokenForms) {
    for (const c of catalogForms) {
      if (s === c) return 1;
      if (s.length >= 3 && c.length >= 3 && (s.includes(c) || c.includes(s))) {
        best = Math.max(best, 0.88);
      }
      const sim = similarity(s, c);
      if (sim >= 0.72) best = Math.max(best, sim * 0.95);
    }
  }
  return best;
}

function itemTokens(item: VoiceCatalogItem): string[] {
  return tokenize(`${item.name} ${item.sku || ''}`).filter((t) => t.length > 1 || /^\d+$/.test(t));
}

function scoreAgainstItem(phraseTokens: string[], item: VoiceCatalogItem): number {
  if (phraseTokens.length === 0) return 0;

  const catalogTokens = itemTokens(item);
  if (catalogTokens.length === 0) return 0;

  // Each spoken token → best catalog token similarity
  const spokenScores = phraseTokens.map((spoken) => {
    let best = 0;
    for (const cat of catalogTokens) {
      best = Math.max(best, tokenMatchScore(spoken, cat));
    }
    return best;
  });

  const coverage =
    spokenScores.reduce((sum, s) => sum + (s >= 0.72 ? 1 : s >= 0.55 ? 0.5 : 0), 0) /
    phraseTokens.length;

  const avgSpoken = spokenScores.reduce((a, b) => a + b, 0) / phraseTokens.length;

  // Each catalog token → best spoken match (penalize ignoring distinctive words)
  const catalogScores = catalogTokens.map((cat) => {
    let best = 0;
    for (const spoken of phraseTokens) {
      best = Math.max(best, tokenMatchScore(spoken, cat));
    }
    return best;
  });
  const catalogCoverage =
    catalogScores.reduce((sum, s) => sum + (s >= 0.72 ? 1 : 0), 0) /
    Math.max(catalogTokens.length, 1);

  // Phrase / name substring & fuzzy whole-string
  const phrase = phraseTokens.join(' ');
  const hay = normalizeText(`${item.name} ${item.sku || ''}`);
  let stringBonus = 0;
  if (phrase.length >= 2 && hay.includes(phrase)) stringBonus = 0.4;
  else {
    const sim = similarity(phrase, hay);
    if (sim >= 0.55) stringBonus = sim * 0.35;
  }

  // Consecutive token order bonus (cat food vs food cat)
  let orderBonus = 0;
  const spokenCanon = phraseTokens.map((t) => canonicalizeToken(t)[0]);
  const catalogCanon = catalogTokens.map((t) => canonicalizeToken(t)[0]);
  let lastIdx = -1;
  let orderedHits = 0;
  for (const s of spokenCanon) {
    const idx = catalogCanon.findIndex((c, i) => i > lastIdx && (c === s || tokenMatchScore(s, c) >= 0.85));
    if (idx >= 0) {
      orderedHits += 1;
      lastIdx = idx;
    }
  }
  if (orderedHits >= 2) orderBonus = 0.15;

  // Intent combo: animal + product type both present
  const animal = ['cat', 'dog', 'bird', 'fish', 'rabbit', 'puppy', 'kitten'];
  const productType = [
    'food',
    'kibble',
    'shampoo',
    'litter',
    'toy',
    'collar',
    'treat',
    'bowl',
    'leash',
    'bed',
    'cage',
  ];
  const spokenExp = expandTokens(phraseTokens);
  const catalogExp = expandTokens(catalogTokens);
  const hasAnimal =
    spokenExp.some((t) => animal.includes(t)) && catalogExp.some((t) => animal.includes(t));
  const hasType =
    spokenExp.some((t) => productType.includes(t)) &&
    catalogExp.some((t) => productType.includes(t));
  const intentBonus = hasAnimal && hasType ? 0.28 : hasAnimal || hasType ? 0.08 : 0;

  let score =
    coverage * 0.42 +
    avgSpoken * 0.28 +
    catalogCoverage * 0.12 +
    stringBonus +
    orderBonus +
    intentBonus;

  // Prefer shorter / more specific catalog names when coverage is strong
  if (coverage >= 0.9 && catalogTokens.length <= phraseTokens.length + 2) {
    score += 0.05;
  }

  return Math.min(score, 1.35);
}

export function splitSpokenPhrases(transcript: string): string[] {
  const cleaned = normalizeText(transcript)
    .replace(FILLER, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return [];

  return cleaned
    .split(/\s*(?:,|&|\+| plus | and | then )\s*/)
    .map((p) => normalizeText(p).replace(FILLER, ' ').replace(/\s+/g, ' ').trim())
    .filter((p) => p.length >= 2);
}

function rankMatches(
  searchTokens: string[],
  items: VoiceCatalogItem[]
): { item: VoiceCatalogItem; score: number }[] {
  const ranked: { item: VoiceCatalogItem; score: number }[] = [];
  for (const item of items) {
    if (item.type === 'PRODUCT' && item.stock != null && item.stock <= 0) continue;
    const score = scoreAgainstItem(searchTokens, item);
    if (score > 0) ranked.push({ item, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

/**
 * Pick best match with confidence: must beat minScore and clearly win
 * over the runner-up (unless runner-up is far weaker).
 */
function bestConfidentMatch(
  searchTokens: string[],
  items: VoiceCatalogItem[],
  minScore: number
): { item: VoiceCatalogItem; score: number } | null {
  const ranked = rankMatches(searchTokens, items);
  if (ranked.length === 0) return null;

  const best = ranked[0];
  if (best.score < minScore) return null;

  const second = ranked[1];
  // Ambiguous: two nearly equal top scores → prefer if gap exists or one is clearly better
  if (second && second.score >= minScore && best.score - second.score < 0.06) {
    // If both are very strong and same “family”, still take the best name match
    if (best.score < 0.72) return null;
  }

  return best;
}

/** Match English voice transcript against catalog item names. */
export function matchSpokenCatalog(
  transcript: string,
  items: VoiceCatalogItem[],
  minScore = 0.42
): VoiceMatch[] {
  const phrases = splitSpokenPhrases(transcript);
  const results: VoiceMatch[] = [];

  const pushMatch = (phrase: string, qty: number, best: { item: VoiceCatalogItem; score: number }) => {
    const key = `${best.item.type}:${best.item.id}`;
    const existing = results.find((r) => `${r.item.type}:${r.item.id}` === key);
    if (existing) {
      existing.quantity += qty;
      existing.score = Math.max(existing.score, best.score);
    } else {
      results.push({
        item: best.item,
        quantity: qty,
        score: best.score,
        phrase,
      });
    }
  };

  for (const phrase of phrases) {
    const tokens = tokenize(phrase).filter((t) => t.length > 1 || /^\d+$/.test(t));
    const { qty, rest } = extractQuantity(tokens);
    const searchTokens = (rest.length > 0 ? rest : tokens).filter(
      (t) => !/^\d+$/.test(t) || t.length > 2
    );
    if (searchTokens.length === 0) continue;

    const best = bestConfidentMatch(searchTokens, items, minScore);
    if (best) pushMatch(phrase, qty, best);
  }

  // Fallback: whole transcript as one intent
  if (results.length === 0 && transcript.trim()) {
    const cleaned = normalizeText(transcript).replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
    const tokens = tokenize(cleaned).filter((t) => t.length > 1 || /^\d+$/.test(t));
    const { qty, rest } = extractQuantity(tokens);
    const searchTokens = rest.length > 0 ? rest : tokens;
    const best = bestConfidentMatch(searchTokens, items, Math.max(0.36, minScore - 0.06));
    if (best) {
      results.push({
        item: best.item,
        quantity: qty,
        score: best.score,
        phrase: transcript,
      });
    }
  }

  // Sliding window: “please add royal canin cat food and shampoo” when split fails
  if (results.length === 0 && items.length > 0) {
    const cleaned = normalizeText(transcript).replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
    const tokens = tokenize(cleaned).filter((t) => t.length > 1 || /^\d+$/.test(t));
    const used = new Set<number>();

    for (let len = Math.min(5, tokens.length); len >= 1; len--) {
      for (let i = 0; i <= tokens.length - len; i++) {
        if ([...Array(len)].some((_, k) => used.has(i + k))) continue;
        const window = tokens.slice(i, i + len);
        const { qty, rest } = extractQuantity(window);
        const searchTokens = rest.length > 0 ? rest : window;
        const best = bestConfidentMatch(searchTokens, items, len === 1 ? 0.78 : 0.5);
        if (best) {
          pushMatch(window.join(' '), qty, best);
          for (let k = 0; k < len; k++) used.add(i + k);
        }
      }
    }
  }

  return results;
}

export function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}
