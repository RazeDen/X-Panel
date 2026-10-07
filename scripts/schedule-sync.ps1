# npm run schedule:install / schedule:remove
# Registers two Windows Task Scheduler tasks for the current user (runs only while you are logged on,
# no password stored):
#   "X-Panel auto sync"   every 5 minutes: npm run sync:auto. Calls X only when a fresh post is
#                         exactly 1 h, 6 h or 24 h old, or every 15 minutes otherwise
#   "X-Panel daily sync"  once a day at 08:00: the normal 45-day incremental sync
# X bills re-reads of the same post only once per UTC day, so this costs about the same as one sync
# a day (~$0.15/day in total). Windows stay hidden (conhost --headless); a run is skipped while the
# previous one is still going. Output: data\sync.log.
param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$names = @('X-Panel auto sync', 'X-Panel daily sync')
$legacy = @('X-Panel fresh sync')  # replaced by "X-Panel auto sync"

foreach ($n in $legacy + $(if ($Remove) { $names } else { @() })) {
  if (Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $n -Confirm:$false; "Removed: $n" }
}
if ($Remove) { return }

$root = Split-Path -Parent $PSScriptRoot
$cmd = Join-Path $root 'scripts\scheduled-sync.cmd'
$conhost = Join-Path $env:WINDIR 'System32\conhost.exe'
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

$auto = New-ScheduledTaskAction -Execute $conhost -Argument "--headless `"$cmd`" sync:auto" -WorkingDirectory $root
$every5 = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName $names[0] -Action $auto -Trigger $every5 -Settings $settings -Force -Description 'X-Panel: every 5 minutes, sync when a fresh post is 1 h, 6 h or 24 h old, or every 15 minutes otherwise.' | Out-Null

$daily = New-ScheduledTaskAction -Execute $conhost -Argument "--headless `"$cmd`" sync" -WorkingDirectory $root
$at8 = New-ScheduledTaskTrigger -Daily -At '08:00'
Register-ScheduledTask -TaskName $names[1] -Action $daily -Trigger $at8 -Settings $settings -Force -Description 'X-Panel: daily 45-day incremental sync.' | Out-Null

foreach ($n in $names) {
  $t = Get-ScheduledTask -TaskName $n
  $i = $t | Get-ScheduledTaskInfo
  "{0}: {1}, next run {2}" -f $n, $t.State, $i.NextRunTime
}
"Log: $(Join-Path $root 'data\sync.log')"
