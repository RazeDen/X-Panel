@echo off
rem Run by Windows Task Scheduler (see scripts\schedule-sync.ps1). The arguments are the npm script
rem and its options, e.g. "sync:auto" (every 5 minutes) or "sync" (daily). Output is appended to
rem data\sync.log, which is rotated to data\sync.log.1 above 5 MB.
cd /d "%~dp0.."
if exist data\sync.log for %%F in (data\sync.log) do if %%~zF GTR 5000000 move /y data\sync.log data\sync.log.1 >nul
echo ==== %date% %time% %* >> data\sync.log
call npm run -s %* >> data\sync.log 2>&1
