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
- Reservations, cancellations and skips go to the debug log only (`claude --debug`). The only line shown in the conversation is written when the compaction runs, for example:

  ```
  Compacted idle context of 250,000 tokens; summary cache hit 90.0% (read 180,000 / write 19,000 / uncached 1,000)
  ```

  The hit rate is `cache read / (cache read + cache write + uncached)` of the summarizer's own request, and is left out when the compaction reports no usage.

## Development

```sh
claude plugin validate claude/mods/compact-large-idle-context
claude plugin test claude/mods/compact-large-idle-context
```

## License

MIT
