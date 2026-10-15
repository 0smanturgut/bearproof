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

## Nightly recording (for clips and screenshots)

`bearproof-rec.timer` starts `bearproof-rec.service` at 20:55 UTC every night: a second ffmpeg reads the same
virtual screen and writes it to disk until 00:35 UTC (the vote close, the whole build, the 00:00 switch). It runs
at the lowest CPU priority (measured: ~0.25 core at 720p30, the stream keeps its frames) and never touches the
stream. About 1.5 GB an hour.

```bash
cp /opt/bearproof/ops/stream/bearproof-{rec,prune}.{service,timer} /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now bearproof-rec.timer bearproof-prune.timer
```

Old recordings delete themselves: `bearproof-prune.timer` runs `prune-rec.sh` at 20:40 UTC every day (before the
night's recording). It keeps the raw video of the last 7 nights, the screenshots for 60 days and server-cut clips
(`cuts-<night>/`) for 30 days, and if the disk still has under 10 GB free, it deletes the oldest nights' video first
(never the newest two). It only touches `<YYYY-MM-DD>/` and `cuts-<YYYY-MM-DD>/` folders. See what it would delete:
`DRY_RUN=1 /opt/bearproof/ops/stream/prune-rec.sh`. Change the limits with `systemctl edit bearproof-prune`
(`Environment=KEEP_VIDEO_NIGHTS=10`). Cut and pull the clips you want from a night within those 7 days.

Output: `/var/lib/bearproof-rec/<night's UTC date>/HHMMSS.mkv` (15-minute pieces, named by start time in UTC) and
`shots/HHMMSS.png` (one a minute). Pull a night to the Mac (outside the repo, it's big):

```bash
rsync -av -e "ssh -i ~/.ssh/bearproof_vps -o IdentitiesOnly=yes" root@76.13.2.222:/var/lib/bearproof-rec/2026-09-24/ ~/Movies/BEARPROOF/2026-09-24/
```
