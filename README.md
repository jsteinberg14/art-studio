# My Art Studio

A drawing app for kids. Snap a photo of your art, get friendly feedback, keep it in your own museum, find new ideas, and draw on top of your pictures.

It is a web app that installs on an iPhone or iPad home screen and opens full screen, like a regular app. It works offline after the first visit, and all art stays on the device.

## Screens

- **Snap:** take or choose a photo of your art and get "You did well" and "Try this next" feedback.
- **Museum:** every saved piece, two to a row, with space around each one.
- **Ideas:** drawing ideas based on the art in your museum.
- **Friends:** a feed with likes, favorites, and kind comments. This is a preview that only works on this device (see "What is a preview" below).
- **Draw on it:** pen, marker, paint brush, and eraser, with rainbow and neutral colors, shades, sizes, and undo.
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

## What is a preview

Two parts work on the device today but need more setup to become fully real.

**Feedback.** The feedback comes from a helper built into the app (`js/feedback.js`). It measures colors, light and dark, and detail, then picks friendly suggestions. It isn't a real AI model. To use a real AI model later, you'd need a small server that keeps the AI service key secret, because a key placed in this public code could be copied by anyone. Then you'd replace `analyzeImage()` with a call to that server.

**Friends.** The friends, their posts, and their comments are samples, and sharing only adds a post on this device. Real sharing between kids needs accounts, a server, and moderation. In the United States, a service that collects personal information from children under 13 also has to follow COPPA, which requires verified parent consent. Plan for that before turning on real sharing.

## Kind comments

Before a comment is posted, `js/kindness.js` checks it:

- Unkind words and put-downs are blocked, including spaced-out and number-swapped spellings.
- Phone numbers, email addresses, links, schools, addresses, and other apps are blocked.
- Comments are limited to 100 letters.
- Quick comments let kids reply without typing.
- The artist can delete any comment on their post and turn comments off. Anyone can report a comment.

Word filters miss things, so treat this as a first layer. A grown-up should review reported comments once real sharing exists.

## Accessibility

The app was tested against WCAG 2.2 Level AA, the standard used for ADA web accessibility. See [ACCESSIBILITY.md](ACCESSIBILITY.md) for the results and the checks still to do by hand.

To rerun the automated check on a computer with Python:

```
pip install playwright
python -m playwright install chromium
python tools/a11y_check.py
```

## Files

| File | What it does |
| --- | --- |
| `index.html` | The page that holds the app |
| `css/styles.css` | Colors, type, and layout |
| `js/app.js` | Screens, navigation, and buttons |
| `js/draw.js` | The drawing canvas |
| `js/feedback.js` | The built-in feedback helper |
| `js/kindness.js` | The comment filter |
| `js/ideas.js` | Drawing ideas |
| `js/db.js` | Saving on the device |
| `js/sample.js` | Sample friends for the preview |
| `js/icons.js` | Icons, so the app works offline |
| `sw.js` | Offline support |
| `manifest.webmanifest` | Home screen name and icon |
| `tools/` | The accessibility check |

Icons are from [Tabler Icons](https://tabler.io/icons) (MIT License).
