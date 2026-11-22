// Talks to Supabase for the Friends tab. Every rule about who can see what is
// enforced on the server (supabase/setup.sql), not here.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

export const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.78.0/+esm';
export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

let clientPromise = null;
export function client() {
  if (!cloudEnabled) return Promise.reject(new Error('not_configured'));
  if (!clientPromise) {
    clientPromise = import(SUPABASE_JS)
      .then((m) => m.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'art-studio-auth' },
      }))
      .catch((e) => { clientPromise = null; throw e; });
  }
  return clientPromise;
}

const MESSAGES = {
  not_configured: 'Friends isn’t set up yet.',
  invite_invalid: 'That invite code didn’t work. Check it and try again.',
  parent_name_invalid: 'Enter your name.',
  not_approved: 'Your family isn’t approved yet.',
  not_admin: 'Only the app owner can do that.',
  link_code_invalid: 'That friend code didn’t work. Friend codes last 7 days.',
  link_code_own: 'That’s your own friend code. Send it to the other family instead.',
  comments_off: 'Comments are turned off for this post.',
  comment_too_fast: 'Slow down a little. Try again in a minute.',
  comment_unkind: 'That message wasn’t sent. Try saying what you like, or one idea to try.',
  comment_private: 'That message wasn’t sent. Leave out phone numbers, addresses, schools, links, and other apps.',
  comment_empty: 'Write something first.',
  title_unkind: 'Pick a different name for this art.',
  title_private: 'Leave personal details out of the art’s name.',
  name_unkind: 'Pick a different name.',
  name_private: 'Use a first name or nickname only.',
  consent_path_invalid: 'That form couldn’t be saved. Try again.',
};

export function friendly(error) {
  const text = String((error && (error.message || error.error_description || error.msg)) || error || '');
  for (const key of Object.keys(MESSAGES)) if (text.includes(key)) return MESSAGES[key];
  if (/failed to fetch|networkerror|load failed|network request failed|importing a module script failed|dynamically imported module/i.test(text)) {
    return 'You’re offline. Connect to the internet and try again.';
  }
  if (/expired|invalid.*(otp|token)|(otp|token).*invalid/i.test(text)) return 'That code didn’t work or has expired. Send a new one.';
  if (/rate limit|too many/i.test(text)) return 'Too many tries. Wait a few minutes and try again.';
  if (/payload too large|exceeded the maximum/i.test(text)) return 'That picture is too big. Try a smaller one.';
  return 'Something went wrong. Try again.';
}

async function run(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

/* ---------- Sign-in ---------- */
export async function sendCode(email) {
  const sb = await client();
  await run(sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }));
}
export async function verifyCode(email, token) {
  const sb = await client();
  await run(sb.auth.verifyOtp({ email, token, type: 'email' }));
}
export async function signOut() {
  const sb = await client();
  await sb.auth.signOut();
}

export async function getState() {
  const sb = await client();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return { signedIn: false };
  const userId = session.user.id;
  const [family, isAdmin] = await Promise.all([
    run(sb.from('families').select('*').eq('parent_id', userId).maybeSingle()),
    run(sb.rpc('is_admin')),
  ]);
  const children = family ? await run(sb.from('children').select('*').eq('family_id', family.id).order('created_at')) : [];
  return { signedIn: true, userId, email: session.user.email, family, isAdmin: Boolean(isAdmin), children: children || [] };
}

/* ---------- Joining ---------- */
export async function redeemInvite(code, parentName) {
  const sb = await client();
  return run(sb.rpc('redeem_invite', { p_code: code, p_parent_name: parentName }));
}
export async function uploadConsent(familyId, file) {
  const sb = await client();
  const ext = (file.name && file.name.includes('.') ? file.name.split('.').pop() : 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${familyId}/consent-${Date.now()}.${ext}`;
  await run(sb.storage.from('consent').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false }));
  await run(sb.rpc('submit_consent', { p_path: path }));
}

/* ---------- Owner tools ---------- */
export async function ownerData() {
  const sb = await client();
  const [pending, families, invites] = await Promise.all([
    run(sb.from('families').select('*').eq('status', 'pending_review').order('consent_uploaded_at')),
    run(sb.from('families').select('id, parent_name, status').order('created_at')),
    run(sb.from('invites').select('*').order('created_at', { ascending: false }).limit(20)),
  ]);
  return { pending: pending || [], families: families || [], invites: invites || [] };
}
export async function consentLink(path) {
  const sb = await client();
  const data = await run(sb.storage.from('consent').createSignedUrl(path, 600));
  return data.signedUrl;
}
export async function reviewFamily(familyId, approve) {
  const sb = await client();
  await run(sb.rpc('admin_review_family', { p_family: familyId, p_approve: approve }));
}
export async function createInvite(note) {
  const sb = await client();
  return run(sb.rpc('admin_create_invite', { p_note: note }));
}

/* ---------- Kids and friend families ---------- */
export async function addChild(familyId, name, tone) {
  const sb = await client();
  return run(sb.from('children').insert({ family_id: familyId, display_name: name, tone }).select().single());
}
export async function removeChild(childId) {
  const sb = await client();
  await run(sb.from('children').delete().eq('id', childId));
}
export async function createLinkCode() {
  const sb = await client();
  return run(sb.rpc('create_link_code'));
}
export async function redeemLinkCode(code) {
  const sb = await client();
  return run(sb.rpc('redeem_link_code', { p_code: code }));
}
export async function friendFamilies(familyId) {
  const sb = await client();
  const links = (await run(sb.from('family_links').select('*'))) || [];
  const ids = links.map((l) => (l.family_a === familyId ? l.family_b : l.family_a));
  if (!ids.length) return [];
  const [families, kids] = await Promise.all([
    run(sb.from('families').select('id, parent_name').in('id', ids)),
    run(sb.from('children').select('id, family_id, display_name, tone').in('family_id', ids).order('created_at')),
  ]);
  return (families || []).map((f) => ({ ...f, children: (kids || []).filter((k) => k.family_id === f.id) }));
}
export async function removeFriendFamily(familyId, otherId) {
  const sb = await client();
  await run(sb.from('family_links').delete()
    .or(`and(family_a.eq.${familyId},family_b.eq.${otherId}),and(family_a.eq.${otherId},family_b.eq.${familyId})`));
}

/* ---------- Posts ---------- */
const POST_FIELDS = 'id, title, image_path, comments_on, created_at, family_id, child_id, child:children(id, display_name, tone), comments(count)';

async function withImages(sb, posts) {
  if (!posts.length) return posts;
  const urls = (await run(sb.storage.from('art').createSignedUrls(posts.map((p) => p.image_path), 3600))) || [];
  const byPath = new Map(urls.map((u) => [u.path, u.signedUrl]));
  return posts.map((p, i) => ({ ...p, url: byPath.get(p.image_path) || (urls[i] && urls[i].signedUrl) || '' }));
}
const commentCount = (p) => (Array.isArray(p.comments) && p.comments[0] ? p.comments[0].count : 0);

export async function feed() {
  const sb = await client();
  const posts = (await run(sb.from('posts').select(POST_FIELDS).order('created_at', { ascending: false }).limit(30))) || [];
  const reactions = posts.length ? (await run(sb.from('reactions').select('post_id, kind, child_id').in('post_id', posts.map((p) => p.id)))) || [] : [];
  const withUrls = await withImages(sb, posts);
  return withUrls.map((p) => ({ ...p, commentCount: commentCount(p), reactions: reactions.filter((r) => r.post_id === p.id) }));
}

export async function postWithComments(postId, familyId) {
  const sb = await client();
  const post = await run(sb.from('posts').select(POST_FIELDS).eq('id', postId).maybeSingle());
  if (!post) return null;
  const [comments, reports] = await Promise.all([
    run(sb.from('comments').select('id, body, created_at, family_id, child_id, child:children(id, display_name, tone)').eq('post_id', postId).order('created_at')),
    run(sb.from('reports').select('comment_id').eq('reporter_family_id', familyId)),
  ]);
  const [withUrl] = await withImages(sb, [post]);
  const reported = new Set((reports || []).map((r) => r.comment_id));
  return { ...withUrl, comments: (comments || []).map((c) => ({ ...c, reported: reported.has(c.id) })) };
}

export async function sharePiece({ familyId, childId, title, blob }) {
  const sb = await client();
  const id = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}${Math.random().toString(36).slice(2)}`;
  const path = `${familyId}/${id}.jpg`;
  await run(sb.storage.from('art').upload(path, blob, { contentType: 'image/jpeg', upsert: false }));
  try {
    return await run(sb.from('posts').insert({ family_id: familyId, child_id: childId, title, image_path: path }).select('id').single());
  } catch (e) {
    await sb.storage.from('art').remove([path]);
    throw e;
  }
}
export async function deletePost(post) {
  const sb = await client();
  await run(sb.storage.from('art').remove([post.image_path]));
  await run(sb.from('posts').delete().eq('id', post.id));
}
export async function setCommentsOn(postId, on) {
  const sb = await client();
  await run(sb.from('posts').update({ comments_on: on }).eq('id', postId));
}
export async function familyPosts(familyId) {
  const sb = await client();
  const posts = (await run(sb.from('posts').select(POST_FIELDS).eq('family_id', familyId).order('created_at', { ascending: false }))) || [];
  return (await withImages(sb, posts)).map((p) => ({ ...p, commentCount: commentCount(p) }));
}

/* ---------- Reactions, comments, reports ---------- */
export async function setReaction({ postId, familyId, childId, kind, on }) {
  const sb = await client();
  if (on) {
    const { error } = await sb.from('reactions').insert({ post_id: postId, family_id: familyId, child_id: childId, kind });
    if (error && !/duplicate/i.test(error.message)) throw error;
  } else {
    await run(sb.from('reactions').delete().eq('post_id', postId).eq('child_id', childId).eq('kind', kind));
  }
}
export async function addComment({ postId, familyId, childId, body }) {
  const sb = await client();
  await run(sb.from('comments').insert({ post_id: postId, family_id: familyId, child_id: childId, body }));
}
export async function deleteComment(commentId) {
  const sb = await client();
  await run(sb.from('comments').delete().eq('id', commentId));
}
export async function reportComment({ commentId, familyId, childId }) {
  const sb = await client();
  const { error } = await sb.from('reports').insert({ comment_id: commentId, reporter_family_id: familyId, reporter_child_id: childId });
  if (error && !/duplicate/i.test(error.message)) throw error;
}
export async function reportsOnMyPosts(familyId) {
  const sb = await client();
  const rows = (await run(sb.from('reports')
    .select('id, created_at, comment:comments(id, body, child:children(display_name), post:posts(id, title, family_id))')
    .order('created_at', { ascending: false }))) || [];
  return rows.filter((r) => r.comment && r.comment.post && r.comment.post.family_id === familyId);
}
export async function resolveReport(reportId) {
  const sb = await client();
  await run(sb.from('reports').delete().eq('id', reportId));
}

/* ---------- Leaving ---------- */
async function removeFolder(sb, bucket, folder) {
  for (;;) {
    const files = (await run(sb.storage.from(bucket).list(folder, { limit: 100 }))) || [];
    const paths = files.filter((f) => f.name && f.id !== null).map((f) => `${folder}/${f.name}`);
    if (!paths.length) return;
    await run(sb.storage.from(bucket).remove(paths));
    if (files.length < 100) return;
  }
}
export async function withdrawFamily(familyId) {
  const sb = await client();
  if (familyId) {
    await removeFolder(sb, 'art', familyId);
    await removeFolder(sb, 'consent', familyId);
  }
  await run(sb.rpc('withdraw_family'));
  await sb.auth.signOut();
}
