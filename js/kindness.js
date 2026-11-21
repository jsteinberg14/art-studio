// Kindness filter for comments. It runs before a comment is posted.
// Word filters miss things, so the app also lets the artist delete comments,
// turn comments off, and report anything that slips through.

export const MAX_COMMENT = 100;

export const QUICK_COMMENTS = [
  'Love the colors',
  'So creative',
  'Great job',
  'This is awesome',
  'I like the details',
  'How did you make this?',
];

const UNKIND_WORDS = [
  'ugly', 'stupid', 'dumb', 'idiot', 'idiotic', 'loser', 'hate', 'hates', 'hated', 'worst',
  'gross', 'lame', 'suck', 'sucks', 'trash', 'garbage', 'boring', 'terrible', 'horrible',
  'awful', 'disgusting', 'pathetic', 'moron', 'shutup', 'freak', 'kill', 'die', 'weirdo',
  'fuck', 'shit', 'crap', 'damn', 'bitch', 'ass', 'asshole', 'bastard', 'wtf', 'stfu',
  'piss', 'dick', 'hell', 'sucker', 'kys',
];

const UNKIND_PHRASES = /\b(shut up|nobody likes|no one likes|can'?t draw|cannot draw|looks bad|so bad|is bad|really bad|not good|bad at|go away|you'?re bad|you are bad|copied|copy ?cat)\b/;
const UNKIND_INSIDE = /(fuck|shit|bitch)/;

const PRIVATE_PATTERNS = [
  /(\d[\s().-]*){7,}/, // phone numbers
  /[^\s@]+@[^\s@]+\.[^\s@]+/, // email addresses
  /(https?:\/\/|www\.|\.(com|net|org|io|co|gg|me|tv|app|ly)\b)/i, // links
  /\b(address|street|avenue|where do you live|where you live|what school|which school|how old|my number|phone number|text me|call me|snapchat|snap me|instagram|insta|tiktok|discord|whatsapp|meet me|meet up|my house)\b/i,
];

const collapse = (w) => w.replace(/(.)\1+/g, '$1');
const UNKIND_SET = new Set(UNKIND_WORDS);
const UNKIND_COLLAPSED = new Set(UNKIND_WORDS.map(collapse));

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[0]/g, 'o').replace(/[1|]/g, 'i').replace(/3/g, 'e').replace(/[4@]/g, 'a')
    .replace(/[5$]/g, 's').replace(/7/g, 't');
}

function isUnkind(text) {
  const norm = normalize(text);
  const joined = norm.replace(/\b([a-z])[\s.\-_*]+(?=[a-z]\b)/g, '$1'); // "u g l y" or "u.g.l.y" -> "ugly"
  if (UNKIND_PHRASES.test(norm)) return true;
  const tokens = new Set([...norm.split(/[^a-z']+/), ...joined.split(/[^a-z']+/)].filter(Boolean));
  for (const t of tokens) {
    const clean = t.replace(/'/g, '');
    if (UNKIND_SET.has(clean) || UNKIND_COLLAPSED.has(collapse(clean)) || UNKIND_INSIDE.test(clean)) return true;
  }
  return false;
}

function isPrivate(text) {
  return PRIVATE_PATTERNS.some((re) => re.test(text));
}

export function checkComment(text, artistName = 'your friend') {
  const value = (text || '').trim();
  if (!value) {
    return { ok: false, title: 'Write something first', message: 'Type a kind comment, or tap one of the quick comments.' };
  }
  if (value.length > MAX_COMMENT) {
    return { ok: false, title: 'That one is a little long', message: `Keep comments to ${MAX_COMMENT} letters or fewer.` };
  }
  if (isPrivate(value)) {
    return { ok: false, title: 'Keep it private', message: 'That message wasn’t sent. Leave out phone numbers, addresses, schools, links, and other apps.' };
  }
  if (isUnkind(value)) {
    return { ok: false, title: 'Let’s keep it kind', message: `That message wasn’t sent. Try telling ${artistName} what you like, or one idea to try.` };
  }
  return { ok: true };
}
