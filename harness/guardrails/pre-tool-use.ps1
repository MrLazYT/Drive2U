# Local, synchronous Codex PreToolUse policy. No command evaluation or network IO.
$ErrorActionPreference = 'Stop'
function Deny([string]$reason) {
    @{hookSpecificOutput=@{hookEventName='PreToolUse'; permissionDecision='deny'; permissionDecisionReason=$reason}} | ConvertTo-Json -Compress
}
try {
    $event = [Console]::In.ReadToEnd() | ConvertFrom-Json
    if ($event.hook_event_name -ne 'PreToolUse' -or $event.tool_name -ne 'Bash') { '{}'; exit 0 }
    $command = $event.tool_input.command
    if ($command -isnot [string]) { Deny 'D2U-G001: missing shell command'; exit 0 }
    $tokens = $null; $errors = $null
    $tree = [System.Management.Automation.Language.Parser]::ParseInput($command, [ref]$tokens, [ref]$errors)
    if ($errors.Count) { Deny 'D2U-G001: shell syntax cannot be inspected'; exit 0 }
    $calls = $tree.FindAll({param($node) $node -is [System.Management.Automation.Language.CommandAst]}, $true)
    foreach ($call in $calls) {
        $name = $call.GetCommandName()
        if (!$name -or ($name -replace '^.*[\\/]', '') -notmatch '^git(?:\.exe)?$') { continue }
        $parts = @($call.CommandElements | Select-Object -Skip 1 | ForEach-Object {
            if ($_ -is [System.Management.Automation.Language.StringConstantExpressionAst]) { $_.Value }
            else { $_.Extent.Text }
        })
        $index = 0
        while ($index -lt $parts.Count) {
            $part = $parts[$index]
            if ($part -cin @('-C','-c','--git-dir','--work-tree','--namespace','--config-env')) { $index += 2; continue }
            if ($part -match '^-' -and $part -cne '-f') { $index++; continue }
            break
        }
        if ($index -ge $parts.Count -or $parts[$index] -cne 'push') { continue }
        foreach ($arg in @($parts | Select-Object -Skip ($index + 1))) {
            if ($arg -cmatch '^--force(?:-with-lease|-if-includes)?(?:=.*)?$' -or
                $arg -cmatch '^-[^-]*f' -or $arg -cmatch '^\+') {
                Deny 'D2U-B001: force push is prohibited (including lease and +refspec).'; exit 0
            }
        }
    }
    '{}'
} catch {
    Deny 'D2U-G001: invalid hook input or inspection failure'
}
