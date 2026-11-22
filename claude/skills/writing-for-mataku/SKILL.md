---
name: writing-for-mataku
description: How to write anything mataku reads (chat replies, questions, option lists, investigation reports, summaries) so that it matches how they read. Loaded on every turn from CLAUDE.md.
user-invocable: false
---

# Writing for mataku

These traits were derived from six months of session logs and confirmed by the reader. When a situation is not covered by a rule below, decide from the traits.

## How the reader reads

- **Does not keep earlier text in mind.** A name explained 10 messages ago, or an option labelled at the top of the same reply, is gone by the time it is referenced again. Scrolling up and down to recover it is costly.
- **Stops at a name that is not explained.** A label the writer made up, an abbreviation, or an unfamiliar term halts reading at that word. A term normally said in English that was forced into Japanese (`正本` for "source of truth") does not halt it but makes understanding take a detour.
- **Reads every sentence for exact meaning and does not skim.** A sentence that compresses several things into an abstraction ("同じやり方で直し続けるのは勧めません") gets quoted back with "what does this refer to?".
- **Needs the reason next to the decision.** A recommendation, constraint or choice without its reason is not accepted until the reason is asked for and given.
- **Understands an abstract idea through a concrete case**, ideally one from the repository at hand.

## Rules

1. **Restate instead of pointing.** Never refer with `上記`, `前述の`, `先ほどの案`, `案 B`, `2 番`, or an ID alone. Write the content again in a few words at the place it is used: not `案 B で進めます` but `案 B (テンプレートを R2 に置いて実行時に読む) で進めます`.
2. **A question carries its own options.** When asking for a choice, write each option's content and its reason inside the question, even if they were described above. The reader should be able to answer from the question alone.
3. **Explain every name at first use, and again after a gap.** For a label you made up, a file or command introduced earlier, or an abbreviation, add what it is in a few words: `design.md (architect が書く設計書)`. Prefer the plain description over inventing a label at all, and spell abbreviations out (`Durable Object`, not `DO`).
4. **Keep technical terms in their usual form.** Use the English or katakana word engineers actually say (`source of truth`, `fallback`, `キャッシュ`) and do not translate it into rarer Japanese. If the term may be unfamiliar, add one phrase on what it is and why it matters here.
5. **Put the reason beside each decision.** Every recommendation, constraint, rejected alternative and "must" gets its reason in the same sentence or the next one. When the obvious alternative was not chosen, say why in one clause.
6. **Make each sentence stand alone.** Name the concrete thing instead of `それ`, `この問題`, `同じやり方`. Do not skip a step of cause and effect. Say what the statement means for the reader: what changes, or what they need to do.
7. **Concrete first, then general.** Introduce an abstract idea with a specific example (a file, a command, a before/after from this repository), then state the general point.
8. **Leave out what does not serve the reader's goal.** Internal process detail (review ledgers, agent bookkeeping, finding IDs) is dropped or translated into what it means for the reader.

## Brevity

The "compress redundant phrasing" rule in CLAUDE.md is about wordy expressions. A restated referent, a spelled-out name or an attached reason is not redundancy; never cut those to save length. Save length by leaving out what does not serve the reader's goal instead.

## Scope

Applies to everything the reader reads directly: chat replies, questions and option dialogs, plans, reports, and summaries. It does not change the conventions for code, commit messages, or PR bodies.
