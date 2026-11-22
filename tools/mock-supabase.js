// TEST ONLY. A tiny in-browser stand-in for supabase-js, used by tools/friends_check.py
// to exercise the Friends screens without a real server. The app never loads this file.
const KEY = 'mock-supabase';
const wait = () => new Promise((r) => setTimeout(r, 15));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const now = () => new Date().toISOString();
const files = new Map();

function seed() {
  return {
    users: [{ id: 'u-dana', email: 'dana@example.com' }],
    session: null,
    admins: [],
    invites: [{ code: 'WELCOME1', note: 'Test', created_at: now(), used_by: null }],
    families: [
      { id: 'f-dana', parent_id: 'u-dana', parent_name: 'Dana', status: 'approved', consent_path: 'f-dana/c.jpg', consent_uploaded_at: now(), created_at: now() },
      { id: 'f-lee', parent_id: 'u-lee', parent_name: 'Lee', status: 'pending_review', consent_path: 'f-lee/c.jpg', consent_uploaded_at: now(), created_at: now() },
    ],
    children: [{ id: 'k-mia', family_id: 'f-dana', display_name: 'Mia', tone: 'gum', created_at: now() }],
    family_links: [],
    link_codes: [{ code: 'MIA123', family_id: 'f-dana', expires_at: new Date(Date.now() + 864e5).toISOString() }],
    posts: [{ id: 'p-mia', family_id: 'f-dana', child_id: 'k-mia', title: 'Watercolor flower', image_path: 'f-dana/flower.jpg', comments_on: true, created_at: now() }],
    comments: [{ id: 'c-mia', post_id: 'p-mia', family_id: 'f-dana', child_id: 'k-mia', body: 'My first try with watercolor', created_at: now() }],
    reactions: [{ post_id: 'p-mia', family_id: 'f-dana', child_id: 'k-mia', kind: 'heart', created_at: now() }],
    reports: [],
    objects: [{ bucket: 'art', path: 'f-dana/flower.jpg' }],
  };
}
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || seed(); } catch (e) { return seed(); } };
let S = load();
const save = () => localStorage.setItem(KEY, JSON.stringify(S));

const me = () => (S.session ? S.session.user.id : null);
const isAdmin = () => S.admins.includes(me());
const myFam = () => S.families.find((f) => f.parent_id === me()) || null;
const famById = (id) => S.families.find((f) => f.id === id);
const linked = (a, b) => S.family_links.some((l) => (l.family_a === a && l.family_b === b) || (l.family_a === b && l.family_b === a));
function canSee(fid) {
  const m = myFam();
  const f = famById(fid);
  return Boolean(m && m.status === 'approved' && f && f.status === 'approved' && (m.id === fid || linked(m.id, fid)));
}
const postOf = (id) => S.posts.find((p) => p.id === id);
const childOf = (id) => S.children.find((c) => c.id === id) || null;
const visibleComment = (c) => { const p = postOf(c.post_id); return p && canSee(p.family_id) && canSee(c.family_id); };

const VISIBLE = {
  families: (r) => r.parent_id === me() || isAdmin() || canSee(r.id),
  children: (r) => (myFam() && r.family_id === myFam().id) || canSee(r.family_id) || isAdmin(),
  family_links: (r) => myFam() && (r.family_a === myFam().id || r.family_b === myFam().id),
  posts: (r) => canSee(r.family_id),
  comments: visibleComment,
  reactions: (r) => { const p = postOf(r.post_id); return p && canSee(p.family_id) && canSee(r.family_id); },
  reports: (r) => {
    const c = S.comments.find((x) => x.id === r.comment_id);
    const p = c && postOf(c.post_id);
    return isAdmin() || (myFam() && (r.reporter_family_id === myFam().id || (p && p.family_id === myFam().id)));
  },
  invites: () => isAdmin(),
};

function embed(table, row) {
  if (table === 'posts') {
    return { ...row, child: childOf(row.child_id), comments: [{ count: S.comments.filter((c) => c.post_id === row.id && visibleComment(c)).length }] };
  }
  if (table === 'comments') return { ...row, child: childOf(row.child_id) };
  if (table === 'reports') {
    const c = S.comments.find((x) => x.id === row.comment_id);
    const p = c && postOf(c.post_id);
    return { ...row, comment: c ? { id: c.id, body: c.body, child: childOf(c.child_id), post: p ? { id: p.id, title: p.title, family_id: p.family_id } : null } : null };
  }
  return { ...row };
}

function kindness(text) {
  if (/(\d[\s().-]*){7,}|@|www\.|\.com/i.test(text)) return 'private';
  if (/\b(ugly|stupid|dumb|hate|loser)\b/i.test(text)) return 'unkind';
  return null;
}
const err = (message) => ({ data: null, error: { message } });

class Query {
  constructor(table) { this.table = table; this.op = 'select'; this.filters = []; this.sort = null; this.max = null; this.mode = 'many'; this.returning = false; }
  select() { if (this.op !== 'select') this.returning = true; return this; }
  eq(col, val) { this.filters.push((r) => r[col] === val); return this; }
  in(col, vals) { this.filters.push((r) => vals.includes(r[col])); return this; }
  or(expr) {
    const m = expr.match(/family_a\.eq\.([^,]+),family_b\.eq\.([^)]+)\)/);
    if (m) this.filters.push((r) => (r.family_a === m[1] && r.family_b === m[2]) || (r.family_a === m[2] && r.family_b === m[1]));
    return this;
  }
  order(col, opts = {}) { this.sort = { col, asc: opts.ascending !== false }; return this; }
  limit(n) { this.max = n; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }
  single() { this.mode = 'single'; return this; }
  insert(row) { this.op = 'insert'; this.row = row; return this; }
  update(values) { this.op = 'update'; this.values = values; return this; }
  delete() { this.op = 'delete'; return this; }
  then(resolve, reject) { return wait().then(() => this.run()).then(resolve, reject); }
  shape(rows) {
    if (this.mode === 'single') return rows.length ? { data: rows[0], error: null } : err('no rows');
    if (this.mode === 'maybe') return { data: rows[0] || null, error: null };
    return { data: rows, error: null };
  }
  run() {
    const t = this.table;
    const list = S[t];
    if (!me()) return err('not signed in');
    if (this.op === 'select') {
      let rows = list.filter((r) => (VISIBLE[t] ? VISIBLE[t](r) : true)).filter((r) => this.filters.every((f) => f(r)));
      if (this.sort) rows = rows.slice().sort((a, b) => (a[this.sort.col] > b[this.sort.col] ? 1 : -1) * (this.sort.asc ? 1 : -1));
      if (this.max) rows = rows.slice(0, this.max);
      return this.shape(rows.map((r) => embed(t, r)));
    }
    if (this.op === 'insert') {
      const row = { ...this.row, created_at: now() };
      const fam = myFam();
      if (t !== 'invites' && (!fam || fam.status !== 'approved' || row.family_id && row.family_id !== fam.id && t !== 'reports')) return err('new row violates row-level security policy');
      if (t === 'children') { row.id = uid(); if (kindness(row.display_name)) return err(`name_${kindness(row.display_name)}`); }
      if (t === 'posts') { row.id = uid(); row.comments_on = true; if (!canSee(row.family_id)) return err('rls'); }
      if (t === 'comments') {
        const p = postOf(row.post_id);
        if (!p || !canSee(p.family_id)) return err('new row violates row-level security policy');
        if (!p.comments_on) return err('comments_off');
        const k = kindness(row.body);
        if (k) return err(`comment_${k}`);
        row.id = uid();
      }
      if (t === 'reactions' && S.reactions.some((r) => r.post_id === row.post_id && r.child_id === row.child_id && r.kind === row.kind)) return err('duplicate key value');
      if (t === 'reports') {
        if (row.reporter_family_id !== fam.id) return err('rls');
        if (S.reports.some((r) => r.comment_id === row.comment_id && r.reporter_family_id === row.reporter_family_id)) return err('duplicate key value');
        row.id = uid();
      }
      list.push(row);
      save();
      return this.shape(this.returning ? [embed(t, row)] : []);
    }
    const targets = list.filter((r) => (VISIBLE[t] ? VISIBLE[t](r) : true)).filter((r) => this.filters.every((f) => f(r)));
    if (this.op === 'update') {
      targets.forEach((r) => { if (t !== 'posts' || r.family_id === (myFam() || {}).id) Object.assign(r, this.values); });
    } else {
      const fam = myFam();
      const allowed = targets.filter((r) => {
        if (t === 'comments') { const p = postOf(r.post_id); return r.family_id === fam.id || (p && p.family_id === fam.id); }
        if (t === 'posts' || t === 'children' || t === 'reactions') return r.family_id === fam.id;
        return true;
      });
      S[t] = list.filter((r) => !allowed.includes(r));
      if (t === 'posts') { const ids = allowed.map((p) => p.id); S.comments = S.comments.filter((c) => !ids.includes(c.post_id)); S.reactions = S.reactions.filter((r) => !ids.includes(r.post_id)); }
      if (t === 'comments') { const ids = allowed.map((c) => c.id); S.reports = S.reports.filter((r) => !ids.includes(r.comment_id)); }
    }
    save();
    return this.shape([]);
  }
}

const RPC = {
  is_admin: () => isAdmin(),
  redeem_invite: ({ p_code, p_parent_name }) => {
    if (myFam()) return myFam().id;
    const inv = S.invites.find((i) => i.code === String(p_code).trim().toUpperCase() && !i.used_by);
    if (!inv) throw new Error('invite_invalid');
    const f = { id: uid(), parent_id: me(), parent_name: p_parent_name, status: 'pending_consent', created_at: now() };
    S.families.push(f);
    inv.used_by = me();
    return f.id;
  },
  submit_consent: ({ p_path }) => { const f = myFam(); f.consent_path = p_path; f.consent_uploaded_at = now(); if (f.status !== 'approved') f.status = 'pending_review'; },
  admin_create_invite: ({ p_note }) => {
    if (!isAdmin()) throw new Error('not_admin');
    const code = uid().replace(/-/g, '').slice(0, 8).toUpperCase();
    S.invites.unshift({ code, note: p_note, created_at: now(), used_by: null });
    return code;
  },
  admin_review_family: ({ p_family, p_approve }) => {
    if (!isAdmin()) throw new Error('not_admin');
    const f = famById(p_family); f.status = p_approve ? 'approved' : 'pending_consent';
  },
  create_link_code: () => {
    const f = myFam(); if (!f || f.status !== 'approved') throw new Error('not_approved');
    S.link_codes = S.link_codes.filter((c) => c.family_id !== f.id);
    const code = 'ABC234';
    S.link_codes.push({ code, family_id: f.id, expires_at: new Date(Date.now() + 864e5).toISOString() });
    return code;
  },
  redeem_link_code: ({ p_code }) => {
    const f = myFam(); if (!f || f.status !== 'approved') throw new Error('not_approved');
    const c = S.link_codes.find((x) => x.code === String(p_code).trim().toUpperCase());
    if (!c) throw new Error('link_code_invalid');
    if (c.family_id === f.id) throw new Error('link_code_own');
    if (!linked(f.id, c.family_id)) S.family_links.push({ family_a: f.id, family_b: c.family_id, created_at: now() });
    S.link_codes = S.link_codes.filter((x) => x !== c);
    return c.family_id;
  },
  withdraw_family: () => {
    const f = myFam(); if (!f) return;
    const kids = S.children.filter((k) => k.family_id === f.id).map((k) => k.id);
    const posts = S.posts.filter((p) => p.family_id === f.id).map((p) => p.id);
    S.families = S.families.filter((x) => x.id !== f.id);
    S.children = S.children.filter((k) => k.family_id !== f.id);
    S.posts = S.posts.filter((p) => p.family_id !== f.id);
    S.comments = S.comments.filter((c) => c.family_id !== f.id && !posts.includes(c.post_id));
    S.reactions = S.reactions.filter((r) => r.family_id !== f.id && !kids.includes(r.child_id));
    S.family_links = S.family_links.filter((l) => l.family_a !== f.id && l.family_b !== f.id);
    S.users = S.users.filter((u) => u.id !== me());
  },
};

const PLACEHOLDER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#F4C0D1"/><circle cx="5" cy="5" r="3" fill="#ED93B1"/></svg>')}`;

function bucket(name) {
  return {
    async upload(path, blob) { await wait(); S.objects.push({ bucket: name, path }); files.set(`${name}/${path}`, URL.createObjectURL(blob)); save(); return { data: { path }, error: null }; },
    async createSignedUrls(paths) { await wait(); return { data: paths.map((p) => ({ path: p, signedUrl: files.get(`${name}/${p}`) || PLACEHOLDER, error: null })), error: null }; },
    async createSignedUrl(path) { await wait(); return { data: { signedUrl: files.get(`${name}/${path}`) || PLACEHOLDER }, error: null }; },
    async remove(paths) { await wait(); S.objects = S.objects.filter((o) => !(o.bucket === name && paths.includes(o.path))); save(); return { data: [], error: null }; },
    async list(folder) { await wait(); return { data: S.objects.filter((o) => o.bucket === name && o.path.startsWith(`${folder}/`)).map((o) => ({ id: o.path, name: o.path.slice(folder.length + 1) })), error: null }; },
  };
}

export function createClient() {
  return {
    auth: {
      async signInWithOtp({ email }) { await wait(); S.pendingEmail = email; save(); return { data: {}, error: null }; },
      async verifyOtp({ email, token }) {
        await wait();
        if (token !== '123456') return err('Token has expired or is invalid');
        let user = S.users.find((u) => u.email === email);
        if (!user) { user = { id: uid(), email }; S.users.push(user); }
        if (email === 'owner@example.com' && !S.admins.includes(user.id)) S.admins.push(user.id);
        S.session = { user };
        save();
        return { data: { session: S.session }, error: null };
      },
      async getSession() { await wait(); return { data: { session: S.session }, error: null }; },
      async signOut() { await wait(); S.session = null; save(); return { error: null }; },
    },
    from: (table) => new Query(table),
    async rpc(name, args) {
      await wait();
      if (!me()) return err('not_signed_in');
      try { const data = RPC[name](args || {}); save(); return { data, error: null }; } catch (e) { return err(e.message); }
    },
    storage: { from: bucket },
  };
}
