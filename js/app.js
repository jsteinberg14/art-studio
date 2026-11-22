import { icon } from './icons.js';
import * as db from './db.js';
import { analyzeImage, loadImage } from './feedback.js';
import { checkComment, QUICK_COMMENTS, MAX_COMMENT } from './kindness.js';
import { Drawing, SIZE_STEPS, BLEND_SIZES, BLEND_STRENGTHS } from './draw.js';
import { makeIdeas } from './ideas.js';
import { FRIENDS, SAMPLE_POSTS, SAMPLE_COMMENTS } from './sample.js';
import { cloudEnabled } from './cloud.js';
import { createCloudFriends } from './friends.js';

const APP_NAME = 'My Art Studio';
const main = document.getElementById('main');
const toastEl = document.getElementById('toast');
const fileInput = document.getElementById('snap-input');
const dialog = document.getElementById('dialog');

/* ---------- Settings ---------- */
const SETTINGS_KEY = 'art-studio-settings';
const THEMES = [
  { id: 'sky', name: 'Sky blue' },
  { id: 'sun', name: 'Sunny yellow' },
  { id: 'gum', name: 'Bubblegum pink' },
  { id: 'bw', name: 'Black and white' },
];
const VIBES = [
  { id: 'bubbly', name: 'Bubbly', example: 'Wow, your colors are super bright and bold!' },
  { id: 'clear', name: 'Clear', example: 'Your colors are bright and bold.' },
];
const SIZES = [
  { id: 'normal', name: 'Standard', example: 'Regular text and color circles' },
  { id: 'big', name: 'Bigger', example: 'Larger text and color circles on the canvas' },
];
const settings = Object.assign({ theme: 'sky', vibe: 'bubbly', size: 'normal' }, readSettings());
function readSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch (e) { return {}; } }
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* private mode */ } }
function applyTheme() { document.documentElement.dataset.theme = settings.theme; document.documentElement.dataset.size = settings.size; }
applyTheme();

/* ---------- Helpers ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const frag = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content; };
const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const fmtDate = (ts, long = false) => new Date(ts).toLocaleDateString(undefined, long ? { month: 'long', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });
function fmtAgo(ts) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} ${hrs === 1 ? 'hour' : 'hours'} ago`;
  return fmtDate(ts);
}

let toastTimer;
function say(message) {
  toastEl.classList.remove('show');
  toastEl.textContent = '';
  requestAnimationFrame(() => { toastEl.textContent = message; toastEl.classList.add('show'); });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
}

function go(hash) { if (location.hash === hash) router(); else location.hash = hash; }

const urlCache = new Map();
function pieceUrl(piece, which = 'thumb') {
  const key = `${piece.id}:${which}`;
  if (!urlCache.has(key)) urlCache.set(key, URL.createObjectURL(which === 'thumb' ? piece.thumb || piece.image : piece.image));
  return urlCache.get(key);
}
// The photo file is made when a piece opens, so the Send button can open the share sheet
// straight from the tap. (iPhone only allows sharing right after a tap.)
const shareFiles = new Map();
function prepareShareFile(piece) {
  const type = piece.image.type || 'image/jpeg';
  const ext = type === 'image/png' ? 'png' : 'jpg';
  const name = (piece.title || 'My art').replace(/[^\w\- ]+/g, '').trim().slice(0, 40) || 'My art';
  shareFiles.set(piece.id, new File([piece.image], `${name}.${ext}`, { type }));
}
function forgetUrls(id) {
  for (const [k, url] of urlCache) if (!id || k.startsWith(`${id}:`)) { URL.revokeObjectURL(url); urlCache.delete(k); }
}

async function shrink(blob, max, quality) {
  const img = await loadImage(blob);
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * k));
  c.height = Math.max(1, Math.round(img.naturalHeight * k));
  const g = c.getContext('2d');
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  img.release();
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('That picture could not be saved.'))), 'image/jpeg', quality));
}

function mix(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const target = t > 0 ? 255 : 0, k = Math.abs(t);
  r = Math.round(r + (target - r) * k); g = Math.round(g + (target - g) * k); b = Math.round(b + (target - b) * k);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
}
function brightness(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) / 3;
}

/* ---------- App state ---------- */
let pending = null; // a photo that was just taken: { blob, url, feedback }
let canvasJob = null; // what the canvas is drawing on: { blob, title, idea, back }
let drawing = null;
let ideaSeed = Math.floor(Math.random() * 100000);
let lastScreenHash = '#/home'; // where the blank canvas returns to

/* ---------- Dialog ---------- */
function ask({ title, body = '', ok = 'OK', cancel = 'Cancel', danger = false, field = null, choices = null }) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    dialog.innerHTML = `
      <form method="dialog" class="dialog-form" novalidate>
        <h2 id="dialog-title">${esc(title)}</h2>
        ${body ? `<p id="dialog-body">${esc(body)}</p>` : ''}
        ${field ? `<label class="field-label" for="dialog-field">${esc(field.label)}</label>
          <input type="text" id="dialog-field" class="input" maxlength="40" value="${esc(field.value)}" autocomplete="off">` : ''}
        ${choices ? `<fieldset class="pick-list"><legend class="sr-only">${esc(title)}</legend>
          ${choices.map((c, i) => `<label class="pick"><input type="radio" name="pick" value="${esc(c.value)}" ${i === 0 ? 'checked' : ''}>
            <img src="${c.img}" alt=""><span>${esc(c.label)}</span>${icon('check', 'pick-check')}</label>`).join('')}</fieldset>` : ''}
        <div class="btn-row dialog-actions">
          <button type="submit" value="cancel" class="btn">${esc(cancel)}</button>
          <button type="submit" value="ok" class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}">${esc(ok)}</button>
        </div>
      </form>`;
    dialog.setAttribute('aria-labelledby', 'dialog-title');
    if (body) dialog.setAttribute('aria-describedby', 'dialog-body'); else dialog.removeAttribute('aria-describedby');
    const form = dialog.querySelector('form');
    const fieldEl = dialog.querySelector('#dialog-field');
    let done = false;
    const finish = (confirmed) => {
      if (done) return;
      done = true;
      let value;
      if (fieldEl) value = fieldEl.value.trim();
      if (choices) value = (dialog.querySelector('input[name="pick"]:checked') || {}).value;
      dialog.close();
      if (opener && opener.isConnected && opener.focus) opener.focus();
      resolve(confirmed ? { ok: true, value } : { ok: false });
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); finish(!e.submitter || e.submitter.value === 'ok'); });
    if (fieldEl) fieldEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } });
    dialog.oncancel = (e) => { e.preventDefault(); finish(false); };
    dialog.showModal();
    if (fieldEl) { fieldEl.focus(); fieldEl.select(); }
    else dialog.querySelector(danger ? 'button[value="cancel"]' : 'button[value="ok"]').focus();
  });
}

/* ---------- Shared pieces of UI ---------- */
function feedbackCards(fb) {
  if (!fb) return '';
  return `
    <div class="fb fb-good"><span class="fb-icon">${icon('star')}</span>
      <div><h3 class="fb-title">You did well</h3><p>${esc(fb.good)}</p></div></div>
    <div class="fb fb-try"><span class="fb-icon">${icon('bulb')}</span>
      <div><h3 class="fb-title">Try this next</h3><p>${esc(fb.tryNext)}</p></div></div>`;
}

function backBar(title, href, label, extra = '') {
  return `<header class="bar">
    <a class="icon-btn" href="${href}" aria-label="${esc(label)}">${icon('chevronLeft')}</a>
    <h1 tabindex="-1">${esc(title)}</h1>
    ${extra || '<span class="bar-spacer"></span>'}
  </header>`;
}

const friendById = (id) => FRIENDS.find((f) => f.id === id) || { id, name: 'You', tone: settings.theme };
const avatar = (person, cls = '') => `<span class="avatar tone-${person.tone} ${cls}" aria-hidden="true">${esc(person.name.charAt(0))}</span>`;

/* ---------- Screens ---------- */
const sparkSvg = (cls) => `<svg class="spark ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 0C13 7 17 11 24 12C17 13 13 17 12 24C11 17 7 13 0 12C7 11 11 7 12 0Z"/></svg>`;

async function homeScreen() {
  const pieces = await db.allPieces();
  const favorites = pieces.filter((p) => p.favorite);
  const spark = sparkSvg;
  const tile = (href, tone, name, sub, ic, extra = '') => `<li${extra ? ` class="${extra}"` : ''}><a class="link-tile tile-${tone}" href="${href}"><span class="tile-disc">${icon(ic)}</span><span class="tile-text"><span class="tile-name">${name}</span><span class="tile-sub">${sub}</span></span></a></li>`;
  return frag(`
    <div class="home">
    <header class="home-head">
      ${spark('spark-a')}${spark('spark-b')}
      <h1 tabindex="-1">What will you make today?</h1>
      <svg class="ribbon" viewBox="0 0 320 18" aria-hidden="true" focusable="false">
        <defs><linearGradient id="ribbon-paint" x1="0" x2="1" y1="0" y2="0">
          ${['coral', 'orange', 'butter', 'mint', 'sky', 'grape', 'pink'].map((c, i) => `<stop offset="${(i / 7 * 100).toFixed(2)}%" style="stop-color:var(--pop-${c})"/><stop offset="${((i + 1) / 7 * 100).toFixed(2)}%" style="stop-color:var(--pop-${c})"/>`).join('')}
        </linearGradient></defs>
        <path d="M6 9C32 -1 52 19 80 9S128 -1 160 9S208 19 240 9S288 -1 314 9" fill="none" stroke="var(--ink)" stroke-width="12" stroke-linecap="round"/>
        <path class="ribbon-paint" d="M6 9C32 -1 52 19 80 9S128 -1 160 9S208 19 240 9S288 -1 314 9" fill="none" stroke="url(#ribbon-paint)" stroke-width="7" stroke-linecap="round"/>
      </svg>
    </header>
    <nav aria-label="Everything in your studio">
      <ul class="link-grid" role="list">
        <li class="tile-wide"><a class="link-tile link-tile-snap tile-coral" href="#/snap">
          ${spark('spark-c')}${spark('spark-d')}
          <span class="tile-disc tile-disc-big">${icon('camera')}</span>
          <span class="tile-text"><span class="tile-name">Snap your art</span><span class="tile-sub">Take a photo and get ideas</span></span></a></li>
        ${tile('#/canvas" data-action="blank-canvas', 'butter', 'Blank canvas', 'Draw anything', 'blank')}
        ${tile('#/ideas', 'mint', 'Ideas', 'Surprise me', 'bulb')}
        ${tile('#/museum', 'sky', 'Museum', 'All your art', 'photo')}
        ${tile('#/friends', 'grape', 'Friends', 'Share and see', 'users')}
        ${tile('#/settings', 'pink', 'Settings', 'Make it yours', 'settings', 'tile-slim')}
        ${cloudEnabled ? tile('#/parent', 'orange', 'Grown-ups', 'For parents', 'lock', 'tile-slim') : ''}
      </ul>
    </nav>
    <section class="block" aria-labelledby="fav-h">
      <div class="section-row"><h2 id="fav-h" class="section-label">${icon('heart')}Your favorites</h2>
        ${favorites.length > 6 ? '<a href="#/museum" class="text-link" aria-label="See all your art in the museum">See all</a>' : ''}</div>
      ${favorites.length
        ? `<ul class="thumb-row fav-row" role="list">${favorites.slice(0, 6).map((p) => `<li><a href="#/piece/${p.id}" class="thumb-link"><img src="${pieceUrl(p)}" alt="${esc(p.title)}"></a></li>`).join('')}</ul>`
        : `<p class="empty-note empty-fav">Tap the heart on a piece in your museum and it shows up here.</p>`}
    </section>
    </div>`);
}

async function snapScreen() {
  const pieces = await db.allPieces();
  const latest = pieces.find((p) => p.feedback);
  return frag(`
    <header class="screen-head">
      <div><p class="kicker">Get ideas to make it even better</p><h1 tabindex="-1">Snap your art</h1></div>
    </header>
    <button type="button" class="snap-card" data-action="snap">
      ${sparkSvg('spark-c')}${sparkSvg('spark-d')}
      <span class="snap-circle">${icon('camera')}</span>
      <span class="snap-title">Snap your art</span>
      <span class="snap-sub">Take or choose a photo</span>
    </button>
    <section class="block" aria-labelledby="latest-h">
      <h2 id="latest-h" class="section-label">Latest feedback</h2>
      ${latest ? feedbackCards(latest.feedback) : '<p class="empty-note">Snap a piece of art and your feedback shows up here.</p>'}
    </section>
    <section class="block" aria-labelledby="museum-h">
      <div class="section-row"><h2 id="museum-h" class="section-label">Your museum</h2>
        ${pieces.length ? '<a href="#/museum" class="text-link" aria-label="See all art in your museum">See all</a>' : ''}</div>
      ${pieces.length
        ? `<ul class="thumb-row" role="list">${pieces.slice(0, 3).map((p) => `<li><a href="#/piece/${p.id}" class="thumb-link"><img src="${pieceUrl(p)}" alt="${esc(p.title)}"></a></li>`).join('')}</ul>`
        : '<p class="empty-note">Your saved art will hang here.</p>'}
    </section>`);
}

async function reviewScreen() {
  if (!pending) { location.replace('#/snap'); return snapScreen(); }
  return frag(`
    ${backBar('Your art', '#/snap', 'Back to Snap')}
    <div class="photo-frame"><img src="${pending.url}" alt="The picture you just took of your art"></div>
    <section class="block" aria-labelledby="fb-h">
      <h2 id="fb-h" class="section-label">Feedback</h2>
      ${feedbackCards(pending.feedback)}
    </section>
    <form class="block stack" data-form="save-piece">
      <div><label for="piece-title" class="field-label">Name your art</label>
      <input type="text" id="piece-title" class="input" maxlength="40" value="${esc(pending.title || 'My art')}" autocomplete="off"></div>
      <div class="btn-row">
        <button type="button" class="btn" data-action="draw-pending">${icon('brush')}Draw on it</button>
        <button type="submit" class="btn btn-primary">Save to museum</button>
      </div>
      <button type="button" class="btn btn-quiet" data-action="snap">${icon('camera')}Take another picture</button>
    </form>`);
}

async function museumScreen() {
  const pieces = await db.allPieces();
  if (!pieces.length) {
    return frag(`
      <header class="screen-head"><div><h1 tabindex="-1">Your museum</h1></div></header>
      <div class="empty">
        <span class="empty-icon">${icon('photo')}</span>
        <h2>Start your museum</h2>
        <p>Every piece you save hangs here, with plenty of room around it.</p>
        <button type="button" class="btn btn-primary" data-action="snap">${icon('camera')}Snap your art</button>
      </div>`);
  }
  return frag(`
    <header class="screen-head"><div><h1 tabindex="-1">Your museum</h1>
      <p class="sub">${pieces.length} ${pieces.length === 1 ? 'piece' : 'pieces'}</p></div></header>
    <ul class="gallery" role="list">
      ${pieces.map((p) => `<li><a class="art-tile" href="#/piece/${p.id}">
        <span class="art-frame"><img src="${pieceUrl(p)}" alt="">${p.favorite ? `<span class="fav-badge" aria-hidden="true">${icon('heart')}</span>` : ''}</span>
        <span class="art-title">${esc(p.title)}${p.favorite ? '<span class="sr-only">, favorite</span>' : ''}</span>
        <span class="art-date">${fmtDate(p.createdAt)}</span></a></li>`).join('')}
    </ul>`);
}

async function pieceScreen(id) {
  const p = await db.getPiece(id);
  if (!p) return notFound('That piece isn’t in your museum anymore.', '#/museum', 'Go to your museum');
  prepareShareFile(p);
  return frag(`
    <header class="bar bar-two">
      <a class="icon-btn" href="#/museum" aria-label="Back to your museum">${icon('chevronLeft')}</a>
      <span class="bar-spacer"></span>
      <div class="head-actions">
        <button type="button" class="icon-btn fav-btn" data-action="toggle-favorite" data-id="${p.id}" aria-pressed="${!!p.favorite}" aria-label="Favorite">${icon('heart')}</button>
        <button type="button" class="icon-btn" data-action="delete-piece" data-id="${p.id}" aria-label="Delete ${esc(p.title)}">${icon('trash')}</button>
      </div>
    </header>
    <div class="photo-frame"><img src="${pieceUrl(p, 'full')}" alt="${esc(p.title)}"></div>
    <h1 tabindex="-1" class="piece-title">${esc(p.title)}</h1>
    <p class="sub">${fmtDate(p.createdAt, true)}</p>
    ${p.feedback ? `<section class="block" aria-labelledby="pfb-h"><h2 id="pfb-h" class="section-label">Feedback</h2>${feedbackCards(p.feedback)}</section>` : ''}
    <div class="btn-row block">
      <button type="button" class="btn btn-primary" data-action="send-photo" data-id="${p.id}">${icon('sendOut')}Send photo</button>
    </div>
    <div class="btn-row">
      <button type="button" class="btn" data-action="share-piece" data-id="${p.id}">${icon('share')}Post to Friends</button>
      <button type="button" class="btn btn-primary" data-action="draw-piece" data-id="${p.id}">${icon('brush')}Draw on it</button>
    </div>`);
}

async function ideasScreen() {
  const pieces = await db.allPieces();
  const ideas = makeIdeas(pieces.slice(0, 8), ideaSeed);
  const tones = ['sky', 'sun', 'gum'];
  return frag(`
    <header class="screen-head"><div><h1 tabindex="-1">Ideas for you</h1>
      <p class="sub">Surprise ideas to spark your next drawing</p></div></header>
    <ul class="idea-list" role="list">
      ${ideas.map((idea, i) => {
        const p = idea.pieceId && pieces.find((x) => x.id === idea.pieceId);
        return `<li class="idea tone-${tones[i % 3]}">
          <div class="idea-src">${p ? `<img src="${pieceUrl(p)}" alt="">` : `<span class="idea-src-icon">${icon('bulb')}</span>`}
            <span>${p ? `Based on ${esc(p.title)}` : 'Surprise idea'}</span></div>
          <h2 class="idea-title">${esc(idea.title)}</h2>
          <p class="idea-text">${esc(idea.text)}</p>
          <div class="idea-foot"><span class="tag">${idea.kind}</span>
            <button type="button" class="idea-go" data-action="try-idea" data-piece="${idea.pieceId || ''}" data-idea="${esc(idea.title)}" aria-label="Try it: ${esc(idea.title)}">Try it ${icon('arrowRight')}</button></div>
        </li>`;
      }).join('')}
    </ul>
    <div class="center block"><button type="button" class="btn" data-action="new-ideas" data-fk="new-ideas">${icon('refresh')}Show new ideas</button></div>`);
}

/* Friends (preview): posts are stored on this device only. */
async function myPosts() {
  const posts = await db.kvGet('posts', []);
  const out = [];
  for (const post of posts) {
    const piece = await db.getPiece(post.pieceId);
    if (piece) out.push({ ...post, mine: true, person: friendById('you'), img: pieceUrl(piece), ago: fmtAgo(post.createdAt), hearts: 0, stars: 0 });
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}
function samplePosts() {
  return SAMPLE_POSTS.map((p) => ({ ...p, mine: false, person: friendById(p.author), img: p.art }));
}
async function findPost(id) {
  return [...(await myPosts()), ...samplePosts()].find((p) => p.id === id) || null;
}
async function getComments(postId) {
  const all = await db.kvGet('comments', {});
  if (all[postId]) return all[postId];
  return (SAMPLE_COMMENTS[postId] || []).map((c) => ({ ...c, createdAt: 0 }));
}
async function saveComments(postId, list) {
  const all = await db.kvGet('comments', {});
  all[postId] = list;
  await db.kvSet('comments', all);
}

async function friendsScreen() {
  const posts = [...(await myPosts()), ...samplePosts()];
  const reactions = await db.kvGet('reactions', {});
  const counts = {};
  for (const p of posts) counts[p.id] = (await getComments(p.id)).length;
  return frag(`
    <header class="screen-head">
      <div><h1 tabindex="-1">Friends</h1></div>
      <button type="button" class="icon-btn icon-btn-filled" data-action="share" aria-label="Share your art">${icon('plus')}</button>
    </header>
    <p class="notice">${icon('lock')}<span>Preview mode. Only you can see this until a grown-up sets up sharing.</span></p>
    <ul class="friend-row" aria-label="Your friends">
      ${FRIENDS.map((f) => `<li class="friend">${avatar(f)}<span>${esc(f.name)}</span></li>`).join('')}
    </ul>
    <ul class="feed" role="list">
      ${posts.map((p) => {
        const r = reactions[p.id] || {};
        return `<li><article class="post" aria-labelledby="post-${p.id}">
          <div class="post-head">${avatar(p.person, 'avatar-sm')}
            <div><p class="post-name" id="post-${p.id}">${esc(p.person.name)}</p><p class="post-time">${esc(p.ago)}</p></div></div>
          <div class="post-art"><img src="${p.img}" alt="Art by ${esc(p.person.name)}: ${esc(p.title)}"></div>
          <div class="post-actions">
            <button type="button" class="react react-heart" data-action="react" data-post="${p.id}" data-kind="heart" data-base="${p.hearts}" aria-pressed="${!!r.heart}">
              ${icon('heart')}<span class="sr-only">Like</span><span class="react-count">${p.hearts + (r.heart ? 1 : 0)}</span></button>
            <button type="button" class="react react-star" data-action="react" data-post="${p.id}" data-kind="star" data-base="${p.stars}" aria-pressed="${!!r.star}">
              ${icon('star')}<span class="sr-only">Favorite</span><span class="react-count">${p.stars + (r.star ? 1 : 0)}</span></button>
            <a class="react" href="#/post/${p.id}">${icon('message')}<span class="sr-only">Comments</span><span class="react-count">${counts[p.id]}</span></a>
          </div>
          <p class="caption"><span class="caption-name">${esc(p.person.name)}</span> ${esc(p.title)}</p>
        </article></li>`;
      }).join('')}
    </ul>`);
}

async function postScreen(id) {
  const post = await findPost(id);
  if (!post) return notFound('That post isn’t here anymore.', '#/friends', 'Go to friends');
  const comments = (await getComments(id)).filter((c) => !c.deleted);
  const owner = post.mine ? 'your friends' : `${post.person.name}’s friends`;
  return frag(`
    ${backBar('Comments', '#/friends', 'Back to friends')}
    <div class="post-summary">
      <img src="${post.img}" alt="Art by ${esc(post.person.name)}: ${esc(post.title)}">
      <div><p class="summary-title">${esc(post.title)}</p><p class="sub">Only ${esc(owner)} can see this</p></div>
    </div>
    ${post.mine ? `<button type="button" class="switch-row" role="switch" aria-checked="${!post.commentsOff}" data-action="toggle-comments" data-post="${post.id}" data-fk="switch">
      <span>Allow comments</span><span class="switch" aria-hidden="true"><span class="switch-knob"></span></span></button>` : ''}
    ${comments.length ? `<ul class="comments" role="list">
      ${comments.map((c) => {
        const person = friendById(c.author);
        const canDelete = post.mine || c.author === 'you';
        return `<li class="comment" tabindex="-1" data-fk="c-${c.id}">${avatar(person, 'avatar-sm')}
          <div class="bubble tone-${person.tone}"><p class="bubble-name">${esc(person.name)}</p><p>${esc(c.text)}</p>
          ${c.reported ? '<p class="reported">Reported. A grown-up will check it.</p>' : ''}</div>
          ${canDelete
            ? `<button type="button" class="icon-btn icon-btn-small" data-action="delete-comment" data-post="${post.id}" data-id="${c.id}" aria-label="Delete comment from ${esc(person.name)}">${icon('trash')}</button>`
            : (c.reported ? '' : `<button type="button" class="icon-btn icon-btn-small" data-action="report-comment" data-post="${post.id}" data-id="${c.id}" aria-label="Report comment from ${esc(person.name)}">${icon('flag')}</button>`)}
        </li>`;
      }).join('')}</ul>` : '<p class="empty-note block">No comments yet. Be the first to say something kind.</p>'}
    ${post.commentsOff ? '<p class="empty-note block">Comments are turned off for this post.</p>' : `
      <div id="nudge" class="nudge-region" role="alert"></div>
      <section class="block" aria-labelledby="quick-h">
        <h2 id="quick-h" class="section-label">Quick comments</h2>
        <div class="chips">${QUICK_COMMENTS.map((q, i) => `<button type="button" class="chip tone-${['sun', 'sky', 'gum'][i % 3]}" data-action="quick" data-post="${post.id}" data-text="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      </section>
      <form class="block" data-form="comment" data-post="${post.id}">
        <label for="comment-text" class="field-label">Write a comment</label>
        <div class="composer">
          <input type="text" id="comment-text" maxlength="${MAX_COMMENT}" placeholder="Say something kind" autocomplete="off" enterkeyhint="send" aria-describedby="comment-count">
          <span class="count-hint" aria-hidden="true" id="comment-count-visible">0/${MAX_COMMENT}</span><span id="comment-count" class="sr-only">0 of ${MAX_COMMENT} letters used</span>
          <button type="submit" class="send" aria-label="Send comment">${icon('send')}</button>
        </div>
      </form>`}`);
}

function settingsScreen() {
  return frag(`
    ${backBar('Settings', '#/home', 'Back to your studio')}
    <form class="settings" data-form="settings">
      <fieldset class="choice-group"><legend>Color scheme</legend>
        ${THEMES.map((t) => `<label class="choice"><input type="radio" name="theme" value="${t.id}" ${settings.theme === t.id ? 'checked' : ''}>
          <span class="choice-swatch tone-${t.id}" aria-hidden="true"></span><span class="choice-name">${t.name}</span>${icon('check', 'choice-check')}</label>`).join('')}
      </fieldset>
      <fieldset class="choice-group"><legend>Canvas text and colors</legend>
        <p class="legend-note">Makes the words and color circles on the drawing screen bigger.</p>
        ${SIZES.map((z) => `<label class="choice"><input type="radio" name="size" value="${z.id}" ${settings.size === z.id ? 'checked' : ''}>
          <span class="choice-text"><span class="choice-name">${z.name}</span><span class="choice-example">${esc(z.example)}</span></span>${icon('check', 'choice-check')}</label>`).join('')}
      </fieldset>
      <fieldset class="choice-group"><legend>Feedback style</legend>
        <p class="legend-note">Changes how new feedback sounds.</p>
        ${VIBES.map((v) => `<label class="choice"><input type="radio" name="vibe" value="${v.id}" ${settings.vibe === v.id ? 'checked' : ''}>
          <span class="choice-text"><span class="choice-name">${v.name}</span><span class="choice-example">${esc(v.example)}</span></span>${icon('check', 'choice-check')}</label>`).join('')}
      </fieldset>
    </form>
    ${cloudEnabled ? `<section class="block" aria-labelledby="grownups-h">
      <h2 id="grownups-h" class="section-label">Grown-ups</h2>
      <p class="body-copy">Set up Friends, add kids, connect with other families, and check reported comments.</p>
      <a class="btn block-btn block" href="#/parent">${icon('lock')}Open the grown-up area</a>
    </section>` : ''}
    <section class="block" aria-labelledby="about-h">
      <h2 id="about-h" class="section-label">About your art</h2>
      <p class="body-copy">Feedback comes from a helper built into this app. It looks at the colors, light, and detail in your picture. ${cloudEnabled ? 'Your museum stays on this device. Only art you share goes to your friends.' : 'Your art stays on this device.'}</p>
    </section>
    <section class="block" aria-labelledby="fresh-h">
      <h2 id="fresh-h" class="section-label">Start fresh</h2>
      <button type="button" class="btn btn-danger" data-action="reset-all">${icon('trash')}Delete all my art</button>
    </section>`);
}

function notFound(message, href, label) {
  return frag(`<div class="empty"><h1 tabindex="-1">Not found</h1><p>${esc(message)}</p><a class="btn btn-primary" href="${href}">${esc(label)}</a></div>`);
}

/* ---------- Canvas screen ---------- */
const TOOLS = [
  { id: 'pen', label: 'Pen', icon: 'pencil' },
  { id: 'marker', label: 'Marker', icon: 'marker' },
  { id: 'brush', label: 'Paint brush', icon: 'brush' },
  { id: 'blend', label: 'Blend', icon: 'blend' },
  { id: 'eraser', label: 'Eraser', icon: 'eraser' },
];
// Blend smudges only the drawing, not a photo underneath, so it appears on blank canvases only.
const toolsFor = (job) => TOOLS.filter((t) => t.id !== 'blend' || !job.blob);
const PALETTES = [
  { label: 'Rainbow colors', start: 0, colors: [['Red', '#F28B82'], ['Orange', '#F8B26A'], ['Yellow', '#FBD66A'], ['Green', '#8FD19E'], ['Blue', '#85B7EB'], ['Purple', '#B39DDB'], ['Pink', '#F4A6C6']] },
  { label: 'Neutral colors', start: 3, colors: [['White', '#FFFFFF'], ['Light tan', '#E8D5B7'], ['Tan', '#C69C6D'], ['Brown', '#8B5E3C'], ['Dark brown', '#5A3A22'], ['Gray', '#888780'], ['Black', '#1F1F1F']] },
];
const cv = { tool: 'pen', pal: 0, base: 0, color: '#F28B82', sizesOpen: false, size: { pen: 0, marker: 2, brush: 2, blend: 1, eraser: 2 }, strength: 1 };

const edge = (hex) => mix(hex, brightness(hex) < 60 ? 0.45 : -0.45);
function shadesFor(name, hex) {
  const b = brightness(hex);
  if (b > 240) return [[0, 'White'], [-0.06, 'Soft white'], [-0.12, 'Pale gray'], [-0.2, 'Light gray'], [-0.3, 'Silver']].map(([t, n]) => [n, t ? mix(hex, t) : hex]);
  if (b < 50) return [[0.65, 'Light gray'], [0.5, 'Gray'], [0.35, 'Dark gray'], [0.2, 'Charcoal'], [0, 'Black']].map(([t, n]) => [n, t ? mix(hex, t) : hex]);
  const lower = name.toLowerCase();
  return [[0.6, `Lightest ${lower}`], [0.3, `Light ${lower}`], [0, name], [-0.25, `Dark ${lower}`], [-0.5, `Darkest ${lower}`]].map(([t, n]) => [n, t ? mix(hex, t) : hex]);
}

function canvasScreen() {
  if (!canvasJob) canvasJob = { blob: null, title: 'My drawing', idea: null, back: '#/home' };
  return frag(`
    <header class="bar">
      <button type="button" class="icon-btn" data-action="leave-canvas" aria-label="Back">${icon('chevronLeft')}</button>
      <h1 tabindex="-1">${canvasJob.idea ? 'Try your idea' : (canvasJob.blob ? 'Draw on it' : 'Blank canvas')}</h1>
      <span class="bar-spacer"></span>
    </header>
    ${canvasJob.idea ? `<p class="idea-banner">${icon('bulb')}<span>${esc(canvasJob.idea)}</span></p>` : ''}
    <div class="stage-wrap"><div class="stage" id="stage"></div></div>
    <div class="tool-row">
      <div class="tools" role="group" aria-label="Drawing tools">
        ${toolsFor(canvasJob).map((t) => `<button type="button" class="tool" data-tool="${t.id}" data-fk="tool-${t.id}" aria-pressed="false" aria-label="${t.label}">${icon(t.icon)}</button>`).join('')}
      </div>
      <button type="button" class="tool tool-undo" data-action="undo" aria-label="Undo">${icon('undo')}</button>
    </div>
    <div class="size-row"><div id="sizes" class="sizes"></div><span class="preview-wrap" aria-hidden="true"><span id="preview" class="preview"></span></span></div>
    <div class="strength-row" id="strengths" hidden></div>
    <div class="color-row" id="color-row">
      <div id="swatches" class="swatches" role="group"></div>
      <button type="button" id="palette-arrow" class="arrow-btn" data-action="switch-palette" data-fk="arrow"></button>
    </div>
    <div id="shades" class="shades" role="group"></div>
    <div class="btn-row canvas-actions">
      <button type="button" class="btn" data-action="start-over">Start over</button>
      <button type="button" class="btn btn-primary" data-action="save-drawing">Save to museum</button>
    </div>`);
}

async function setupCanvas() {
  const stage = document.getElementById('stage');
  if (cv.tool === 'blend' && canvasJob.blob) cv.tool = 'pen';
  drawing = new Drawing(stage);
  drawing.ink.setAttribute('role', 'img');
  drawing.ink.setAttribute('aria-label', canvasJob.blob ? 'Drawing area on top of your picture. Draw with your finger or Apple Pencil.' : 'Blank drawing area. Draw with your finger or Apple Pencil.');
  try { await drawing.setBackground(canvasJob.blob); } catch (e) { say(e.message); }
  cv.sizesOpen = false;
  renderControls();

  const tools = main.querySelector('.tools');
  let holdTimer = null;
  let held = false;
  tools.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-tool]');
    if (!b) return;
    held = false;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      held = true;
      cv.tool = b.dataset.tool;
      cv.sizesOpen = true;
      renderControls();
      if (navigator.vibrate) navigator.vibrate(10);
    }, 450);
  });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) tools.addEventListener(type, () => clearTimeout(holdTimer));
  tools.addEventListener('contextmenu', (e) => e.preventDefault());
  tools.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tool]');
    if (!b) return;
    if (held) { held = false; return; }
    const keyboard = e.detail === 0;
    if (cv.tool === b.dataset.tool) cv.sizesOpen = !cv.sizesOpen;
    else { cv.tool = b.dataset.tool; cv.sizesOpen = false; }
    renderControls();
    if (keyboard && cv.sizesOpen) { const s = main.querySelector('.size-btn[aria-pressed="true"]'); if (s) s.focus(); }
  });
}

function renderControls() {
  if (!drawing) return;
  const focusKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fk : null;
  const tool = TOOLS.find((t) => t.id === cv.tool);
  main.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === cv.tool)));

  const sizes = main.querySelector('#sizes');
  if (cv.sizesOpen) {
    sizes.setAttribute('role', 'group');
    sizes.setAttribute('aria-label', `${tool.label} size`);
    const blend = cv.tool === 'blend';
    sizes.innerHTML = (blend ? BLEND_SIZES : SIZE_STEPS).map((s, i) => {
      const dot = blend ? Math.min(26, Math.round(s.px * 0.38)) : Math.min(s.px, 22);
      return `<button type="button" class="size-btn" data-action="pick-size" data-i="${i}" data-fk="size-${i}" aria-pressed="${cv.size[cv.tool] === i}">
      <span class="size-dot" style="width:${dot}px;height:${dot}px"></span><span class="sr-only">${s.label}</span></button>`;
    }).join('');
  } else {
    sizes.removeAttribute('role');
    sizes.removeAttribute('aria-label');
    sizes.innerHTML = '<span class="size-hint">Tap the tool again or hold it to change its size</span>';
  }

  const pal = PALETTES[cv.pal];
  const row = main.querySelector('#color-row');
  row.classList.toggle('is-alt', cv.pal === 1);
  const sw = main.querySelector('#swatches');
  sw.setAttribute('aria-label', pal.label);
  sw.innerHTML = pal.colors.map(([name, hex], i) => `<button type="button" class="swatch" data-action="pick-color" data-i="${i}" data-fk="sw-${cv.pal}-${i}" aria-pressed="${cv.base === i}" aria-label="${name}" style="--c:${hex};--edge:${edge(hex)}"><span class="swatch-dot"></span></button>`).join('');
  const arrow = main.querySelector('#palette-arrow');
  arrow.setAttribute('aria-label', cv.pal === 0 ? 'Show neutral colors' : 'Back to rainbow colors');
  arrow.innerHTML = icon(cv.pal === 0 ? 'chevronRight' : 'chevronLeft');

  const [baseName, baseHex] = pal.colors[cv.base];
  const shades = main.querySelector('#shades');
  shades.setAttribute('aria-label', `Shades of ${baseName.toLowerCase()}`);
  shades.innerHTML = shadesFor(baseName, baseHex).map(([name, hex], i) => `<button type="button" class="shade" data-action="pick-shade" data-hex="${hex}" data-fk="sh-${i}" aria-pressed="${cv.color === hex}" aria-label="${name}" style="--c:${hex};--edge:${edge(hex)}"></button>`).join('');

  const blendTool = cv.tool === 'blend';
  const strengths = main.querySelector('#strengths');
  strengths.hidden = !blendTool;
  if (blendTool) {
    strengths.innerHTML = `<span class="strength-label" aria-hidden="true">Strength</span>
      <div class="strength-btns" role="group" aria-label="Blend strength">${BLEND_STRENGTHS.map((s, i) => `<button type="button" class="strength-btn" data-action="pick-strength" data-i="${i}" data-fk="strength-${i}" aria-pressed="${cv.strength === i}">${s.label}</button>`).join('')}</div>`;
  } else strengths.innerHTML = '';

  const px = (blendTool ? BLEND_SIZES : SIZE_STEPS)[cv.size[cv.tool]].px;
  const preview = main.querySelector('#preview');
  preview.style.width = preview.style.height = `${blendTool ? Math.min(Math.round(px * 0.5), 34) : Math.min(px, 30)}px`;
  preview.classList.toggle('is-eraser', cv.tool === 'eraser');
  preview.classList.toggle('is-blend', blendTool);
  preview.style.background = cv.tool === 'eraser' || blendTool ? '' : cv.color;
  drawing.setTool(cv.tool, px, cv.color, BLEND_STRENGTHS[cv.strength].amount);

  if (focusKey) { const el = main.querySelector(`[data-fk="${focusKey}"]`); if (el) el.focus(); }
}

function animateSwatches(direction) {
  const sw = main.querySelector('#swatches');
  sw.classList.remove('slide-r', 'slide-l');
  void sw.offsetWidth;
  sw.classList.add(direction);
}

/* ---------- Actions ---------- */
async function startSnap() { fileInput.value = ''; fileInput.click(); }

fileInput.addEventListener('change', async () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  if (file.type && !file.type.startsWith('image/')) { say('That file isn’t a picture. Choose a photo instead.'); return; }
  say('Looking at your art…');
  try {
    const blob = await shrink(file, 1600, 0.88);
    const feedback = await analyzeImage(blob, settings.vibe);
    if (pending) URL.revokeObjectURL(pending.url);
    pending = { blob, url: URL.createObjectURL(blob), feedback, title: 'My art' };
    go('#/review');
  } catch (e) {
    say(e.message || 'That picture could not be opened. Try a different photo.');
  }
});

async function savePiece({ title, blob, feedback }) {
  const piece = { id: uid(), title: title || 'My art', createdAt: Date.now(), image: blob, thumb: await shrink(blob, 480, 0.82), feedback };
  await db.addPiece(piece);
  db.askToKeepData();
  return piece;
}

async function sharePiece(id) {
  const posts = await db.kvGet('posts', []);
  if (posts.some((p) => p.pieceId === id)) { say('That piece is already in your friends feed'); go('#/friends'); return; }
  const piece = await db.getPiece(id);
  if (!piece) return;
  posts.push({ id: uid(), pieceId: id, title: piece.title, createdAt: Date.now(), commentsOff: false });
  await db.kvSet('posts', posts);
  say('Shared to your friends feed');
  go('#/friends');
}

async function addComment(postId, text) {
  const list = await getComments(postId);
  list.push({ id: uid(), author: 'you', text, createdAt: Date.now() });
  await saveComments(postId, list);
}

const actions = {
  snap: () => startSnap(),
  'draw-pending': () => {
    const title = (main.querySelector('#piece-title') || {}).value;
    pending.title = title || 'My art';
    canvasJob = { blob: pending.blob, title: pending.title, idea: null, back: '#/review' };
    go('#/canvas');
  },
  'draw-piece': async (el) => {
    const p = await db.getPiece(el.dataset.id);
    if (!p) return;
    canvasJob = { blob: p.image, title: p.title, idea: null, back: `#/piece/${p.id}` };
    go('#/canvas');
  },
  'try-idea': (el) => {
    // Every idea starts on a completely blank canvas, even one based on a museum piece.
    canvasJob = { blob: null, title: 'My drawing', idea: el.dataset.idea, back: '#/ideas' };
    go('#/canvas');
  },
  'new-ideas': () => { ideaSeed += 1; router({ focus: '[data-fk="new-ideas"]' }).then(() => say('New ideas are ready')); },
  'delete-piece': async (el) => {
    const p = await db.getPiece(el.dataset.id);
    if (!p) return;
    const r = await ask({ title: `Delete “${p.title}”?`, body: cloudEnabled ? 'It will be removed from your museum. If you shared it, a grown-up can remove it from Friends.' : 'It will be removed from your museum and your friends feed.', ok: 'Delete', danger: true });
    if (!r.ok) return;
    await db.deletePiece(p.id);
    const posts = await db.kvGet('posts', []);
    await db.kvSet('posts', posts.filter((x) => x.pieceId !== p.id));
    forgetUrls(p.id);
    say('Deleted from your museum');
    go('#/museum');
  },
  'toggle-favorite': async (el) => {
    const p = await db.getPiece(el.dataset.id);
    if (!p) return;
    p.favorite = !p.favorite;
    await db.addPiece(p);
    el.setAttribute('aria-pressed', String(p.favorite));
    say(p.favorite ? 'Added to your favorites' : 'Removed from your favorites');
  },
  // Opens the iPhone share sheet with the picture, so it can be sent in Messages or any other app.
  'send-photo': async (el) => {
    const file = shareFiles.get(el.dataset.id);
    if (!file) return;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: file.name.replace(/\.\w+$/, '') }); }
      catch (e) { if (!e || e.name !== 'AbortError') say('Sharing didn’t work. Try again.'); }
      return;
    }
    // No share sheet here (for example on a computer): save the picture instead.
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = file.name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    say('Sharing isn’t available here, so the photo was saved to this device');
  },
  'share-piece': (el) => sharePiece(el.dataset.id),
  share: async () => {
    const pieces = await db.allPieces();
    if (!pieces.length) {
      const r = await ask({ title: 'Nothing to share yet', body: 'Snap a piece of art first. Then you can share it here.', ok: 'Snap your art' });
      if (r.ok) startSnap();
      return;
    }
    const r = await ask({ title: 'Share with friends', ok: 'Share', choices: pieces.slice(0, 20).map((p) => ({ value: p.id, label: p.title, img: pieceUrl(p) })) });
    if (r.ok && r.value) sharePiece(r.value);
  },
  react: async (el) => {
    const reactions = await db.kvGet('reactions', {});
    const entry = reactions[el.dataset.post] || {};
    entry[el.dataset.kind] = !entry[el.dataset.kind];
    reactions[el.dataset.post] = entry;
    await db.kvSet('reactions', reactions);
    el.setAttribute('aria-pressed', String(entry[el.dataset.kind]));
    el.querySelector('.react-count').textContent = Number(el.dataset.base) + (entry[el.dataset.kind] ? 1 : 0);
  },
  quick: async (el) => {
    await addComment(el.dataset.post, el.dataset.text);
    say('Comment posted');
    router({ focus: '#comment-text' });
  },
  'delete-comment': async (el) => {
    const r = await ask({ title: 'Delete this comment?', ok: 'Delete', danger: true });
    if (!r.ok) return;
    const list = await getComments(el.dataset.post);
    await saveComments(el.dataset.post, list.filter((c) => c.id !== el.dataset.id));
    say('Comment deleted');
    router({ focus: '#comment-text' });
  },
  'report-comment': async (el) => {
    const r = await ask({ title: 'Report this comment?', body: 'A grown-up will look at it. The person who wrote it won’t know you reported it.', ok: 'Report' });
    if (!r.ok) return;
    const list = await getComments(el.dataset.post);
    const c = list.find((x) => x.id === el.dataset.id);
    if (c) c.reported = true;
    await saveComments(el.dataset.post, list);
    say('Reported. A grown-up will check it.');
    router({ focus: `[data-fk="c-${el.dataset.id}"]` });
  },
  'toggle-comments': async (el) => {
    const posts = await db.kvGet('posts', []);
    const p = posts.find((x) => x.id === el.dataset.post);
    if (!p) return;
    p.commentsOff = !p.commentsOff;
    await db.kvSet('posts', posts);
    say(p.commentsOff ? 'Comments turned off' : 'Comments turned on');
    router({ focus: '[data-fk="switch"]' });
  },
  'reset-all': async () => {
    const r = await ask({ title: 'Delete all your art?', body: 'This removes every piece, post, and comment from this device. It can’t be undone.', ok: 'Delete everything', danger: true });
    if (!r.ok) return;
    await db.clearAll();
    forgetUrls();
    pending = null;
    say('All your art was deleted');
    go('#/home');
  },
  'leave-canvas': async () => {
    if (drawing && drawing.dirty) {
      const r = await ask({ title: 'Leave without saving?', body: 'Your drawing will be lost.', ok: 'Leave', cancel: 'Keep drawing', danger: true });
      if (!r.ok) return;
      drawing.dirty = false;
    }
    const back = (canvasJob && canvasJob.back) || '#/home';
    canvasJob = null;
    go(back);
  },
  'blank-canvas': () => {
    canvasJob = { blob: null, title: 'My drawing', idea: null, back: lastScreenHash };
    go('#/canvas');
  },
  undo: () => { if (drawing && !drawing.undo()) say('Nothing to undo'); },
  'start-over': async () => {
    if (!drawing || !drawing.dirty) { say('Nothing to clear yet'); return; }
    const r = await ask({ title: 'Start over?', body: 'This clears your drawing. Your picture stays.', ok: 'Clear drawing', danger: true });
    if (r.ok) { drawing.clear(); drawing.dirty = false; say('Drawing cleared'); }
  },
  'save-drawing': async () => {
    if (!drawing || !drawing.dirty) { say('Draw something first, then save.'); return; }
    const suggested = canvasJob.blob ? `${canvasJob.title} remix`.slice(0, 40) : 'My drawing';
    const r = await ask({ title: 'Save to museum', field: { label: 'Name your art', value: suggested }, ok: 'Save' });
    if (!r.ok) return;
    try {
      const blob = await drawing.exportBlob();
      const feedback = await analyzeImage(blob, settings.vibe);
      const piece = await savePiece({ title: r.value || suggested, blob, feedback });
      drawing.dirty = false;
      canvasJob = null;
      say('Saved to your museum');
      go(`#/piece/${piece.id}`);
    } catch (e) { say(e.message || 'Saving failed. Try again.'); }
  },
  'pick-size': (el) => {
    cv.size[cv.tool] = Number(el.dataset.i);
    cv.sizesOpen = false;
    const toolButton = main.querySelector(`[data-tool="${cv.tool}"]`);
    renderControls();
    if (toolButton) toolButton.focus();
  },
  'pick-strength': (el) => { cv.strength = Number(el.dataset.i); renderControls(); },
  'pick-color': (el) => {
    cv.base = Number(el.dataset.i);
    cv.color = PALETTES[cv.pal].colors[cv.base][1];
    renderControls();
  },
  'pick-shade': (el) => { cv.color = el.dataset.hex; renderControls(); },
  'switch-palette': () => {
    cv.pal = cv.pal === 0 ? 1 : 0;
    cv.base = PALETTES[cv.pal].start;
    cv.color = PALETTES[cv.pal].colors[cv.base][1];
    renderControls();
    animateSwatches(cv.pal === 1 ? 'slide-r' : 'slide-l');
  },
};

const forms = {
  'save-piece': async (form) => {
    if (!pending) return;
    const title = form.querySelector('#piece-title').value.trim() || 'My art';
    try {
      await savePiece({ title, blob: pending.blob, feedback: pending.feedback });
      URL.revokeObjectURL(pending.url);
      pending = null;
      say('Saved to your museum');
      go('#/museum');
    } catch (e) { say('Saving failed. Try again.'); }
  },
  comment: async (form) => {
    const input = form.querySelector('#comment-text');
    const post = await findPost(form.dataset.post);
    if (!post) return;
    const result = checkComment(input.value, post.mine ? 'your friend' : post.person.name);
    const nudge = main.querySelector('#nudge');
    if (!result.ok) {
      nudge.innerHTML = `<div class="nudge">${icon('heartHandshake')}<div><p class="nudge-title">${esc(result.title)}</p><p class="nudge-text">${esc(result.message)}</p></div></div>`;
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', 'comment-count nudge');
      input.focus();
      return;
    }
    await addComment(post.id, input.value.trim());
    say('Comment posted');
    router({ focus: '#comment-text' });
  },
};

const cloudFriends = cloudEnabled ? createCloudFriends({
  esc, frag, say, ask, go, router: (opts) => router(opts), icon, db, pieceUrl, shrink,
  checkComment, QUICK_COMMENTS, MAX_COMMENT, backBar, fmtAgo, main,
}) : null;
if (cloudFriends) {
  Object.assign(actions, cloudFriends.actions);
  Object.assign(forms, cloudFriends.forms);
}

main.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !main.contains(el)) return;
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); if (el.dataset.busy) return; fn(el, e); }
});
main.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const fn = forms[form.dataset.form];
  if (fn) fn(form);
});
main.addEventListener('input', (e) => {
  if (e.target.id === 'comment-text') {
    main.querySelector('#comment-count-visible').textContent = `${e.target.value.length}/${MAX_COMMENT}`;
    main.querySelector('#comment-count').textContent = `${e.target.value.length} of ${MAX_COMMENT} letters used`;
    const nudge = main.querySelector('#nudge');
    if (nudge && nudge.innerHTML) nudge.innerHTML = '';
    e.target.removeAttribute('aria-invalid');
    e.target.setAttribute('aria-describedby', 'comment-count');
  }
});
main.addEventListener('change', (e) => {
  if (e.target.name === 'theme') {
    settings.theme = e.target.value; saveSettings(); applyTheme();
    say(`Color scheme: ${THEMES.find((t) => t.id === settings.theme).name}`);
  }
  if (e.target.name === 'size') {
    settings.size = e.target.value; saveSettings(); applyTheme();
    say(`Canvas text and colors: ${SIZES.find((z) => z.id === settings.size).name}`);
  }
  if (e.target.name === 'vibe') {
    settings.vibe = e.target.value; saveSettings();
    say(`Feedback style: ${VIBES.find((v) => v.id === settings.vibe).name}`);
  }
});

document.querySelector('.tabbar').addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !actions[el.dataset.action]) return;
  e.preventDefault();
  actions[el.dataset.action](el, e);
});

/* ---------- Router ---------- */
const ROUTES = {
  home: homeScreen, snap: snapScreen, review: reviewScreen, museum: museumScreen, piece: pieceScreen,
  ideas: ideasScreen, friends: friendsScreen, post: postScreen, settings: settingsScreen, canvas: canvasScreen,
};
if (cloudFriends) Object.assign(ROUTES, cloudFriends.routes);
const TAB_FOR = { home: 'home', snap: 'snap', review: 'snap', settings: 'home', museum: 'museum', piece: 'museum', ideas: 'ideas', friends: 'friends', post: 'friends', parent: 'friends', owner: 'friends' };
const HIDE_TABS = new Set(['canvas', 'review', 'post', 'settings', 'parent', 'owner']);
let renderCount = 0;
let firstRender = true;

async function router(opts = {}) {
  const id = ++renderCount;
  const [rawName, arg] = location.hash.replace(/^#\/?/, '').split('/');
  const name = ROUTES[rawName] ? rawName : 'home';
  if (drawing && name !== 'canvas') { drawing.destroy(); drawing = null; }
  let content;
  try { content = await ROUTES[name](arg); } catch (e) {
    console.error(e);
    content = notFound('Something went wrong opening this screen.', '#/home', 'Go to your studio');
  }
  if (id !== renderCount) return;
  if (drawing) { drawing.destroy(); drawing = null; }
  main.replaceChildren(content);
  if (name !== 'canvas') lastScreenHash = location.hash || '#/home';
  document.body.dataset.screen = name;
  document.body.dataset.tabs = HIDE_TABS.has(name) ? 'off' : 'on';
  document.querySelectorAll('[data-tab]').forEach((a) => {
    if (a.dataset.tab === TAB_FOR[name]) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const h1 = main.querySelector('h1');
  document.title = h1 ? `${h1.textContent} – ${APP_NAME}` : APP_NAME;
  if (name === 'canvas') await setupCanvas();
  if (cloudFriends && cloudFriends.afterRender) await cloudFriends.afterRender(name);
  if (opts.focus) {
    const el = main.querySelector(opts.focus);
    if (el) el.focus();
  } else {
    window.scrollTo(0, 0);
    if (!firstRender && h1) h1.focus({ preventScroll: true });
  }
  firstRender = false;
}

// Swiping back (or the browser's back button) leaves the drawing screen too.
// If there's unsaved drawing, put the canvas back and ask first, so art is never lost by accident.
let restoringCanvas = false;
const routeNameNow = () => { const n = location.hash.replace(/^#\/?/, '').split('/')[0]; return ROUTES[n] ? n : 'home'; };
window.addEventListener('hashchange', async () => {
  if (restoringCanvas) { restoringCanvas = false; return; }
  if (drawing && drawing.dirty && routeNameNow() !== 'canvas') {
    restoringCanvas = true;
    location.hash = '#/canvas';
    const r = await ask({ title: 'Leave without saving?', body: 'Your drawing will be lost.', ok: 'Leave', cancel: 'Keep drawing', danger: true });
    if (r.ok && drawing) {
      const back = (canvasJob && canvasJob.back) || '#/home';
      drawing.dirty = false;
      canvasJob = null;
      if (history.length > 2) history.back(); else go(back);
    }
    return;
  }
  router();
});
window.addEventListener('beforeunload', (e) => { if (drawing && drawing.dirty) { e.preventDefault(); e.returnValue = ''; } });
document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
router();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
