# Claude Code Configuration

## Communication Rules

### Language
- **Always respond in Japanese**
- All explanations, messages, and conversations should be in Japanese

### Code Style
- **Do not add code comments unless explicitly requested**
- Keep code clean and readable
- Only add comments when specifically asked to do so

## Pull Requests

- Open a pull request only when the user asks for one in the current request. Never push.
- Base is the repository default branch. The title follows Conventional Commits (`type(scope): summary`), imperative, lowercase, at most 72 characters.
- The body follows `.github/PULL_REQUEST_TEMPLATE.md`: `## Context` (why the branch exists, one to three sentences), `## Changes` (flat one-line bullets of finished work, grouped by theme, not one per commit), and `## Notes` only when a reviewer needs something beyond those two (manual steps after merge, behavior changes, decisions). Omit `## Notes` when empty.
- Do not include pending or future items: CI results not yet seen, follow-up work, checklists, or checkboxes.
- No external URLs anywhere in the body. End the body with `🤖 Generated with Claude Code` and no link.
- Before creating the PR, confirm the branch is pushed and in sync with `origin`, and run `git log <base>..HEAD --format='%h %B' | grep -nE 'https?://|www\.'`; it must print nothing. If it prints matches, stop and show them to the user instead of opening the PR.
- Write the body to a scratch file and pass it with `gh pr create --base <base> --head <branch> --title "<title>" --body-file <file>`.
