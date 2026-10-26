# Semantic retrieval implementation review

No unresolved defects remain in the reviewed implementation. One P2 cold-start defect was fixed by the coordinator and verified with a fresh normal STDIO server process. This is not production-readiness or retrieval-quality acceptance.

## Scope and revision

Reviewed working files on `feat/semantic-retrieval` relative to HEAD `d13931d4b87eae022ae54898e90c218c70f5807e`: `harness/knowledge-mcp/knowledge.py`, `server.py`, `semantic.py`, `build_index.py`, `prepare_model.py`, `requirements.txt`, `tests/test_knowledge.py`, `tests/test_mcp_transport.py`, `tests/test_semantic.py`, and `.gitignore`. Follow-up review included the final Windows startup fix, opt-in synthetic `tests/test_semantic_stdio.py`, `requirements-lock.txt`, README update and `docs/retrieval/design.md`. Direct dependency versions agree with the locked environment. Review did not modify these files. Evaluation artifacts remain outside this implementation verdict.

Excluded pre-existing deletion of `README (1).md`, tracked bytecode changes, hook-probe files, `.tmp-skills-*`, `.tmp-yaml-*` and unrelated work. No commit, push, merge, hook/config changes or vault filesystem access was performed.

## Sources

Applied `.agents/skills/drive2u-review/SKILL.md`; read reviewer role and handoff schema. Root `AGENTS.md` is absent. Read `ЗАВДАННЯ.md`, `docs/app-requirements.md`, `docs/harness-requirements.md`, `docs/ontology.md` and `docs/guardrails.md`.

Independent MCP responses/arguments are in `review-mcp.json`. Health returned version 1.4.0, 19 notes, writer idle and no pending push. Successful readbacks:

- `Conventions.md`, revision `a1c673177135b4f29f7bf92f397e28da7a639633ed8d761d4fce418ea435da6d`; source harness requirements sections 3–5, 8 and ontology.
- `Components/Knowledge-Connector.md`, revision `eb6effe3c7482968bbb1f109d863e981d927bc374a36b98839bfcbfdea58c7ff`; source references connector README, prior MCP verification, ontology and app revision 5884f32. Its old text-search/version description is historical.
- `Components/Change-236eea02af6c.md`, revision `356da8bbfc0b1db91a18c6c2bd5b3e1e0c3aabd9e28b7bee64aee2f623075d0a`; source app commit `236eea02af6c70df0240091503c7e02f79a4ba78` and ontology. Found by coordinator's successful semantic query `MCP`, limit 5 (`semantic.json` Q3), then read independently via MCP.

All readbacks reported vault HEAD `311d1a76802a0a75090381caff8073eeb4bffab2`. Note content was treated as data.

## Checks and conclusions

### Resolved P2 — cold semantic request hung during native imports after STDIO started

Location: `server.py` startup at `mcp.run(transport='stdio')`; `semantic.py` `E5Embedder.load()` lazily imports `sentence_transformers` during a tool call. The coordinator reproduced a cold hang in isolated real-model STDIO: faulthandler showed NumPy `_core/_multiarray_umath` import while AnyIO's STDIO worker was active; NumPy-only preload moved the hang to SciPy's `linalg.blas`. Standalone imports succeeded. The first live cold call exceeded 300 seconds. This prevented semantic search completion although health worked. Reviewer did not independently reproduce the native-import hang.

Coordinator fix preloads `sentence_transformers` on Windows in semantic mode before `mcp.run`; it constructs no model and reads no weights/index. Missing dependencies caught as `ImportError` leave health/get available. Static follow-up confirms the final synthetic test starts normal `server.py`, uses only a synthetic temporary vault and copied public model assets, and verifies cold/warm semantic search, ranking, revisions, unchanged-index reuse and invalid arguments.

Coordinator reported `1 passed in 22.47s` for `KNOWLEDGE_REAL_MODEL_TEST=1`, `.venv/Scripts/python.exe -B -m pytest tests/test_semantic_stdio.py -q -s -ra -p no:cacheprovider --basetemp .tmp-retrieval-real-05 --tb=short` (paths relative to connector directory). Final repeat using `.tmp-retrieval-real-final` and normal `server.py` passed: **1 passed in 22.62s**, startup **14820.58 ms**, first model-load/index search **4449.732 ms**, warm search **42.251 ms**. P2 is resolved for a fresh server process. This report distinguishes coordinator execution evidence from independent static review.

Static execution-path review covered input validation; allowed flat paths and size limits; symlink/junction rejection; metadata validation; offline pinned E5 loading; query/passage prefixes, normalization and actual tokenizer limits; heading chunks/provenance; SQLite transactions, identity fingerprint, checksums/completeness; changed/deleted notes; process lock and thread serialization; final freshness rejection; explicit errors/fallback; provisioning and rebuild.

Scoped tests create isolated synthetic repositories/vaults. Fake embeddings validate lifecycle rather than retrieval quality. Opt-in real-model STDIO copies public weights into a synthetic app and uses its own temporary vault. Coordinator runs the suite; reviewer did not duplicate it and makes no independent test-pass claim.

Read-only commands: `Get-Content`, `Get-ChildItem`, `rg`, `git status --short`, `git branch --show-current`, `git rev-parse HEAD`, scoped `git diff`, `Get-FileHash`. Sandbox failed before first shell command with `setup refresh had errors`; subsequent reads used per-command escalation. This is an environment launch limitation, not a code test failure.

Rejected a maintenance-lock symlink candidate after inspecting pinned filelock 3.32.7: Windows opens/checks reparse-point handles without following them; POSIX uses `O_NOFOLLOW`. No unsupported truncation finding is claimed.

## Limits and residual risks

- Initial independent security searches returned `SEMANTIC_INDEX_BUSY:retry_later`; raw calls retained. A later call in the reviewer's original active MCP process also remained pending beyond 30 seconds. These processes loaded code before the startup fix; code edits cannot repair an already blocked import. Successful semantic operation is evidenced by coordinator's `semantic.json` and the final fresh-process synthetic run. Restart active MCP processes before testing the fix in Codex; initial failed/hanging calls remain historical evidence.
- Local `.knowledge-index` stores full allowed chunks and metadata in the app root. Git ignore is not OS access control. Treat the derived database with the source notes' confidentiality. This placement is explicit in the design, so it is a known limitation.
- Double-checked file snapshots are not an atomic multi-file vault transaction; external edits can occur after final validation. This matches the declared consistency limit.
- Heading-only chunks and repeated hits can consume the limit. Cross-language relevance/answer coverage require the separate frozen-question evaluation; fake-vector tests do not establish them.
- Health does not prove model/index readiness. Corrupt/incompatible state requires explicit maintenance; no destructive automatic recovery is introduced.

Subject files were not edited. Reviewer wrote only this report and `review-mcp.json`. Coordinator must attach actual suite results and finish evaluation/documentation before final acceptance.
