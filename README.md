# My Art Studio

A drawing app for kids. Snap a photo of your art, get friendly feedback, keep it in your own museum, find new ideas, and draw on top of your pictures.

It is a web app that installs on an iPhone or iPad home screen and opens full screen, like a regular app. It works offline after the first visit, and all art stays on the device.

## Screens

- **Look:** every screen shares the Home page style: thick dark outlines, chunky shadows, paint-pot colors, a rainbow ribbon under each screen's title, and tilted snapshot frames for your art.
- **Home:** small links to everything: Snap your art, Museum, Blank canvas, Ideas, Friends, and Settings. Your favorite pieces sit below the links. To favorite a piece, open it from the Museum and tap the heart.
- **Snap:** the second tab. Take or choose a photo of your art and get "You did well" and "Try this next" feedback. Your latest feedback and recent museum pieces are here too.
- **Send photo:** on a piece, tap Send photo to open the iPhone share sheet and send the picture in Messages (or any app) as a photo. On a computer it saves the picture instead. ("Post to Friends" adds it to the Friends feed.)
- **Museum:** every saved piece, two to a row, with space around each one. Favorited pieces show a small heart.
- **Blank canvas:** the middle button on the bottom bar opens an empty page to draw on. It also has a **Blend** tool that smudges colors together, with four sizes and three strengths (Light, Medium, Strong). Blend isn't on photo canvases, because it can only smudge your drawing, not the photo under it.
- **Ideas:** random drawing ideas ("Try it" opens a completely blank canvas), like silly characters, places, and quick challenges. About one refresh in four, one of the three ideas is based on a piece in your museum.
- **Friends:** an invite-only feed for families you know, with likes, favorites, and kind comments. It stays in on-device preview mode until you set it up (see [SETUP-FRIENDS.md](SETUP-FRIENDS.md)).
- **Grown-ups:** a PIN-protected area where parents sign in, give permission, add kids, connect with other families, and review reported comments.
- **Draw on it:** pen, marker, paint brush, and eraser (plus Blend on a blank canvas), with rainbow and neutral colors, shades, sizes, and undo.
- **Settings:** color scheme (sky blue, sunny yellow, or bubblegum pink) and feedback style (bubbly or clear).

## Put it on GitHub Pages

You can do all of this in a web browser. No coding tools are needed.

1. Sign in at [github.com](https://github.com) and select **New repository**. Name it something like `art-studio`, set it to **Public**, and select **Create repository**.
2. On the new repository page, select **uploading an existing file**.
3. Open the `art-studio` folder on your computer, select everything inside it (including the `css`, `js`, `icons`, and `tools` folders), and drag it onto the upload page. Then select **Commit changes**.
4. Go to **Settings**, then **Pages**. Under "Build and deployment," set **Source** to **Deploy from a branch**, choose the **main** branch and the **/ (root)** folder, and select **Save**.
5. Wait a minute or two, then refresh the page. GitHub shows the web address, which looks like `https://your-name.github.io/art-studio/`.

GitHub Pages sites are public, so anyone with the address can open the app. They can't see the art, because each device keeps its own art.

## Add it to an iPhone or iPad

1. Open the web address in **Safari**.
2. Tap the **Share** button (the square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**, then tap **Add**.
4. Open **Art Studio** from the home screen. The first time you snap a picture, allow camera and photo access when asked.

The app needs iOS or iPadOS 16.4 or later.

## Updating the app

When you change any file, open `sw.js` and change `art-studio-v1` to `art-studio-v2` (then `v3`, and so on). Upload the changed files to GitHub. Phones and iPads pick up the new version the second time the app opens after the update.

## Where the art is saved

Art, posts, and comments are saved on the device in the browser's storage. They are not uploaded anywhere.

- Deleting the app from the home screen, or clearing Safari website data, deletes the art.
- Art doesn't move between devices. An iPad and an iPhone each have their own museum.
- To keep a favorite piece forever, take a screenshot of it on the Museum screen.

## Feedback and Friends

**Feedback.** The feedback comes from a helper built into the app (`js/feedback.js`). It measures colors, light and dark, and detail, then picks friendly suggestions. It isn't a real AI model. To use a real AI model later, you'd need a small server that keeps the AI service key secret, because a key placed in this public code could be copied by anyone. Then you'd replace `analyzeImage()` with a call to that server.

**Friends.** Until it's set up, Friends shows sample friends, and sharing only adds a post on this device. [SETUP-FRIENDS.md](SETUP-FRIENDS.md) walks through turning on real sharing with a free Supabase server, including the parent permission step that COPPA requires for children under 13.

## Kind comments

Before a comment is posted, the app checks it with `js/kindness.js`, and the server checks it again with the same rules, so the check can't be skipped:

- Unkind words and put-downs are blocked, including spaced-out and number-swapped spellings.
- Phone numbers, email addresses, links, schools, addresses, and other apps are blocked.
- Comments are limited to 100 letters.
- Quick comments let kids reply without typing.
- The artist can delete any comment on their post and turn comments off. Anyone can report a comment.

Word filters miss things, so treat this as a first layer. Reported comments show up in the grown-up area for the artist's parent to review.

## Accessibility

The app was tested against WCAG 2.2 Level AA, the standard used for ADA web accessibility. See [ACCESSIBILITY.md](ACCESSIBILITY.md) for the results and the checks still to do by hand.

To rerun the automated checks on a computer with Python:

```
pip install playwright
python -m playwright install chromium
python tools/a11y_check.py
python tools/friends_check.py
```

## Files

| File | What it does |
| --- | --- |
| `index.html` | The page that holds the app |
| `css/styles.css` | Colors, type, and layout |
| `js/app.js` | Screens, navigation, and buttons |
| `js/draw.js` | The drawing canvas, including the blend tool |
| `js/feedback.js` | The built-in feedback helper |
| `js/kindness.js` | The comment filter |
| `js/ideas.js` | Random drawing ideas |
| `js/db.js` | Saving on the device |
| `js/sample.js` | Sample friends for the preview |
| `js/friends.js` | The real Friends screens and the grown-up area |
| `js/cloud.js` | Talks to the Supabase server |
| `js/config.js` | Your Supabase settings |
| `supabase/setup.sql` | The server setup script |
| `privacy.html` | The privacy notice for parents |
| `consent-form.html` | The printable parent permission form |
| `js/icons.js` | Icons, so the app works offline |
| `sw.js` | Offline support |
| `manifest.webmanifest` | Home screen name and icon |
| `tools/` | The accessibility checks and a test-only stand-in server |

Icons are from [Tabler Icons](https://tabler.io/icons) (MIT License).
