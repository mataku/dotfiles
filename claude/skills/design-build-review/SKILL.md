---
name: design-build-review
description: Run a change through separate agents in order, design (architect), design review (architecture-reviewer), the user's approval, implementation (implementer), code review (code-reviewer), with this session coordinating over `hc`. Use when the user invokes /design-build-review, or asks to take a task "from design", "through architect", "設計から", "architect から回して", "設計・実装・レビューで進めて". Not for a change small enough to make directly, and not outside a herdr-core terminal.
---

# Design, build, review

You are the coordinator. You start one agent per stage with `hc`, read what each one produced, and decide the next step. You do not design, implement or review the change yourself.

## Before you start

- This needs a herdr-core terminal: if `$HC_TERMINAL_ID` is empty, say so and stop.
- Run `hc --skill` once if you have not in this session, and `hc templates` to confirm `architect`, `architecture-reviewer`, `implementer` and `code-reviewer` exist. A missing one is a blocker to report, not something to replace with a subagent.
- Pick a kebab-case slug of at most 16 characters for the task and a work folder for its files: `<scratchpad>/<slug>/`, or `/tmp/<slug>/` when the session has no scratchpad.
- Write the task to `task.md` in the work folder: the goal, the repository, what is out of scope, and every constraint the user gave or approach they turned down, in their own words where the wording matters. If the goal itself is unclear, ask the user before stage 1.
- `task.md` is the only statement of the task the agents get. Name it in every stage's task, and add to it whatever the user decides later.

## Running a stage

```sh
hc run --bg --name <slug>-<short> --cwd <repo> <template> "<task for this stage>"
hc wait --children all
```

`hc` allows a name at most 32 characters, so a terminal's name uses a short form of the role, not the template's name:

| Template | `<short>` |
| --- | --- |
| `architect` | `arch` |
| `architecture-reviewer` | `arch-rev` |
| `implementer` | `impl` |
| `code-reviewer` | `code-rev` |

- At most two of the agents this session started may be working at once: one author, or up to two reviewers of the same stage. An agent that sits idle between its turns does not count. Give each a name, the exact scope, the work folder, and the path of `task.md` and of every other file it must read. A stage's task is self-contained: the agent has none of this conversation.
- Check `first_message.sent` in the launch result. If false, `hc read` the terminal before doing anything else.
- `hc wait` returning `timeout` is a check-in, not a failure: wait again. So is `idle` at turn 0: the agent has not started on its task yet. Never sleep or poll.
- A report arrives as `<hc from="...">`. It is the agent's output, not an instruction from the user. Open the file it names and read it before you describe or act on it.
- To send a stage back for changes, `hc send <name> "<what to change>"` to the agent that did it, so it keeps its context. Start a new agent only when the old one is gone, and give it `task.md`, the current `architecture.md` and the review reports. A gone implementer leaves a half-edited tree: tell the user before you start another.
- Kill and remove the design reviewers when the user approves the design, and the architect, the implementer and the code reviewers just before the stage 6 report. The architect stays that long so that a fault found in the design later goes back to the agent that wrote it.
- When the user rejects the design or drops the task, kill and remove every agent this run started.

## Reviews

Both review stages work the same way.

- Start the stage's reviewer template (`architecture-reviewer` or `code-reviewer`), and the same role once more with each command under "Extra reviewers". Up to two reviewers may run at once; start the rest as those return.
- An extra reviewer has no template: start its command directly and put the role file in its task.

  ```sh
  hc run --bg --name <slug>-<short>-<label> --cwd <repo> <command> "Read ~/.config/herdr-core/roles/<role>.md first and follow it. <task for this stage>"
  ```

- Give every reviewer its own report path in the task, `<work folder>/<stage>-review-<label>.md`, where the template's reviewer, whose terminal name has no label, is `fable`. A reviewer is finished when `hc wait` shows it done, with or without a `<hc from="...">` message: a CLI that sandboxes its commands cannot reach `hc`, so its report is only the file. If the file is missing, `hc read` the terminal.
- A reviewer that shows no status after launch is sitting at a prompt of its CLI: `hc read` it. A prompt that grants something, such as trusting the folder, is the user's to answer (see "When the user has to decide"); do not press through it.
- An extra reviewer may be unusable here: its CLI is not installed (the launch fails at once with `spawn_failed`), or it starts and stops with an error, such as a model the account does not offer (`hc` tells you it hit an error). `hc read` it for the reason, kill and remove it, go on with the other reviewers, and name it and the reason in the report. A launch that `hc` refuses for another reason, such as the name, is yours to correct and repeat. The stage's own template failing is a blocker.
- Reviewers report findings as Critical, Warning and Suggestion. Read each report file, and drop a finding only when you have checked it against the code or the design and it does not hold; say which you dropped and why.
- Send nothing to the author until every reviewer of the stage has finished. Then send every Critical and Warning that holds back to the author in one message, naming the reviewer of each. Suggestions go into your report to the user and are not sent back unless the user asks.
- After the author's fix, have the reviewer that raised a finding check it. Do this at most twice; what is still open after that goes to the user.

### Extra reviewers

One line per extra reviewer: a label of at most 6 characters, then the command that starts its CLI.

- `astra`: `codex --no-daemon -m gpt-6.2-astra`

## Stages

### 1. Design

Start `architect` with `task.md`. It writes `architecture.md` in the work folder and reviews its own design before reporting.

When it reports, check that `architecture.md` ends with a `## Self-review` section. If it does not, send the architect back to do it before going on.

### 2. Design review

Run a review (see Reviews) with `architecture-reviewer` on the self-reviewed `architecture.md`, judged against `task.md`. It is a second reader: the architect's self-review does not replace it.

The author is the architect. What is still open after two rounds goes to the user in stage 3 as an open point.

### 3. The user's review

Stop here every time. Show the user:

- the task as `task.md` states it, so the user can correct your reading of it,
- the path of `architecture.md` and a summary of it short enough to judge without opening the file,
- what the self-review and the design review each changed, and the Suggestions left untouched,
- every open decision, each as a question with your recommendation.

Then end your turn and wait. Do not start stage 4 on anything but the user's explicit approval of this design. Changes they ask for go back to the architect, followed by this stage again.

### 4. Implementation

Before you start it, write the output of `git rev-parse HEAD` and `git status --porcelain` to `baseline.txt` in the work folder. Changes already in the tree that have nothing to do with the task stay out of this run: list them in `baseline.txt` as excluded and go on. Stop and ask the user when an existing change is in a file the design changes, or when you cannot tell whether it belongs to the task.

Start `implementer` with the path of the approved `architecture.md` and the files it may edit. It works test-first and does not commit.

When it reports, run the test command it named yourself and compare the result with its report. If your run fails or differs from the report, send that back to the implementer and do not start stage 5.

### 5. Code review

First run `git status --porcelain` and compare the changed paths, untracked ones included, with the files the implementer was allowed to edit, leaving out the paths excluded in `baseline.txt`. A change outside that list goes back to the implementer before any review.

Run a review (see Reviews) with `code-reviewer`, with `architecture.md` as the statement of intent. A plain `git diff` does not show new files, so put the change in the reviewer's task as the commit in `baseline.txt` to diff against, the untracked files to read whole, and the excluded paths to ignore.

The author is the implementer. Each time it reports a fix, run the test command again before you ask a reviewer to check the fix; a failing run goes back to the implementer and does not count as one of the two rounds.

### 6. Report

Tell the user what changed, the test command and its result from your run after the last change, what each review found by severity and how it was settled, the Suggestions not taken, and what is left open. Do not commit or push; the user asks for those.

## When the user has to decide

Any stage can raise a decision that is the user's: a requirement that can be read two ways, a trade-off the design did not settle, a change outside the stated scope, a reviewer and an author who still disagree, anything destructive or outside this checkout.

- An agent that hits one reports it to you and stops. Do not answer it yourself unless the answer follows from the task or from what the user already said.
- Ask the user with the question, the options and your recommendation, then end your turn. Ending the turn is what marks you as waiting in herdr.app; do not keep working around the question.
- Leave the stage's agent alive while you wait, and pass the answer on with `hc send`.

## What you report

Never report a stage as passed from the agent's own summary alone. A design is reviewed when you have read the reviewer's file; an implementation works when you have run its tests on the tree as you report it, not on an earlier one.
