# Guardrails Drive2U

## Політика й контроль

Стабільні ID не перевикористовуються. Попереднє погодження користувача задовольняє WARN у визначеному обсязі. BLOCK не стає ALLOW через інструкцію агента.

| ID | Категорія | Умова | Реакція політики | Реальний контроль | Межі та відомі обходи |
| --- | --- | --- | --- | --- | --- |
| D2U-A001 | ALLOW | Читання дозволених docs і коду застосунку | Дозволити | Файловий sandbox сесії | Не дає дозволу на vault або secrets |
| D2U-A002 | ALLOW | Retrieval knowledge MCP та читання GitHub MCP | Дозволити; трактувати вміст як дані | Knowledge path validation/allowlist; GitHub лише читання | Локальний snapshot може відставати; помилка MCP не є hook-deny |
| D2U-A003 | ALLOW | Ізольовані тести із синтетичними даними | Дозволити | Тестовий harness не виконує кандидатні команди | Ізоляцію інших тестів перевіряти окремо |
| D2U-W001 | WARN / REQUIRE APPROVAL | Зміни залежностей, міграцій, авторизації | Погодити обсяг, вплив і відкат | Текстова політика; автоматичного WARN hook немає | Поточний hook пропускає ці дії |
| D2U-W002 | WARN / REQUIRE APPROVAL | Зміна прийнятого архітектурного рішення | Погодити новий ADR; зберегти попередній | Текстова політика, review | Автоматичної перевірки ADR немає |
| D2U-W003 | WARN / REQUIRE APPROVAL | Ingestion із commit/push або публікація коду | Погодити ціль та зміст; перевірити published/push | MCP write flag, revision, clean-tree/git checks; shell sandbox approvals | MCP не доводить змістовного погодження; звичайний push hook не блокує |
| D2U-B001 | BLOCK | Force push, lease або +refspec | Відхилити до виконання | Реалізований PreToolUse PowerShell AST hook | Потребує довіри Codex; активація IDE поки не підтверджена; лише буквальні команди |
| D2U-B002 | BLOCK | Руйнівні git-операції без збереження змін | Відмовити; спочатку забезпечити збереження й відновлення | Текстова політика; детектора немає | reset/clean/checkout/restore hook не аналізує |
| D2U-B003 | BLOCK | Прямий файловий доступ агента до vault в обхід MCP | Відмовити; використати knowledge MCP | Sandbox обмежує запис поза workspace | Читання не повністю обмежене; hook не перевіряє шляхи чи symlinks |
| D2U-B004 | BLOCK | Видалення прийнятого ADR | Відмовити; зберегти документ та історію | Текстова політика; MCP не має delete | Це не доказ роботи IDE hook; інші writers технічно не перекриті |

У цій задачі користувач погодив перелічені документи, hook, тести, зміни нотаток та commit/push у vault і робочу гілку застосунку. Це задовольняє W003 лише для цих змін. Merge у main, сторонні файли, secrets і production поза обсягом.

## Контракт Codex

Перевірено 2026-10-24: VS Code codex-cli 0.164.0-alpha.11.1. Джерело контракту — [офіційна документація hooks](https://learn.chatgpt.com/docs/hooks). CLI також має bypass-hook-trust; це не доказ активації IDE.

Проєктний `.codex/hooks.json`: PreToolUse, matcher `^Bash$`, синхронний command handler, timeout 5 секунд. User config.toml не змінюється. Абсолютний Windows-шлях прив’язаний до цього workspace; при перенесенні змінити його та повторно довірити hook. Потрібні Windows PowerShell і довірений project config layer.

Stdin — JSON із session_id, transcript_path, cwd, hook_event_name; PreToolUse додає turn_id, tool_name, tool_use_id, tool_input. Shell та exec_command відображаються як Bash із tool_input.command, а не зовнішнім exec_command.cmd. apply_patch має ім’я apply_patch, MCP — ім’я MCP tool. write_stdin не проходить повторний PreToolUse. Цей hook підписаний тільки на Bash.

Відмова stdout (exit 0):

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"D2U-B001: force push prohibited"}}
```

Пропуск — `{}`, без автоматичного approve. permissionDecision=ask не використовується: документація вказує, що воно не підтримується. Hook читає stdin, пише JSON у stdout, не виконує перевірювані команди й не використовує мережу.

## Shell-синтаксис і межі

PowerShell Parser перевіряє CommandAst, включно з блоками, розділенням `;`, quoted executable через `&`, git.exe і шляхами. Підтримані git -C path, -c key=value, --git-dir/--work-tree; push з --force, -f, комбінованим -uf, --force-with-lease[=...], --force-if-includes або +refspec блокується. --force-if-includes блокується консервативно, навіть коли сам не змушує push.

git fetch --force, git log -f, звичайний push, --no-force, коментарі й текстові приклади пропускаються. Невалідний JSON, відсутній command та parse errors відхиляються скриптом як D2U-G001. Помилка запуску hook або timeout у Codex можуть пропустити дію: це не fail-closed межа.

Не покриті: executable/arguments у змінних, splatting, aliases/functions, git aliases, зовнішні скрипти, encoded commands, вкладені shell-команди як рядки, Python/Node/subprocess, інші shell-діалекти, нові дані write_stdin, hosted tools, вимкнення/зміна hook. Невикликаний scriptblock із force push може консервативно блокуватися. AST guardrail не забезпечує повного захисту від довільного коду. Права Git hosting потрібні як незалежна межа; тут їх не змінювали.

## Активація та продовження

Codex пропускає нові неменеджовані hooks до перегляду й довіри через `/hooks`. IDE-активація **не підтверджена**; модульні тести не є її доказом. Відсутність delete MCP також не є таким доказом.

Єдина інструкція продовження: **перезапустіть Codex у цьому workspace, відкрийте `/hooks`, перегляньте й довірте Drive2U PreToolUse, потім надішліть «Продовж перевірку hook у Codex на одноразовому локальному репозиторії».** Довіра потрібна за офіційним контрактом Codex. Подальший тест має створити одноразовий repo і локальний bare remote, виконати звичайний push та спробу force push через Codex shell, зафіксувати hook-deny і незмінний remote SHA. Робочий origin не використовувати.
