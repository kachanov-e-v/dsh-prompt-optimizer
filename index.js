/**
 * Host half of the Prompt Optimizer bundle.
 *
 * Exposes one package-private HTTP route that rewrites a composer draft with
 * the user's default model through `ctx.llm`. The Client half still owns the
 * UI and falls back to its local template when no model is available.
 *
 * The Host also inserts the standing working rules into the result, so the model
 * never rewrites, shortens, or drops them.
 */
const ROUTE_PATH = '/dsh-prompt-optimizer/optimize';
const MAX_DRAFT_CHARS = 20000;
// 20 000 characters can occupy up to 4 bytes each in UTF-8, and JSON adds
// quotes and escapes; 128 KiB keeps the declared character limit reachable.
const MAX_BODY_BYTES = 128 * 1024;

export const inject = ['webServer'];

/** Build an Error carrying a stable code for the HTTP reply. */
function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/** Write one JSON reply unless the response is already committed. */
function sendJson(response, status, payload) {
  if (response.headersSent) return;
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

/** Read a bounded JSON request body. */
function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let settled = false;
    const chunks = [];
    request.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        settled = true;
        request.resume();
        reject(fail('BODY_TOO_LARGE', 'Request body is too large'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (settled) return;
      settled = true;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(fail('INVALID_JSON', 'Request body is not valid JSON'));
      }
    });
    request.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    request.on('aborted', () => {
      if (settled) return;
      settled = true;
      reject(fail('ABORTED', 'Request was aborted'));
    });
  });
}

/** Reject requests that the Host's own gate or origin rule does not admit. */
function refusalStatus(ctx, request) {
  let connection;
  try {
    connection = ctx.get('connection');
  } catch {
    connection = undefined;
  }
  const gate = connection && typeof connection.requestRejection === 'function'
    ? connection.requestRejection.bind(connection)
    : undefined;
  if (gate !== undefined) {
    try {
      const status = gate(request);
      if (typeof status === 'number') return status;
    } catch {
      return 403;
    }
  }
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (typeof origin === 'string' && origin !== '' && origin !== 'null') {
    try {
      if (new URL(origin).host !== host) return 403;
    } catch {
      return 403;
    }
  }
  return undefined;
}

/** Drop one fence wrapping the whole model answer, keeping inner code fences. */
function stripOuterFence(value) {
  const match = /^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```$/.exec(value);
  return match ? match[1].trim() : value;
}

/**
 * Standing working rules inserted into every improved prompt. Keep this table in
 * sync with the `rules` arrays in `client.js`, which the local template uses.
 */
const STANDING_RULES = {
  ru: [
    'Документацию веди вместе с кодом: AGENTS.md — правила и соглашения для агентов, ROADMAP.md — статус, приоритеты и следующий шаг, README.md — установка, использование и архитектура. У каждого файла своя роль — не переписывай одно и то же в трёх местах; создавай файл, если его ещё нет.',
    'Держи знание в репозитории, а не в переписке: фиксируй текущее состояние, принятые решения, их причины, известные проблемы и следующий шаг, чтобы новая сессия продолжила работу без истории чата. Решение без причины считается незафиксированным.',
    'Не угадывай: не выдумывай API, пути, версии и цифры — не уверен, проверь или спроси. При нехватке данных задай до трёх точных вопросов; на развилке перечисли варианты и явно порекомендуй лучший с обоснованием. Отделяй факт от предположения.',
    'Отвечай и задавай вопросы только на русском языке.',
    'Весь проект веди на русском: документация, тексты интерфейса, комментарии, сообщения об ошибках, коммиты и правила. Исключения — идентификаторы кода, имена библиотек и внешних API, служебные файлы инструментов; спорный случай опиши в README.',
    'Соблюдай инженерные конвенции: стиль и соглашения языка и фреймворка, совместимость версий, обработка ошибок и граничных случаев, никаких секретов в репозитории и логах.',
    'Отчитывайся по факту, четырьмя строками: Проверено (что и какими командами) / Не проверено / Риски / Следующий шаг. Непроверенный результат не называй готовым.',
    'Делай ровно запрошенное: не рефактори попутно, не добавляй зависимости, не меняй публичные контракты, формат данных и лицензию без явного согласия.',
    'Если задача заблокирована — нет доступа, противоречивые требования, риск потери данных — остановись, опиши блокер и варианты. Не обходи ограничения и не отключай проверки ради зелёного статуса.',
  ],
  zh: [
    '文档与代码同步维护：AGENTS.md 记录代理的规则与约定，ROADMAP.md 记录状态、优先级和下一步，README.md 记录安装、使用与架构。每个文件各有职责，不要把同样的内容重复写在三处；文件不存在时在同一次改动中创建。',
    '把知识留在仓库而不是对话里：记录当前状态、已做的决定及理由、已知问题和下一步，使新会话无需聊天历史即可继续工作。没有理由的决定视为未记录。',
    '不要猜测：不要编造 API、路径、版本或数字——不确定就核实或询问。信息不足时提出至多三个明确问题；在分叉处列出选项并给出明确推荐及理由。区分事实与假设。',
    '遵循工程约定：语言与框架的风格、版本兼容性、错误与边界情况处理，仓库和日志中不得出现密钥。',
    '按事实汇报，共四行：已验证（内容与所用命令）/ 未验证 / 风险 / 下一步。未经验证的结果不要称为完成。',
    '只做被要求的事：不顺手重构、不新增依赖，未经明确同意不修改公共契约、数据格式和许可证。',
    '任务受阻时——无法访问、要求矛盾、数据丢失风险——停下来说明阻碍和可选方案。不要绕开限制，也不要为了通过状态而关闭检查。',
  ],
  en: [
    'Keep documentation alive with the code: AGENTS.md for rules and conventions for agents, ROADMAP.md for status, priorities and the next step, README.md for installation, usage and architecture. Each file has its own role, so do not copy the same text into three places; create a missing file in the same change.',
    'Keep knowledge in the repository, not in the chat: record the current state, decisions, their reasons, known issues and the next step so a new session can continue without the chat history. A decision without its reason counts as unrecorded.',
    'Never guess: do not invent APIs, paths, versions or numbers — verify or ask. When information is missing ask up to three precise questions; at a fork list the options and recommend the best one with reasoning. Separate facts from assumptions.',
    'Follow engineering conventions: language and framework style, version compatibility, error and edge-case handling, no secrets in the repository or logs.',
    'Report facts in four lines: Verified (what and with which commands) / Not verified / Risks / Next step. Never call unverified work done.',
    'Do exactly what was asked: no drive-by refactoring, no new dependencies, no changes to public contracts, data formats or the licence without explicit consent.',
    'When blocked — no access, contradictory requirements, risk of data loss — stop and describe the blocker with options. Never bypass restrictions or disable checks to get a green status.',
  ],
};

/** Heading of the working-rules section per answer language. */
const RULES_HEADINGS = {
  ru: 'Правила работы',
  zh: '工作规则',
  en: 'Working rules',
};

/** Marker the model must leave where the working-rules section belongs. */
const RULES_MARKER = '<!--WORKING-RULES-->';

/**
 * Insert the canonical working-rules section: replace the marker when the model
 * kept it, otherwise append the section so the rules are never lost.
 */
function withWorkingRules(text, language) {
  const heading = RULES_HEADINGS[language] || RULES_HEADINGS.en;
  const rules = STANDING_RULES[language] || STANDING_RULES.en;
  const block = ['## ' + heading].concat(rules.map((rule) => '- ' + rule)).join('\n');
  const marker = /^[ \t]*<!--\s*WORKING-RULES\s*-->[ \t]*$/m;
  if (marker.test(text)) return text.replace(marker, block);
  return text + '\n\n' + block;
}

/**
 * The rewrite instruction: preserve meaning, leave the rules marker, and return
 * only the improved prompt. The rules themselves are inserted by the Host, so
 * the model never rewrites, shortens, or drops them.
 */
function systemPrompt(language) {
  const answerLanguage = language === 'ru'
    ? 'Russian'
    : language === 'zh'
      ? 'Chinese'
      : 'English';
  const lengthGuide = language === 'zh'
    ? 'roughly 330-560 Chinese characters'
    : 'roughly 150-300 words';
  return [
    'You are a prompt engineer. Rewrite the user draft into a high-quality, structured, professional prompt.',
    'Rules:',
    "- Preserve the user's intent, constraints, and concrete details; never invent facts.",
    '- Do not answer the request. Return only the improved prompt.',
    '- Use a clear structure: role, task, requirements, working rules, output format, quality criteria.',
    '- Put the marker line ' + RULES_MARKER
      + ' exactly once, alone on its own line, between the requirements section and the output-format section. Write nothing in its place: the caller replaces it with the working-rules section.',
    '- Never write a working-rules section yourself, and never drop, move, or reformat the marker.',
    `- Keep the result concise: ${lengthGuide}.`,
    `- Write the improved prompt in ${answerLanguage}.`,
    '- If the draft contains code, keep it verbatim.',
    '- Return plain text only, with no preamble, commentary, or fence around the whole answer.',
  ].join('\n');
}

/** Stream one model rewrite and return the assembled text. */
async function rewriteWithModel(ctx, text, language, settings) {
  let llm;
  try {
    llm = ctx.get('llm');
  } catch {
    llm = undefined;
  }
  if (!llm) throw fail('NO_LLM', 'The LLM service is not available in this profile');
  let defaultModel;
  try {
    defaultModel = ctx.get('agentDefaultModel');
  } catch {
    defaultModel = undefined;
  }
  let selection;
  try {
    selection = defaultModel?.currentSelection?.();
  } catch {
    selection = undefined;
  }
  const configuredProvider = typeof settings.provider === 'string' && settings.provider.trim() !== ''
    ? settings.provider.trim()
    : undefined;
  const configuredModel = typeof settings.model === 'string' && settings.model.trim() !== ''
    ? settings.model.trim()
    : undefined;
  const provider = configuredProvider || selection?.provider;
  const model = configuredModel || selection?.model;
  if (!provider || !model) throw fail('NO_MODEL', 'No default model is selected');
  const reasoningEffort = !configuredProvider && !configuredModel
    ? selection?.reasoningEffort
    : undefined;

  const timeoutMs = Number.isFinite(settings.timeoutMs)
    ? Math.max(3000, Math.min(120000, settings.timeoutMs))
    : 45000;
  const maxTokens = Number.isFinite(settings.maxTokens)
    ? Math.max(128, Math.min(4000, settings.maxTokens))
    : 1200;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let output = '';
  try {
    for await (const chunk of llm.stream({
      provider,
      model,
      ...(reasoningEffort ? { reasoningEffort } : {}),
      system: systemPrompt(language),
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Rewrite this draft:\n\n' + text }],
        },
      ],
      temperature: 0.25,
      maxTokens,
      signal: controller.signal,
    })) {
      if (chunk.type === 'text-delta') {
        output += chunk.text;
      } else if (chunk.type === 'finish') {
        const reason = chunk.reason || {};
        if (reason.kind === 'error' || reason.kind === 'aborted') {
          const failure = reason.failure;
          const code = controller.signal.aborted && reason.kind === 'aborted'
            ? 'TIMEOUT'
            : failure?.code || (reason.kind === 'aborted' ? 'ABORTED' : 'LLM_ERROR');
          const message = failure?.message
            || (reason.kind === 'aborted' ? 'Model call was cancelled' : 'Model call failed');
          throw fail(code, message);
        }
        // A prompt cut off by the token limit looks complete but loses its tail.
        if (typeof reason.kind === 'string' && /^(length|max[_-]?tokens?)$/i.test(reason.kind)) {
          throw fail('TRUNCATED', 'Model output was cut off by the token limit');
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }

  const cleaned = stripOuterFence(output.trim());
  if (!cleaned) throw fail('EMPTY', 'The model returned an empty prompt');
  // The rules section is added by the Host, so a model cannot lose or rewrite it.
  return { text: withWorkingRules(cleaned, language), provider, model };
}

/** Handle one optimize request. */
async function handle(ctx, request, response, settings) {
  const refused = refusalStatus(ctx, request);
  if (refused !== undefined) {
    sendJson(response, refused, { ok: false, code: 'REFUSED', error: 'Request refused' });
    return;
  }
  if (request.method !== 'POST') {
    response.writeHead(405, { allow: 'POST' });
    response.end();
    return;
  }
  const contentType = String(request.headers['content-type'] || '');
  if (!contentType.toLowerCase().includes('application/json')) {
    sendJson(response, 415, { ok: false, code: 'UNSUPPORTED_MEDIA_TYPE', error: 'Expected application/json' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    const code = error && error.code;
    sendJson(response, code === 'BODY_TOO_LARGE' ? 413 : 400, {
      ok: false,
      code: code || 'INVALID_BODY',
      error: error instanceof Error ? error.message : 'Invalid body',
    });
    return;
  }

  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (text === '') {
    sendJson(response, 400, { ok: false, code: 'EMPTY_TEXT', error: 'Text is required' });
    return;
  }
  if (text.length > MAX_DRAFT_CHARS) {
    sendJson(response, 413, { ok: false, code: 'TEXT_TOO_LONG', error: 'Draft is too long' });
    return;
  }
  const language = body?.language === 'ru' || body?.language === 'zh' ? body.language : 'en';

  try {
    const result = await rewriteWithModel(ctx, text, language, settings);
    sendJson(response, 200, { ok: true, ...result });
  } catch (error) {
    const code = error && error.code ? error.code : 'LLM_ERROR';
    const status = code === 'NO_MODEL' || code === 'NO_LLM'
      ? 409
      : code === 'TIMEOUT'
        ? 504
        : 502;
    sendJson(response, status, {
      ok: false,
      code,
      error: error instanceof Error ? error.message : 'Model call failed',
    });
  }
}

export function apply(ctx, config) {
  const settings = config && typeof config === 'object' ? config : {};
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: ROUTE_PATH,
      handler: (request, response) => handle(ctx, request, response, settings),
    }),
    'dsh-prompt-optimizer: optimize route',
  );
}
