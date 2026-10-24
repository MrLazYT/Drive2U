# Виправлення YAML frontmatter — 2026-10-24

Проміжний результат: код конектора 1.3.1 перевірений; активний MCP у цій сесії
ще 1.3.0. Реальне читання після перезапуску й відкладена синхронізація
Backend-API не завершені. Попередні журнали блокера збережені.

## Стан і джерела

Старт: feat/backend-fare-orchestration, SHA
`7147aba786978b2aec6411294d5837313d2b7dde`; створено feat/fix-knowledge-yaml.
Сторонні README (1).md deletion, pyc modification, hook-probe, .tmp-skills і
.codex/hook-probe-path.txt збережені без reset/stash і виключені з коміту.
STDIO test child міг додатково оновити вже змінений tracked pyc: `-B`
батьківського Python не успадковується як CLI-параметр дочірнього процесу.
Cache не відновлювався руйнівно й не включається до коміту.
AGENTS.md пошуком не знайдено. Прочитані knowledge.py, server.py, обидва
тестові файли, README/VERIFICATION, docs/skills-verification.md, результати
docs/orchestration/backend-fare/, ЗАВДАННЯ.md, вимоги app/harness, ontology,
guardrails та обидва SKILL.md. Server API і hooks/config не змінювались.

## Реальні MCP-виклики до перезапуску

health_check: version=1.3.0, write_enabled=true, writer_busy=false,
pending_push=false; dirty=null і git_status=not_checked_by_health не доводять
clean tree або свіжість origin. Послідовні get_note виконані один раз:

| Ціль | Фактичний результат | Revision успішного get або MCP search |
| --- | --- | --- |
| Conventions.md | успіх | b76b8bd81aa1b01de2d3ac549dee6cc861891f84092423884a9d114e81d580e1 |
| Components/Knowledge-Connector.md | успіх | 7a8dbb9972255daa2645700e399f0a0a71210b6ed99699cd3220990e73236664 |
| Components/Backend-API.md | INVALID_YAML | 496beff9611b6b4b53dcd64eb296647dd05031c80f4a4f0c928f87f8684ba174 (search) |
| Concepts/Fare-Quote.md | INVALID_YAML | 88414eb06f1e3070122e07ff54f27ef804904edc446dfe4d6b3d65f36368aba1 (search) |
| Concepts/Route.md | INVALID_YAML | 610431d2ef5c12ee7db70cbaa35850558077a3cd62c3474b2f591086780cdd48 (search) |

Після зміни коду health_check викликано ще раз і він повернув 1.3.0:
активний процес не оновився. Безрезультатні get_note не повторювалися.

## Дві відокремлені причини

Підтверджений дефект коду: `text.split('---', 2)` сприймав будь-яке входження
як closing fence. У валідному синтетичному `source: "docs/example---reference.md"`
це обрізало YAML усередині лапок і спричиняло INVALID_YAML. Не взяте в лапки
значення могло мовчки обрізати source і перенести суфікс у body — попередня
знахідка R1. Новий парсер шукає лише окремий рядок `---`.

Окремі дані реальних нотаток: через search_notes(query=Backend-API/Fare-Quote/Route,
limit=20) отримані уривки з повним frontmatter. У кожному рядки 7–8 перед
`- drive2u` та типом містять U+00A0 (NBSP) замість звичайного YAML-відступу.
У показаному metadata немає внутрішнього `---`. Синтетичний аналог із NBSP
дає INVALID_YAML і в 1.3.1; цей тест збережено. Отже виправлення fence-дефекту
не є доказом усунення цих трьох реальних помилок. Немає автоматичної заміни
NBSP, видалення metadata або приховування YAML-помилок.

## Red/green і повний suite

Усі команди — `harness/knowledge-mcp/.venv/Scripts/python.exe -B`, без
встановлення залежностей. Репозиторійні тести використовують окремі
тимчасові app/vault/bare remote; transport явно задає ці корені. Робочий vault
не відкривався файловими/git-засобами. Чисті parser unit cases — синтетичні рядки.

```text
-m pytest harness/knowledge-mcp/tests/test_knowledge.py::test_frontmatter_delimiter_inside_quoted_source -q -p no:cacheprovider --basetemp .tmp-yaml-red --tb=short
До зміни knowledge.py: 1 failed in 1.48s; KnowledgeError INVALID_YAML саме у parse_note.
-m pytest harness/knowledge-mcp/tests/test_knowledge.py -k 'frontmatter_delimiter or parse_note' -q -p no:cacheprovider --basetemp .tmp-yaml-green-final --tb=short
Після виправлення: 11 passed, 33 deselected in 1.34s.
-m pytest harness/knowledge-mcp/tests -q -ra -p no:cacheprovider --basetemp .tmp-yaml-full --tb=short
42 passed, 3 skipped in 81.68s.
```

Проміжний green-запуск виявив 4 failures збереження кінцевого переносу YAML
block scalar. Перед завершенням YAML-сегмента повернено кінцевий LF; повтор
пройшов. Жоден тест не вимкнено. Покриті quoted source, body `---`, LF/CRLF,
BOM, block scalar, missing fences, malformed YAML і missing metadata.
Transport перевіряє version=1.3.1, source з `---`, body fence, створення,
readback, unchanged, revisions, заборонені шляхи та Conventions update.
Пропуски: Windows symlink без дозволу ОС й два POSIX process-group cases;
Windows taskkill і symlink acceptance не підтверджені.

## Рев’ю через drive2u-review

Застосовано координатором цієї сесії, без окремого subagent. Предмет:
knowledge.py, server.py, tests/test_knowledge.py, tests/test_mcp_transport.py
і пов’язана документація; base `7147aba786978b2aec6411294d5837313d2b7dde`.
Прочитані зазначені вище локальні вимоги, Conventions/Knowledge-Connector
через get_note та релевантні MCP search-дані з revisions у таблиці.

Перевірені точні fences, збереження metadata/body/block scalar, LF/CRLF/BOM,
явні errors, незмінність шляхів/required keys/revisions/writer lock/git lifecycle,
ізоляція test repos і STDIO-контракт. D2U-A001/A002/A003 дотримано; W003
задоволено запитом для цільових commit/push; залежності/auth/ADR не змінені,
force push/руйнівного git/filesystem vault обходу немає. Нових підтверджених
P1/P2/P3 знахідок у виправленні немає. Залишковий NBSP і стара active version
не приховані й обмежують висновок щодо реальних нотаток.

`git diff --check` — exit 0. Hash diff трьох змінених Python/test файлів
до й після read-only review: `6b1c071e603387b67a7ba51fd5822034f40ca7fb`.
`git diff --exit-code -- harness/knowledge-mcp/server.py server .codex/hooks.json`
не виявив змін; предмет під час рев’ю не редагувався. Після рев’ю дописані
лише докази в документації. Повний suite — 42/3 як наведено вище.

## Продовження після перезапуску MCP

1. Дочекатися завершення поточної роботи й збереження commit/push. Не вбивати
   активний MCP посеред виклику; не видаляти lock або pending markers.
2. У Codex IDE відкрити gear → MCP servers і виконати Restart extension, якщо
   кнопка доступна. Альтернатива — закрити VS Code повністю й відкрити знову
   `D:/Projects/react-native/Drive2U`. Конфігурацію/hook trust не змінювати.
   [Офіційна інструкція MCP](https://learn.chatgpt.com/docs/extend/mcp)
   описує Restart extension для IDE.
3. У новій сесії, залишившись у feat/fix-knowledge-yaml, надіслати:

```text
Продовж задачу feat/fix-knowledge-yaml за docs/knowledge-yaml-fix.md.
Перевір git status, не чіпай сторонні зміни. Через drive2u_knowledge виклич
health_check: потрібна version=1.3.1. Якщо версія стара, зупинись із діагностикою.
Послідовно прочитай Conventions.md, Components/Knowledge-Connector.md,
Components/Backend-API.md, Concepts/Fare-Quote.md, Concepts/Route.md.
За INVALID_YAML не обходь MCP і не переписуй нотатки наосліп; відділи залишкові
помилки від виправлених. Перевір зафіксований NBSP у tags через MCP-дані.
Лише після успішного get_note Backend-API застосуй $drive2u-sync-knowledge
за кодом 7147aba786978b2aec6411294d5837313d2b7dde: збережи попередній текст,
зв’язки й нереалізовані інтеграції, додай API/decimal/server tariff/UAH/validation
та історичні 37 тестів; не називай estimate Fare-Quote або весь компонент готовим.
Використай свіжу expected_revision; перевір published, readback і точний
unchanged без нового коміту. За потреби онови Knowledge-Connector за чинним
дозволом. Додай датовані фактичні результати, commit/push цієї гілки; без main merge.
```

Якщо NBSP/INVALID_YAML збережеться, потрібна діагностика власника vault:
перевірка рядків frontmatter 1–10 з відображенням Unicode-відступів і
повідомлення YAML loader з line/column/problem без секретів. Власник може
погоджено виправити лише відступи, зберігши повний вміст/metadata/зв’язки;
агент не робив цього через filesystem. Далі потрібен успішний get_note.
Пошуковий excerpt недостатній для безпечної заміни повного тіла Backend-API.

## Стан відкладеної синхронізації

Не запускалася: успішного get_note Backend-API та актуальної read revision
немає. ingest_note не викликався; vault commit відсутній, published/readback/
unchanged не перевірені. Так само Knowledge-Connector не переписувався:
не слід оголошувати активний MCP оновленим до перевірки нової сесії.
Це не успішне завершення всієї задачі; серверна реалізація не втрачена.
