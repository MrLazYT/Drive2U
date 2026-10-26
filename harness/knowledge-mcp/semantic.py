"""Local, rebuildable vector index. Only Vault.read/note_ids access source files."""
from __future__ import annotations

from contextlib import closing
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import threading
import time

from filelock import FileLock, Timeout
from knowledge import KnowledgeError, parse_note, revision

MODEL_ID = 'intfloat/multilingual-e5-small'
MODEL_REVISION = '614241f622f53c4eeff9890bdc4f31cfecc418b3'
CHUNK_VERSION = 'heading-char1000-token512-v1'
DIMENSION = 384


def safe_directory(app: Path, relative: str) -> Path:
    target = app / relative
    for part in (target, *target.parents):
        if part == app:
            break
        if part.is_symlink() or (hasattr(part, 'is_junction') and part.is_junction()):
            raise KnowledgeError('INDEX_PATH_UNSAFE')
    if not target.resolve().is_relative_to(app):
        raise KnowledgeError('INDEX_PATH_UNSAFE')
    return target


class E5Embedder:
    """Loads once per server, offline. Provision public weights separately."""
    identity = f'{MODEL_ID}@{MODEL_REVISION}'
    dimension = DIMENSION

    def __init__(self, app):
        self.directory = safe_directory(app, '.knowledge-models/' + MODEL_REVISION)
        self.model = None

    def load(self):
        if self.model is None:
            if not (self.directory / 'model.safetensors').is_file():
                raise KnowledgeError('SEMANTIC_MODEL_UNAVAILABLE:run_prepare_model')
            try:
                # No network or model-supplied Python is permitted during retrieval.
                from sentence_transformers import SentenceTransformer
                import torch
                torch.set_num_threads(4)
                self.model = SentenceTransformer(str(self.directory), device='cpu',
                    local_files_only=True, trust_remote_code=False,
                    model_kwargs={'use_safetensors': True})
                self.model.max_seq_length = 512
            except Exception:
                raise KnowledgeError('SEMANTIC_MODEL_LOAD_FAILED:check_local_dependencies_and_weights') from None
        return self.model

    def fits(self, text):
        return len(self.load().tokenizer.encode('passage: ' + text)) <= 512

    def encode(self, texts, *, query=False):
        model = self.load()
        prefix = 'query: ' if query else 'passage: '
        try:
            return model.encode([prefix + x for x in texts], normalize_embeddings=True,
                                show_progress_bar=False, batch_size=16).tolist()
        except Exception:
            raise KnowledgeError('SEMANTIC_EMBEDDING_FAILED') from None


def chunks(note_id, text, fits=lambda text: True, max_chars=1000):
    meta, body = parse_note(text)
    # Required keys alone do not guarantee safe metadata types.
    expected = {'Concepts': 'concept', 'Components': 'component',
                'Decisions': 'decision', 'Glossary': 'glossary'}
    kind = expected.get(note_id.split('/')[0],
                        'moc' if note_id == 'MOC-Drive2U.md' else 'convention')
    if (meta['type'] != kind or meta['status'] not in {'planned','active','accepted','deprecated'}
            or not isinstance(meta['tags'], list)
            or not all(isinstance(t, str) for t in meta['tags'])
            or not isinstance(meta['source'], str)):
        raise KnowledgeError('INVALID_INDEX_METADATA:' + note_id)
    for key in ('created', 'updated'):
        from datetime import date
        try:
            date.fromisoformat(str(meta[key]))
        except (ValueError, TypeError):
            raise KnowledgeError('INVALID_INDEX_METADATA:' + note_id) from None
    title = next((m.group(1) for line in body.splitlines()
                  if (m := re.match(r'^# (.+)', line))), Path(note_id).stem)
    sections, headings, lines, fenced = [], [], [], False
    for line in body.splitlines():
        if re.match(r'^\s*(`{3,}|~{3,})', line):
            fenced = not fenced
        match = None if fenced else re.match(r'^(#{1,6})\s+(.+)', line)
        if match:
            if lines:
                sections.append((' / '.join(h[1] for h in headings), '\n'.join(lines)))
            level = len(match[1])
            headings = [h for h in headings if h[0] < level] + [(level, match[2])]
            lines = [line]
        else:
            lines.append(line)
    if lines:
        sections.append((' / '.join(h[1] for h in headings), '\n'.join(lines)))
    result = []
    for section_index, (section, content) in enumerate(sections):
        context = f'{note_id}\n{title[:120]}\n{section[:120]}\nstatus: {meta["status"]}\n'
        content = content.strip()
        part = 0
        while content:
            size = min(len(content), max_chars - len(context))
            if size < 1:
                raise KnowledgeError('INVALID_CHUNK_BUDGET')
            while size > 0 and not fits(context + content[:size]):
                size //= 2
            if size == 0:
                raise KnowledgeError('CHUNK_CONTEXT_TOO_LONG:' + note_id)
            # Prefer paragraph/line/word boundaries; never discard non-whitespace text.
            if size < len(content):
                boundary = max(content.rfind('\n', 0, size), content.rfind(' ', 0, size))
                if boundary > size // 2:
                    size = boundary
            piece, content = content[:size].strip(), content[size:].lstrip()
            if piece:
                chunk_id = revision(f'{note_id}\0{section_index}\0{section}\0{part}')
                result.append(dict(note_id=note_id, title=title, section=section,
                    text=piece, embedding_text=context + piece, revision=revision(text),
                    chunk_id=chunk_id, source=meta['source']))
                part += 1
    return result


def normalize(vector, dimension):
    if len(vector) != dimension or not all(isinstance(x, (int,float)) and math.isfinite(x) for x in vector):
        raise KnowledgeError('INDEX_VECTOR_INVALID')
    norm = math.sqrt(sum(x*x for x in vector))
    if norm == 0:
        raise KnowledgeError('INDEX_VECTOR_INVALID')
    return [x / norm for x in vector]


class SemanticIndex:
    def __init__(self, vault, embedder=None):
        self.vault = vault
        self.directory = safe_directory(vault.app, '.knowledge-index')
        self.embedder = embedder or E5Embedder(vault.app)
        self.guard = threading.RLock()
        self.fingerprint = revision(json.dumps([self.embedder.identity,
            self.embedder.dimension, CHUNK_VERSION, str(vault.root)], ensure_ascii=False))

    def snapshot(self):
        return {note_id: self.vault.read(note_id) for note_id in self.vault.note_ids()}

    def search(self, query, limit):
        start = time.perf_counter()
        safe_directory(self.vault.app, '.knowledge-index')
        self.directory.mkdir(parents=True, exist_ok=True)
        for name in ('vectors.sqlite3', 'index.lock'):
            path = self.directory / name
            if path.is_symlink() or (hasattr(path, 'is_junction') and path.is_junction()):
                raise KnowledgeError('INDEX_PATH_UNSAFE')
        try:
            with self.guard, FileLock(str(self.directory / 'index.lock'), timeout=0):
                return self._search(query, limit, start)
        except Timeout:
            raise KnowledgeError('SEMANTIC_INDEX_BUSY:retry_later') from None
        except (sqlite3.Error, ValueError, KeyError, TypeError):
            raise KnowledgeError('SEMANTIC_INDEX_CORRUPT:run_rebuild_index') from None

    def _search(self, query, limit, start):
        snapshot = self.snapshot()
        revisions = {key: revision(value) for key,value in snapshot.items()}
        # Validate all notes, including unchanged ones. Model/tokenizer loaded lazily here.
        all_chunks = [c for key,text in snapshot.items()
                      for c in chunks(key, text, self.embedder.fits)]
        database = self.directory / 'vectors.sqlite3'
        with closing(sqlite3.connect(database)) as db:
            db.execute('PRAGMA trusted_schema=OFF')
            db.execute('CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS vectors (id TEXT PRIMARY KEY, note TEXT NOT NULL, document TEXT NOT NULL, vector TEXT NOT NULL, checksum TEXT NOT NULL)')
            state = dict(db.execute('SELECT key,value FROM state'))
            if state and state.get('fingerprint') != self.fingerprint:
                raise KnowledgeError('SEMANTIC_INDEX_INCOMPATIBLE:run_rebuild_index')
            old_revisions = json.loads(state.get('revisions', '{}'))
            changed = {key for key,value in revisions.items() if old_revisions.get(key) != value}
            removed = set(old_revisions) - set(revisions)
            pending = [c for c in all_chunks if c['note_id'] in changed]
            vectors = self.embedder.encode([c['embedding_text'] for c in pending]) if pending else []
            if len(vectors) != len(pending):
                raise KnowledgeError('SEMANTIC_EMBEDDING_COUNT_INVALID')
            with db:
                for key in changed | removed:
                    db.execute('DELETE FROM vectors WHERE note=?', (key,))
                for chunk,vector in zip(pending,vectors):
                    document = json.dumps(chunk, ensure_ascii=False, sort_keys=True)
                    encoded = json.dumps(normalize(vector, self.embedder.dimension))
                    db.execute('INSERT INTO vectors VALUES (?,?,?,?,?)',
                        (chunk['chunk_id'],chunk['note_id'],document,encoded,revision(document + encoded)))
                db.executemany('INSERT OR REPLACE INTO state VALUES (?,?)', [
                    ('fingerprint',self.fingerprint), ('revisions',json.dumps(revisions,sort_keys=True))])
            indexed = list(db.execute('SELECT id,note,document,vector,checksum FROM vectors'))
        expected = {c['chunk_id']: c for c in all_chunks}
        if {r[0] for r in indexed} != set(expected):
            raise KnowledgeError('SEMANTIC_INDEX_INCOMPLETE:run_rebuild_index')
        query_vector = normalize(self.embedder.encode([query], query=True)[0], self.embedder.dimension)
        results = []
        for chunk_id,note_id,document,encoded,checksum in indexed:
            chunk = json.loads(document)
            if (chunk != expected[chunk_id] or chunk['note_id'] != note_id
                    or revision(document + encoded) != checksum):
                raise KnowledgeError('SEMANTIC_INDEX_CORRUPT:run_rebuild_index')
            vector = normalize(json.loads(encoded), self.embedder.dimension)
            score = sum(x*y for x,y in zip(query_vector,vector))
            results.append({key:value for key,value in chunk.items() if key != 'embedding_text'} |
                {'excerpt': chunk['text'], 'name_match': query.casefold() in note_id.casefold(),
                 'score': round(max(-1.,min(1.,score)), 6), 'score_kind': 'cosine_similarity'})
        # A concurrent writer must not make this response present stale text as current.
        if {key: revision(value) for key,value in self.snapshot().items()} != revisions:
            raise KnowledgeError('CORPUS_CHANGED_DURING_SEARCH:retry')
        results.sort(key=lambda r: (-r['score'], r['note_id'], r['chunk_id']))
        return {'results':results[:limit], 'total':len(results), 'head':self.vault.local_head(),
                'consistency':'validated per-file local snapshot; no multi-file transaction',
                'mode':'semantic', 'model':self.embedder.identity,
                'corpus_revision':revision(json.dumps(revisions,sort_keys=True)),
                'note_revisions':revisions, 'index_updates':{'changed':len(changed),'removed':len(removed)},
                'elapsed_ms':round((time.perf_counter()-start)*1000,3),
                'ranking':'cosine similarity; not a probability of correctness'}
