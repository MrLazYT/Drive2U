# Local semantic retrieval — 1.4.0

The knowledge connector embeds allowed Markdown sections locally and persists normalized
vectors in SQLite. Markdown remains the source of truth. No mobile or API code is changed.

## Model and environment

`intfloat/multilingual-e5-small`, revision
`614241f622f53c4eeff9890bdc4f31cfecc418b3`, MIT license, 384 dimensions.
The public [model card](https://huggingface.co/intfloat/multilingual-e5-small/raw/614241f622f53c4eeff9890bdc4f31cfecc418b3/README.md)
lists Ukrainian (`uk`). E5 retrieval uses `query: ` for queries and `passage: ` for
documents, including non-English input, with normalized vectors and a 512-token budget.
The [pinned file listing](https://huggingface.co/intfloat/multilingual-e5-small/tree/614241f622f53c4eeff9890bdc4f31cfecc418b3)
reports 471 MB safetensors, 17.1 MB tokenizer JSON and 5.07 MB sentencepiece data.
The download deliberately excludes pickle weights, ONNX/OpenVINO variants and Python code.
Name/license/size were announced before download. No token or paid API is needed.

Actual target: Windows AMD64, CPython 3.13.15, SQLite 3.50.4,
sentence-transformers 6.2.0, torch 2.14.1, transformers 5.20.2. Installation/import
and actual CPU inference were checked in the existing connector `.venv`.
[Sentence Transformers installation](https://sbert.net/docs/installation.html)
recommends Python 3.10+, PyTorch 2.2+, transformers 5+.
`requirements.txt` pins direct dependencies; `requirements-lock.txt` records the
tested environment, including transitive and development packages.

The embedder runs on CPU with four Torch threads, batch size 16, and loads lazily once
per server. It uses local files only, safetensors and `trust_remote_code=False`.
On Windows the dependency library is imported before STDIO starts its reader threads
to avoid a reproduced native NumPy/SciPy import hang. This loads no model weights
and builds no index, but adds startup latency (measured separately from health/search).
Only public model provisioning needs network access; note/query inference does not.
Public-model download took 30.735 s; that is separate from indexing/search latency.

## Storage choice

SQLite is the persistent embedded vector store. This small corpus uses an exact
normalized dot product over all stored vectors, with deterministic score/ID ordering.
There is no approximate-nearest-neighbor extension or separate database service.
This avoids Chroma's additional dependencies and Windows packaging requirements;
large corpora will need a separately evaluated storage/ranking design.
[Python sqlite3 documentation](https://docs.python.org/3.13/library/sqlite3.html)
describes its disk persistence and transactional interface.

Derived data lives exclusively at `<app-root>/.knowledge-index/vectors.sqlite3`;
public weights at `<app-root>/.knowledge-models/<revision>/`. Both directories are
ignored by Git. Deleting/rebuilding the derived index never modifies Markdown.
The database contains state (model/chunking/vault fingerprint and note revisions)
and vectors (chunk ID, note ID, full chunk metadata, normalized vector, checksum).

## Allowed input and chunks

Indexing uses only `Vault.note_ids()` and `Vault.read()`: the four permitted flat
Markdown folders and the two supported root notes. It does not recurse into service
folders, `.git`, nested directories or arbitrary paths. Existing size, ID, traversal,
symlink/junction and separate-repository checks remain in effect. Required YAML keys,
type/location, allowed status, string source, tag list and ISO dates are validated;
invalid notes fail the search explicitly instead of silently disappearing.

Sections follow ATX Markdown heading hierarchy. Fenced code headings are excluded.
Long sections split on line/word boundaries within 1000 characters including context,
then shrink to fit the actual E5 tokenizer budget. Embedding context includes note ID,
note title, section ancestry and metadata status; returned text is the section fragment.
Each chunk includes `note_id`, `title`, `section`, `text`, source note SHA256 `revision`,
stable positional SHA256 `chunk_id`, and metadata `source`. IDs remain stable for
unchanged heading/position structure; inserting earlier sections can change later IDs.
Heading-only sections are retained and may rank unhelpfully; the fixed evaluation
reports this limitation rather than retuning the questions.

## Freshness, updates and failures

Every search reads and validates the current allowed corpus. Only added/changed notes
are re-embedded; deleted notes are removed in the same SQLite transaction as revision
updates. Unchanged vectors persist across server restarts. A second corpus snapshot
before returning rejects concurrent changes (`CORPUS_CHANGED_DURING_SEARCH`). This
is a validated collection of file snapshots, not a transactional vault snapshot.
No read runs git, waits for the writer lock, or changes source Markdown.

Model identity, dimension, chunking version or vault root mismatch requires an explicit
rebuild. Missing index builds lazily; missing model, corrupt database/checksum/vector,
incomplete rows and indexing failures are explicit errors. No stale fragments or hidden
lexical fallback are returned. A process lock protects SQLite updates and a thread lock
serializes one server instance; another instance can return `SEMANTIC_INDEX_BUSY`.
The first call can be expensive; use the server maintenance command in advance.
Health only counts permitted notes/checks writer readiness, never loads the model/index.

## MCP contract and defaults

`search_notes(query, limit=10)` retains its name/signature. Query must contain nonspace
text, at most 200 characters; limit is an integer 1..50. Existing `results`, `total`,
`head`, `consistency`, `note_id`, `revision`, `excerpt`, `name_match` fields remain.
`total` now counts chunks; multiple hits can identify the same note. `excerpt` equals
`text`. Added fields: chunk metadata, `score`, `score_kind=cosine_similarity`, top-level
`mode`, pinned `model`, `corpus_revision`, full `note_revisions`, `index_updates`,
`elapsed_ms`, and `ranking`. Similarity measures embedding proximity, never correctness
probability. Callers can use get_note for current full text and metadata status.

Default `KNOWLEDGE_RETRIEVAL_MODE=semantic` is offline. Explicit diagnostic `text` calls
the retained old algorithm and labels its response `mode=text`; other values fail.
No new agent file-reading tool exists. Existing root/write environment variables,
global Codex config, hooks and GitHub MCP configuration are unchanged.

## Provisioning and recovery

Run in the server environment with the existing `DRIVE2U_APP_ROOT` and
`DRIVE2U_VAULT_ROOT` (do not supply vault paths to an agent file reader):

```powershell
harness/knowledge-mcp/.venv/Scripts/python.exe -m pip install -r harness/knowledge-mcp/requirements.txt
harness/knowledge-mcp/.venv/Scripts/python.exe -B harness/knowledge-mcp/prepare_model.py
harness/knowledge-mcp/.venv/Scripts/python.exe -B harness/knowledge-mcp/build_index.py
# Explicitly replace only the derived database for corrupt/incompatible state:
harness/knowledge-mcp/.venv/Scripts/python.exe -B harness/knowledge-mcp/build_index.py --rebuild
```

The maintenance entrypoint uses the same server Vault checks; it prints revision/count
metadata, no note bodies, and does not provide another agent channel into the vault.
Do not delete lock files while processes run. After code changes exit Codex CLI cleanly,
restart `codex` from the workspace, and confirm health version plus an actual semantic
search. Restarting a test server alone does not prove the active Codex MCP was updated.
