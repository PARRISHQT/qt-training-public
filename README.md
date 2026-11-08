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
2. Clone your fork and start Claude Code:

   ```bash
   git clone https://github.com/<your-github-username>/qt-training-public.git
   cd qt-training-public
   claude
   ```

3. Wait for the instructors to give you the first task. Claude Code commits and pushes your work to your fork after every prompt (see `CLAUDE.md`).

## Share your work

Once your fork has its first push, open a pull request back to this repo so the instructors can review your work:

1. On your fork's GitHub page, click **Contribute**, then **Open pull request**.
2. Check that the base is `phase2interactive/qt-training-public` · `main` and the compare branch is your fork's branch.
3. Title it `<Your Name> - Session 2`, choose **Create draft pull request**, and leave it open.

You only need to do this once. Every later push from your fork updates the same pull request. We will not merge it.
