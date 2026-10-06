@echo off
rem Run by Windows Task Scheduler (see scripts\schedule-sync.ps1). Extra arguments go to the sync,
rem e.g. --days=2 for the 15-minute fresh-post sync. Output is appended to data\sync.log,
rem which is rotated to data\sync.log.1 above 5 MB.
cd /d "%~dp0.."
if exist data\sync.log for %%F in (data\sync.log) do if %%~zF GTR 5000000 move /y data\sync.log data\sync.log.1 >nul
echo ==== %date% %time% sync %* >> data\sync.log
call npm run sync -- %* >> data\sync.log 2>&1
