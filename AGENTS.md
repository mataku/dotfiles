# mataku/dotfiles

Dotfiles, Homebrew packages, and macOS defaults for a personal Apple Silicon Mac, applied with `setup.sh` on a fresh machine and `mise bootstrap` day to day.

## Repository

- `setup.sh` is the single entrypoint, for a fresh Mac (`curl ... | bash`) and for CI alike. It installs Homebrew, applies `Brewfile`, installs the newest Node.js release that node-build lists with nodenv (made the global version only when none is set), installs mise, runs `mise bootstrap`, applies one-time system settings with sudo, and prints the GUI apps to install by hand.
- `mise.toml` at the repository root declares `[dotfiles]` symlinks (targets under `~`, sources in this repository) and `[bootstrap.macos.defaults]`. It is a project config, so run `mise bootstrap` from this directory. It declares no `[tools]`; language runtimes stay on nodenv, rbenv, and rustup. Its `bootstrap` task, which `mise bootstrap` runs last, installs the simulators mod viewer's npm packages with `npm ci --ignore-scripts` from `herdr-app/mods/simulators/viewer/package-lock.json`; `mise bootstrap --only task` runs it alone.
- `Brewfile` lists formulae, casks, and Mac App Store apps. After `brew install`, run `make dump` to regenerate it.
- Day to day: `mise bootstrap` after editing `mise.toml`, `brew install` for packages. `setup.sh` is rarely re-run.
- Agents run `mise bootstrap --dry-run` first and run `mise bootstrap` only when the dry run succeeds and lists nothing but the intended changes. If the dry run fails or lists anything else, stop and report it; never pass `--force-dotfiles`.
- `.github/workflows/provisioning.yml` runs `setup.sh` unchanged on a macOS runner and asserts the result. Never add CI-only branches to `setup.sh`; CI-specific behavior lives in workflow environment variables only. A check longer than a few lines lives in `scripts/ci/`, one script per workflow step, so it can be run locally with `bash scripts/ci/<name>.sh`; the scripts only verify and never set anything up.
- Each tool's config lives in its own directory (`fish/`, `zsh/`, `nvim/`, `wezterm/`, `ghostty/`, `herdr/`, `herdr-app/`, `herdr-core/`, `orca/`, `lazygit/`, `tig/`, `ripgrep/`, `rtk/`, `git/`, `ruby/`, `claude/`). Edit the file there; the symlink makes it live.
- Before creating or changing a mod under `herdr-app/mods/`, read `herdr-app/mods/DESIGN.md` and write the parts it lists exactly as shown. To change a part, change `DESIGN.md` and every mod that uses it in the same commit.
- After editing a mod, run `touch -h ~/.config/herdr-app/mods/<name>/main.js`: Herdr watches the link, not the file it points to, so the edit is not loaded without it.
- Verify a mod with `node --test herdr-app/mods/*/*.test.js` and `herdr-app check ~/.config/herdr-app/mods/<name>`. A new mod needs its links in `mise.toml`; CI finds it by its `mod.json`, so the workflow needs no change.
- Not managed here on purpose: `~/.claude/settings.json`, GUI applications, tmux (herdr replaced it).

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
- Before creating the PR, confirm the branch is pushed and in sync with `origin`, and run `git log <base>..HEAD --format='%h %B' | grep -nE 'https?://|www\.'`; it must print nothing. If it prints matches, stop and show them to the user instead of opening the PR.
- Write the body to a scratch file and pass it with `gh pr create --base <base> --head <branch> --title "<title>" --body-file <file>`.
