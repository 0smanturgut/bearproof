#!/usr/bin/env bash
# The Build Agent's sandbox needs bubblewrap and socat, and on Ubuntu 24.04+ an AppArmor profile that lets bwrap
# create user namespaces (per Claude Code's sandboxing docs). Idempotent.
set -euo pipefail
sudo apt-get install -y -q bubblewrap socat >/dev/null
if [ "$(sysctl -n kernel.apparmor_restrict_unprivileged_userns 2>/dev/null || echo 0)" = "1" ]; then
    sudo tee /etc/apparmor.d/bwrap >/dev/null <<'P'
abi <abi/4.0>,
include <tunables/global>

profile bwrap /usr/bin/bwrap flags=(unconfined) {
  userns,
  include if exists <local/bwrap>
}
P
    sudo systemctl reload apparmor
fi
bwrap --ro-bind / / --unshare-net true && echo "sandbox: bubblewrap works"
