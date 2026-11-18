# compact-large-idle-context

A Claude Code mod (function hooks) that reports Claude Code's built-in idle compaction: when the engine compacts a long conversation shortly before the 1-hour prompt cache expires, the mod writes one line with the size of the context and the cache hit rate of the summarizer's request.

The mod does not compact anything itself. It depends on the built-in idle compaction being on (`"idleCompaction"` in settings.json, on by default), which compacts a context of at least 200,000 tokens at 90% of the cache lifetime and hides the compaction from terminals that read the Program Status Protocol (OSC 7501), such as herdr.app.

## Behavior

- Every compaction passes through unchanged: the mod never vetoes, rewrites or retries one, and an error from the compaction reaches the caller as before.
- A compaction counts as the idle one when all of the following hold:
  - its trigger is `auto` and it compacts the main conversation, not a subagent's;
  - no main-conversation turn is running;
  - at least 30 minutes have passed since a main-conversation turn last started or ended. Threshold compactions happen during a turn or within seconds of its end, and the built-in idle compaction fires about 54 minutes after the last request.
- For that compaction, once it succeeds, the mod writes one line in the conversation, for example:

  ```
  Compacted idle context of 250,000 tokens; summary cache hit 90.0% (read 180,000 / write 19,000 / uncached 1,000)
  ```

  The hit rate is `cache read / (cache read + cache write + uncached)` of the summarizer's own request, and is left out when the compaction reports no usage. A skipped compaction writes nothing.
- Every main-conversation compaction also leaves a debug line (`claude --debug`) with its trigger, whether a turn is running and the time since the last turn.

## Limitations

- That the built-in idle compaction reaches plugin hooks as `auto` with `usage` and `tokensBefore` in its result was read from Claude Code 2.1.327, not from documentation, and may change with an update. The debug line shows what arrives.
- An `auto` compaction more than 30 minutes after the last turn that is not the idle one would be reported as idle.

## Development

```sh
claude plugin validate claude/mods/compact-large-idle-context
claude plugin test claude/mods/compact-large-idle-context
```

## License

MIT
