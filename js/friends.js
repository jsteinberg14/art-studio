// The real Friends tab: kid feed, comments, the grown-up area, and owner tools.
// Used only when js/config.js has Supabase settings.
import * as cloud from './cloud.js';
import { OWNER_NAME } from './config.js';

const DEVICE_KEY = 'art-studio-device';
const UNLOCK_MINUTES = 10;
const MAX_PIN_TRIES = 5;
const TONES = [
  { id: 'sky', name: 'Sky blue' },
  { id: 'sun', name: 'Sunny yellow' },
  { id: 'gum', name: 'Bubblegum pink' },
];

export function createCloudFriends(ctx) {
  const { esc, frag, say, ask, go, router, icon, db, pieceUrl, shrink, checkComment, QUICK_COMMENTS, MAX_COMMENT, backBar, fmtAgo, main } = ctx;

  /* ---------- This device: grown-up PIN and which kid uses it ---------- */
  const readDevice = () => { try { return JSON.parse(localStorage.getItem(DEVICE_KEY) || '{}'); } catch (e) { return {}; } };
  const writeDevice = (value) => { try { localStorage.setItem(DEVICE_KEY, JSON.stringify(value)); } catch (e) { /* private mode */ } };
  const deviceFor = (userId) => { const d = readDevice(); return d.userId === userId ? d : { userId }; };
  const saveDevice = (userId, changes) => writeDevice({ ...deviceFor(userId), ...changes, userId });

  async function hashPin(pin, salt) {
    const bytes = new TextEncoder().encode(`${salt}:${pin}`);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  let unlockedUntil = 0;
  const isUnlocked = () => Date.now() < unlockedUntil;
  const unlock = () => { unlockedUntil = Date.now() + UNLOCK_MINUTES * 60000; };
  let pendingEmail = null;
  let lastState = null;

  async function loadState() {
    lastState = await cloud.getState();
    return lastState;
  }
  function currentChild(st) {
    if (!st || !st.signedIn || !st.family) return null;
    const id = deviceFor(st.userId).childId;
    return st.children.find((c) => c.id === id) || null;
  }
  const ready = (st) => st && st.signedIn && st.family && st.family.status === 'approved' && currentChild(st);

  /* ---------- Small pieces of UI ---------- */
  const avatarFor = (child, cls = '') => `<span class="avatar tone-${esc((child && child.tone) || 'sky')} ${cls}" aria-hidden="true">${esc(((child && child.display_name) || '?').charAt(0).toUpperCase())}</span>`;

  function problemScreen(title, error, href = '#/friends') {
    return frag(`
      ${backBar(title, href, 'Back')}
      <div class="empty">
        <span class="empty-icon">${icon('refresh')}</span>
        <h2>That didn’t load</h2>
        <p>${esc(cloud.friendly(error))}</p>
        <button type="button" class="btn btn-primary" data-action="c-retry">${icon('refresh')}Try again</button>
      </div>`);
  }

  const fieldError = (id) => `<p id="${id}" class="field-error" role="alert"></p>`;
  function showError(id, message) {
    const el = main.querySelector(`#${id}`);
    if (el) el.textContent = message;
  }

  async function busy(button, task) {
    if (button) { button.setAttribute('aria-busy', 'true'); button.dataset.busy = '1'; }
    try { return await task(); } finally {
      if (button && button.isConnected) { button.removeAttribute('aria-busy'); delete button.dataset.busy; }
    }
  }

  /* ---------- Kid screens ---------- */
  async function friendsScreen() {
    let st;
    try { st = await loadState(); } catch (e) { return problemScreen('Friends', e, '#/home'); }
    if (!ready(st)) {
      const approved = st.signedIn && st.family && st.family.status === 'approved';
      return frag(`
        <header class="screen-head"><div><h1 tabindex="-1">Friends</h1></div></header>
        <div class="empty">
          <span class="empty-icon">${icon('users')}</span>
          <h2>${approved ? 'Almost ready' : 'Friends needs a grown-up'}</h2>
          <p>${approved
            ? 'A grown-up needs to choose who uses this device.'
            : 'A grown-up sets up Friends so only people you know can see your art.'}</p>
          <a class="btn btn-primary" href="#/parent">${icon('lock')}Grown-ups</a>
        </div>`);
    }
    const me = currentChild(st);
    let posts, friendFams;
    try { [posts, friendFams] = await Promise.all([cloud.feed(), cloud.friendFamilies(st.family.id)]); } catch (e) { return problemScreen('Friends', e, '#/home'); }
    const friends = [...st.children.filter((c) => c.id !== me.id), ...friendFams.flatMap((f) => f.children)];
    return frag(`
      <header class="screen-head">
        <div><h1 tabindex="-1">Friends</h1><p class="sub">Signed in as ${esc(me.display_name)}</p></div>
        <div class="head-actions">
          <button type="button" class="icon-btn" data-action="c-refresh" data-fk="c-refresh" aria-label="Check for new posts">${icon('refresh')}</button>
          <button type="button" class="icon-btn icon-btn-filled" data-action="share" aria-label="Share your art">${icon('plus')}</button>
        </div>
      </header>
      ${friends.length
        ? `<ul class="friend-row" aria-label="Your friends">${friends.map((f) => `<li class="friend">${avatarFor(f)}<span>${esc(f.display_name)}</span></li>`).join('')}</ul>`
        : '<p class="notice">Ask a grown-up to add friends, so you can see each other’s art.</p>'}
      ${posts.length ? `<ul class="feed" role="list">${posts.map((p) => postCard(p, me)).join('')}</ul>`
        : `<div class="empty"><span class="empty-icon">${icon('photo')}</span><h2>No posts yet</h2>
           <p>Share a piece from your museum and it shows up here for your friends.</p>
           <button type="button" class="btn btn-primary" data-action="share">${icon('share')}Share your art</button></div>`}`);
  }

  function postCard(p, me) {
    const hearts = p.reactions.filter((r) => r.kind === 'heart');
    const stars = p.reactions.filter((r) => r.kind === 'star');
    const myHeart = hearts.some((r) => r.child_id === me.id);
    const myStar = stars.some((r) => r.child_id === me.id);
    const name = p.child ? p.child.display_name : 'A friend';
    return `<li><article class="post" aria-labelledby="post-${p.id}">
      <div class="post-head">${avatarFor(p.child, 'avatar-sm')}
        <div><p class="post-name" id="post-${p.id}">${esc(name)}</p><p class="post-time">${esc(fmtAgo(new Date(p.created_at).getTime()))}</p></div></div>
      <div class="post-art"><button type="button" class="zoomable" data-action="zoom-image" data-src="${esc(p.url)}" data-alt="${esc(`Art by ${name}: ${p.title}`)}" aria-label="Zoom in on ${esc(`art by ${name}: ${p.title}`)}"><img src="${esc(p.url)}" alt=""><span class="zoom-cue" aria-hidden="true">${icon('zoom')}</span></button></div>
      <div class="post-actions">
        <button type="button" class="react react-heart" data-action="c-react" data-post="${p.id}" data-kind="heart" data-count="${hearts.length}" aria-pressed="${myHeart}">
          ${icon('heart')}<span class="sr-only">Like</span><span class="react-count">${hearts.length}</span></button>
        <button type="button" class="react react-star" data-action="c-react" data-post="${p.id}" data-kind="star" data-count="${stars.length}" aria-pressed="${myStar}">
          ${icon('star')}<span class="sr-only">Favorite</span><span class="react-count">${stars.length}</span></button>
        <a class="react" href="#/post/${p.id}">${icon('message')}<span class="sr-only">Comments</span><span class="react-count">${p.commentCount}</span></a>
      </div>
      <p class="caption"><span class="caption-name">${esc(name)}</span> ${esc(p.title)}</p>
    </article></li>`;
  }

  async function postScreen(id) {
    let st, post;
    try {
      st = await loadState();
      if (!ready(st)) { location.replace('#/friends'); return friendsScreen(); }
      post = await cloud.postWithComments(id, st.family.id);
    } catch (e) { return problemScreen('Comments', e); }
    if (!post) {
      return frag(`${backBar('Comments', '#/friends', 'Back to friends')}<div class="empty"><h2>That post isn’t here anymore</h2><a class="btn btn-primary" href="#/friends">Go to friends</a></div>`);
    }
    const mine = post.family_id === st.family.id;
    const artist = post.child ? post.child.display_name : 'your friend';
    return frag(`
      ${backBar('Comments', '#/friends', 'Back to friends')}
      <div class="post-summary">
        <img src="${esc(post.url)}" alt="Art by ${esc(artist)}: ${esc(post.title)}">
        <div><p class="summary-title">${esc(post.title)}</p><p class="sub">Only ${mine ? 'your friends' : `${esc(artist)}’s friends`} can see this</p></div>
      </div>
      ${mine ? `<button type="button" class="switch-row" role="switch" aria-checked="${post.comments_on}" data-action="c-toggle-comments" data-post="${post.id}" data-on="${post.comments_on}" data-fk="switch">
        <span>Allow comments</span><span class="switch" aria-hidden="true"><span class="switch-knob"></span></span></button>` : ''}
      ${post.comments.length ? `<ul class="comments" role="list">${post.comments.map((c) => {
        const name = c.child ? c.child.display_name : 'A friend';
        const canDelete = mine || c.family_id === st.family.id;
        return `<li class="comment" tabindex="-1" data-fk="c-${c.id}">${avatarFor(c.child, 'avatar-sm')}
          <div class="bubble tone-${esc((c.child && c.child.tone) || 'sky')}"><p class="bubble-name">${esc(name)}</p><p>${esc(c.body)}</p>
          ${c.reported ? '<p class="reported">Reported. A grown-up will check it.</p>' : ''}</div>
          ${canDelete
            ? `<button type="button" class="icon-btn icon-btn-small" data-action="c-delete-comment" data-post="${post.id}" data-id="${c.id}" aria-label="Delete comment from ${esc(name)}">${icon('trash')}</button>`
            : (c.reported ? '' : `<button type="button" class="icon-btn icon-btn-small" data-action="c-report-comment" data-post="${post.id}" data-id="${c.id}" aria-label="Report comment from ${esc(name)}">${icon('flag')}</button>`)}
        </li>`;
      }).join('')}</ul>` : '<p class="empty-note block">No comments yet. Be the first to say something kind.</p>'}
      ${!post.comments_on ? '<p class="empty-note block">Comments are turned off for this post.</p>' : `
        <div id="nudge" class="nudge-region" role="alert"></div>
        <section class="block" aria-labelledby="quick-h">
          <h2 id="quick-h" class="section-label">Quick comments</h2>
          <div class="chips">${QUICK_COMMENTS.map((q, i) => `<button type="button" class="chip tone-${['sun', 'sky', 'gum'][i % 3]}" data-action="c-quick" data-post="${post.id}" data-text="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        </section>
        <form class="block" data-form="c-comment" data-post="${post.id}" data-artist="${esc(mine ? 'your friend' : artist)}">
          <label for="comment-text" class="field-label">Write a comment</label>
          <div class="composer">
            <input type="text" id="comment-text" maxlength="${MAX_COMMENT}" placeholder="Say something kind" autocomplete="off" enterkeyhint="send" aria-describedby="comment-count">
            <span class="count-hint" aria-hidden="true" id="comment-count-visible">0/${MAX_COMMENT}</span><span id="comment-count" class="sr-only">0 of ${MAX_COMMENT} letters used</span>
            <button type="submit" class="send" aria-label="Send comment">${icon('send')}</button>
          </div>
        </form>`}`);
  }

  function showNudge(title, message) {
    const nudge = main.querySelector('#nudge');
    if (!nudge) { say(message); return; }
    nudge.innerHTML = `<div class="nudge">${icon('heartHandshake')}<div><p class="nudge-title">${esc(title)}</p><p class="nudge-text">${esc(message)}</p></div></div>`;
    const input = main.querySelector('#comment-text');
    if (input) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', 'comment-count nudge'); input.focus(); }
  }

  async function postComment(postId, body, artist) {
    const local = checkComment(body, artist);
    if (!local.ok) { showNudge(local.title, local.message); return false; }
    const st = lastState;
    const me = currentChild(st);
    try {
      await cloud.addComment({ postId, familyId: st.family.id, childId: me.id, body: body.trim() });
    } catch (e) {
      showNudge('That comment wasn’t posted', cloud.friendly(e));
      return false;
    }
    say('Comment posted');
    await router({ focus: '#comment-text' });
    return true;
  }

  async function shareToFriends(pieceId) {
    let st;
    try { st = await loadState(); } catch (e) { say(cloud.friendly(e)); return; }
    if (!ready(st)) {
      const r = await ask({ title: 'Friends isn’t set up yet', body: 'A grown-up needs to set up Friends before you can share.', ok: 'Go to Friends' });
      if (r.ok) go('#/friends');
      return;
    }
    const piece = await db.getPiece(pieceId);
    if (!piece) return;
    say('Sharing…');
    try {
      const blob = await shrink(piece.image, 1400, 0.85);
      await cloud.sharePiece({ familyId: st.family.id, childId: currentChild(st).id, title: piece.title.slice(0, 40), blob });
      say('Shared with your friends');
      go('#/friends');
    } catch (e) { say(cloud.friendly(e)); }
  }

  /* ---------- Grown-up area ---------- */
  async function parentScreen() {
    let st;
    try { st = await loadState(); } catch (e) { return problemScreen('Grown-ups', e); }
    if (!st.signedIn) return signInScreen();
    const dev = deviceFor(st.userId);
    if (!dev.pinHash) return setPinScreen();
    if (!isUnlocked()) return pinScreen();
    return familyScreen(st);
  }

  function signInScreen() {
    if (!pendingEmail) {
      return frag(`
        ${backBar('Grown-ups', '#/friends', 'Back to friends')}
        <p class="body-copy">This part is for parents and guardians. Sign in with your email, and we’ll send you a code.</p>
        <form class="block stack" data-form="c-send-code" novalidate>
          <div><label for="parent-email" class="field-label">Your email</label>
          <input type="email" id="parent-email" class="input" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" aria-describedby="email-error" required></div>
          ${fieldError('email-error')}
          <button type="submit" class="btn btn-primary">Send code</button>
        </form>
        <p class="body-copy block"><a class="inline-link" href="./privacy.html" target="_blank" rel="noopener">How Friends handles your family’s information</a></p>`);
    }
    return frag(`
      ${backBar('Grown-ups', '#/friends', 'Back to friends')}
      <p class="body-copy">We sent a code to ${esc(pendingEmail)}. It can take a minute to arrive.</p>
      <form class="block stack" data-form="c-verify-code" novalidate>
        <div><label for="parent-code" class="field-label">Code from the email</label>
        <input type="text" id="parent-code" class="input" inputmode="numeric" autocomplete="one-time-code" maxlength="10" aria-describedby="code-error" required></div>
        ${fieldError('code-error')}
        <button type="submit" class="btn btn-primary">Sign in</button>
      </form>
      <div class="btn-row block">
        <button type="button" class="btn" data-action="c-resend">Send a new code</button>
        <button type="button" class="btn" data-action="c-change-email">Use a different email</button>
      </div>`);
  }

  function setPinScreen() {
    return frag(`
      ${backBar('Grown-ups', '#/friends', 'Back to friends')}
      <h2 class="screen-sub">Make a grown-up PIN</h2>
      <p class="body-copy">The PIN keeps kids out of this area on this device. Use 4 to 8 numbers that your child doesn’t know.</p>
      <form class="block stack" data-form="c-set-pin" novalidate>
        <div><label for="pin-new" class="field-label">New PIN</label>
        <input type="password" id="pin-new" class="input" inputmode="numeric" autocomplete="new-password" maxlength="8" aria-describedby="pin-error" required></div>
        <div><label for="pin-again" class="field-label">Type it again</label>
        <input type="password" id="pin-again" class="input" inputmode="numeric" autocomplete="new-password" maxlength="8" aria-describedby="pin-error" required></div>
        ${fieldError('pin-error')}
        <button type="submit" class="btn btn-primary">Save PIN</button>
      </form>`);
  }

  function pinScreen() {
    return frag(`
      ${backBar('Grown-ups', '#/friends', 'Back to friends')}
      <form class="stack" data-form="c-check-pin" novalidate>
        <div><label for="pin-check" class="field-label">Grown-up PIN</label>
        <input type="password" id="pin-check" class="input" inputmode="numeric" autocomplete="off" maxlength="8" aria-describedby="pin-error" required></div>
        ${fieldError('pin-error')}
        <button type="submit" class="btn btn-primary">Unlock</button>
      </form>
      <button type="button" class="btn btn-quiet block" data-action="c-forgot-pin">Forgot the PIN? Sign in again</button>`);
  }

  function familyScreen(st) {
    const f = st.family;
    const ownerLink = st.isAdmin ? `<a class="btn block-btn" href="#/owner">${icon('settings')}Owner tools</a>` : '';
    const lockRow = `<section class="block" aria-labelledby="device-h"><h2 id="device-h" class="section-label">This device</h2>
      <div class="stack"><button type="button" class="btn block-btn" data-action="c-lock">${icon('lock')}Lock the grown-up area</button>
      <button type="button" class="btn block-btn" data-action="c-sign-out">Sign out on this device</button></div></section>`;

    if (!f) {
      if (st.isAdmin) {
        return frag(`
          ${backBar('Grown-ups', '#/friends', 'Back to friends')}
          <p class="body-copy">You’re the app owner. Set up your own family, then invite other families from Owner tools.</p>
          <div class="stack block"><button type="button" class="btn btn-primary block-btn" data-action="c-owner-family">Set up my family</button>${ownerLink}</div>
          ${lockRow}`);
      }
      return frag(`
        ${backBar('Grown-ups', '#/friends', 'Back to friends')}
        <p class="body-copy">Friends is invite-only. Enter the invite code you were sent.</p>
        <form class="block stack" data-form="c-join" novalidate>
          <div><label for="join-name" class="field-label">Your name</label>
          <p class="field-hint" id="join-name-hint">Other parents see this. A first name is fine.</p>
          <input type="text" id="join-name" class="input" maxlength="40" autocomplete="given-name" aria-describedby="join-name-hint join-error" required></div>
          <div><label for="join-code" class="field-label">Invite code</label>
          <input type="text" id="join-code" class="input" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="join-error" required></div>
          ${fieldError('join-error')}
          <button type="submit" class="btn btn-primary">Join</button>
        </form>
        ${lockRow}`);
    }

    if (f.status !== 'approved') {
      const waiting = f.status === 'pending_review';
      return frag(`
        ${backBar('Grown-ups', '#/friends', 'Back to friends')}
        ${waiting ? `<div class="fb fb-good"><span class="fb-icon">${icon('check')}</span><div><h2 class="fb-title">Form received</h2>
          <p>${esc(OWNER_NAME || 'The app owner')} will check it. Sharing turns on after it’s approved.</p></div></div>` : ''}
        <section class="${waiting ? 'block' : ''}" aria-labelledby="consent-h">
          <h2 id="consent-h" class="screen-sub">${waiting ? 'Need to send a different form?' : 'Give permission'}</h2>
          <p class="body-copy">Before your child can share, we need a signed permission form from you. Here’s what Friends uses:</p>
          <ul class="plain-list">
            <li>A first name or nickname you choose for your child</li>
            <li>Photos of art your child shares, with their titles</li>
            <li>Comments and likes your child leaves on friends’ art</li>
          </ul>
          <p class="body-copy">Only families you connect with can see any of it. There are no ads and no tracking. You can delete anything, or everything, from this screen at any time.</p>
          <p class="body-copy block"><a class="inline-link" href="./privacy.html" target="_blank" rel="noopener">Read the full privacy notice</a></p>
          <ol class="steps block">
            <li><a class="inline-link" href="./consent-form.html" target="_blank" rel="noopener">Open the permission form</a> and print it, or copy it onto paper.</li>
            <li>Fill it in and sign it.</li>
            <li>Take a photo of the signed form and send it here.</li>
          </ol>
          <form class="block stack" data-form="c-consent" novalidate>
            <div><label for="consent-file" class="field-label">Signed permission form</label>
            <input type="file" id="consent-file" class="file-input" accept="image/*,application/pdf" aria-describedby="consent-error" required></div>
            ${fieldError('consent-error')}
            <button type="submit" class="btn btn-primary">Send form</button>
          </form>
        </section>
        ${st.isAdmin && waiting ? `<div class="block"><button type="button" class="btn btn-primary block-btn" data-action="c-approve-self" data-id="${f.id}">Approve my family</button></div>` : ''}
        ${ownerLink ? `<div class="block">${ownerLink}</div>` : ''}
        ${lockRow}
        <section class="block" aria-labelledby="leave-h"><h2 id="leave-h" class="section-label">Leave Friends</h2>
          <button type="button" class="btn btn-danger block-btn" data-action="c-withdraw">${icon('trash')}Delete our family and everything we shared</button></section>`);
    }

    const dev = deviceFor(st.userId);
    return frag(`
      ${backBar('Grown-ups', '#/friends', 'Back to friends')}
      <p class="sub">${esc(f.parent_name)}’s family</p>
      <section class="block" aria-labelledby="kids-h">
        <h2 id="kids-h" class="section-label">Kids</h2>
        ${st.children.length ? `<ul class="manage-list" role="list">${st.children.map((c) => `<li class="manage-row">
          ${avatarFor(c, 'avatar-sm')}<div class="manage-main"><p class="manage-title">${esc(c.display_name)}</p>
          <p class="sub">${dev.childId === c.id ? 'Uses this device' : 'Not on this device'}</p></div>
          ${dev.childId === c.id ? '' : `<button type="button" class="btn btn-small" data-action="c-use-device" data-id="${c.id}" aria-label="Use this device as ${esc(c.display_name)}">Use here</button>`}
          <button type="button" class="icon-btn icon-btn-small" data-action="c-remove-child" data-id="${c.id}" data-name="${esc(c.display_name)}" aria-label="Remove ${esc(c.display_name)}">${icon('trash')}</button>
        </li>`).join('')}</ul>` : '<p class="empty-note">Add your child to start sharing.</p>'}
        <form class="block stack" data-form="c-add-child" novalidate>
          <div><label for="child-name" class="field-label">Add a kid</label>
          <p class="field-hint" id="child-name-hint">Use a first name or nickname. Friends see this name.</p>
          <input type="text" id="child-name" class="input" maxlength="20" autocomplete="off" aria-describedby="child-name-hint child-error" required></div>
          <fieldset class="tone-pick"><legend class="field-label">Their color</legend>
            ${TONES.map((t, i) => `<label class="tone-option"><input type="radio" name="child-tone" value="${t.id}" ${i === 0 ? 'checked' : ''}>
              <span class="choice-swatch tone-${t.id}" aria-hidden="true"></span><span>${t.name}</span></label>`).join('')}
          </fieldset>
          ${fieldError('child-error')}
          <button type="submit" class="btn">${icon('plus')}Add kid</button>
        </form>
      </section>
      <section class="block" aria-labelledby="friends-h">
        <h2 id="friends-h" class="section-label">Friend families</h2>
        <div id="friend-families"><p class="empty-note">Loading friend families…</p></div>
        <div class="stack block">
          <button type="button" class="btn block-btn" data-action="c-get-link">${icon('share')}Get our friend code</button>
        </div>
        <form class="block stack" data-form="c-link" novalidate>
          <div><label for="link-code" class="field-label">Enter a friend code from another parent</label>
          <input type="text" id="link-code" class="input" maxlength="10" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="link-error" required></div>
          ${fieldError('link-error')}
          <button type="submit" class="btn">Connect families</button>
        </form>
      </section>
      <section class="block" aria-labelledby="shared-h">
        <h2 id="shared-h" class="section-label">Art your family shared</h2>
        <div id="family-posts"><p class="empty-note">Loading shared art…</p></div>
      </section>
      <section class="block" aria-labelledby="reports-h">
        <h2 id="reports-h" class="section-label">Reported comments</h2>
        <div id="family-reports"><p class="empty-note">Loading reports…</p></div>
      </section>
      ${ownerLink ? `<div class="block">${ownerLink}</div>` : ''}
      ${lockRow}
      <section class="block" aria-labelledby="leave-h"><h2 id="leave-h" class="section-label">Leave Friends</h2>
        <p class="body-copy">This deletes your family, your kids’ names, and every post, comment, and like your family made. It also deletes your signed form.</p>
        <button type="button" class="btn btn-danger block-btn block" data-action="c-withdraw">${icon('trash')}Delete our family and everything we shared</button></section>`);
  }

  async function fillFamilyDetails(st) {
    const friendsEl = main.querySelector('#friend-families');
    const postsEl = main.querySelector('#family-posts');
    const reportsEl = main.querySelector('#family-reports');
    if (!friendsEl) return;
    try {
      const [fams, posts, reports] = await Promise.all([
        cloud.friendFamilies(st.family.id), cloud.familyPosts(st.family.id), cloud.reportsOnMyPosts(st.family.id),
      ]);
      friendsEl.innerHTML = fams.length ? `<ul class="manage-list" role="list">${fams.map((f) => `<li class="manage-row">
          <div class="manage-main"><p class="manage-title">${esc(f.parent_name)}’s family</p>
          <p class="sub">${f.children.length ? esc(f.children.map((c) => c.display_name).join(', ')) : 'No kids added yet'}</p></div>
          <button type="button" class="icon-btn icon-btn-small" data-action="c-unlink" data-id="${f.id}" data-name="${esc(f.parent_name)}" aria-label="Stop sharing with ${esc(f.parent_name)}’s family">${icon('x')}</button>
        </li>`).join('')}</ul>` : '<p class="empty-note">No friend families yet. Send your friend code to another parent, or enter theirs.</p>';
      postsEl.innerHTML = posts.length ? `<ul class="manage-list" role="list">${posts.map((p) => `<li class="manage-row">
          <img class="manage-thumb" src="${esc(p.url)}" alt="">
          <div class="manage-main"><p class="manage-title">${esc(p.title)}</p>
          <p class="sub">${esc(p.child ? p.child.display_name : '')}, ${p.commentCount} ${p.commentCount === 1 ? 'comment' : 'comments'}</p></div>
          <button type="button" class="icon-btn icon-btn-small" data-action="c-delete-post" data-id="${p.id}" data-path="${esc(p.image_path)}" data-title="${esc(p.title)}" aria-label="Delete ${esc(p.title)}">${icon('trash')}</button>
        </li>`).join('')}</ul>` : '<p class="empty-note">Nothing shared yet.</p>';
      reportsEl.innerHTML = reports.length ? `<ul class="manage-list" role="list">${reports.map((r) => `<li class="report-row">
          <p><span class="manage-title">${esc((r.comment.child && r.comment.child.display_name) || 'A friend')}</span> wrote “${esc(r.comment.body)}” on “${esc(r.comment.post.title)}”</p>
          <div class="btn-row"><button type="button" class="btn btn-small" data-action="c-keep-comment" data-id="${r.id}">Keep it</button>
          <button type="button" class="btn btn-small btn-danger" data-action="c-remove-reported" data-id="${r.comment.id}">Delete comment</button></div>
        </li>`).join('')}</ul>` : '<p class="empty-note">No reports. If a kid reports a comment on your family’s art, it shows up here.</p>';
    } catch (e) {
      const msg = `<p class="empty-note">${esc(cloud.friendly(e))}</p>`;
      friendsEl.innerHTML = msg; postsEl.innerHTML = msg; reportsEl.innerHTML = msg;
    }
  }

  async function ownerScreen() {
    let st;
    try { st = await loadState(); } catch (e) { return problemScreen('Owner tools', e, '#/parent'); }
    if (!st.signedIn || !isUnlocked() || !st.isAdmin) { location.replace('#/parent'); return parentScreen(); }
    let data;
    try { data = await cloud.ownerData(); } catch (e) { return problemScreen('Owner tools', e, '#/parent'); }
    const counts = { approved: 0, pending_review: 0, pending_consent: 0 };
    data.families.forEach((f) => { counts[f.status] = (counts[f.status] || 0) + 1; });
    return frag(`
      ${backBar('Owner tools', '#/parent', 'Back to grown-ups')}
      <p class="sub">${counts.approved} approved, ${counts.pending_review} waiting for review, ${counts.pending_consent} still need a form</p>
      <section class="block" aria-labelledby="review-h">
        <h2 id="review-h" class="section-label">Forms to review</h2>
        ${data.pending.length ? `<ul class="manage-list" role="list">${data.pending.map((f) => `<li class="report-row">
          <p><span class="manage-title">${esc(f.parent_name)}</span>, sent ${esc(new Date(f.consent_uploaded_at).toLocaleDateString())}</p>
          <div class="btn-row">
            <button type="button" class="btn btn-small" data-action="c-view-form" data-path="${esc(f.consent_path)}" aria-label="View form from ${esc(f.parent_name)}">View form</button>
            <button type="button" class="btn btn-small" data-action="c-review" data-id="${f.id}" data-approve="0" data-name="${esc(f.parent_name)}" aria-label="Send back form from ${esc(f.parent_name)}">Send back</button>
            <button type="button" class="btn btn-small btn-primary" data-action="c-review" data-id="${f.id}" data-approve="1" data-name="${esc(f.parent_name)}" aria-label="Approve ${esc(f.parent_name)}’s family">Approve</button>
          </div></li>`).join('')}</ul>` : '<p class="empty-note">No forms waiting.</p>'}
      </section>
      <section class="block" aria-labelledby="invite-h">
        <h2 id="invite-h" class="section-label">Invite a family</h2>
        <form class="stack" data-form="c-invite" novalidate>
          <div><label for="invite-note" class="field-label">Who it’s for</label>
          <p class="field-hint" id="invite-note-hint">Only you see this note.</p>
          <input type="text" id="invite-note" class="input" maxlength="80" autocomplete="off" aria-describedby="invite-note-hint"></div>
          <button type="submit" class="btn btn-primary">Create invite code</button>
        </form>
        ${data.invites.length ? `<ul class="manage-list block" role="list">${data.invites.map((i) => `<li class="manage-row">
          <div class="manage-main"><p class="manage-title code-text">${esc(i.code)}</p><p class="sub">${esc(i.note || 'No note')}, ${i.used_by ? 'used' : 'not used yet'}</p></div></li>`).join('')}</ul>` : ''}
      </section>`);
  }

  /* ---------- Actions ---------- */
  const actions = {
    'c-retry': () => router(),
    'c-refresh': async () => { await router({ focus: '[data-fk="c-refresh"]' }); say('Up to date'); },
    share: async () => {
      const pieces = await db.allPieces();
      if (!pieces.length) {
        const r = await ask({ title: 'Nothing to share yet', body: 'Snap a piece of art first. Then you can share it here.', ok: 'Go to your studio' });
        if (r.ok) go('#/home');
        return;
      }
      const r = await ask({ title: 'Share with friends', ok: 'Share', choices: pieces.slice(0, 20).map((p) => ({ value: p.id, label: p.title, img: pieceUrl(p) })) });
      if (r.ok && r.value) shareToFriends(r.value);
    },
    'share-piece': (el) => shareToFriends(el.dataset.id),
    'c-react': async (el) => {
      const st = lastState;
      const me = currentChild(st);
      if (!me || el.dataset.busy) return;
      const on = el.getAttribute('aria-pressed') !== 'true';
      const count = Number(el.dataset.count) + (on ? 1 : -1);
      el.setAttribute('aria-pressed', String(on));
      el.dataset.count = String(count);
      el.querySelector('.react-count').textContent = count;
      try {
        await busy(el, () => cloud.setReaction({ postId: el.dataset.post, familyId: st.family.id, childId: me.id, kind: el.dataset.kind, on }));
      } catch (e) {
        el.setAttribute('aria-pressed', String(!on));
        el.dataset.count = String(count + (on ? -1 : 1));
        el.querySelector('.react-count').textContent = el.dataset.count;
        say(cloud.friendly(e));
      }
    },
    'c-quick': (el) => postComment(el.dataset.post, el.dataset.text, 'your friend'),
    'c-delete-comment': async (el) => {
      const r = await ask({ title: 'Delete this comment?', ok: 'Delete', danger: true });
      if (!r.ok) return;
      try { await cloud.deleteComment(el.dataset.id); say('Comment deleted'); router({ focus: '#comment-text' }); } catch (e) { say(cloud.friendly(e)); }
    },
    'c-report-comment': async (el) => {
      const r = await ask({ title: 'Report this comment?', body: 'A grown-up will look at it. The person who wrote it won’t know you reported it.', ok: 'Report' });
      if (!r.ok) return;
      try {
        await cloud.reportComment({ commentId: el.dataset.id, familyId: lastState.family.id, childId: currentChild(lastState).id });
        say('Reported. A grown-up will check it.');
        router({ focus: `[data-fk="c-${el.dataset.id}"]` });
      } catch (e) { say(cloud.friendly(e)); }
    },
    'c-toggle-comments': async (el) => {
      const on = el.dataset.on !== 'true';
      try {
        await cloud.setCommentsOn(el.dataset.post, on);
        say(on ? 'Comments turned on' : 'Comments turned off');
        router({ focus: '[data-fk="switch"]' });
      } catch (e) { say(cloud.friendly(e)); }
    },
    'c-resend': async (el) => {
      try { await busy(el, () => cloud.sendCode(pendingEmail)); say('New code sent'); } catch (e) { say(cloud.friendly(e)); }
    },
    'c-change-email': () => { pendingEmail = null; router(); },
    'c-forgot-pin': async () => {
      const r = await ask({ title: 'Sign in again?', body: 'You’ll sign out on this device, then sign back in with a code from your email and make a new PIN. Nothing is deleted.', ok: 'Sign out' });
      if (!r.ok) return;
      const st = lastState;
      try { await cloud.signOut(); } catch (e) { /* signing out locally still works */ }
      if (st && st.userId) saveDevice(st.userId, { pinHash: null, salt: null, tries: 0 });
      unlockedUntil = 0;
      router();
    },
    'c-lock': () => { unlockedUntil = 0; say('Grown-up area locked'); go('#/friends'); },
    'c-sign-out': async () => {
      const r = await ask({ title: 'Sign out on this device?', body: 'Your child won’t be able to use Friends here until you sign in again. Nothing is deleted.', ok: 'Sign out' });
      if (!r.ok) return;
      const st = lastState;
      try { await cloud.signOut(); } catch (e) { /* ignore */ }
      if (st && st.userId) saveDevice(st.userId, { pinHash: null, salt: null, childId: null });
      unlockedUntil = 0;
      say('Signed out');
      go('#/friends');
    },
    'c-owner-family': async (el) => {
      const r = await ask({ title: 'Set up my family', field: { label: 'Your name (other parents see this)', value: '' }, ok: 'Set up' });
      if (!r.ok || !r.value) return;
      try {
        await busy(el, async () => {
          const code = await cloud.createInvite('Owner’s family');
          const familyId = await cloud.redeemInvite(code, r.value);
          await cloud.reviewFamily(familyId, true);
        });
        say('Your family is ready');
        router();
      } catch (e) { say(cloud.friendly(e)); }
    },
    'c-approve-self': async (el) => {
      try { await cloud.reviewFamily(el.dataset.id, true); say('Family approved'); router(); } catch (e) { say(cloud.friendly(e)); }
    },
    'c-use-device': (el) => {
      saveDevice(lastState.userId, { childId: el.dataset.id });
      const kid = lastState.children.find((c) => c.id === el.dataset.id);
      say(`This device is now for ${kid ? kid.display_name : 'your child'}`);
      router({ focus: '#kids-h' });
    },
    'c-remove-child': async (el) => {
      const r = await ask({ title: `Remove ${el.dataset.name}?`, body: 'This deletes their name and every post, comment, and like they made.', ok: 'Remove', danger: true });
      if (!r.ok) return;
      try {
        const posts = (await cloud.familyPosts(lastState.family.id)).filter((p) => p.child_id === el.dataset.id);
        for (const p of posts) await cloud.deletePost(p);
        await cloud.removeChild(el.dataset.id);
        if (deviceFor(lastState.userId).childId === el.dataset.id) saveDevice(lastState.userId, { childId: null });
        say(`${el.dataset.name} was removed`);
        router({ focus: '#kids-h' });
      } catch (e) { say(cloud.friendly(e)); }
    },
    'c-get-link': async (el) => {
      try {
        const code = await busy(el, () => cloud.createLinkCode());
        await ask({ title: `Your friend code is ${code}`, body: 'Send it to the other parent. It works once and lasts 7 days. Making a new code cancels this one.', ok: 'Done', cancel: 'Close' });
      } catch (e) { say(cloud.friendly(e)); }
    },
    'c-unlink': async (el) => {
      const r = await ask({ title: `Stop sharing with ${el.dataset.name}’s family?`, body: 'Your families won’t see each other’s art anymore. Nothing is deleted.', ok: 'Stop sharing', danger: true });
      if (!r.ok) return;
      try { await cloud.removeFriendFamily(lastState.family.id, el.dataset.id); say('Stopped sharing'); router({ focus: '#friends-h' }); } catch (e) { say(cloud.friendly(e)); }
    },
    'c-delete-post': async (el) => {
      const r = await ask({ title: `Delete “${el.dataset.title}”?`, body: 'Friends won’t see it anymore. Its comments and likes are deleted too.', ok: 'Delete', danger: true });
      if (!r.ok) return;
      try { await cloud.deletePost({ id: el.dataset.id, image_path: el.dataset.path }); say('Deleted'); router({ focus: '#shared-h' }); } catch (e) { say(cloud.friendly(e)); }
    },
    'c-keep-comment': async (el) => {
      try { await cloud.resolveReport(el.dataset.id); say('Report cleared'); router({ focus: '#reports-h' }); } catch (e) { say(cloud.friendly(e)); }
    },
    'c-remove-reported': async (el) => {
      const r = await ask({ title: 'Delete this comment?', ok: 'Delete', danger: true });
      if (!r.ok) return;
      try { await cloud.deleteComment(el.dataset.id); say('Comment deleted'); router({ focus: '#reports-h' }); } catch (e) { say(cloud.friendly(e)); }
    },
    'c-withdraw': async () => {
      const r = await ask({ title: 'Delete your family from Friends?', body: 'This deletes your kids’ names, every post, comment, and like your family made, and your signed form. Art in this device’s museum stays. This can’t be undone.', ok: 'Delete everything', danger: true });
      if (!r.ok) return;
      try {
        const st = lastState;
        say('Deleting…');
        await cloud.withdrawFamily(st.family && st.family.id);
        if (st.userId) writeDevice({});
        unlockedUntil = 0;
        say('Your family was deleted from Friends');
        go('#/friends');
      } catch (e) { say(cloud.friendly(e)); }
    },
    'c-view-form': async (el) => {
      const win = window.open('', '_blank');
      try {
        const url = await cloud.consentLink(el.dataset.path);
        if (win) win.location.href = url; else location.href = url;
      } catch (e) { if (win) win.close(); say(cloud.friendly(e)); }
    },
    'c-review': async (el) => {
      const approve = el.dataset.approve === '1';
      const r = await ask({
        title: approve ? `Approve ${el.dataset.name}’s family?` : `Send back ${el.dataset.name}’s form?`,
        body: approve ? 'Their kids can share with families they connect with.' : 'They’ll be asked to send a new signed form.',
        ok: approve ? 'Approve' : 'Send back',
      });
      if (!r.ok) return;
      try { await cloud.reviewFamily(el.dataset.id, approve); say(approve ? 'Approved' : 'Sent back'); router({ focus: '#review-h' }); } catch (e) { say(cloud.friendly(e)); }
    },
  };

  /* ---------- Forms ---------- */
  const value = (form, sel) => (form.querySelector(sel).value || '').trim();
  const forms = {
    'c-comment': async (form) => {
      const input = form.querySelector('#comment-text');
      await postComment(form.dataset.post, input.value, form.dataset.artist);
    },
    'c-send-code': async (form) => {
      const email = value(form, '#parent-email');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError('email-error', 'Enter an email address, like name@example.com.'); form.querySelector('#parent-email').focus(); return; }
      try {
        await busy(form.querySelector('button[type="submit"]'), () => cloud.sendCode(email));
        pendingEmail = email;
        say('Code sent');
        router({ focus: '#parent-code' });
      } catch (e) { showError('email-error', cloud.friendly(e)); }
    },
    'c-verify-code': async (form) => {
      const code = value(form, '#parent-code').replace(/\s/g, '');
      if (!/^\d{6,10}$/.test(code)) { showError('code-error', 'Enter the code from the email. It’s 6 numbers or more.'); form.querySelector('#parent-code').focus(); return; }
      try {
        await busy(form.querySelector('button[type="submit"]'), () => cloud.verifyCode(pendingEmail, code));
        pendingEmail = null;
        unlock();
        say('Signed in');
        router();
      } catch (e) { showError('code-error', cloud.friendly(e)); form.querySelector('#parent-code').focus(); }
    },
    'c-set-pin': async (form) => {
      const a = value(form, '#pin-new'), b = value(form, '#pin-again');
      if (!/^\d{4,8}$/.test(a)) { showError('pin-error', 'Use 4 to 8 numbers.'); form.querySelector('#pin-new').focus(); return; }
      if (a !== b) { showError('pin-error', 'The two PINs don’t match. Try again.'); form.querySelector('#pin-again').focus(); return; }
      const salt = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random());
      saveDevice(lastState.userId, { pinHash: await hashPin(a, salt), salt, tries: 0 });
      unlock();
      say('PIN saved');
      router();
    },
    'c-check-pin': async (form) => {
      const st = lastState;
      const dev = deviceFor(st.userId);
      const pin = value(form, '#pin-check');
      if (pin && (await hashPin(pin, dev.salt)) === dev.pinHash) {
        saveDevice(st.userId, { tries: 0 });
        unlock();
        router();
        return;
      }
      const tries = (dev.tries || 0) + 1;
      if (tries >= MAX_PIN_TRIES) {
        try { await cloud.signOut(); } catch (e) { /* ignore */ }
        saveDevice(st.userId, { pinHash: null, salt: null, tries: 0 });
        say('Too many tries. Sign in again with a code from your email.');
        router();
        return;
      }
      saveDevice(st.userId, { tries });
      showError('pin-error', `That PIN isn’t right. ${MAX_PIN_TRIES - tries} ${MAX_PIN_TRIES - tries === 1 ? 'try' : 'tries'} left.`);
      const input = form.querySelector('#pin-check');
      input.value = '';
      input.focus();
    },
    'c-join': async (form) => {
      const name = value(form, '#join-name'), code = value(form, '#join-code');
      if (!name) { showError('join-error', 'Enter your name.'); form.querySelector('#join-name').focus(); return; }
      if (!code) { showError('join-error', 'Enter your invite code.'); form.querySelector('#join-code').focus(); return; }
      try { await busy(form.querySelector('button[type="submit"]'), () => cloud.redeemInvite(code, name)); say('Welcome to Friends'); router(); } catch (e) { showError('join-error', cloud.friendly(e)); }
    },
    'c-consent': async (form) => {
      const file = form.querySelector('#consent-file').files[0];
      if (!file) { showError('consent-error', 'Choose a photo or scan of the signed form.'); form.querySelector('#consent-file').focus(); return; }
      if (file.size > 8 * 1024 * 1024) { showError('consent-error', 'That file is too big. Use a photo under 8 MB.'); return; }
      try {
        let upload = file;
        if (file.type.startsWith('image/') && file.type !== 'image/heic') upload = new File([await shrink(file, 2000, 0.85)], 'consent.jpg', { type: 'image/jpeg' });
        await busy(form.querySelector('button[type="submit"]'), () => cloud.uploadConsent(lastState.family.id, upload));
        say('Form sent');
        router();
      } catch (e) { showError('consent-error', cloud.friendly(e)); }
    },
    'c-add-child': async (form) => {
      const name = value(form, '#child-name');
      const tone = (form.querySelector('input[name="child-tone"]:checked') || {}).value || 'sky';
      if (!name) { showError('child-error', 'Enter a first name or nickname.'); form.querySelector('#child-name').focus(); return; }
      const check = checkComment(name);
      if (!check.ok) { showError('child-error', 'Pick a different name. Use a first name or nickname only.'); return; }
      try {
        const kid = await busy(form.querySelector('button[type="submit"]'), () => cloud.addChild(lastState.family.id, name, tone));
        if (!deviceFor(lastState.userId).childId && kid) saveDevice(lastState.userId, { childId: kid.id });
        say(`${name} was added`);
        router({ focus: '#child-name' });
      } catch (e) { showError('child-error', cloud.friendly(e)); }
    },
    'c-link': async (form) => {
      const code = value(form, '#link-code');
      if (!code) { showError('link-error', 'Enter the friend code from the other parent.'); form.querySelector('#link-code').focus(); return; }
      try { await busy(form.querySelector('button[type="submit"]'), () => cloud.redeemLinkCode(code)); say('Families connected'); router({ focus: '#friends-h' }); } catch (e) { showError('link-error', cloud.friendly(e)); }
    },
    'c-invite': async (form) => {
      try {
        const code = await busy(form.querySelector('button[type="submit"]'), () => cloud.createInvite(value(form, '#invite-note')));
        await ask({ title: `Invite code: ${code}`, body: 'Send this code to the parent. They enter it in Friends, then Grown-ups, after signing in. It works once.', ok: 'Done', cancel: 'Close' });
        router({ focus: '#invite-h' });
      } catch (e) { say(cloud.friendly(e)); }
    },
  };

  return {
    routes: { friends: friendsScreen, post: postScreen, parent: parentScreen, owner: ownerScreen },
    actions,
    forms,
    afterRender: async (name) => {
      if (name === 'parent' && lastState && lastState.family && lastState.family.status === 'approved' && isUnlocked()) {
        await fillFamilyDetails(lastState);
      }
    },
  };
}
