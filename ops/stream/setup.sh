#!/usr/bin/env bash
# One-time setup of the 24/7 stream of https://bearproof.app/live?tv=1 to X, on a fresh Ubuntu 22.04/24.04 VPS.
# Run as root:  bash /opt/bearproof/ops/stream/setup.sh
# Then store the X stream key with set-key.sh. Nothing secret lives in this repo.
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q xvfb ffmpeg xdotool curl gnupg ca-certificates fonts-dejavu-core

# Google Chrome from Google's signed apt repository (Ubuntu's chromium is a snap, which is fiddly under systemd).
if ! command -v google-chrome >/dev/null; then
    install -d -m 755 /etc/apt/keyrings
    curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /etc/apt/keyrings/google.gpg
    echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google.gpg] https://dl.google.com/linux/chrome/deb/ stable main" \
        >/etc/apt/sources.list.d/google-chrome.list
    apt-get update -q
    apt-get install -y -q google-chrome-stable
fi

# Chrome and ffmpeg run as an unprivileged user with a UID nobody else uses. (useradd --system once picked 999,
# which a Docker container's database user already ran as on the host.)
if ! id bpstream >/dev/null 2>&1; then
    uid=2626
    while getent passwd "$uid" >/dev/null || getent group "$uid" >/dev/null; do uid=$((uid + 1)); done
    groupadd --gid "$uid" bpstream
    useradd --uid "$uid" --gid "$uid" --create-home --shell /usr/sbin/nologin bpstream
fi
install -d -m 700 /etc/bearproof

install -m 644 "$(dirname "$0")/bearproof-stream.service" /etc/systemd/system/bearproof-stream.service
systemctl daemon-reload
systemctl enable bearproof-stream.service
echo "setup done. Next: bash $(dirname "$0")/set-key.sh"
