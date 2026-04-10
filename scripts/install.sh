#!/usr/bin/env bash
# elevator-sim — in-LXC installer
#
# Called by proxmox-install.sh via `pct exec`, or manually inside the LXC.
# Installs Docker, clones the repo, and starts services with docker compose.
#
# Usage:
#     bash install.sh install     # first-time setup
#     bash install.sh update      # pull latest + rebuild

set -euo pipefail

REPO="${ELEVATOR_SIM_REPO:-RyKaT07/elevator-sim}"
BRANCH="${ELEVATOR_SIM_BRANCH:-main}"
INSTALL_DIR="/opt/elevator-sim"

# -----------------------------------------------------------------------------
# helpers
# -----------------------------------------------------------------------------

log()  { printf '\033[34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
fail() { printf '\033[31m✗\033[0m %s\n' "$*"; exit 1; }

# -----------------------------------------------------------------------------
# install Docker (Debian/Ubuntu)
# -----------------------------------------------------------------------------

install_docker() {
    if command -v docker >/dev/null 2>&1; then
        ok "Docker already installed: $(docker --version)"
        return
    fi

    log "installing Docker via official convenience script"
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
    ok "Docker installed: $(docker --version)"
}

# -----------------------------------------------------------------------------
# clone / update repo
# -----------------------------------------------------------------------------

clone_repo() {
    if [ -d "$INSTALL_DIR/.git" ]; then
        log "repo exists, pulling latest"
        cd "$INSTALL_DIR"
        git fetch origin "$BRANCH"
        git reset --hard "origin/$BRANCH"
    else
        log "cloning github.com/${REPO}@${BRANCH}"
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends git >/dev/null 2>&1
        git clone --branch "$BRANCH" --single-branch "https://github.com/${REPO}.git" "$INSTALL_DIR"
    fi
    ok "repo at $INSTALL_DIR"
}

# -----------------------------------------------------------------------------
# start services
# -----------------------------------------------------------------------------

start_services() {
    cd "$INSTALL_DIR"
    log "building and starting services with docker compose"
    docker compose up -d --build
    ok "services started"
}

# -----------------------------------------------------------------------------
# create systemd service for auto-restart
# -----------------------------------------------------------------------------

create_systemd() {
    cat > /etc/systemd/system/elevator-sim.service <<EOF
[Unit]
Description=Elevator Simulator (docker compose)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable elevator-sim.service
    ok "systemd service created and enabled"
}

# -----------------------------------------------------------------------------
# health check
# -----------------------------------------------------------------------------

wait_healthy() {
    log "waiting for services to be healthy"
    local i
    for i in $(seq 1 30); do
        if curl -sf http://127.0.0.1:8000/health >/dev/null 2>&1; then
            ok "backend healthy after ${i}s"
            return
        fi
        sleep 1
    done
    fail "backend did not become healthy within 30s — check 'docker compose logs'"
}

# -----------------------------------------------------------------------------
# commands
# -----------------------------------------------------------------------------

cmd_install() {
    install_docker
    clone_repo
    start_services
    create_systemd
    wait_healthy
    ok "elevator-sim is running"
}

cmd_update() {
    clone_repo
    start_services
    wait_healthy
    ok "elevator-sim updated and running"
}

# -----------------------------------------------------------------------------
# main
# -----------------------------------------------------------------------------

case "${1:-install}" in
    install) cmd_install ;;
    update)  cmd_update ;;
    *)       fail "unknown command: $1 (use install or update)" ;;
esac
