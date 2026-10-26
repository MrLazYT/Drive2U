"""Server maintenance entrypoint; no vault content is printed or exported."""
import argparse
import json
import os
from pathlib import Path

from knowledge import Vault
from semantic import SemanticIndex


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rebuild', action='store_true', help='replace derived SQLite index only')
    args = parser.parse_args()
    vault = Vault(os.environ['DRIVE2U_APP_ROOT'], os.environ['DRIVE2U_VAULT_ROOT'])
    index = SemanticIndex(vault)
    if args.rebuild:
        from filelock import FileLock
        index.directory.mkdir(parents=True, exist_ok=True)
        with FileLock(str(index.directory / 'index.lock'), timeout=0):
            target = index.directory / 'vectors.sqlite3'
            if target.is_symlink() or (hasattr(target, 'is_junction') and target.is_junction()):
                raise ValueError('INDEX_PATH_UNSAFE')
            target.unlink(missing_ok=True)
    result = index.search('індекс', 1)
    print(json.dumps({key:result[key] for key in ('mode','model','corpus_revision',
        'note_revisions','index_updates','elapsed_ms','total')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
