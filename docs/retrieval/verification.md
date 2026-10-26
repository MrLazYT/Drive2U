# Semantic retrieval verification

Work in progress. No evaluation or implementation success is claimed here.

Initial app SHA: `d13931d4b87eae022ae54898e90c218c70f5807e`.
Branch created from `feat/fix-knowledge-yaml`: `feat/semantic-retrieval`.
Active MCP health: 1.3.1, 19 notes, writes enabled, writer idle, no pending push.
Corpus HEAD through MCP: `311d1a76802a0a75090381caff8073eeb4bffab2`.
Backend-API revision: `bf39934c5ed3ae3a8d890517f3f04802a08ff1422c14335ae3efcd8c1459d586`.
Readback confirms the partial calculator at app SHA 7147aba and distinguishes it from Fare-Quote.

Sandbox commands fail before execution with `setup refresh had errors`.
Local inspection used individually approved elevated commands; no filesystem vault access.
Root AGENTS.md is absent; repository discovery found ЗАВДАННЯ.md.

Pre-existing changes, excluded from this task: deleted `harness/knowledge-mcp/README (1).md`,
modified tracked `__pycache__/knowledge.cpython-313.pyc`, `.codex/hook-probe-path.txt`,
`.tmp-skills-repro.py`, `.tmp-skills-verification/`, `.tmp-yaml-*`, `hook-probe-*`.
No reset, restore, clean or merge was performed.

## Continuation inspection — 2026-10-26

This continuation found the branch and implementation/baseline already present.
`git reflog` confirms checkout from feat/fix-knowledge-yaml to
feat/semantic-retrieval at the same d13931d base. The branch was not recreated or reset.
Initial active health here was1.4.0, not the1.3.1 recorded by the earlier baseline.
MCP Conventions revision a1c673177135b4f29f7bf92f397e28da7a639633ed8d761d4fce418ea435da6d;
Knowledge-Connector eb6effe3c7482968bbb1f109d863e981d927bc374a36b98839bfcbfdea58c7ff.
Backend-API current readback and all evaluation revision checks confirm the completed
YAML recovery and prior calculator sync. No filesystem/git tools opened the vault.

Read ЗАВДАННЯ.md, app/harness requirements, ontology, guardrails, skills,
knowledge-yaml-fix, both available repository SKILL.md files, orchestration README,
roles and schema; inspected connector source, dependencies, tests and README.
Root AGENTS.md is absent. No hooks/global config/GitHub MCP configuration changed.

## Provisioning

Python3.13.15 Windows AMD64; SQLite3.50.4. Existing target .venv already had direct
dependencies installed; this continuation inspected versions and wrote pip freeze
to requirements-lock.txt. No paid API or credentials were used. Official model
card/file listing, Sentence Transformers installation and Python SQLite docs were
checked; links and decision are in design.md. MIT/public model name, pinned revision
and approximately493MB size announced before `prepare_model.py` download.
Actual files:470641600-byte safetensors,17082730-byte tokenizer JSON,
5069051-byte sentencepiece model, plus small config files. Download30.7351165s.

```powershell
$env:DRIVE2U_APP_ROOT='D:/Projects/react-native/Drive2U'
$env:HF_HUB_DISABLE_TELEMETRY='1'
harness/knowledge-mcp/.venv/Scripts/python.exe -B harness/knowledge-mcp/prepare_model.py
harness/knowledge-mcp/.venv/Scripts/python.exe -B -m pip freeze
```

Model loading uses offline local safetensors and trust_remote_code=False.
Standalone synthetic embedding succeeded. Model weights/index/.venv are ignored.
The local derived index contains note text and must inherit vault confidentiality;
it is not a second authorized agent-reading channel. Evaluation uses only MCP data.

## Tests and actual failures

All pytest commands use the target .venv, `-B`, `-q -ra -p no:cacheprovider --tb=short`
unless explicitly noted. Tests create their own synthetic app/vault/bare remotes;
the real-model smoke copies public weights once and uses only two synthetic notes.

* An initial test invocation was queued after a300s MCP await; a second invocation
  accidentally reused `.tmp-retrieval-suite`. Their concurrent setup interfered:
  63 passed,3 skipped,2 setup errors in79.56s; second run interrupted. This was a
  runner mistake, not a valid test failure/success. No assertions were disabled.
* Clean repeat `-m pytest harness/knowledge-mcp/tests --basetemp .tmp-retrieval-final-01`:
  **64 passed,4 skipped in81.69s**. Windows OS symlink privileges and two POSIX
  process-group cases skipped. Windows taskkill behavior is not proven.
* Final complete repeat after startup fix and new opt-in test:
  `-m pytest harness/knowledge-mcp/tests --basetemp .tmp-retrieval-final-02`:
  **64 passed,5 skipped in86.00s**. Fifth skip is the explicitly opt-in real-model
  smoke, which passed separately as recorded below. `git diff --check`: exit0.
* Real STDIO before startup fix hung. A temporary test-only faulthandler wrapper
  showed native import stuck in numpy `_core/multiarray.py` at create_module while
  AnyIO reader threads were running. NumPy-only eager import moved the hang into
  scipy/linalg/blas.py. Standalone main-process imports worked.
* One diagnostic wrapper run failed `ModuleNotFoundError: knowledge` due missing
  sys.path; fixed the test wrapper before continuing. These were real failures,
  not hidden passes. The wrapper was removed from final tests.
* Windows startup now imports Sentence Transformers dependencies before mcp.run
  creates STDIO readers, without constructing/loading a model or indexing.
  Diagnostic synthetic real smoke `.tmp-retrieval-real-05`: **1 passed in22.47s**.
* Final ordinary server.py STDIO, no diagnostic wrapper:
  `KNOWLEDGE_REAL_MODEL_TEST=1`, `-m pytest harness/knowledge-mcp/tests/test_semantic_stdio.py -q -s -ra -p no:cacheprovider --basetemp .tmp-retrieval-real-final --tb=short`:
  **1 passed in22.62s**. Initialize/startup14820.580ms; first search including
  model weights and synthetic index4449.732ms; loaded-model search42.251ms.
  These are two synthetic notes, not the19-note evaluation corpus.

The real smoke validates Ukrainian documents with an English recovery query,
semantic mode, cosine field, correct nearest note, current full-note revision,
persistent repeat0changed/0removed, empty/limit errors and traversal denial over
actual MCP/STDIO. Health before search leaves the index absent. Unit fake vectors
test lifecycle/freshness/corruption, not multilingual quality.

## Active MCP, evaluation and GitHub

Original root first semantic search returned tools/call timeout300s; concurrent
agent searches returned explicit SEMANTIC_INDEX_BUSY. No lock was deleted. The
same original process subsequently became ready, built117chunks and answered all
ten evaluation requests. Warm external MCP wall times237–296ms, mean261.2ms.
Text baseline47–67ms, mean56.7ms. Cold failure is saved in semantic.json, separate
from warm results. No successful initial full-corpus build duration is claimed.

Both responders use separate fresh contexts and identical instructions; raw packets,
outputs and scoring code retained. Full semantic note_revisions equality against
baseline's19-note manifest is asserted by score_evaluation.py. Corpus was frozen
through comparison and role reviews. Questions/criteria were never retuned.

Official `drive2u_github.get_commit(owner=MrLazYT, repo=Drive2U,
sha=d13931d4b87eae022ae54898e90c218c70f5807e, detail=none)` succeeded in this
continuation. Existing github-mcp.json also records the baseline read. Configuration
was unchanged. No GitHub write or merge was performed.

## Skills, roles and restart limits

Both requested skills were discovered in this session's skill catalog and their
actual SKILL.md instructions followed. Independent retrieval review records the
startup P2 and its resolution in review.md. Reviewer did not edit subject files.
Planner completed and coordinator accepted handoff before starting independent
Reviewer; both performed actual semantic MCP retrieval and get_note readbacks.
Fare review accepted with no findings; existing37 API tests inspected as historical
evidence, not falsely rerun. All handoffs/raw evidence/transcript in orchestration/.
No skills, role files, mobile code or API code were changed.

Active Codex processes already loaded the pre-startup-fix module; their successful
warm searches prove semantic retrieval, not deployment of the new startup fix.
The latest startup path is proven in fresh real STDIO tests. To refresh all active
processes: finish calls, exit Codex CLI cleanly, reopen terminal at the workspace,
run `codex`, keeping the existing MCP/config/hooks, then send:

```text
Продовж перевірку feat/semantic-retrieval за docs/retrieval/verification.md.
Не змінюй питання, API, hooks або конфігурацію. Перевір git status і сторонні зміни.
Через MCP health_check перевір1.4.0; виконай search_notes("відновлення стану після перепідключення",5).
Підтвердь mode=semantic, pinned E5 revision, актуальність ревізій через get_note
лише знайдених нотаток; зафіксуй cold/warm latency. Не видаляй lock і не обходь
MCP до vault. Прочитай knowledge-sync.json перед будь-яким повторним записом.
```

No restart is falsely claimed for the existing active processes. Sandbox setup
failed before execution; necessary local commands used individually approved
require_escalated. This permission did not authorize filesystem vault access.
