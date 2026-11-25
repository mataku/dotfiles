# compact-large-idle-context

A Claude Code mod (function hooks) that compacts a large context once, shortly before the 1-hour prompt cache expires on an idle session, so coming back to a long session does not pay for re-caching the whole conversation.

## Behavior

- When a main-conversation turn ends normally (`reason: 'answer'`), a compaction is reserved for 50 minutes later. Subagent turns, interrupted turns, refusals and turns ended by an error do not reserve.
- There is only ever one reservation. Every normally completed turn restarts the 50 minutes.
- The reservation is cancelled when a new turn starts, when a manual or automatic compaction of the main conversation happens, or when the session ends (including `/clear`).
- When the timer fires, the compaction runs only if all of the following hold; otherwise nothing happens and nothing is retried:
  - At least 50 and less than 58 minutes of wall-clock time have passed since the turn ended. A timer delayed further (for example by the Mac sleeping) may already have missed the cache.
  - The session is the same one that made the reservation.
  - The context is at least 200,000 tokens.
  - No turn started while these checks ran.
- The compaction runs once. It does not reserve another one by itself, and a failed or vetoed compaction is not retried.
- The compaction asks the summarizer to end its summary with a `<digest>` block for the person: a summary of the conversation in at most 5 lines, the decisions still open, and the TODOs that remain, in the language the person writes in. The request rides on the summarizer's own request as `/compact <instructions>` does, so it costs no extra model call.
- When the compaction succeeds, the mod posts one notice in the conversation: the context size and the summarizer's cache hit rate, then the digest. For example:

  ```
  Compacted idle context of 250,000 tokens; summary cache hit 90.0% (read 180,000 / write 19,000 / uncached 1,000)

  Moved the idle compaction back into the mod and added a digest post.

  Open decisions
  - Whether threshold compactions should post a digest too (waiting on a week of use)

  TODO
  - Turn off the built-in idle compaction in settings.json
  ```

  The hit rate is `cache read / (cache read + cache write + uncached)` of the summarizer's own request, and is left out when the compaction reports no usage.
- The notice is a `$.ui.log` line: drawn dim on screen, stored in the session's transcript, and never sent to the model. A `system` row added with `$.session.append` is stored too, but the running session does not draw it, so it is not used.
- When the summary carries no `<digest>` block, the notice shows the first 1,500 characters of the summary instead.
- Reservations, cancellations and skips go to the debug log only (`claude --debug`).

## Checking it by hand

Two environment variables lower the thresholds so the notice can be seen without waiting 50 minutes. Set them when starting `claude`; an empty, zero, negative or non-numeric value keeps the default.

- `COMPACT_LARGE_IDLE_CONTEXT_DELAY_MINUTES`: minutes from the end of a turn to the compaction (default 50). The timer still gives up 8 minutes after it is due.
- `COMPACT_LARGE_IDLE_CONTEXT_MIN_TOKENS`: the smallest context that is compacted (default 200,000).

```sh
COMPACT_LARGE_IDLE_CONTEXT_DELAY_MINUTES=1 COMPACT_LARGE_IDLE_CONTEXT_MIN_TOKENS=1000 claude
```

## Setup

Turn off the built-in idle compaction with `"idleCompaction": false` in `~/.claude/settings.json`. Left on, it compacts about 54 minutes after the last request whenever this mod skipped, and that compaction posts no digest.

## Limitations

- The compaction is started with `$.session.compact()`, which Claude Code reports to terminals that read the Program Status Protocol (OSC 7501) as working and then done. herdr.app therefore marks the tab unread and plays its done sound for it. No mod API hides a plugin's compaction the way the built-in idle compaction hides itself.
- `/compact` and threshold compactions are left as they are and post no digest.
- `$.session.compact()` is refused in a headless (`-p` or SDK) session, so the mod does nothing there.

## Development

```sh
claude plugin validate claude/mods/compact-large-idle-context
claude plugin test claude/mods/compact-large-idle-context
```

## License

MIT
