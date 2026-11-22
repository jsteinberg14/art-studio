// Ideas are mostly random: silly characters, places, and quick challenges mixed together.
// Once in a while (about one refresh in four) one idea is based on a piece in the museum.

const PIECE_IDEAS = [
  { kind: 'Draw', title: (t) => `Draw your “${t}” somewhere new`, text: 'Maybe on the moon, under the sea, or in a jungle.' },
  { kind: 'Draw', title: (t) => `Add a reflection to “${t}”`, text: 'Draw it upside down in a puddle or a lake below.' },
  { kind: 'Draw', title: (t) => `Give “${t}” a tiny friend`, text: 'Add a little character hiding somewhere in it.' },
  { kind: 'Draw', title: (t) => `Draw “${t}” up close`, text: 'Zoom in on one small part and make it huge.' },
];

const CREATURES = [
  'a sleepy dragon', 'a robot who loves gardening', 'a cat astronaut', 'a tiny octopus', 'a friendly ghost',
  'a giant snail', 'a penguin on roller skates', 'a talking tree', 'a pirate pig', 'a cloud with a face',
  'a super-fast turtle', 'a dinosaur at a birthday party', 'a fox in a raincoat', 'a mermaid with a guitar',
  'a monster who is afraid of the dark', 'a llama in sunglasses', 'a superhero squirrel', 'a bear baking a cake',
  'a snowman on vacation', 'a wizard frog', 'a dog driving a bus', 'a unicorn with a jetpack',
  'a shy alien', 'a giraffe with a very long scarf', 'a spider who knits', 'a duck detective',
];
const PLACES = [
  'on top of a mountain of ice cream', 'inside a giant teacup', 'at the bottom of the ocean', 'on a floating island',
  'in a forest made of candy', 'on the moon', 'in a hot air balloon', 'at a school for monsters',
  'in a treehouse city', 'during a thunderstorm', 'in a haunted library', 'on a rainbow slide',
  'at a very fancy tea party', 'inside a volcano', 'on a train that never stops', 'in a garden of giant flowers',
  'at the end of a secret tunnel', 'on a pirate ship', 'inside a snow globe', 'in the middle of a dance party',
];
const ANIMALS = ['cat', 'owl', 'shark', 'rabbit', 'elephant', 'butterfly', 'crab', 'horse', 'frog', 'bat', 'zebra', 'parrot'];
const THINGS = ['teapot', 'sock', 'cactus', 'lamp', 'banana', 'umbrella', 'bicycle', 'cupcake', 'castle', 'boot', 'clock', 'pizza slice'];

const CHALLENGES = [
  { kind: 'Draw', title: 'Draw a house with 10 windows', text: 'Who lives behind each one?' },
  { kind: 'Make', title: 'Make a pattern using only zigzags', text: 'Try big zigzags, tiny ones, and ones that cross.' },
  { kind: 'Draw', title: 'Draw a monster using only triangles', text: 'Pointy teeth, pointy ears, pointy everything.' },
  { kind: 'Draw', title: 'Invent a brand new fruit and draw it', text: 'What does it taste like? What is it called?' },
  { kind: 'Draw', title: 'Draw your dream treehouse', text: 'Add ladders, slides, and a secret room.' },
  { kind: 'Draw', title: 'Draw a sandwich with 12 layers', text: 'What is the silliest thing you can put in it?' },
  { kind: 'Draw', title: 'Draw a hat for a giraffe', text: 'It has to be tall. Really tall.' },
  { kind: 'Draw', title: 'Draw a door to a secret world', text: 'What is waiting on the other side?' },
  { kind: 'Draw', title: 'Draw a bug as big as a bus', text: 'Would people ride it or run from it?' },
  { kind: 'Make', title: 'Make a pattern using only dots', text: 'Try big dots, tiny dots, and dots inside dots.' },
  { kind: 'Draw', title: 'Draw a robot made of kitchen things', text: 'Maybe a toaster body and spoon arms.' },
  { kind: 'Draw', title: 'Draw a map of an island that doesn’t exist', text: 'Add a treasure spot and a scary swamp.' },
  { kind: 'Draw', title: 'Draw a cat who is the boss of a company', text: 'What is its office like?' },
  { kind: 'Draw', title: 'Draw a vehicle that can go anywhere', text: 'Wheels? Wings? Rocket legs?' },
  { kind: 'Draw', title: 'Draw a fish that lives in the sky', text: 'How does it swim through the clouds?' },
  { kind: 'Draw', title: 'Draw a family of tiny people living in a shoe', text: 'Where is the kitchen? Where do they sleep?' },
  { kind: 'Draw', title: 'Draw a tower that goes up forever', text: 'What is on the very top floor?' },
  { kind: 'Make', title: 'Make a creature from just five shapes', text: 'Circles, squares, triangles, or any you like.' },
  { kind: 'Draw', title: 'Draw something that only comes out at night', text: 'What does it do while everyone is asleep?' },
  { kind: 'Draw', title: 'Draw a fancy restaurant for bugs', text: 'What is on the menu?' },
  { kind: 'Draw', title: 'Draw an animal with the wrong number of legs', text: 'Two? Eleven? You decide.' },
  { kind: 'Draw', title: 'Draw your favorite food as a superhero', text: 'What is its power?' },
  { kind: 'Draw', title: 'Draw a house that can walk', text: 'Where is it going today?' },
  { kind: 'Draw', title: 'Draw a self-portrait as an animal', text: 'Which animal feels most like you?' },
  { kind: 'Draw', title: 'Draw a very, very long dog', text: 'How many friends can ride on its back?' },
  { kind: 'Draw', title: 'Draw a clock that tells silly times', text: 'Maybe “time for a nap” or “time to dance.”' },
  { kind: 'Make', title: 'Make a pattern that looks like waves', text: 'Wiggly lines in a row, over and over.' },
  { kind: 'Draw', title: 'Draw an invention that does your chores', text: 'Add buttons, arms, and a funny sound.' },
];
const HINTS = [
  'Give it a name.', 'What is it doing right now?', 'Add one tiny surprise.', 'Does it have a favorite snack?',
  'What is it thinking about?', 'Make it as silly as you can.', 'Add something hiding in the picture.', 'Who is its best friend?',
  'What sound does it make?', 'Is it big or tiny?', 'What happens next?',
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

const pick = (list, rand) => list[Math.floor(rand() * list.length)];

function pickTwo(list, rand) {
  const first = pick(list, rand);
  let second = pick(list, rand);
  while (second === first) second = pick(list, rand);
  return [first, second];
}

const shorten = (t) => (t.length > 24 ? `${t.slice(0, 23)}…` : t);

// Each recipe makes one random idea. The mix changes with every seed.
const RECIPES = [
  (rand) => ({ kind: 'Draw', title: `Draw ${pick(CREATURES, rand)} ${pick(PLACES, rand)}`, text: pick(HINTS, rand) }),
  (rand) => { const [a, b] = pickTwo(ANIMALS, rand); return { kind: 'Draw', title: `Draw a mash-up of a ${a} and a ${b}`, text: pick(HINTS, rand) }; },
  (rand) => ({ kind: 'Draw', title: `Give a ${pick(THINGS, rand)} a face and a job`, text: pick(HINTS, rand) }),
  (rand) => ({ ...pick(CHALLENGES, rand) }),
  (rand) => ({ ...pick(CHALLENGES, rand) }),
];

export function makeIdeas(pieces, seed, count = 3) {
  const rand = random(seed);
  const ideas = [];
  const seen = new Set();
  let guard = 0;
  while (ideas.length < count && guard++ < 200) {
    const idea = RECIPES[Math.floor(rand() * RECIPES.length)](rand);
    if (seen.has(idea.title)) continue;
    seen.add(idea.title);
    ideas.push({ ...idea, id: `r${seed}-${ideas.length}`, pieceId: null });
  }
  // Now and then, swap one idea for one based on a saved piece.
  if (pieces.length && rand() < 0.25) {
    const piece = pick(pieces, rand);
    const t = pick(PIECE_IDEAS, rand);
    const slot = Math.floor(rand() * count);
    ideas[slot] = { id: `p${seed}-${slot}`, kind: t.kind, title: t.title(shorten(piece.title)), text: t.text, pieceId: piece.id };
  }
  return ideas;
}
