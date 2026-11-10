# qt-training-public

Workspace for the QuikTrip Claude Code training sessions.

## Before the session

You need:

- **git**
- **A GitHub account**
- **Claude Code**, installed and signed in. Check with `claude --version`, then run `claude` once to confirm it starts.
- **Node.js 18 or later.** Check with `node --version`.
- The SDK or runtime for whatever language you like to build in, such as .NET, Node, or Python.

## Setup

1. Fork this repo to your GitHub account: click **Fork** and keep **Copy the `main` branch only** checked.
2. Clone your fork, create a branch for the first pass, and start Claude Code:

   ```bash
   git clone https://github.com/<your-github-username>/qt-training-public.git
   cd qt-training-public
   git checkout -b pass-1
   claude
   ```

3. Wait for the instructors to give you the first task. Claude Code commits and pushes your work to your fork after every prompt (see `CLAUDE.md`).

Each pass of the exercise goes on its own branch (`pass-1`, `pass-2`, …). The instructors will give you the command to start each new pass.

## Share your work

Open one draft pull request back to this repo for each pass branch, once that branch has its first push. This lets the instructors compare your passes.

1. On your fork's GitHub page, switch to the pass branch, then click **Contribute** → **Open pull request**.
2. Check that the base is `phase2interactive/qt-training-public` · `main`.
3. Title it `<Your Name> - Pass <N>`, choose **Create draft pull request**, and leave it open.

Later pushes to that branch update the same pull request. We will not merge it.

## Pizza ordering app

Run `npm start` and open http://localhost:3000 (Node 18+, no dependencies). Run `npm test` for tests.

- Backend: `server.js` (REST API), `pricing.js` (server-side pricing/validation), orders stored in `data/orders.json`.
- Frontend: `public/` (vanilla HTML/CSS/JS).
- Prices, tax, and delivery fee live in `data/menu.json` with research notes. They are Tulsa-area estimates and should be reviewed by a person before real use.
