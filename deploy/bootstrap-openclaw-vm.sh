#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

USERNAME="${OPENCLAW_USER:-vyahhi}"
HOME_DIR="/home/${USERNAME}"
OPENCLAW_HOME="${HOME_DIR}/.openclaw"

apt-get update
apt-get install -y ca-certificates curl git gnupg jq

curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
  | gpg --dearmor -o /etc/apt/keyrings/google-chrome.gpg
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
  > /etc/apt/sources.list.d/google-chrome.list

curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | gpg --dearmor -o /etc/apt/keyrings/githubcli-archive-keyring.gpg
chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  > /etc/apt/sources.list.d/github-cli.list

apt-get update
apt-get install -y gh google-chrome-stable
npm install -g openclaw

id -u "${USERNAME}" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "${USERNAME}"
install -d -o "${USERNAME}" -g "${USERNAME}" "${OPENCLAW_HOME}"
install -d -o "${USERNAME}" -g "${USERNAME}" "${OPENCLAW_HOME}/workspace"
install -d -o "${USERNAME}" -g "${USERNAME}" "${OPENCLAW_HOME}/skills"

cat >/etc/systemd/system/openclaw.service <<UNIT
[Unit]
Description=OpenClaw Gateway
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=${USERNAME}
WorkingDirectory=${HOME_DIR}
Environment=HOME=${HOME_DIR}
Environment=PATH=/usr/bin:/usr/local/bin:/bin
EnvironmentFile=${OPENCLAW_HOME}/.env
ExecStart=/usr/bin/openclaw gateway run --allow-unconfigured --bind loopback --port 18789 --auth token --token \${OPENCLAW_GATEWAY_TOKEN}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable openclaw.service

cat <<EOF
Bootstrap complete.
Next:
1. Create ${OPENCLAW_HOME}/.env from .env.example.
2. Create ${OPENCLAW_HOME}/openclaw.json from deploy/openclaw.json.example.
3. Clone the repo into ${OPENCLAW_HOME}/workspace.
4. systemctl start openclaw
EOF
