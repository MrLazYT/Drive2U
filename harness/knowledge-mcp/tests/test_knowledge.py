from pathlib import Path
import subprocess
import sys
import pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from knowledge import Vault, KnowledgeError


def git(root, *args):
    p = subprocess.run(['git','-C',str(root),*args],text=True,capture_output=True,check=True)
    return p.stdout.strip()


@pytest.fixture
def setup(tmp_path):
    remote=tmp_path/'remote.git';remote.mkdir();git(remote,'init','--bare','--initial-branch=main')
    app=tmp_path/'app';app.mkdir();git(app,'init','--initial-branch=main')
    root=tmp_path/'vault';git(tmp_path,'clone',str(remote),str(root))
    git(root,'config','user.name','Connector Tests');git(root,'config','user.email','tests@example.invalid')
    moc='---\ntype: moc\ncreated: 2026-10-22\nupdated: 2026-10-22\nstatus: active\ntags: [drive2u, moc]\nsource: requirements\n---\n\n# MOC\n'
    (root/'MOC-Drive2U.md').write_text(moc,encoding='utf-8')
    git(root,'add','.');git(root,'commit','-m','initial');git(root,'push','-u','origin','main')
    return Vault(str(app),str(root),True),remote


def create(v, title='Ride', **kwargs):
    return v.ingest(title,'concept','# Ride\n\nA ride.','drive2u/docs/app-requirements.md',**kwargs)


def test_create_get_search_repeat_update(setup):
    v,remote=setup
    first=create(v)
    assert first['status']=='created' and first['published']
    assert git(remote,'rev-parse','main')==first['commit']
    assert '[[Ride]]' in v.read('MOC-Drive2U.md')
    assert v.search('ride')['total']==2
    assert v.get('Concepts/Ride.md')['metadata']['type']=='concept'
    assert create(v)['status']=='unchanged'
    assert git(v.root,'rev-parse','HEAD')==first['commit']
    with pytest.raises(KnowledgeError,match='REVISION_CONFLICT'):
        v.ingest('Ride','concept','# Ride\nChanged','source')
    updated=v.ingest('Ride','concept','# Ride\nChanged','source',expected_revision=first['revision'])
    assert updated['status']=='updated'
    # Retry carrying stale revision is safe if content already matches.
    assert v.ingest('Ride','concept','# Ride\nChanged','source',expected_revision=first['revision'])['status']=='unchanged'


@pytest.mark.parametrize('path',['../secret.md','Concepts/../../secret.md','/tmp/secret.md',
                                 'Concepts\\Ride.md','.git/config','Other/Ride.md','Concepts/a/b.md'])
def test_reject_paths(setup,path):
    with pytest.raises(KnowledgeError):setup[0].get(path)


def test_symlink(setup,tmp_path):
    v,_=setup
    (v.root/'Concepts').mkdir();(tmp_path/'outside.md').write_text('secret')
    try:
        (v.root/'Concepts'/'Hidden.md').symlink_to(tmp_path/'outside.md')
    except OSError:
        pytest.skip('OS does not permit symlink creation')
    with pytest.raises(KnowledgeError,match='SYMLINK'):v.get('Concepts/Hidden.md')


def test_read_only(setup):
    v,_=setup;v.write_enabled=False
    assert v.health()['write_enabled'] is False
    with pytest.raises(KnowledgeError,match='WRITES_DISABLED'):create(v)


def test_dirty_vault_preserved(setup):
    v,_=setup;(v.root/'personal.txt').write_text('keep')
    with pytest.raises(KnowledgeError,match='DIRTY_VAULT'):create(v)
    assert (v.root/'personal.txt').read_text()=='keep'
    assert not (v.root/'Concepts').exists()


def test_missing_link_no_write(setup):
    v,_=setup
    with pytest.raises(KnowledgeError,match='LINK_TARGET_NOT_FOUND'):create(v,links=['Missing'])
    assert not git(v.root,'status','--porcelain')


def test_duplicate_name(setup):
    v,_=setup;create(v)
    with pytest.raises(KnowledgeError,match='DUPLICATE_NOTE_NAME'):
        v.ingest('Ride','component','# Ride','source')


def test_pull_remote_update(setup,tmp_path):
    v,remote=setup
    other=tmp_path/'other';git(tmp_path,'clone',str(remote),str(other))
    git(other,'config','user.name','Other');git(other,'config','user.email','other@example.invalid')
    (other/'README.txt').write_text('remote update')
    git(other,'add','.');git(other,'commit','-m','remote');git(other,'push')
    create(v)
    assert (v.root/'README.txt').read_text()=='remote update'


def test_unrelated_ahead_not_pushed(setup):
    v,remote=setup;before=git(remote,'rev-parse','main')
    (v.root/'local.txt').write_text('unrelated')
    git(v.root,'add','.');git(v.root,'commit','-m','unrelated')
    with pytest.raises(KnowledgeError,match='UNPUBLISHED_OR_DIVERGED'):create(v)
    assert git(remote,'rev-parse','main')==before


def test_push_failure_retry(setup,monkeypatch):
    v,remote=setup;actual=v.git
    def fail(*args):
        if args[0]=='push':raise KnowledgeError('GIT_COMMAND_FAILED:push')
        return actual(*args)
    monkeypatch.setattr(v,'git',fail)
    r=create(v)
    assert r['published'] is False and v.pending.exists()
    assert git(remote,'rev-parse','main') != r['commit']
    monkeypatch.setattr(v,'git',actual)
    repeat=create(v)
    assert repeat['status']=='unchanged' and repeat['published']
    assert repeat['commit']==r['commit'] and not v.pending.exists()
    assert git(remote,'rev-parse','main')==r['commit']


def test_commit_failure_preserves_files(setup,monkeypatch):
    v,_=setup;actual=v.git
    def fail(*args):
        if args[0]=='commit':raise KnowledgeError('GIT_COMMAND_FAILED:commit')
        return actual(*args)
    monkeypatch.setattr(v,'git',fail)
    with pytest.raises(KnowledgeError,match='LOCAL_COMMIT_FAILED'):create(v)
    assert v.read('Concepts/Ride.md')
    assert not v.pending.exists()


def test_ignored_target_refused(setup):
    v,_=setup
    (v.root/'.gitignore').write_text('Concepts/\n')
    git(v.root,'add','.gitignore');git(v.root,'commit','-m','ignore');git(v.root,'push')
    with pytest.raises(KnowledgeError,match='TARGET_IGNORED'):create(v)
    assert not (v.root/'Concepts').exists()


def test_nested_roots_refused(setup):
    v,_=setup
    with pytest.raises(KnowledgeError,match='SEPARATE'):
        Vault(str(v.root),str(v.root),True)


def test_reads_work_while_other_process_holds_writer_lock(setup):
    v,_=setup;create(v)
    from filelock import FileLock
    other=FileLock(str(v.gitdir/'drive2u-knowledge.lock'))
    with other:
        assert v.health()['writer_busy'] is True
        assert v.get('Concepts/Ride.md')['content']
        assert v.search('Ride')['total']==2
        from filelock import Timeout
        with pytest.raises(Timeout):create(v,title='Other')


def test_health_and_reads_do_not_run_git(setup,monkeypatch):
    v,_=setup;create(v)
    def forbidden(*args):raise AssertionError('retrieval must not execute git')
    monkeypatch.setattr(v,'git',forbidden)
    assert v.health()['ok']
    assert v.get('Concepts/Ride.md')['note_id']=='Concepts/Ride.md'
    assert v.search('Ride')['total']==2
