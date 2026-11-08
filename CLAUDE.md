# Training log

This repo is used for a training class. The instructors review each student's prompts afterward.

At the end of every turn where you respond to the user, do these steps:

1. Append an entry to `prompt-log.md` in the repo root. Create the file if it is missing. Use this format:

   ```markdown
   ## <local date and time> · <current git branch>

   **Prompt:**
   <the user's message, copied word for word>

   **Summary:** <one to three sentences: what you did and which files changed>
   ```

2. Commit all changes, including code and `prompt-log.md`, with a short message that describes the change.
3. Push to `origin`. If the push fails, tell the user in one line and continue.

Do not leave out entries, and do not edit earlier entries.
