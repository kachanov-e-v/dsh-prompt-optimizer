/**
 * Проверка без внешних зависимостей: собирает обе половины бандла в песочнице
 * и сверяет локальный шаблон с LLM-инструкцией.
 *
 * Запуск: node test/rules-check.mjs .
 *
 * Что проверяется:
 * - файлы не содержат смешанных переводов строк (портируемость чекаута);
 * - локальный шаблон содержит все разделы в нужном порядке и без «Контекста»;
 * - правило о русском языке есть только в блоке `ru`: у `en` и `zh` 7 пунктов,
 *   у `ru` — 9;
 * - список правил в `client.js` дословно совпадает со `STANDING_RULES` в
 *   `index.js`, а заголовки — с `RULES_HEADINGS`;
 * - правила не уходят в модель: системный промпт содержит маркер, но не тексты
 *   правил, а Host сам вставляет блок правил в ответ;
 * - определение намерения и языка работает на образцах ru / en / zh.
 *
 * Модули не импортируются напрямую: `client.js` — фабрика `__ModuleLoader__`,
 * а `index.js` — ESM с побочным экспортом, поэтому оба собираются через
 * `new Function` с заглушками.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

const root = process.argv[2] || '.';
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const clientSrc = read('client.js');
const indexSrc = read('index.js');

/** Внутри файла переводы строк должны быть одинаковыми. */
for (const [name, src] of [['client.js', clientSrc], ['index.js', indexSrc]]) {
  const crlf = (src.match(/\r\n/g) || []).length;
  const bareLf = (src.match(/(?<!\r)\n/g) || []).length;
  console.log(`EOL ${name}: CRLF=${crlf}, одиночных LF=${bareLf}`);
  assert.ok(crlf === 0 || bareLf === 0, `${name}: смешанные переводы строк`);
}

// --- Client-половина: заглушки загрузчика модулей и React -------------------
let captured;
const ReactStub = {
  createElement: () => null,
  Fragment: 'Fragment',
  useRef: () => ({ current: null }),
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
  useEffect: () => {},
};
const anchor = "    return {\n      inject: ['slots', 'locale'],";
const clientForTest = clientSrc.replace(/\r\n/g, '\n');
const injected = clientForTest.replace(
  anchor,
  '    globalThis.__dpo = { buildPrompt, detectIntent, detectLanguage, RU, EN, ZH, COPY };\n' + anchor,
);
assert.notStrictEqual(injected, clientForTest, 'client.js: не найден якорь для проверки');
new Function('window', injected)({ __ModuleLoader__: { load: (def) => { captured = def; } } });
captured.factory(() => ReactStub);
const { buildPrompt, detectIntent, detectLanguage, RU, EN, ZH, COPY } = globalThis.__dpo;
const TABLES = { ru: RU, en: EN, zh: ZH };

// --- Host-половина: экспорт снимается, скрипт выполняется как обычный код ---
const stripped = indexSrc
  .replace(/\bexport const /g, 'const ')
  .replace(/\bexport function /g, 'function ')
  + '\nglobalThis.__idx = { STANDING_RULES, RULES_HEADINGS, RULES_MARKER, withWorkingRules, systemPrompt };\n';
new Function(stripped)();
const { STANDING_RULES, RULES_HEADINGS, RULES_MARKER, withWorkingRules, systemPrompt } = globalThis.__idx;

// --- Определение намерения и языка ------------------------------------------
for (const [draft, expected] of [
  ['Напиши функцию на python с ретраями', 'code'],
  ['Сделай лендинг для кофейни', 'create'],
  ['Проанализируй рынок подписок', 'analyze'],
  ['Что такое Cordis?', 'question'],
  ['привет', 'general'],
]) {
  assert.strictEqual(detectIntent(draft), expected, `намерение для ${JSON.stringify(draft)}`);
}
assert.strictEqual(detectLanguage('Привет'), 'ru');
assert.strictEqual(detectLanguage('你好'), 'zh');
assert.strictEqual(detectLanguage('hello'), 'en');

// --- Интерфейсные строки: одинаковый набор ключей во всех языках ------------
const copyKeys = Object.keys(COPY.ru).sort();
for (const lang of ['en', 'zh']) {
  assert.deepStrictEqual(Object.keys(COPY[lang]).sort(), copyKeys, `COPY.${lang}: разный набор строк`);
}

// --- Локальный шаблон по каждому языку --------------------------------------
const drafts = {
  ru: 'Напиши функцию retry на python с экспоненциальной задержкой',
  en: 'Write a retry function in python with exponential backoff',
  zh: '用 python 写一个指数退避的重试函数',
};
const expectedRules = { ru: 9, en: 7, zh: 7 };
const sizes = {};
for (const [lang, draft] of Object.entries(drafts)) {
  const out = buildPrompt(draft);
  sizes[lang] = lang === 'zh'
    ? `${out.length} символов`
    : `${out.replace(/\s+/g, ' ').trim().split(' ').length} слов`;
  const headings = TABLES[lang].headings;
  const order = ['role', 'task', 'requirements', 'rules', 'format', 'quality'];
  const positions = order.map((key) => out.indexOf('## ' + headings[key]));
  assert.ok(positions.every((pos) => pos >= 0), `${lang}: отсутствует раздел`);
  assert.deepStrictEqual(
    positions.slice().sort((a, b) => a - b),
    positions,
    `${lang}: нарушен порядок разделов`,
  );
  assert.ok(!('context' in headings), `${lang}: раздел «Контекст» должен быть удалён`);
  const bullets = out
    .slice(out.indexOf('## ' + headings.rules), out.indexOf('## ' + headings.format))
    .split('\n')
    .filter((line) => line.startsWith('- '));
  assert.deepStrictEqual(bullets, TABLES[lang].rules.map((rule) => '- ' + rule), `${lang}: блок правил`);
  assert.strictEqual(TABLES[lang].rules.length, expectedRules[lang], `${lang}: число правил`);
}

// --- Пункт о русском языке только в блоке ru --------------------------------
assert.ok(
  RU.rules.some((rule) => rule.includes('только на русском языке')),
  'ru: нет правила об языке общения',
);
assert.ok(
  RU.rules.some((rule) => rule.includes('Весь проект веди на русском')),
  'ru: нет правила об языке проекта',
);
for (const lang of ['en', 'zh']) {
  assert.ok(
    !TABLES[lang].rules.some((rule) => /русск|Russian|俄语/.test(rule)),
    `${lang}: пункт о русском языке должен отсутствовать`,
  );
}

// --- Совпадение правил и заголовков в обеих половинах ----------------------
for (const lang of ['ru', 'en', 'zh']) {
  assert.deepStrictEqual(TABLES[lang].rules, STANDING_RULES[lang], `${lang}: правила разошлись`);
  assert.strictEqual(RULES_HEADINGS[lang], TABLES[lang].headings.rules, `${lang}: заголовки разошлись`);
}
assert.deepStrictEqual(Object.keys(TABLES).sort(), Object.keys(STANDING_RULES).sort());
assert.deepStrictEqual(Object.keys(TABLES).sort(), Object.keys(RULES_HEADINGS).sort());

// --- Правила не уходят в модель, а вставляются Host-ом ---------------------
for (const lang of ['ru', 'en', 'zh']) {
  const prompt = systemPrompt(lang);
  assert.ok(prompt.includes(RULES_MARKER), `systemPrompt(${lang}) без маркера правил`);
  for (const rule of STANDING_RULES[lang]) {
    assert.ok(!prompt.includes(rule), `systemPrompt(${lang}) не должен содержать сами правила`);
  }
  // Маркер на месте: блок встаёт между требованиями и форматом ответа.
  const heading = RULES_HEADINGS[lang];
  const sample = [
    '## Role', 'text', '',
    '## Requirements', '- item', '',
    RULES_MARKER, '',
    '## Output format', '1. item',
  ].join('\n');
  const filled = withWorkingRules(sample, lang);
  assert.ok(!filled.includes(RULES_MARKER), `${lang}: маркер не заменён`);
  assert.strictEqual(filled.split('## ' + heading).length - 1, 1, `${lang}: раздел правил не один`);
  for (const rule of STANDING_RULES[lang]) {
    assert.ok(filled.includes('- ' + rule), `${lang}: правило не попало в результат`);
  }
  const before = filled.indexOf('## Output format');
  const blockAt = filled.indexOf('## ' + heading);
  assert.ok(blockAt >= 0 && blockAt < before, `${lang}: блок правил вставлен не перед форматом ответа`);
  // Маркер потерян: правила всё равно попадают в результат.
  const appended = withWorkingRules(sample.replace(RULES_MARKER + '\n', ''), lang);
  assert.ok(appended.trimEnd().endsWith(STANDING_RULES[lang].at(-1)), `${lang}: блок не добавлен в конец`);
}

console.log('ОК: шаблон, LLM-инструкция и вставка правил проверены');
console.log('Размер шаблона (ориентир для lengthGuide): '
  + Object.entries(sizes).map(([lang, size]) => `${lang}: ${size}`).join(', '));
console.log('\n--- пример (ru, намерение=code) ---\n' + buildPrompt(drafts.ru));
