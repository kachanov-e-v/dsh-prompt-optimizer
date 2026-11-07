# dsh-prompt-optimizer

A DeepSeek Harness (DSH) plugin that adds a one-click **Prompt Optimizer** button
to the composer tool row. It rewrites a rough draft into a high-quality,
structured, professional prompt, either with the user's selected LLM or with a
deterministic local template, and writes the result back into the composer.

- **Package**: `dsh-prompt-optimizer` (version 3.0.0)
- **Type**: DSH Cordis bundle (`host` + `client`)
- **UI slot**: `conversation.input.left`
- **License**: MIT

## What it does

The button sits in the left part of the composer tool row, next to the other
compact controls. It has two modes, switchable with the small chip next to it:

| Mode | Behaviour |
|------|-----------|
| **LLM** (default) | Sends the draft to the Host route `/dsh-prompt-optimizer/optimize`, which streams a rewrite through the configured LLM (`ctx.llm`, using the default model selection). The model is instructed to preserve intent and return only the improved prompt. |
| **Шаблон / Template** | Rewrites the draft locally with a deterministic template: role, task, context, requirements, output format and quality criteria. No network call, no tokens. |

Clicking the main button again restores the original draft. The selected mode is
persisted in `localStorage`.

## Fallback behaviour

If the model is unavailable (no default model, LLM service missing, provider
error, timeout, aborted request, gate refusal), the plugin automatically applies
the local template, shows a warning dot with the reason, and — for
`NO_MODEL` / `NO_LLM` — switches the mode to **Template**. If the user edits the
draft while the model is working, the model result is discarded so it never
overwrites the user's new text.

## Files

```
dsh-prompt-optimizer/
├── package.json          # bundle manifest (dsh.bundle.patch + dsh.client)
├── cordis.patch.yml      # inserts the host + client plugin rows
├── index.js              # Host half: HTTP route + LLM streaming
├── client.js             # Client half: slot registration + UI
├── icon.svg              # plugin icon
├── locale/
│   ├── en.json           # English metadata
│   └── ru.json           # Russian metadata
├── README.md
├── AGENTS.md
└── ROADMAP.md
```

## Installation (DSH)

This is a linked (local) bundle. From a DSH profile shell:

```bash
# install from the local directory
dsh plugin install "C:\path\to\dsh-prompt-optimizer"

# or via the Plugin Manager UI: Plugins -> Install from directory
```

After installation, enable the bundle in the profile (it is enabled by default)
and reload the page (`F5`) so the client module is picked up.

## Usage

1. Open a session in the DSH Web UI.
2. Look at the left part of the composer tool row — you will see **✨ Улучшить /
   Improve** plus a small **LLM / Шаблон** chip.
3. Type a rough draft into the composer.
4. Click **Улучшить**. In LLM mode the button shows **Улучшаю…** while the
   request runs; in template mode the rewrite is instant.
5. The composer now contains the improved prompt. Click the button again to
   restore the original draft.
6. Use the chip to switch modes. The choice is remembered between sessions.

The UI language follows the active DSH locale (`ru`, `zh`, `en`).

## Host route contract

`POST /dsh-prompt-optimizer/optimize`

Request body (JSON):

```json
{ "text": "draft", "language": "ru" }
```

- `text` — required, non-empty, up to 20 000 characters.
- `language` — `"ru"` or `"en"` (default `"en"`).

Response (JSON):

```json
{ "ok": true, "text": "improved prompt", "provider": "...", "model": "..." }
```

Error responses carry `{ "ok": false, "code": "...", "error": "..." }` with
status codes `400 / 401 / 403 / 409 / 413 / 415 / 502 / 504`.

Security: same-origin check, Host request gate (`connection.requestRejection`),
bounded body (`32 KiB`) and text length.

## Development

- Host half: plain ESM, no build step. Exports `apply(ctx, config)` and
  `inject = ['webServer']`.
- Client half: a `window.__ModuleLoader__.load` factory, React from the browser
  module table, no JSX transform. All DOM/CSS is self-contained.
- Local template logic lives in `buildPrompt` / `detectIntent` /
  `detectLanguage` / `cleanDraft` inside `client.js`.
- No tests are committed yet; the functional checks used during development
  were ad-hoc Node scripts (not part of the repo).

## Configuration

The bundle accepts an optional `config` object on the plugin row:

```yaml
- id: dsh-prompt-optimizer
  config:
    provider: deepseek-official   # override LLM provider
    model: deepseek-v4-flash      # override LLM model
    timeoutMs: 45000              # request timeout, 3000..120000
    maxTokens: 1200               # output cap, 128..4000
```

When `provider`/`model` are omitted, the current default model selection is
used.

## Contributing

See [AGENTS.md](AGENTS.md) for repository conventions and [ROADMAP.md](ROADMAP.md)
for planned work. Pull requests are welcome.
