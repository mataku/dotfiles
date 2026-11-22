# herdr-core

Roles and launch templates for the agents that `hc`, the CLI of herdr-core, starts in its terminals. `mise bootstrap` links both directories into `~/.config/herdr-core/`, and the `architect-build-review` skill runs a change through the four roles.

## Layout

| Path | Holds |
| --- | --- |
| `roles/<role>.md` | What an agent in that role does and what it hands back. |
| `templates/<role>.md` | How `hc` starts that role: the launch command, and one line that points at the role file. |

There are four roles, each with a role file and a template of the same name:

| Role | What it does |
| --- | --- |
| `architect` | Designs a change before anyone writes it and writes the design to `architecture.md`. Edits no project file. |
| `architecture-reviewer` | Reviews that design against the stated goal before it is implemented. Read-only. |
| `implementer` | Implements the design, test-first where the project has tests. Edits only the files the design and the task name, and does not commit. |
| `code-reviewer` | Reviews the change against its goal, the design and the repository's instruction files. Read-only. |

No role starts other agents, and each one ends its turn with the path of the file it wrote.

## Roles and templates

A role and the way to start it are kept in separate files, so that more than one model can play the same role:

- **A role file is shared by every model that plays the role.** It is plain Markdown without frontmatter and says nothing about which model or CLI runs it. The rules of the role are written there, for every model at once instead of once per model.
- **A template holds only the launch command and a line pointing at the role file.** Its frontmatter has `name`, `description`, and `command`, which picks the CLI, the model and the effort. The `description` is the summary that `hc templates` shows: it names the model and repeats a few rules of the role in short, so it follows the role file when one of them changes. The template's body is the one line below. Giving a role another model is an edit to `command` and to the model its `description` names.
- **A further model on another CLI gets no template.** The `architect-build-review` skill lists such an extra reviewer as a label and a command, and starts that command with a pointer to the same role file.

The body of `templates/<role>.md`:

```text
Read `~/.config/herdr-core/roles/<role>.md` first and follow it for the task below.
```

`hc templates` lists the templates. `hc run` takes a template's name in place of a program, and combines the template's body and the task into the agent's first message:

```sh
hc run --bg --name <name> --cwd <repo> architect "<task>"
```

## Links

The repository's [`mise.toml`](../mise.toml) has one `[dotfiles]` entry per directory:

```toml
"~/.config/herdr-core/templates" = "herdr-core/templates"
"~/.config/herdr-core/roles" = "herdr-core/roles"
```

`mise bootstrap`, run from the repository root, makes each target a symlink to the directory in this repository.

- `~/.config/herdr-core/templates` is where `hc` looks for templates. The templates point at the role files by their linked path, `~/.config/herdr-core/roles/`, so an agent finds its role file whatever repository it works in.
- Each entry links a whole directory: a file added to `roles/` or `templates/` needs no new entry.
- Only these two directories are linked. `~/.config/herdr-core/` itself is an ordinary directory, and this README is not linked.

## The architect-build-review skill

[`claude/skills/architect-build-review/SKILL.md`](../claude/skills/architect-build-review/SKILL.md) is a Claude Code skill. Its folder is linked to `~/.claude/skills/architect-build-review` by its own `[dotfiles]` entry. The session that runs it, inside a herdr-core terminal, is the coordinator: it starts the agents of each stage with `hc`, reads what each one wrote, and decides the next step. It does not design, implement or review the change itself.

| Stage | Who works |
| --- | --- |
| 1. Architecture | `architect` |
| 2. Architecture review | `architecture-reviewer`, and each extra reviewer in that role |
| 3. The user's review | The user: the coordinator shows the design and waits for approval |
| 4. Implementation | `implementer` |
| 5. Code review | `code-reviewer`, and each extra reviewer in that role |
| 6. Report | The coordinator |

The skill holds the rules of each stage and the files of a run. It, the role files and the templates are written against each other: a name, a heading or a word that one of them writes is one that another reads or repeats. The points below are the main ones and not a complete list, so before changing such a text, search the tracked files for it from the repository root and change every file that has it:

```sh
git grep -n -F -e '<text>'
```

- **Names.** Before stage 1 the skill checks with `hc templates` that the four templates exist, and it starts each stage's agent by the name of its template. The design is the file `architecture.md` in `roles/architect.md` and in the skill.
- **The pointer to the role file.** An extra reviewer has no template, so the skill writes the pointer itself, as `Read ~/.config/herdr-core/roles/<role>.md first and follow it.` The linked path and the file names are therefore written in the skill as well as in the templates.
- **The sections of the design.** `roles/architect.md` asks for `## Files`, `## Verification`, `## Open decisions` when there are any, and `## Self-review` at the end, and each of the other three role files names some of these sections too. The skill checks that `## Files`, `## Verification` and `## Self-review` are there, compares what the implementer changed with `## Files`, runs the commands under `## Verification` itself, and puts every open decision to the user as a question.
- **Reports.** The reviewer roles keep a status on the first line of a report: `Status: in progress` while they work, then `Status: complete` or `Status: stuck: <why>`. The skill counts a report only when its first line is `Status: complete`. `roles/implementer.md` has the implementer report each verification command it ran with its result, and the skill compares that report with its own run of the commands.
- **The words of a review.** The reviewer roles sort findings into Critical, Warning and Suggestion, mark each one as verified or suspected, and say withdrawn or kept for each when they check the answers; the `description` of the two reviewer templates names the three severities too. The skill sends the author every Critical and Warning that stands, each with a number, and the architect and implementer roles answer every finding by its number.
