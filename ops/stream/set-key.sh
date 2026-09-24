#!/usr/bin/env bash
# Stores the X (Media Studio → Producer → Sources) RTMP URL and stream key on this server, then (re)starts the
# stream. The key is typed, never shown, and only readable by root. Run as root: bash set-key.sh
set -euo pipefail
read -rp "RTMP URL (e.g. rtmps://va.pscp.tv:443/x): " url
read -rsp "Stream key (hidden): " key
echo
[ -n "$url" ] && [ -n "$key" ] || { echo "both are needed"; exit 1; }
install -d -m 700 /etc/bearproof
umask 077
printf 'RTMP_URL=%s\nSTREAM_KEY=%s\n' "${url%/}" "$key" >/etc/bearproof/stream.env
systemctl restart bearproof-stream.service
echo "saved. The stream starts in about 15 seconds: journalctl -u bearproof-stream -f"
