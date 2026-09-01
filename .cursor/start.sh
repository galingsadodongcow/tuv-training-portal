#!/usr/bin/env bash
# Per-boot startup for the Academy Portal Cloud Agent environment.
#
# Brings up a self-contained local Supabase stack (Docker) and seeds it, so the
# Next.js dev server (started separately as a terminal) has a working backend
# with demo users and sample data. Idempotent and safe to re-run.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# --- Docker daemon (nested VM needs fuse-overlayfs + relaxed bridge netfilter) ---
sudo mkdir -p /etc/docker
if [ ! -f /etc/docker/daemon.json ]; then
  printf '{\n  "storage-driver": "fuse-overlayfs",\n  "features": { "containerd-snapshotter": false }\n}\n' \
    | sudo tee /etc/docker/daemon.json >/dev/null
fi

if ! sudo docker info >/dev/null 2>&1; then
  echo "[start] launching dockerd..."
  sudo rm -f /var/run/docker.pid
  sudo bash -c 'nohup dockerd >/var/log/dockerd.log 2>&1 &'
  for i in $(seq 1 30); do
    sudo docker info >/dev/null 2>&1 && break
    sleep 1
  done
fi
sudo docker info >/dev/null 2>&1 || { echo "[start] dockerd failed to start"; sudo tail -n 40 /var/log/dockerd.log; exit 1; }

# Same-bridge container traffic must bypass iptables in this nested environment.
sudo sysctl -w net.bridge.bridge-nf-call-iptables=0 net.bridge.bridge-nf-call-ip6tables=0 >/dev/null 2>&1 || true
# Let the non-root user reach the daemon (supabase CLI runs unprivileged).
sudo chmod 666 /var/run/docker.sock 2>/dev/null || true

# --- Supabase stack ---
echo "[start] starting supabase..."
supabase start

# --- Seed + migrate + expose academy_v2 + write .env.local ---
bash "$REPO_ROOT/.cursor/local-supabase/setup.sh"

echo "[start] environment ready."
