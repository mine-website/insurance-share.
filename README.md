# Insurance Share

A free, static website. A visitor picks a poster, types Name + Mobile, sees a live 1080 x 1080 preview with their details written on it, edits the message, and shares it to WhatsApp.

* Hosting: GitHub Pages (free) — no server, no database, no paid service
* Technology: plain HTML / CSS / JavaScript, no frameworks, no libraries
* Privacy: Name and Mobile are processed only inside the visitor's browser

---

## A. Architecture and why

```
GitHub repository  ──►  GitHub Pages (free website)
   index.html, css/, js/          │
   data/templates.json  ◄─────────┤  the site reads this file
   images/templates/*.webp        │  and the images
                                  ▼
                        Visitor's phone / computer
                        (image is drawn here, on an HTML canvas)
```

* **Static site.** Every feature the visitor uses (form, preview, canvas image, share) works inside the browser, so no server is needed.
* **`data/templates.json` is the database.** It holds settings, categories and templates. Editing it = changing the site.
* **Admin tool (`/admin/`)** prepares changes visually. The changes become live only when they are saved to GitHub (see section 4).

## B. What is completely free

| Item | Cost |
|---|---|
| GitHub account, public repository | Free |
| GitHub Pages hosting (HTTPS included) | Free (public repositories on a free account) |
| Storage of images and JSON in the repository | Free (repository limit is about 1 GB, Pages sites about 1 GB; each poster is about 40-250 KB) |
| WhatsApp sharing | Free, uses the phone's own share sheet |
| Fonts | System fonts, nothing downloaded |
| Databases, APIs, servers | None used |

Limits to know: GitHub Pages is for lightweight sites (soft bandwidth limit about 100 GB/month). A repository on a free account must be **public** for Pages, so anyone can see your files. Never put secrets in it.

---

## C. WhatsApp limitations (honest version)

| What you might expect | Reality |
|---|---|
| A link that opens WhatsApp with the **image** attached | Not possible. `https://wa.me/?text=...` can pre-fill **text only**. |
| The website chooses the contact/group | Not possible. WhatsApp always lets the **user** choose. |
| Website sends the message by itself | Not possible (needs the paid WhatsApp Business API). Not needed here. |
| Share image **and** text through the phone's share sheet | **Possible** with the browser Web Share API (`navigator.share({files, text})`). This is the main method. |

How the app behaves:

* **Phone (Android Chrome / Samsung Internet / Edge, iPhone Safari 15+):** "Share on WhatsApp" opens the phone's share sheet with the image + text. The user taps **WhatsApp**, then picks a contact, group or community group inside WhatsApp. The site cannot force the sheet to show only WhatsApp; it shows all apps, WhatsApp among them.
* **Caption text:** On Android, WhatsApp normally uses the text as the image caption. On iPhone, WhatsApp may ignore the text when an image is attached. For that reason the app **copies the text to the clipboard automatically** right before opening the share sheet; if the caption is empty, the user long-presses the caption box and taps Paste.
* **WhatsApp Status:** whether "My status" appears in the WhatsApp picker depends on WhatsApp's version and platform and cannot be controlled by a website. If it is missing, the user can tap **Download Image** and post it from WhatsApp Status manually.
* **Computer (Windows/Mac) and browsers without file sharing:** WhatsApp cannot receive a file from a website. The app downloads the image and opens WhatsApp (Web/Desktop) with the text pre-filled; the user attaches the image with the paperclip, or presses **Copy Image** and Ctrl+V in the chat (Chrome/Edge/Safari/recent Firefox).
* **In-app browsers** (opening the link inside Facebook, Instagram etc.) often block sharing and downloads. Ask users to open the link in Chrome/Safari.
* `navigator.share` requires HTTPS. GitHub Pages provides it.

> I could not test on real phones while building this. Please run the checklist in section J on at least one Android phone and one iPhone before sending the link to others. The behaviours above match how these browsers are documented to work, but WhatsApp updates can change details.

---

## D. Image standard

Short version (full details, reasons, and the ChatGPT prompt: **`docs/IMAGE_STANDARD.md`**):

```
Canvas            1080 x 1080 px
Main design       y 0 to 960
Reserved strip    y 960 to 1080 (120 px, flat solid white, completely empty)
Name area         x 48 to 600,   text centre line y 1022
Mobile area       x 632 to 1032, text centre line y 1022
```

The site paints the strip itself by default, so the result is always clean.

## E. Project structure

```
insurance-share/
├── index.html              user website (put in the ROOT of the repository)
├── README.md               this guide
├── css/
│   ├── style.css           look and feel (colours are at the top)
│   └── admin.css           extra styles for the admin page
├── js/
│   ├── app.js              user page logic
│   ├── variables.js        {NAME}, {MOBILE} list, validation, formats  ← add new variables here
│   ├── canvas.js           draws the poster (used by site AND admin)
│   ├── share.js            WhatsApp / share / download / copy
│   ├── admin.js            admin tool logic (+ optional GitHub publishing)
│   └── util.js             small helpers
├── data/
│   └── templates.json      settings + categories + templates
├── images/templates/       posters (.webp) and thumbnails (-thumb.webp)
├── admin/
│   └── index.html          admin tool
└── docs/
    ├── IMAGE_STANDARD.md   image rules + reusable ChatGPT prompt
    └── strip-guide.png     picture of the fixed layout
```

---

## F. Data storage options compared

| Option | Advantages | Disadvantages | Used? |
|---|---|---|---|
| 1. `templates.json` in GitHub | Free, versioned (undo any mistake in GitHub history), simple, works on Pages | Not written by visitors; changes need a commit; public | **Yes** (templates & settings) |
| 2. Whole repo as content store (images too) | Free, images cached by GitHub's CDN | Repo size limits; public | **Yes** (images) |
| 3. Browser localStorage | No server, instant | Only on that one device; can be cleared | **Yes** — only to remember the visitor's own Name/Mobile (optional checkbox) |
| 4. Supabase / Firebase | Real logins, uploads, analytics | Extra account, keys, rules to learn, privacy questions, free tiers can change | No — not needed for version 1 |

## G. Admin login: the honest answer

A static GitHub Pages site **cannot keep a password secret**. Anything in a static page can be read by anyone, so a "login screen" would only pretend to be secure. So:

* `/admin/` has **no password on purpose**. It cannot change the website by itself. It is just a helper that runs in your browser.
* Real security comes from **GitHub**: only someone who can commit to your repository can change the site.

Ways to save changes (all free):

| Option | How | Pros | Cons |
|---|---|---|---|
| **A. Manual (always works)** | Admin tool → download `templates.json` and the images → upload on github.com (drag & drop) | No token, simplest, nothing to leak | A few extra clicks |
| **B. Publish button (built in, optional)** | Paste a GitHub **fine-grained token** (only your repo, only *Contents: Read and write*) into the admin page; "Publish to GitHub" uploads the images and JSON | One click, works from a phone, real security (GitHub checks the token) | You must guard the token; a leaked token lets someone edit that repo (revoke it at any time in GitHub settings) |
| C. Hosted CMS (e.g. Decap CMS, Pages CMS) | Web dashboard that commits to GitHub | Familiar CMS screens | Needs OAuth setup or a third-party service; more moving parts. Not used here, and not tested with this project |
| D. Supabase/Firebase backend | Real user accounts | Real admin login and uploads | More complexity; overkill for version 1 |

**Recommendation:** start with A. Move to B when you get tired of uploading. Never share the token, and only tick "Remember" on your own device.

---

## H. Deploy on GitHub Pages (beginner steps)

1. **Create an account** at https://github.com (free). Verify your email.
2. **Create the repository:** click **+ → New repository**. Name: `insurance-share`. Choose **Public**. Tick "Add a README file". Click **Create repository**.
3. **Upload the files:** unzip `insurance-share.zip` on your computer. In the repository click **Add file → Upload files**. Drag **the contents of the unzipped folder** (`index.html`, and the folders `css`, `js`, `data`, `images`, `admin`, `docs`, plus `README.md`) into the page. `index.html` must be at the top level, not inside another folder. Wait for the upload, then click **Commit changes**.
   * If dragging folders does not work in your browser, use Chrome on a computer, or GitHub Desktop.
4. **Turn on Pages:** repository **Settings → Pages**. Under "Build and deployment", Source = **Deploy from a branch**. Branch = **main**, folder = **/(root)**. Click **Save**.
5. **Wait 1-2 minutes**, refresh the Pages settings screen. It shows: *Your site is live at* `https://YOUR-USERNAME.github.io/insurance-share/`.
6. **Open it** on your phone. You should see three sample posters.
7. The admin tool is at `https://YOUR-USERNAME.github.io/insurance-share/admin/`. Do not link it from anywhere.

### Testing on your computer before uploading (optional)
Double-clicking `index.html` will **not** work (browsers block loading the JSON file that way). Instead, open a terminal in the folder and run `python3 -m http.server 8000`, then open http://localhost:8000. (Share/download features that need HTTPS are best tested on the real GitHub site.)

## I. Adding / updating content

### Add a new template (recommended: Admin tool)

1. Create the image in ChatGPT with the prompt in `docs/IMAGE_STANDARD.md`. Download it.
2. Open `/admin/`. Click **Add template**.
3. Choose the image. Type the title. Choose a category. Write the message. Use the `{NAME}` / `{MOBILE}` buttons to insert variables.
4. Check the preview. The Name/Mobile are already in the standard position; you only need to drag them if this poster is special. Use the test-name box to try a very long name.
5. Click **Save template** (this keeps it in the page for now).
6. Save to GitHub:
   * **Option A (manual):** click **Download templates.json** and **Download new images**. On github.com open the `data` folder → **Add file → Upload files** → upload `templates.json` (it replaces the old one). Open `images/templates` → upload the new `.webp` files.
   * **Option B:** click **Publish to GitHub** (after connecting a token, section G).
7. Wait 1-2 minutes, refresh the website (on phones, close and reopen the tab).

### Add / rename a category
Admin tool → **Categories** → add, rename, or delete (only empty categories can be deleted). Then save as above.

### Hide or delete a template
Admin tool → template list → untick **Active** (hidden but kept) or click **Delete**. Then save. The old image file stays in the repository; delete it on github.com if you want (optional).

### Change wording only, quickly
On github.com open `data/templates.json`, click the pencil icon ✏️, edit the `"message"` text (keep `\n` for new lines), click **Commit changes**. A single missing quote or comma breaks the file — see troubleshooting.

### Change site-wide settings
Also in `data/templates.json` → `"settings"`:

| Setting | Meaning |
|---|---|
| `country.code` | shown before the mobile box |
| `validation.mobile.digits / pattern` | number length and the allowed pattern (`^[6-9][0-9]{9}$` = 10 digits starting with 6-9) |
| `mobileFormat` | `plain` 9978964888, `spaced` 99789 64888, `international` +91 99789 64888 |
| `strip` | the bottom strip (`repaint` true/false, `y`, `color`, accent line) |
| `defaultFields` | standard position/style of Name and Mobile for **all** posters |

A template can override any of these with its own `"fields"` / `"strip"` (the Admin tool does this automatically when you move something).

### Template JSON structure

```json
{
  "id": "car-insurance-renewal",
  "title": "Car Insurance Renewal",
  "category": "motor",
  "description": "Renewal reminder",
  "image": "images/templates/car-insurance-renewal.webp",
  "thumb": "images/templates/car-insurance-renewal-thumb.webp",
  "message": "Hello {NAME},\n\nFor any insurance requirement:\n📞 {MOBILE}",
  "active": true,
  "fields": { "mobile": { "x": 1000, "fontSize": 30 } },
  "strip":  { "repaint": false }
}
```

Compared with your draft: settings shared by all posters live once in `settings.defaultFields`, so a poster only lists what is different (usually nothing). `thumb` is a small image for fast loading, `category` refers to an id in the category list so categories can be renamed safely, and `strip` allows the clean-strip repaint. `x, y` is the text anchor: x = left edge / right edge / centre (depending on `align`), y = vertical middle of the text.

### Add a new variable later (e.g. `{WEBSITE}`)
Add one entry to the list in `js/variables.js` (copy the `NAME` one). The form field, validation, message replacement and admin preview are created automatically. If it should also appear on the image, add a matching entry under `settings.defaultFields` in `templates.json` (e.g. `"website": { ... }`) and set `field: 'website'` in the variable.

## Troubleshooting

| Problem | Fix |
|---|---|
| Site shows 404 | Pages not enabled or still building. Settings → Pages; wait 2 minutes. `index.html` must be in the repository root. |
| "The poster list could not be loaded" | `data/templates.json` is missing or has a typo. Paste its content into https://jsonlint.com to find the error. Or open the file's **History** on GitHub and restore the previous version. |
| Posters show broken pictures | Image path in JSON does not match the real file name (names are case-sensitive: `Car.webp` ≠ `car.webp`). |
| I uploaded a new image but the old one shows | Browser cache. Reload; on phones close the tab or add `?v=2` after the address. |
| Name/Mobile text looks wrong on one poster | Open it in Admin → Edit → **Reset to standard positions**. |
| Share button hidden | Your browser cannot share files (e.g. desktop Firefox). Use "Share on WhatsApp" or Download. |
| Nothing happens in Instagram/Facebook browser | Open the link in Chrome or Safari. |
| Publish to GitHub error 401 / 403 / 404 | Token expired or wrong / needs *Contents: Read and write* on that repo / user name, repo name or branch is wrong. |
| Publish error 409 | Someone (or you) changed the file on GitHub. Click "Connect and load from GitHub" again. |
| Gujarati letters look like boxes on the image | The device lacks a Gujarati font (very rare on phones). Text in the message box is not affected. |

---

## Security and privacy

* **What is stored?** Nothing on any server. If the visitor keeps "Remember my details" ticked, Name and Mobile are saved in **that browser's localStorage** so they need not retype them; they can untick it to erase them.
* **Is data sent to a server?** No. The image is drawn and shared in the browser. The only requests are for your own site's files. No analytics, no cookies, no third-party fonts or scripts.
* **What can visitors see?** Everything in the repository is public, including `admin/` and `templates.json`. That is fine because there are no secrets in them.
* **Can someone modify templates?** Not without write access to your GitHub repository. Enable **two-factor authentication** on your GitHub account.
* **Admin credentials:** GitHub password + 2FA (your login), and optionally a fine-grained token limited to this one repository. Set an expiry (e.g. 90 days) and revoke it if you lose the phone. Do not save the token on shared devices.
* The Share features send the image and text to the app the **user** chooses (WhatsApp); this is the user's own action.

---

## J. Testing checklist

Do this on the live GitHub Pages address.

**Desktop (Chrome or Edge, and Safari/Firefox if you can)**
- [ ] Home shows a grid; category buttons filter it
- [ ] Open a poster; cursor is in the Name box; preview shows faded "Your Name" / "XXXXX XXXXX"
- [ ] Type a name and mobile → preview updates instantly, in the bottom strip
- [ ] Mobile validation: `123`, `1234567890`, `9999999999` are rejected; `+91 99789 64888` and `09978964888` are accepted (converted to 10 digits)
- [ ] Very long name is shrunk / cut with "…", never overlaps the mobile number
- [ ] Message shows the name and mobile in place of `{NAME}` `{MOBILE}`; editing it works; "Restore original text" works
- [ ] **Copy Text** → "Text copied successfully."; paste in Notepad to check
- [ ] **Download Image** → file named like `Sample_Car_Insurance_Renewal_Kunal_Shah.png`; open it: exactly 1080 × 1080
- [ ] **Share on WhatsApp** → image downloads, WhatsApp opens with text, help box appears; Copy Image + Ctrl+V works

**Android (Chrome)**
- [ ] Layout has no sideways scrolling; buttons are easy to tap; keyboard for mobile field is numeric
- [ ] **Share on WhatsApp** → share sheet with image → tap WhatsApp → contact list → send. Caption is present (or paste works)
- [ ] Send to: one contact, one group, and (if offered) Status/community group
- [ ] **Share** (generic) opens the share sheet; **Download Image** saves to Downloads/Gallery
- [ ] Gujarati name and Gujarati message display correctly

**iPhone (Safari)**
- [ ] Same checks as Android; note whether the caption arrives or you must paste
- [ ] Download Image saves (Files or Photos via the share sheet)
- [ ] No zoom-in when tapping the input boxes

**Admin**
- [ ] `/admin/` lists the templates; toggling Active changes the site after saving
- [ ] Add template: choose a PNG from ChatGPT, drag Name/Mobile, snap to the standard position, Save
- [ ] "Download templates.json" and "Download new images" produce files (or Publish to GitHub succeeds)
- [ ] After upload and 2 minutes, the new poster appears on the public site with correct text positions
- [ ] Category add / rename / delete works; a used category cannot be deleted

**Privacy**
- [ ] In the browser's developer tools → Network tab, typing a name and mobile causes **no** request
