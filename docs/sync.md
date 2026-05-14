# Sync across computers

Keep your The Curator in sync across multiple computers — for free, with no subscription, using a private GitHub repository that only you can access.

---

## What sync does and why it's useful

By default, your knowledge base managed by The Curator lives only on one computer. If you use a laptop at home and a desktop at university, your knowledge stays stuck on whichever machine you last used it on.

The Sync feature solves this. It uses a **free, private GitHub repository** as a middleman: you push your knowledge up to GitHub, then pull it down on your other computer. Your notes never leave GitHub's servers (which only you can access — the repository is private), and you never need to pay for a sync subscription.

Compared to alternatives:
- No Obsidian Sync subscription ($10–$25/month)
- No Dropbox or iCloud complications
- No manual copying of folders
- Everything is version-controlled — if you accidentally delete pages, you can recover them

---

## What gets synced (and what doesn't)

| Item | Synced? | Reason |
|------|---------|--------|
| Wiki pages (`wiki/`) | Yes | This is your knowledge — the whole point |
| Chat conversations (`conversations/`) | Yes | So you can continue threads on any machine |
| Domain schemas (`CLAUDE.md`) | Yes | So the AI behaves consistently everywhere |
| Raw source files (`raw/`) | No | These can be large; re-ingest from the original file if needed |
| API keys (`.env`) | No | Never synced — stays on each machine only |
| App code (`src/`, `package.json`, etc.) | No | The app is installed separately on each computer |
| Sync config (`.sync-config.json`) | No | Contains your PAT — stays local only |

---

## Prerequisites

Before you start, you need:

1. **A free GitHub account** — sign up at [github.com](https://github.com) if you don't have one
2. **The The Curator app installed** on at least one computer (see the [User Guide](user-guide.md) for installation steps)
3. **An internet connection** when you sync (not required for normal use)

That's it. No developer tools, no command line, no extra software.

---

## First-time setup (about 3 minutes)

The Sync tab has a built-in wizard that walks you through everything. Here's what to expect at each step.

### Step 1 — Open the Sync tab

Start your server (`node src/server.js`) and open `http://localhost:3333`. Click the **Sync** tab. You'll see a welcome screen explaining what sync does. Click **Get started**.

### Step 2 — Create a private GitHub repository

Before the wizard can continue, you need to create a repository on GitHub to store your knowledge. Do this now:

1. Go to [github.com/new](https://github.com/new)
2. Give it a name — something like `my-curator-brain` or `curator-knowledge`
3. Set visibility to **Private** (this is important — keeps your notes private)
4. Leave "Initialize this repository" unchecked (the wizard will do this)
5. Click **Create repository**
6. Copy the repository URL — it looks like `https://github.com/yourusername/my-curator-brain.git`

Now go back to the wizard.

### Step 3 — Enter the repository URL (Wizard Step 1)

Paste the URL you just copied into the field and click **Next**.

### Step 4 — Create and enter a Personal Access Token (Wizard Step 2)

GitHub needs to verify that you have permission to write to your repository. It does this using a **Personal Access Token (PAT)** — think of it as a password specifically for this app.

To create one:

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **Generate new token** → **Generate new token (classic)**
3. Give it a name like "The Curator sync"
4. Set **Expiration** to **No expiration** (recommended — so you don't have to repeat this every few months)
5. Under **Select scopes**, tick the **`repo`** checkbox (this gives access to private repositories)
6. Scroll down and click **Generate token**
7. **Copy the token immediately** — GitHub only shows it once. It starts with `ghp_`.

Paste the token into the wizard and click **Next**.

> Your token is stored in a file called `.sync-config.json` in your project folder. This file is gitignored — it never leaves your computer.

### Step 5 — Choose your starting mode (Wizard Step 3)

- Choose **Push** if this is the first computer you're setting up (this will send your existing knowledge up to GitHub)
- Choose **Pull** if you've already set up another computer and want to download its knowledge

Click **Finish**. The wizard processes the connection, initialises the repository, and performs the first sync. You'll see a success screen when it's done.

---

## Setting up on a second computer

Once sync is working on your first computer, adding a second one takes about 2 minutes.

1. Install the The Curator app on the second computer (follow the [User Guide](user-guide.md) steps 1–6)
2. Open `http://localhost:3333` and go to the **Sync** tab
3. Run through the wizard — same repo URL, same PAT (or create a new one if you lost the original)
4. At Step 3, choose **Pull** to download the knowledge from GitHub

After the wizard completes, all your wiki pages and conversations will appear on the new computer.

---

## Daily workflow

Once sync is set up, the habit is simple — one button, both directions:

**Click **Sync now** at the start and end of every work session.**

That's it. It pulls remote changes from GitHub first, then pushes your local changes — so both machines reconcile in one click.

### Sync now (pull + push, the everyday button)

The **Sync now** button is what you use 95% of the time. It pulls anything new from GitHub, then pushes anything new from this machine. You don't have to remember which computer is "ahead" — the button handles both directions.

### Advanced — one-way operations

The Sync tab has a collapsible **Advanced** section containing two one-way buttons. Use these only when you're certain about direction:

- **Push only** — uploads your local changes to GitHub without pulling first. Use when you're sure no other machine has new changes.
- **Pull only** — downloads remote changes to this computer without pushing yours. Use when you're sure this computer has nothing new to share.

For everyday use, prefer **Sync now**.

> **Note for users updating from v2.5.x:** the previous Sync tab had three coequal buttons labelled *Sync Up*, *Sync Down*, and *Sync*. In v2.6.0 these are renamed and reorganised: *Sync* is now **Sync now** (the primary action), and *Sync Up* / *Sync Down* are now **Push only** / **Pull only** inside the collapsible Advanced section. The underlying behaviour is unchanged.

---

## What if you forget to sync?

If you forget to **Sync now** on one machine and then do new work on another machine, you'll have changes in two places. The app handles this gracefully:

- When you click **Sync now**, the app automatically commits any uncommitted local changes first, then pulls from GitHub using a rebase strategy, then pushes
- In most cases, this works automatically — the changes from both machines are merged cleanly
- In rare cases where two machines edited the exact same wiki page in conflicting ways, git will flag a conflict. If this happens, see the [Troubleshooting](#troubleshooting) section below

The best way to avoid conflicts entirely is to **Sync now** at the start and end of every session. But if you forget occasionally, it usually resolves itself.

---

## Troubleshooting

### "403 Forbidden" or "authentication failed"

Your Personal Access Token is wrong, expired, or doesn't have the right permissions.

- Double-check that you ticked the `repo` scope when creating the token
- If the token has expired, create a new one at [github.com/settings/tokens](https://github.com/settings/tokens) and update it in `.sync-config.json` (open the file in any text editor and replace the `token` value)
- Classic tokens set to "no expiration" will not expire — use this option to avoid re-doing this step

### "404 Not Found" or "repository not found"

The repository URL is wrong, or the repository doesn't exist yet.

- Check the URL in `.sync-config.json` — it should end in `.git`
- Make sure the repository exists on GitHub (visit the URL in your browser)
- Make sure the repository is not owned by an organisation that blocks PAT access

### "Network error" or "could not resolve host"

The app can't reach GitHub. Check your internet connection. If you're on a university network, try a different connection or hotspot — some networks block git operations.

### "Push rejected" or "non-fast-forward update"

Someone pushed new changes to GitHub (from another computer) that you haven't pulled yet. The fix is just one click:

- Click **Sync now** — it pulls remote changes first, then pushes yours.

(If you previously used *Push only* and got this error, that's why. **Sync now** handles both directions and avoids the problem entirely.)

### Merge conflict

If two computers edited the same wiki page in incompatible ways, git cannot automatically merge them. You'll see an error message mentioning "conflict".

This is uncommon but can happen. To fix it:
1. Open a terminal in your project folder
2. Run `git --git-dir=.knowledge-git --work-tree=domains status` to see which files are conflicted
3. Open the conflicted file — it will contain markers like `<<<<<<< HEAD` and `>>>>>>> origin/main`
4. Edit the file to keep the version you want, removing the conflict markers
5. Run the command shown to complete the merge

If this feels complicated, the easiest recovery is to decide which machine has the "correct" version, and overwrite the other machine by using **Pull only** (in the Advanced section) after discarding local changes.

---

## Privacy note

Your repository is **private**. GitHub employees do not read private repository contents. Only you (and anyone you explicitly invite as a collaborator) can see your knowledge.

Your Personal Access Token is stored only in `.sync-config.json` on your local machine — it is gitignored and never uploaded anywhere.

Your Gemini API key (in `.env`) is also never synced.

---

## Token expiry

When creating a Personal Access Token, GitHub gives you expiry options: 30 days, 60 days, 90 days, 1 year, or **No expiration**.

For this use case, **No expiration is recommended**. Sync is meant to be a quiet background habit — having a token expire and break sync after a few months is disruptive. Since the token only has access to one private repository (yours), the risk is low.

If you do choose an expiry date, make a calendar reminder to renew the token before it expires.
