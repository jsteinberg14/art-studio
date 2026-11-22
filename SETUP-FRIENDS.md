# Turning on Friends

Until you finish these steps, the Friends tab stays in preview mode, where everything stays on the device. Plan for about an hour. You'll need a computer for the first part.

## How it works

- **Invite-only.** Only parents with an invite code you created can join.
- **Parents set everything up.** A parent signs in with a code sent to their email, sends a signed permission form, and adds their child by first name or nickname. Kids never type in personal details.
- **You approve each family.** Sharing turns on only after you've seen their signed form.
- **Parents connect with each other.** One parent sends a friend code, and the other enters it. Kids only see art from families their parents connected with.
- **The server enforces the rules.** Who can see what, and the kindness check on comments, run on the server, so they can't be skipped.
- **A grown-up PIN on each device** keeps kids out of the grown-up area.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com), sign up for the free plan, and select **New project**.
2. Give it a name like `art-studio`, create a database password and save it somewhere safe, and pick the region closest to you.
3. Wait a couple of minutes for the project to finish setting up.

## 2. Run the setup script

1. In your project, open **SQL Editor** and select **New query**.
2. Open `supabase/setup.sql` from the app folder, copy all of it, and paste it in.
3. Select **Run**. You should see a success message.

The script creates the tables, the security rules, the kindness check, and private picture storage. It's safe to run again if you need to.

I wasn't able to run this script against a real Supabase project, so it hasn't been tested there. If **Run** shows an error, copy the error message and send it to me.

## 3. Set up email for sign-in codes

Supabase's built-in email only sends to people on your own Supabase team, and it's limited to a few messages an hour. Other parents need a real email-sending service to get their codes. Several have free plans that are plenty for a few families, such as Brevo, Resend, or Amazon SES.

1. Create an account with one of those services and follow its steps to verify a sender address.
2. In Supabase, open **Authentication**, then **Emails**, then **SMTP Settings**. Turn on custom SMTP and enter the details the email service gave you.
3. Open the **Templates** tab. In both the **Magic link** and **Confirm signup** templates, replace the body with this, then save:

```
<h2>Your My Art Studio sign-in code</h2>
<p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
<p>If you didn’t ask for this, you can ignore this email.</p>
```

The app asks for the code instead of using a sign-in link, because links open in Safari rather than in the home-screen app.

## 4. Connect the app

1. In Supabase, open **Project Settings**, then **API Keys**. Copy the **publishable** key, which starts with `sb_publishable_`. If you only see a **Create new API keys** button, select it first.
2. On the same screens, copy your **Project URL**, which looks like `https://abcd1234.supabase.co`.
3. Open `js/config.js` and fill it in:

```js
export const SUPABASE_URL = 'https://abcd1234.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_...';
export const OWNER_NAME = 'Jon';
export const OWNER_EMAIL = 'you@example.com';
```

The publishable key is meant to be public, so it's fine in GitHub. Never put a **secret** key in the app.

4. In `sw.js`, change the version number (for example, `art-studio-v3` to `art-studio-v4`).
5. Upload everything to GitHub, including the new `supabase` folder, `privacy.html`, and `consent-form.html`.

## 5. Make yourself the owner

1. Open the app, go to **Friends**, and tap **Grown-ups**.
2. Sign in with your own email, enter the code, and make a PIN. The app asks for an invite code. Stop there.
3. In Supabase, open **SQL Editor** and run this line with your email:

```sql
insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
```

4. Back in the app, close **Grown-ups** and open it again. Tap **Set up my family**, then add your child under **Kids**.

## 6. Invite a family

1. In **Grown-ups**, open **Owner tools**, enter who the invite is for, and tap **Create invite code**.
2. Send the code to the parent, along with your app's web address.
3. They add the app to their home screen, open **Friends**, tap **Grown-ups**, sign in, and enter the code.
4. They print the permission form (or copy it onto paper), sign it, and send a photo of it from the app.
5. In **Owner tools**, open their form, check it, and tap **Approve**.
6. They add their child and choose which child uses that device.
7. To connect your families, one of you taps **Get our friend code** and sends it to the other, who enters it under **Friend families**.

## Things to know

- **Free projects can pause.** Supabase may pause a free project after a stretch with no use. If Friends stops loading, open the Supabase dashboard and restore the project.
- **Reports show up in the grown-up area.** When a kid reports a comment on your family's art, it appears under **Reported comments**. There are no email alerts, so check now and then.
- **Leaving deletes everything.** When a parent taps **Delete our family and everything we shared**, their family, kids' names, posts, comments, likes, and signed form are deleted.
- **Keep the forms private.** Signed forms are stored privately and only you can open them.
- **This isn't legal advice.** The steps follow the FTC's COPPA rules for parent permission, using a signed form. Check with a lawyer if you ever open Friends to people you don't know.

## Testing it yourself

`tools/friends_check.py` walks through every Friends screen using a stand-in server and runs the accessibility checks. It doesn't touch your real Supabase project.

```
pip install playwright
python -m playwright install chromium
python tools/friends_check.py
```
