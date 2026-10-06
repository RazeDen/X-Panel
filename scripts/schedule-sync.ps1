# npm run schedule:install / schedule:remove
# Registers two Windows Task Scheduler tasks for the current user (runs only while you are logged on,
# no password stored):
#   "X-Panel fresh sync"  every 15 minutes, posts from the last 2 days -> early-growth snapshots
#                         (impressions after the first hour, same-age ranks)
#   "X-Panel daily sync"  once a day at 08:00, the normal 45-day incremental sync
# X bills re-reads of the same post only once per UTC day, so the 15-minute cadence costs about the
# same as one sync a day (~$0.15/day in total). Windows stay hidden (conhost --headless); a run is
# skipped if the previous one is still going. Output: data\sync.log.
param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$names = @('X-Panel fresh sync', 'X-Panel daily sync')

if ($Remove) {
  foreach ($n in $names) {
    if (Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $n -Confirm:$false; "Removed: $n" }
  }
  return
}

$root = Split-Path -Parent $PSScriptRoot
$cmd = Join-Path $root 'scripts\scheduled-sync.cmd'
$conhost = Join-Path $env:WINDIR 'System32\conhost.exe'
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

$fresh = New-ScheduledTaskAction -Execute $conhost -Argument "--headless `"$cmd`" --days=2" -WorkingDirectory $root
$every15 = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName $names[0] -Action $fresh -Trigger $every15 -Settings $settings -Force -Description 'X-Panel: sync posts from the last 2 days every 15 minutes (early-growth snapshots).' | Out-Null

$daily = New-ScheduledTaskAction -Execute $conhost -Argument "--headless `"$cmd`"" -WorkingDirectory $root
$at8 = New-ScheduledTaskTrigger -Daily -At '08:00'
Register-ScheduledTask -TaskName $names[1] -Action $daily -Trigger $at8 -Settings $settings -Force -Description 'X-Panel: daily 45-day incremental sync.' | Out-Null

foreach ($n in $names) {
  $t = Get-ScheduledTask -TaskName $n
  $i = $t | Get-ScheduledTaskInfo
  "{0}: {1}, next run {2}" -f $n, $t.State, $i.NextRunTime
}
"Log: $(Join-Path $root 'data\sync.log')"
