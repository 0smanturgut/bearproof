# 24/7 stream of the control room

A VPS streams `https://bearproof.app/live?tv=1` to X around the clock: Xvfb (a virtual screen), Google Chrome in
kiosk mode, ffmpeg over RTMP, one systemd service that restarts itself. The page is built for this: it scales to any
16:9 screen, switches to each new build at 00:00 UTC, and reloads itself twice a day outside build sessions.

**Needs:** Ubuntu 22.04/24.04, 2 vCPU and 4 GB RAM for 720p30 (the default; measured on a 2 vCPU KVM: ffmpeg ~0.4 core, Chrome ~0.3, steady 30 fps), 4 vCPU and 8 GB for 1080p30, ~3 GB of
disk, ~4.6 Mbit/s up all the time (about 1.5 TB a month).

```bash
git clone https://github.com/0smanturgut/bearproof /opt/bearproof
bash /opt/bearproof/ops/stream/setup.sh     # packages, the bpstream user, the systemd unit
bash /opt/bearproof/ops/stream/set-key.sh   # the operator types X's RTMP URL and stream key (hidden), starts it
journalctl -u bearproof-stream -f           # logs (the key is scrubbed)
```

1080p: `systemctl edit bearproof-stream`, add `Environment=WIDTH=1920 HEIGHT=1080 BITRATE=6000k`, restart. Stop:
`systemctl stop bearproof-stream`. Update: `git -C /opt/bearproof pull && systemctl restart bearproof-stream`.

After a page deploy, reload the page without cutting the stream: `DISPLAY=:99 xdotool key F5`.

The stream key lives only in `/etc/bearproof/stream.env` on the server (root-only). Never commit it.
