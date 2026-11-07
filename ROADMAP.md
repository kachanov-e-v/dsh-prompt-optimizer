# ROADMAP

Planned and possible future work for `dsh-prompt-optimizer`.

## Done

- [x] Client-side button in `conversation.input.left`
- [x] Local template rewrite (role / task / context / requirements / format /
      quality)
- [x] Host route with LLM streaming (`/dsh-prompt-optimizer/optimize`)
- [x] LLM / Template mode switch with persistence
- [x] Automatic fallback to template on model failure
- [x] Restore-original-draft on second click
- [x] ru / zh / en UI copy by language prefix
- [x] README, AGENTS, ROADMAP, LICENSE

## Next

- [ ] Add a real test harness (Node scripts under `test/`) covering `buildPrompt`
      and the Host route with a mocked `ctx.llm`.
- [ ] Expose plugin settings (provider/model/timeout/maxTokens) through a
      `Config` schema instead of raw `config`.
- [ ] Show the active model name in the tooltip while in LLM mode.
- [ ] Add a "copy to clipboard" affordance for the generated prompt.
- [ ] Support streamed preview of the model rewrite (token-by-token) instead of
      waiting for the full answer.
- [ ] Per-intent system prompts for the LLM path (code vs. analysis vs. question).
- [ ] Optional custom system prompt / style presets configurable by the user.
- [ ] Better handling of very long drafts (chunking or summarisation before rewrite).

## Maybe later

- [ ] Publish to the DSH plugin market.
- [ ] Telemetry opt-in for template vs. LLM usage.
- [ ] A sidebar panel with prompt history and favourites.
