# AGENTS.md

Guidance for AI coding agents working on `dsh-prompt-optimizer`.

## Project

- DSH (DeepSeek Harness) Cordis bundle plugin.
- Two halves: `index.js` (Host, ESM, `apply(ctx, config)` + `inject`) and
  `client.js` (browser `__ModuleLoader__` factory, React from the browser table).
- No build step, no TypeScript, no test runner. Plain JavaScript only.
- UI is injected into the `conversation.input.left` slot.

## Conventions

- Keep both halves dependency-free (no `require` of Harness packages).
- Host half must declare `inject` for every service it touches (`webServer`,
  optionally `llm`/`agentDefaultModel`/`connection` via `ctx.get`).
- Client half must return `{ inject, apply }` and register slots with
  `ctx.slots.inject` + `ctx.slots.register`.
- Style with `--dsw-alias-*` theme tokens only; literal colours are for artwork
  (icon) only.
- Localise UI copy by language prefix (`ru` / `zh` / `en`), do not rely on exact
  locale ids, because DSH uses regional ids such as `ru-RU`.
- Keep request bodies bounded and validate on the Host side.
- Never call a model from the client; always go through the Host route.

## Working on the code

- Edit `client.js` / `index.js` directly; there is no compile step.
- Syntax check: `node --check client.js && node --check index.js`.
- JSON check: parse `package.json` and `locale/*.json`.
- SVG: must parse as XML (`[xml](Get-Content icon.svg)`).
- The bundle is linked into the profile from this directory; after editing,
  reinstall via `plugin_manager install_bundle` (or remove + install) and reload
  the page.

## Do not

- Add JSX or TypeScript — the client half is evaluated as plain JS by
  `__ModuleLoader__`.
- Import Harness client packages (`@deepseek-ai/dsh-client-*`) from the client
  half; use `ctx` services and `host.call` instead.
- Store secrets in `config` or in the repo.
- Commit ad-hoc test scripts or build artefacts.

## Release

- Bump `version` in `package.json`.
- Reinstall the bundle in the profile and verify the slot registration via
  `cordis_inspect_query` (`Slots.listSubTree`, root `conversation.input.left`).
- Push to GitHub (`master` branch).
