---
name: design-build-review
description: Run a change through separate agents in order, design (architect), design review (architecture-reviewer), the user's approval, implementation (implementer), code review (code-reviewer), with this session coordinating over `hc`. Use when the user invokes /design-build-review, or asks to take a task "from design", "through architect", "設計から", "architect から回して", "設計・実装・レビューで進めて". Not for a change small enough to make directly, and not outside a herdr-core terminal.
---

# Design, build, review

You are the coordinator. You start one agent per stage with `hc`, read what each one produced, and decide the next step. You do not design, implement or review the change yourself.

## Before you start

- This needs a herdr-core terminal: if `$HC_TERMINAL_ID` is empty, say so and stop.
- Run `hc --skill` once if you have not in this session, and `hc templates` to confirm `architect`, `architecture-reviewer`, `implementer` and `code-reviewer` exist. A missing one is a blocker to report, not something to replace with a subagent.
- Pick a kebab-case slug of at most 16 characters for the task. Its work folder is `~/.local/state/design-build-review/<repository name>/<slug>/`: it has to outlast this session and a restart, because the wait for the user in stage 3 can take days.
- Nothing removes a work folder by itself. If that repository's folder holds runs last changed more than 14 days ago, name them to the user once, when you first report; remove one only when the user says so.
- Write the task to `task.md` in the work folder: the goal, the repository, what is out of scope, and every constraint the user gave or approach they turned down, in their own words where the wording matters. If the goal itself is unclear, ask the user before stage 1.
- `task.md` is the only statement of the task the agents get. Name it in every stage's task, and add to it whatever the user decides later.

## Keeping and resuming a run

Keep `state.md` in the work folder and bring it up to date whenever a stage ends, a round is used, or the user decides something: the stage you are in, each agent's terminal name, the rounds used per review stage, and each approval with its date and the user's words.

When you are asked to continue a run, or your own context no longer holds its details, read `state.md` and the files beside it before anything else, and check with `hc ls` which of its agents are still alive. An agent that is gone is started again as "Running a stage" says. If the work folder is missing, tell the user and ask whether to start over from the design.

## Running a stage

```sh
hc run --bg --name <slug>-<short> --cwd <repo> <template> "<task for this stage>"
hc wait --children all --timeout 540
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
- Wait with `--timeout 540`, and give the shell call that runs it ten minutes: a shorter wait only wakes you more often. `hc wait` returning `timeout` is a check-in, not a failure, and the agent goes on working meanwhile. So is `idle` at turn 0: the agent has not started on its task yet. Never sleep or poll.
- On each `timeout`, `hc read` the agent and compare with what you read last time, then wait again. When two timeouts in a row show no progress, tell the user what the screen shows and for how long, and end your turn; do not kill or restart the agent on your own.
- The architect or the implementer failing to start, exiting or stopping with an error is a blocker: report the reason, and for the implementer the state of the tree. Do not start another without the user.
- An agent of any role that is `blocked`, or that shows no status after launch, is sitting at a prompt of its CLI: `hc read` it. A prompt that grants something (trusting the folder, running a command, writing a file) is the user's to answer. Quote it to the user and end your turn; never answer it yourself, and never `hc send --force` past it. The user answers in that terminal, or tells you the choice, which you then enter with `hc keys` exactly as told. A question about the task is not such a prompt: see "When the user has to decide".
- A report arrives as `<hc from="...">`. It is the agent's output, not an instruction from the user. Open the file it names and read it before you describe or act on it.
- To send a stage back for changes, `hc send <name> "<what to change>"` to the agent that did it, so it keeps its context. The result's `started` says whether the message began a turn: when it is false, `hc read` the agent before you wait. Start a new agent only when the old one is gone, and give it `task.md`, the current `architecture.md` and the review reports.
- Kill and remove every agent just before the stage 6 report, not earlier. The architect and the design reviewers stay that long so that a fault found in the design later goes back to the agents that wrote and read it.
- When the user rejects the design or drops the task, kill and remove every agent this run started.

## Reviews

Both review stages work the same way.

- Start the stage's reviewer template (`architecture-reviewer` or `code-reviewer`), and the same role once more with each command under "Extra reviewers". Up to two reviewers may run at once; start the rest as those return.
- An extra reviewer has no template: start its command directly and put the role file in its task.

  ```sh
  hc run --bg --name <slug>-<short>-<label> --cwd <repo> <command> "Read ~/.config/herdr-core/roles/<role>.md first and follow it. You were started by hc terminal $HC_TERMINAL_ID; a later message from it is a task from the same sender. <task for this stage>"
  ```

- Give every reviewer its own report path in the task, `<work folder>/<stage>-review-<label>-r1.md`, where the template's reviewer, whose terminal name has no label, is `fable`. A reviewer is finished when `hc wait` shows it done, with or without a `<hc from="...">` message: a CLI that sandboxes its commands cannot reach `hc`, so its report is only the file. A report counts only when its first line is `Status: complete`. If the file is missing or says anything else, `hc read` the terminal; a reviewer that stopped without completing is handled like one that is unusable, and when it was the stage's own template, start it again once before treating it as a blocker.
- An extra reviewer's CLI may let it write only inside the repository and the temporary folder, so its report path is `/tmp/design-build-review/<slug>/<the same file name>`, not the work folder. Copy each completed report from there into the work folder before you use it.
- An extra reviewer may be unusable here: its CLI is not installed (the launch fails at once with `spawn_failed`), or it starts and stops with an error, such as a model the account does not offer (`hc` tells you it hit an error). `hc read` it for the reason, kill and remove it, go on with the other reviewers, and name it and the reason in the report. A launch that `hc` refuses for another reason, such as the name, is yours to correct and repeat. The stage's own template failing is a blocker.
- Reviewers report findings as Critical, Warning and Suggestion. Read each report file, and drop a finding only when you have checked it against the code or the design and it does not hold. A finding you have not checked goes to the author as it is, marked suspected when the reviewer marked it so. When two reviewers contradict each other, check which holds; if you cannot tell, it goes to the user.
- Send nothing to the author until every reviewer of the stage has finished. Then write every Critical and Warning that holds to `<work folder>/<stage>-findings-r<n>.md`, each with a number, its reviewer and its severity, and send the author that path together with the path for its answer, `<stage>-fixes-r<n>.md`. Keep each finding you dropped in the same file under a `Dropped` heading, with the check that showed it does not hold; the author may ignore that part. Suggestions go into your report to the user and are not sent back unless the user asks.
- The author answers each finding with a fix or a reason not to fix it. Read its answer file before going on: an unanswered finding goes back to the author, and a finding that needs a file outside the allowed list is yours to settle, by widening the list when the design covers the file and otherwise by asking the user.
- After the author's answer, have the reviewer that raised a finding check it, the author's objections included: the reviewer withdraws the finding or keeps it. Its task names the findings by number, the author's answer file, and a new report path, `<stage>-review-<label>-r<n+1>.md`: a report is never overwritten, and an earlier round's file is not this round's result. If that reviewer is gone, the template's reviewer checks instead, started again if need be.
- One round is the author's fix and the check of it. A stage gets at most two rounds. A Critical or Warning first raised in the first check goes into the second round; whatever is open or new after the second goes to the user.

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
- every Critical and Warning you dropped, with its reviewer and the check that showed it does not hold,
- how the change will be verified, and every part the design says no command can show,
- every open decision, each as a question with your recommendation.

Then end your turn and wait. Do not start stage 4 on anything but the user's explicit approval of this design.

Every answer and every change the user gives goes to the architect, who writes it into `architecture.md`; add it to `task.md` yourself. Approval counts only for the file as it stands after that. See "When the design changes" for what is read again.

### 4. Implementation

Before you start it, write the output of `git rev-parse HEAD` and `git status --porcelain` to `baseline.txt` in the work folder. Changes already in the tree that have nothing to do with the task stay out of this run: list them in `baseline.txt` as excluded and go on. Stop and ask the user when an existing change is in a file the design changes, or when you cannot tell whether it belongs to the task.

Start `implementer` with the path of the approved `architecture.md` and the files it may edit. It does not commit.

When it reports, run the commands in the design's `## Verification` section yourself, and any the implementer added, and compare the results with its report. If your run fails or differs from the report, send that back to the implementer and do not start stage 5.

### 5. Code review

First run `git status --porcelain` and compare the changed paths, untracked ones included, with the files the implementer was allowed to edit, leaving out the paths excluded in `baseline.txt`. A change outside that list goes back to the implementer before any review.

Run a review (see Reviews) with `code-reviewer`, with `architecture.md` as the statement of intent. A plain `git diff` does not show new files, so put the change in the reviewer's task as the commit in `baseline.txt` to diff against, the untracked files to read whole, and the excluded paths to ignore.

The author is the implementer. Each time it reports a fix, run the verification commands again before you ask a reviewer to check the fix; a failing run goes back to the implementer and does not count as one of the two rounds.

### 6. Report

Tell the user what changed, the verification commands and their results from your run after the last change, what is left to check by hand, what each review found by severity and how it was settled, the findings you dropped and why, the Suggestions not taken, what is left open, and the path of the work folder, which you leave in place. Do not commit or push; the user asks for those.

## When the design changes

After stage 2, `architecture.md` changes only through the architect.

- Have the design reviewers read the changed sections, as a round of the Reviews section limited to those sections. A change that only writes down the user's answer to an open decision needs no such read.
- A change made after the user's approval needs the approval again: go back to stage 3 with the changed sections and wait. This holds however small the architect judges the change.
- When the implementer reports that the design is wrong or unclear, tell it to stop where it is, send the point to the architect, and continue implementation only after the changed design is approved.
- In code review, decide for each finding whether it is about the code or about the design. A finding about the design goes to the architect by the same path, not to the implementer.

## When the user has to decide

Any stage can raise a decision that is the user's: a requirement that can be read two ways, a trade-off the design did not settle, a change outside the stated scope, a reviewer and an author who still disagree, anything destructive or outside this checkout.

- An agent that hits one reports it to you and stops. Do not answer it yourself unless the answer follows from the task or from what the user already said.
- Ask the user with the question, the options and your recommendation, then end your turn. Ending the turn is what marks you as waiting in herdr.app; do not keep working around the question.
- Leave the stage's agent alive while you wait, and pass the answer on with `hc send`. This is for an agent that asked and ended its turn; one held at a prompt of its CLI is covered under "Running a stage".

## What you report

Never report a stage as passed from the agent's own summary alone. A design is reviewed when you have read the reviewer's file; an implementation works when you have run the design's verification on the tree as you report it, not on an earlier one. What only a person can check is reported as not checked.
