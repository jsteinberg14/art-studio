// Sample friends and posts for the Friends preview. Real sharing needs a server
// with grown-up approval (see README.md), so these stay on the device.

const svg = (body) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${body}</svg>`)}`;

const FLOWER = svg(`<rect width="200" height="200" fill="#FBEAF0"/>
<path d="M100 118 C97 150 103 172 100 200" stroke="#5DA56B" stroke-width="7" fill="none" stroke-linecap="round"/>
<ellipse cx="78" cy="160" rx="18" ry="8" fill="#7DBA87" transform="rotate(-30 78 160)"/>
<g fill="#ED93B1"><circle cx="100" cy="70" r="23"/><circle cx="128" cy="92" r="23"/><circle cx="117" cy="124" r="23"/><circle cx="83" cy="124" r="23"/><circle cx="72" cy="92" r="23"/></g>
<circle cx="100" cy="100" r="17" fill="#FAC775"/>`);

const CAT = svg(`<rect width="200" height="200" fill="#0C447C"/>
<circle cx="40" cy="40" r="3" fill="#FFF"/><circle cx="160" cy="30" r="2" fill="#FFF"/><circle cx="170" cy="120" r="3" fill="#FFF"/><circle cx="25" cy="140" r="2" fill="#FFF"/>
<circle cx="150" cy="60" r="22" fill="#FAC775"/>
<ellipse cx="100" cy="150" rx="50" ry="38" fill="#85B7EB"/>
<circle cx="100" cy="98" r="34" fill="#85B7EB"/>
<path d="M74 74 L78 50 L92 68 Z M126 74 L122 50 L108 68 Z" fill="#85B7EB"/>
<circle cx="89" cy="96" r="4" fill="#0C447C"/><circle cx="111" cy="96" r="4" fill="#0C447C"/>
<path d="M94 109 Q100 114 106 109" fill="none" stroke="#0C447C" stroke-width="3" stroke-linecap="round"/>`);

const SUN = svg(`<rect width="200" height="200" fill="#FAEEDA"/>
<g stroke="#EF9F27" stroke-width="7" stroke-linecap="round"><path d="M100 18v18M100 128v-6M42 76h18M140 76h18M58 34l12 12M142 34l-12 12M58 118l12-12M142 118l-12-12"/></g>
<circle cx="100" cy="76" r="32" fill="#EF9F27"/>
<path d="M0 160 Q50 120 100 150 T200 140 V200 H0 Z" fill="#8FD19E"/>
<path d="M0 180 Q60 150 120 175 T200 170 V200 H0 Z" fill="#5DA56B"/>`);

const RAINBOW = svg(`<rect width="200" height="200" fill="#E6F1FB"/>
<g fill="none" stroke-width="12"><path d="M30 150 A70 70 0 0 1 170 150" stroke="#F28B82"/><path d="M42 150 A58 58 0 0 1 158 150" stroke="#F8B26A"/><path d="M54 150 A46 46 0 0 1 146 150" stroke="#FBD66A"/><path d="M66 150 A34 34 0 0 1 134 150" stroke="#8FD19E"/><path d="M78 150 A22 22 0 0 1 122 150" stroke="#85B7EB"/></g>
<g fill="#FFFFFF"><circle cx="34" cy="152" r="16"/><circle cx="54" cy="156" r="14"/><circle cx="166" cy="152" r="16"/><circle cx="146" cy="156" r="14"/></g>`);

export const FRIENDS = [
  { id: 'mia', name: 'Mia', tone: 'gum' },
  { id: 'jay', name: 'Jay', tone: 'sky' },
  { id: 'sam', name: 'Sam', tone: 'sun' },
  { id: 'lily', name: 'Lily', tone: 'gum' },
];

export const SAMPLE_POSTS = [
  { id: 'sample-1', author: 'mia', title: 'My first watercolor flower', art: FLOWER, ago: '2 hours ago', hearts: 4, stars: 2 },
  { id: 'sample-2', author: 'jay', title: 'Space cat', art: CAT, ago: 'Yesterday', hearts: 6, stars: 3 },
  { id: 'sample-3', author: 'sam', title: 'Sunny day on the hill', art: SUN, ago: '2 days ago', hearts: 3, stars: 1 },
  { id: 'sample-4', author: 'lily', title: 'Rainbow in the clouds', art: RAINBOW, ago: '3 days ago', hearts: 5, stars: 4 },
];

export const SAMPLE_COMMENTS = {
  'sample-1': [
    { id: 'c1', author: 'jay', text: 'The petals look so soft!' },
    { id: 'c2', author: 'sam', text: 'I love the colors you picked.' },
  ],
  'sample-2': [{ id: 'c3', author: 'mia', text: 'Space cat is so cool' }],
  'sample-3': [{ id: 'c4', author: 'lily', text: 'It makes me want to go outside' }],
  'sample-4': [],
};
