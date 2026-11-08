/**
 * Client half of the Prompt Optimizer bundle.
 *
 * Registers one compact chip in the composer tool row
 * (`conversation.input.left`). The chip rewrites the current draft either with
 * the selected model (through the Host route) or with the local template, then
 * writes the result back through the composer's own `inputActions`. Clicking
 * the chip again restores the original draft.
 */
window.__ModuleLoader__.load({
  id: 'dsh-prompt-optimizer',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const en = {
      'action.optimize': 'Improve',
      'action.restore': 'Restore',
      'title.optimize': 'Rewrite this draft with the selected model into a professional, structured prompt',
      'title.restore': 'Restore the original draft',
      'aria.optimize': 'Improve prompt',
      'aria.restore': 'Restore original prompt',
      'mode.llm': 'LLM',
      'mode.template': 'Template',
      'mode.title': 'Improvement mode: model rewrite or local template',
      'busy': 'Improving…',
      'fallback': 'The model is unavailable — the template was applied',
      'changed': 'The draft changed while the model was working; the result was not applied',
      'llm.title': 'Rewrite the draft with the selected model',
      'template.title': 'Structure the draft with the local template, without a model call',
    };

    const zh = {
      'action.optimize': '优化',
      'action.restore': '还原',
      'title.optimize': '用所选模型将草稿改写为专业、结构化的提示词',
      'title.restore': '恢复原始草稿',
      'aria.optimize': '优化提示词',
      'aria.restore': '恢复原始提示词',
      'mode.llm': 'LLM',
      'mode.template': '模板',
      'mode.title': '优化模式：模型改写或本地模板',
      'busy': '优化中…',
      'fallback': '模型不可用，已应用模板',
      'changed': '模型处理期间草稿已更改，结果未应用',
      'llm.title': '用所选模型改写草稿',
      'template.title': '用本地模板结构化草稿，不调用模型',
    };

    const ru = {
      'action.optimize': 'Улучшить',
      'action.restore': 'Вернуть',
      'title.optimize': 'Переписать черновик выбранной моделью в профессиональный структурированный запрос',
      'title.restore': 'Вернуть исходный черновик',
      'aria.optimize': 'Улучшить запрос',
      'aria.restore': 'Вернуть исходный запрос',
      'mode.llm': 'LLM',
      'mode.template': 'Шаблон',
      'mode.title': 'Режим улучшения: переписывание моделью или локальный шаблон',
      'busy': 'Улучшаю…',
      'fallback': 'Модель недоступна — применён шаблон',
      'changed': 'Черновик изменился во время работы модели — результат не применён',
      'llm.title': 'Переписать черновик выбранной моделью',
      'template.title': 'Структурировать черновик локальным шаблоном без вызова модели',
    };

    const COPY = { en, zh, ru };

    const CSS = [
      '.dpo-wrap{display:inline-flex;align-items:center;gap:2px;position:relative}',
      '.dpo-chip{display:inline-flex;align-items:center;gap:4px;height:28px;min-width:34px;padding:0 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;font-weight:500;line-height:20px;cursor:pointer;transition:background-color .12s,color .12s;white-space:nowrap}',
      '.dpo-chip:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dpo-chip:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.dpo-chip:disabled{opacity:.5;cursor:default}',
      '.dpo-chip[data-done="true"]{color:var(--dsw-alias-state-success-primary)}',
      '.dpo-chip[data-done="true"]:hover:not(:disabled){color:var(--dsw-alias-state-success-primary)}',
      '.dpo-icon{width:14px;height:14px;flex:none;display:inline-flex}',
      '.dpo-mode{height:22px;padding:0 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:18px;cursor:pointer;white-space:nowrap}',
      '.dpo-mode:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}',
      '.dpo-mode:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.dpo-mode:disabled{opacity:.5;cursor:default}',
      '.dpo-notice{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-warn-primary);flex:none;display:inline-block}',
      '@media (max-width:520px){.dpo-label{display:none}}',
    ].join('\n');

    const MODE_KEY = 'dsh-prompt-optimizer:mode';

    function readMode() {
      try {
        return localStorage.getItem(MODE_KEY) === 'template' ? 'template' : 'llm';
      } catch {
        return 'llm';
      }
    }

    function writeMode(mode) {
      try {
        localStorage.setItem(MODE_KEY, mode);
      } catch {
        /* Storage is unavailable; the mode still works for this mount. */
      }
    }

    /** Resolve the host route against the UI's mount point, like other bundles. */
    function apiPath(path) {
      const relative = path.replace(/^\/+/, '');
      if (typeof document === 'undefined') return '/' + relative;
      return new URL(relative, document.baseURI).pathname;
    }

    function detectLanguage(text) {
      if (/[\u0400-\u04FF]/.test(text)) return 'ru';
      if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';
      return 'en';
    }

    function detectIntent(text) {
      const lower = text.toLowerCase();
      if (
        /```|<\?php|\bfunction\b|\bclass\b|\bconst\b|\bimport\b|\bdef\b|ошибк|баг|код|скрипт|\bapi\b|\bsql\b|regex|python|javascript|typescript|react|node\.?js|css|html|\.js\b|\.ts\b|\.py\b|代码|编程|脚本|函数|接口|数据库|报错|异常|错误/.test(
          lower,
        )
      ) {
        return 'code';
      }
      if (
        /создай|сделай|напиши|разработай|построй|спроектируй|\bbuild\b|\bcreate\b|\bmake\b|\bwrite\b|\bdesign\b|\bimplement\b|\bgenerate\b|创建|设计|实现|开发|编写|生成|搭建/.test(
          lower,
        )
      ) {
        return 'create';
      }
      if (
        /проанализируй|объясни|сравни|оцени|разбери|analy[sz]e|explain|compare|evaluate|review|research|分析|解释|比较|评估|评审|研究/.test(
          lower,
        )
      ) {
        return 'analyze';
      }
      if (
        /\?|？|^(что|как|почему|зачем|когда|где|кто|какой|какая|какие|сколько|можно|стоит|what|how|why|when|where|who|which|should|can|is|are|does|do)\b|如何|怎么|怎样|为什么|何时|哪里|哪个|多少|能否/.test(
          lower,
        )
      ) {
        return 'question';
      }
      return 'general';
    }

    function cleanDraft(raw) {
      const source = String(raw || '');
      let text = source
        .replace(/\r\n?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (!/```/.test(source)) text = text.replace(/[ \t]+/g, ' ');
      return text;
    }

    const RU = {
      role: {
        code: 'Ты — senior software engineer. Давай production-ready решения, учитывай граничные случаи, безопасность и производительность.',
        create: 'Ты — опытный специалист по продукту и разработке. Предлагай продуманные, практичные решения.',
        analyze: 'Ты — аналитик. Опирайся на факты, явно отделяй допущения от выводов и делай однозначную рекомендацию.',
        question: 'Ты — компетентный эксперт по теме запроса. Отвечай точно, по существу и без общих фраз.',
        general: 'Ты — опытный эксперт. Работай профессионально, структурно и по существу.',
      },
      requirements: {
        code: [
          'Соблюдай лучшие практики, обрабатывай ошибки и граничные случаи.',
          'Приведи рабочий код с краткими пояснениями.',
          'Укажи зависимости и шаги запуска, если они нужны.',
        ],
        create: [
          'Предложи конкретный результат и план действий, а не общие рассуждения.',
          'Сформулируй ключевые допущения.',
          'Добавь пример или макет, если это уместно.',
        ],
        analyze: [
          'Сравни варианты по явным критериям.',
          'Отдели факты от предположений.',
          'Сделай однозначный вывод и рекомендацию.',
        ],
        question: [
          'Дай прямой ответ в первом абзаце.',
          'Объясни причины и приведи пример.',
          'Укажи ограничения и случаи, когда ответ не применим.',
        ],
        general: [
          'Будь конкретен и избегай общих фраз.',
          'Приведи примеры и практические шаги.',
          'Если данных недостаточно, задай не более трёх уточняющих вопросов.',
        ],
      },
      format: {
        code: ['1. Краткое решение', '2. Код', '3. Пояснения и граничные случаи', '4. Как проверить'],
        create: ['1. Понимание задачи', '2. Предлагаемое решение', '3. План реализации', '4. Пример или макет', '5. Следующие шаги'],
        analyze: ['1. Краткий вывод', '2. Критерии и сравнение', '3. Обоснование', '4. Рекомендация'],
        question: ['1. Прямой ответ', '2. Объяснение', '3. Пример', '4. Ограничения'],
        general: ['1. Краткое понимание задачи', '2. Ответ по шагам', '3. Примеры', '4. Следующие шаги'],
      },
      context: 'Отвечай на русском языке. Сохрани исходный смысл запроса и не добавляй лишних требований.',
      quality: ['Полнота и точность.', 'Ясная структура и профессиональный тон.', 'Практическая применимость.'],
      headings: {
        role: 'Роль',
        task: 'Задача',
        context: 'Контекст',
        requirements: 'Требования',
        format: 'Формат ответа',
        quality: 'Критерии качества',
      },
    };

    const EN = {
      role: {
        code: 'You are a senior software engineer. Produce production-ready solutions and account for edge cases, security, and performance.',
        create: 'You are an experienced product and engineering specialist. Propose a thoughtful, practical solution.',
        analyze: 'You are an analyst. Rely on facts, separate assumptions from conclusions, and make an unambiguous recommendation.',
        question: 'You are a competent expert on the topic. Answer precisely, substantively, and without filler.',
        general: 'You are an experienced expert. Work professionally, in a structured way, and to the point.',
      },
      requirements: {
        code: [
          'Follow best practices and handle errors and edge cases.',
          'Provide working code with brief explanations.',
          'List dependencies and run steps when needed.',
        ],
        create: [
          'Propose a concrete result and action plan, not general discussion.',
          'State the key assumptions.',
          'Include an example or mockup when appropriate.',
        ],
        analyze: [
          'Compare options against explicit criteria.',
          'Separate facts from assumptions.',
          'Give a clear conclusion and recommendation.',
        ],
        question: [
          'Give the direct answer in the first paragraph.',
          'Explain the reasons and give an example.',
          'State limitations and cases where the answer does not apply.',
        ],
        general: [
          'Be concrete and avoid generic filler.',
          'Provide examples and practical steps.',
          'If information is insufficient, ask at most three clarifying questions.',
        ],
      },
      format: {
        code: ['1. Brief solution', '2. Code', '3. Explanation and edge cases', '4. How to verify'],
        create: ['1. Understanding of the task', '2. Proposed solution', '3. Implementation plan', '4. Example or mockup', '5. Next steps'],
        analyze: ['1. Brief conclusion', '2. Criteria and comparison', '3. Rationale', '4. Recommendation'],
        question: ['1. Direct answer', '2. Explanation', '3. Example', '4. Limitations'],
        general: ['1. Brief understanding of the task', '2. Step-by-step answer', '3. Examples', '4. Next steps'],
      },
      context: 'Answer in English. Preserve the original intent and do not add requirements the user did not ask for.',
      quality: ['Completeness and accuracy.', 'Clear structure and professional tone.', 'Practical applicability.'],
      headings: {
        role: 'Role',
        task: 'Task',
        context: 'Context',
        requirements: 'Requirements',
        format: 'Output format',
        quality: 'Quality criteria',
      },
    };

    const ZH = {
      role: {
        code: '你是一名资深软件工程师。给出可用于生产环境的方案，考虑边界情况、安全性和性能。',
        create: '你是一名经验丰富的产品与工程专家。提出周全、可落地的方案。',
        analyze: '你是一名分析师。以事实为依据，明确区分假设与结论，并给出明确的建议。',
        question: '你是该主题的资深专家。回答准确、切题，不空泛。',
        general: '你是一名经验丰富的专家。以专业、结构化且切题的方式工作。',
      },
      requirements: {
        code: [
          '遵循最佳实践，处理错误和边界情况。',
          '提供可运行的代码，并附简要说明。',
          '如有需要，列明依赖和运行步骤。',
        ],
        create: [
          '给出具体成果和行动计划，而不是泛泛而谈。',
          '说明关键假设。',
          '适当时附上示例或草图。',
        ],
        analyze: [
          '按明确的标准比较各个选项。',
          '区分事实与假设。',
          '给出明确的结论和建议。',
        ],
        question: [
          '在第一段给出直接答案。',
          '解释原因并给出示例。',
          '说明局限性和不适用的场景。',
        ],
        general: [
          '具体明确，避免空话。',
          '提供示例和可执行的步骤。',
          '如果信息不足，最多提出三个澄清问题。',
        ],
      },
      format: {
        code: ['1. 简要方案', '2. 代码', '3. 说明与边界情况', '4. 验证方法'],
        create: ['1. 任务理解', '2. 建议方案', '3. 实施计划', '4. 示例或草图', '5. 后续步骤'],
        analyze: ['1. 简要结论', '2. 标准与对比', '3. 依据', '4. 建议'],
        question: ['1. 直接答案', '2. 解释', '3. 示例', '4. 局限性'],
        general: ['1. 任务简述', '2. 分步回答', '3. 示例', '4. 后续步骤'],
      },
      context: '用中文回答。保留原始意图，不要添加用户未要求的额外要求。',
      quality: ['完整与准确。', '结构清晰，语气专业。', '具备实际可操作性。'],
      headings: {
        role: '角色',
        task: '任务',
        context: '背景',
        requirements: '要求',
        format: '回答格式',
        quality: '质量标准',
      },
    };

    function buildPrompt(raw) {
      const text = cleanDraft(raw);
      if (!text) return '';
      const language = detectLanguage(text);
      const intent = detectIntent(text);
      const copy = language === 'ru' ? RU : language === 'zh' ? ZH : EN;
      const headings = copy.headings;

      return [
        '## ' + headings.role,
        copy.role[intent],
        '',
        '## ' + headings.task,
        text,
        '',
        '## ' + headings.context,
        copy.context,
        '',
        '## ' + headings.requirements,
        copy.requirements[intent].map((item) => '- ' + item).join('\n'),
        '',
        '## ' + headings.format,
        copy.format[intent].join('\n'),
        '',
        '## ' + headings.quality,
        copy.quality.map((item) => '- ' + item).join('\n'),
      ].join('\n');
    }

    function SparkleIcon() {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: 14,
          height: 14,
          className: 'dpo-icon',
          'aria-hidden': true,
          fill: 'none',
          xmlns: 'http://www.w3.org/2000/svg',
        },
        h('path', {
          d: 'M8 1.8l1.25 3.1L12.4 6.2l-3.15 1.3L8 10.6 6.75 7.5 3.6 6.2l3.15-1.3L8 1.8z',
          fill: 'currentColor',
        }),
        h('path', {
          d: 'M12.6 10.2l.65 1.6 1.65.65-1.65.65-.65 1.6-.65-1.6-1.65-.65 1.65-.65.65-1.6z',
          fill: 'currentColor',
          opacity: 0.7,
        }),
        h('path', {
          d: 'M3.4 9.4l.5 1.25 1.3.5-1.3.5-.5 1.25-.5-1.25-1.3-.5 1.3-.5.5-1.25z',
          fill: 'currentColor',
          opacity: 0.55,
        }),
      );
    }

    function apply(ctx) {
      /** Resolve the UI copy from the locale service's active language id. */
      function currentLanguage() {
        let active = 'en';
        try {
          active = String(ctx.locale.getLocale().active || 'en').toLowerCase();
        } catch {
          /* Keep the English fallback. */
        }
        if (active.indexOf('ru') === 0) return 'ru';
        if (active.indexOf('zh') === 0) return 'zh';
        return 'en';
      }

      function PromptOptimizerChip(props) {
        const useInput = props.useInput;
        const inputActions = props.inputActions;
        const draft = useInput((state) => (state ? state.draft : ''));
        const phase = useInput((state) => (state ? state.phase : undefined));
        const lastRef = React.useRef(null);
        const draftRef = React.useRef(draft);
        const abortRef = React.useRef(null);
        const aliveRef = React.useRef(true);
        const [done, setDone] = React.useState(false);
        const [busy, setBusy] = React.useState(false);
        const [mode, setMode] = React.useState(readMode);
        const [notice, setNotice] = React.useState(null);
        const [lang, setLang] = React.useState(currentLanguage);

        draftRef.current = draft;

        React.useEffect(() => {
          const update = () => setLang(currentLanguage());
          update();
          return ctx.locale.subscribe(update);
        }, []);

        React.useEffect(() => {
          aliveRef.current = true;
          return () => {
            aliveRef.current = false;
            if (abortRef.current) abortRef.current.abort();
          };
        }, []);

        const copy = COPY[lang] || COPY.en;

        React.useEffect(() => {
          const last = lastRef.current;
          if (last && draft !== last.result) {
            lastRef.current = null;
            setDone(false);
          }
        }, [draft]);

        const empty = !draft || !draft.trim();
        const machineBusy = phase === 'adjudicating' || phase === 'submitting' || phase === 'sending';
        const disabled = empty || machineBusy;

        const applyResult = (result, original) => {
          if (!result) return;
          lastRef.current = { original, result };
          inputActions.setDraft(result);
          setDone(true);
          setNotice(null);
        };

        const toggleMode = () => {
          if (busy) return;
          const next = mode === 'llm' ? 'template' : 'llm';
          setMode(next);
          writeMode(next);
          setNotice(null);
        };

        const onClick = async () => {
          if (disabled || busy || !inputActions) return;
          const last = lastRef.current;
          if (last && draft === last.result) {
            inputActions.setDraft(last.original);
            lastRef.current = null;
            setDone(false);
            setNotice(null);
            return;
          }

          const original = draft;
          if (mode === 'template') {
            applyResult(buildPrompt(original), original);
            return;
          }

          setBusy(true);
          setNotice(null);
          const controller = new AbortController();
          abortRef.current = controller;
          try {
            const response = await fetch(apiPath('/dsh-prompt-optimizer/optimize'), {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ text: original, language: detectLanguage(original) }),
              signal: controller.signal,
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload || payload.ok !== true || typeof payload.text !== 'string') {
              const error = new Error(
                (payload && (payload.error || payload.code)) || 'HTTP ' + response.status,
              );
              error.code = payload && payload.code;
              throw error;
            }
            if (!aliveRef.current) return;
            if (draftRef.current !== original) {
              setNotice(copy.changed);
              return;
            }
            applyResult(payload.text.trim(), original);
          } catch (error) {
            if (controller.signal.aborted || !aliveRef.current) return;
            if (draftRef.current !== original) {
              setNotice(copy.changed);
              return;
            }
            const fallback = buildPrompt(original);
            if (fallback) {
              applyResult(fallback, original);
              setNotice(copy.fallback);
            }
            if (error && (error.code === 'NO_MODEL' || error.code === 'NO_LLM')) {
              setMode('template');
              writeMode('template');
            }
          } finally {
            if (aliveRef.current) setBusy(false);
            abortRef.current = null;
          }
        };

        const label = busy
          ? copy.busy
          : done
            ? copy['action.restore']
            : copy['action.optimize'];
        const title = busy
          ? copy.busy
          : done
            ? copy['title.restore']
            : mode === 'llm'
              ? copy['llm.title']
              : copy['template.title'];

        return h(
          React.Fragment,
          null,
          h('style', { key: 'dpo-style' }, CSS),
          h(
            'span',
            { key: 'wrap', className: 'dpo-wrap' },
            h(
              'button',
              {
                type: 'button',
                className: 'dpo-chip',
                'data-done': done ? 'true' : 'false',
                disabled: disabled || busy,
                title,
                'aria-label': copy[done ? 'aria.restore' : 'aria.optimize'],
                onClick,
              },
              h(SparkleIcon, { key: 'icon' }),
              h('span', { key: 'label', className: 'dpo-label' }, label),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dpo-mode',
                disabled: busy,
                title: copy['mode.title'],
                'aria-label': copy['mode.title'],
                onClick: toggleMode,
              },
              mode === 'llm' ? copy['mode.llm'] : copy['mode.template'],
            ),
            notice
              ? h('span', {
                  key: 'notice',
                  className: 'dpo-notice',
                  role: 'status',
                  'aria-label': notice,
                  'aria-live': 'polite',
                  title: notice,
                })
              : null,
          ),
        );
      }

      ctx.slots.inject('conversation.input.left', () =>
        ctx.slots.register(
          {
            name: 'conversation.input.left',
            id: 'prompt-optimizer',
            order: 100,
            label: () => COPY[currentLanguage()]['action.optimize'],
          },
          PromptOptimizerChip,
        ),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    };
  },
});
