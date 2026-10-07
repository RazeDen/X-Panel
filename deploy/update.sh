#!/bin/sh
# Rebuild and restart X-Panel on the server after the code changed (run as root from anywhere):
#   sh /opt/x-panel/app/deploy/update.sh
# Keeps every file owned by the xpanel service user, reinstalls dependencies only when the lockfile
# changed, builds, then restarts the dashboard. Sync timers pick up new code on their next run.
set -e
APP=/opt/x-panel/app
cd "$APP"
chown -R xpanel:xpanel "$APP"
as_xpanel() { runuser -u xpanel -- env HOME=/opt/x-panel NEXT_TELEMETRY_DISABLED=1 "$@"; }
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  as_xpanel npm ci --no-audit --no-fund
fi
as_xpanel npm run -s typecheck
as_xpanel npm run -s build
install -m 644 deploy/*.service deploy/*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl restart x-panel-web.service
sleep 3
systemctl is-active x-panel-web.service
curl -s -o /dev/null -w "dashboard http %{http_code}\n" http://127.0.0.1:3000/
