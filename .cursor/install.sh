#!/usr/bin/env bash
# One-time environment bootstrap for Academy Portal (Cloud Agent build/install).
#
# Installs system tooling, the Supabase CLI, project dependencies, and pre-pulls
# the Supabase Docker images so first boot is fast. Idempotent.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SUPABASE_CLI_VERSION="2.116.0"

echo "[install] installing system packages..."
# Non-interactive, and auto-resolve conffile prompts (e.g. /etc/fuse.conf) so the
# install never blocks waiting on stdin.
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
APT_OPTS=(-y -qq -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)
sudo -E apt-get update -qq
# docker.io + fuse-overlayfs: run Supabase locally in this nested VM.
# postgresql-client: apply migrations / inspect the database.
sudo -E apt-get install "${APT_OPTS[@]}" docker.io fuse-overlayfs postgresql-client ca-certificates curl

echo "[install] installing supabase CLI ${SUPABASE_CLI_VERSION}..."
if ! command -v supabase >/dev/null 2>&1 || [ "$(supabase --version 2>/dev/null)" != "$SUPABASE_CLI_VERSION" ]; then
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/supabase.tar.gz" \
    "https://github.com/supabase/cli/releases/download/v${SUPABASE_CLI_VERSION}/supabase_linux_amd64.tar.gz"
  tar -xzf "$tmp/supabase.tar.gz" -C "$tmp"
  sudo install -m 0755 "$tmp/supabase" /usr/local/bin/supabase
  rm -rf "$tmp"
fi
supabase --version

echo "[install] installing node dependencies..."
# Never block on corepack's "about to download" confirmation.
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile

echo "[install] pre-pulling Supabase Docker images..."
sudo mkdir -p /etc/docker
printf '{\n  "storage-driver": "fuse-overlayfs",\n  "features": { "containerd-snapshotter": false }\n}\n' \
  | sudo tee /etc/docker/daemon.json >/dev/null
if ! sudo docker info >/dev/null 2>&1; then
  sudo rm -f /var/run/docker.pid
  sudo bash -c 'nohup dockerd >/var/log/dockerd.log 2>&1 &'
  for i in $(seq 1 30); do sudo docker info >/dev/null 2>&1 && break; sleep 1; done
fi
sudo sysctl -w net.bridge.bridge-nf-call-iptables=0 net.bridge.bridge-nf-call-ip6tables=0 >/dev/null 2>&1 || true
sudo chmod 666 /var/run/docker.sock 2>/dev/null || true
# Bring the stack up once to cache images into the snapshot, then tear it down
# so the snapshot is captured with no running containers.
if sudo docker info >/dev/null 2>&1; then
  supabase start || true
  supabase stop --no-backup || true
fi

echo "[install] done."
