"""Offline contract and PowerShell AST tests. Never execute candidate commands."""
import json
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'harness/guardrails/pre-tool-use.ps1'


def invoke(command=None, event=None):
    event = event if event is not None else {
        'hook_event_name': 'PreToolUse', 'tool_name': 'Bash',
        'tool_input': {'command': command}, 'cwd': str(ROOT),
        'session_id': 'synthetic', 'tool_use_id': 'synthetic', 'turn_id': 'synthetic',
    }
    result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive',
                             '-File', str(SCRIPT)], input=json.dumps(event),
                            capture_output=True, text=True, timeout=5)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


class Guardrails(unittest.TestCase):
    def test_block(self):
        for command in [
            'git push --force', 'git push -f origin HEAD',
            'git -C "C:/fake repo" push --force-with-lease origin HEAD',
            '& "C:/Program Files/Git/bin/git.exe" push --force-with-lease=main:abc',
            'git push -uf origin main', 'git push origin +HEAD:main',
            'git -c core.quotepath=false push --force',
            'git status; git push --force', 'if ($true) { git push -f }',
            'git push --force-if-includes',
        ]:
            with self.subTest(command=command):
                self.assertEqual(invoke(command)['hookSpecificOutput']['permissionDecision'], 'deny')

    def test_allow_and_warn_passthrough(self):
        for command in [
            'Get-Content docs/ontology.md', 'git status --short',
            'python -m unittest discover -s harness/guardrails',
            'git push origin HEAD', 'git -C "C:/fake repo" push --dry-run origin HEAD',
            'git fetch --force', 'git log -f', 'git push --no-force',
            'Write-Output "git push --force"', '# git push -f\ngit status',
            'git push origin feature/force', 'git push origin main --follow-tags',
        ]:
            with self.subTest(command=command):
                self.assertEqual(invoke(command), {})

    def test_event_contract(self):
        self.assertEqual(invoke(event={'hook_event_name': 'PostToolUse', 'tool_name': 'Bash'}), {})
        self.assertEqual(invoke(event={'hook_event_name': 'PreToolUse', 'tool_name': 'mcp__drive2u_knowledge__get_note'}), {})
        self.assertEqual(invoke(None)['hookSpecificOutput']['permissionDecision'], 'deny')

    def test_registration(self):
        config = json.loads((ROOT / '.codex/hooks.json').read_text())
        group, = config['hooks']['PreToolUse']
        self.assertEqual(group['matcher'], '^Bash$')
        self.assertEqual(group['hooks'][0]['timeout'], 5)


if __name__ == '__main__':
    unittest.main()
