// Ideas are built from the art in the museum. With an empty museum, starter ideas are used.

const PIECE_IDEAS = [
  { kind: 'Draw', title: (t) => `Draw your “${t}” somewhere new`, text: 'Maybe on the moon, under the sea, or in a jungle.' },
  { kind: 'Paint', title: (t) => `Paint your “${t}” at night`, text: 'What colors would everything turn in the dark?' },
  { kind: 'Draw', title: (t) => `Add a reflection to “${t}”`, text: 'Draw it upside down in a puddle or a lake below.' },
  { kind: 'Draw', title: (t) => `Draw what’s just outside “${t}”`, text: 'What would you see if the picture kept going?' },
  { kind: 'Make', title: (t) => `Remake “${t}” with only 3 colors`, text: 'Pick your favorite three and see what happens.' },
  { kind: 'Draw', title: (t) => `Give “${t}” a tiny friend`, text: 'Add a little character hiding somewhere in it.' },
  { kind: 'Paint', title: (t) => `Paint “${t}” in a storm`, text: 'Add wind, rain, or big swirling clouds.' },
  { kind: 'Draw', title: (t) => `Draw “${t}” up close`, text: 'Zoom in on one small part and make it huge.' },
];

const STARTERS = [
  { kind: 'Draw', title: 'Draw your favorite animal wearing a hat', text: 'Is it a tiny hat or a really tall one?' },
  { kind: 'Paint', title: 'Paint a sunset with only three colors', text: 'Try orange, pink, and purple.' },
  { kind: 'Draw', title: 'Draw your room like a map', text: 'Look at it from above, like a bird would.' },
  { kind: 'Make', title: 'Make a pattern using only circles', text: 'Big ones, small ones, and ones inside each other.' },
  { kind: 'Draw', title: 'Draw a friendly monster', text: 'Give it a name and a favorite snack.' },
  { kind: 'Paint', title: 'Paint the weather outside right now', text: 'Sunny, cloudy, rainy, or snowy?' },
  { kind: 'Draw', title: 'Draw a city in the clouds', text: 'How do people get around up there?' },
  { kind: 'Draw', title: 'Draw your shoe, really big', text: 'Fill the whole page with every detail.' },
];

function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const shorten = (t) => (t.length > 24 ? `${t.slice(0, 23)}…` : t);

export function makeIdeas(pieces, seed, count = 3) {
  const rand = random(seed);
  if (!pieces.length) {
    return shuffle(STARTERS, rand).slice(0, count).map((s, i) => ({ ...s, id: `s${seed}-${i}`, pieceId: null }));
  }
  const ps = shuffle(pieces, rand);
  const templates = shuffle(PIECE_IDEAS, rand);
  return Array.from({ length: count }, (_, i) => {
    const piece = ps[i % ps.length];
    const t = templates[i % templates.length];
    return { id: `p${seed}-${i}`, kind: t.kind, title: t.title(shorten(piece.title)), text: t.text, pieceId: piece.id };
  });
}
