#!/usr/bin/env bash
# elevator-sim — Proxmox VE one-shot installer
#
# Run on a Proxmox VE host shell (not inside an LXC!). Creates a new
# unprivileged Debian LXC with Docker support, then runs scripts/install.sh
# inside it to bring up elevator-sim via docker compose.
#
# Usage (interactive, on the Proxmox host):
#     bash -c "$(curl -fsSL https://raw.githubusercontent.com/RyKaT07/elevator-sim/main/scripts/proxmox-install.sh)"
#
# Unattended (all defaults, no prompts):
#     ASSUME_YES=1 bash -c "$(curl -fsSL .../proxmox-install.sh)"
#
# Environment overrides (all optional):
#     CTID               next free id
#     CT_HOSTNAME        elevator-sim
#     CORES              1
#     RAM_MB             512
#     SWAP_MB            256
#     DISK_GB            4
#     STORAGE            first storage that supports rootdir
#     BRIDGE             vmbr0
#     IP                 dhcp  (or CIDR like 10.0.0.50/24 — then also GATEWAY)
#     GATEWAY            (only if IP is not dhcp)
#     NAMESERVER         DNS server (default: inherit from host)
#     SEARCHDOMAIN       DNS search domain (default: inherit from host)
#     TEMPLATE           debian-13-standard_*.tar.zst (latest matching)
#     CT_PASSWORD        random 24-char if unset
#     SSH_PUBKEY         a single public key string ('ssh-ed25519 AAAA...')
#     SSH_KEY_FILE       path to authorized_keys file
#     ELEVATOR_SIM_REPO  RyKaT07/elevator-sim
#     ELEVATOR_SIM_BRANCH main
#     ASSUME_YES=1       skip confirmation prompt

set -euo pipefail

# -----------------------------------------------------------------------------
# cosmetics + logging
# -----------------------------------------------------------------------------

TMP_PUBKEY=""
cleanup() {
    [ -n "$TMP_PUBKEY" ] && [ -f "$TMP_PUBKEY" ] && rm -f "$TMP_PUBKEY"
}
trap cleanup EXIT

if [ -t 1 ]; then
    C_RED=$'\033[31m' C_GREEN=$'\033[32m' C_YELLOW=$'\033[33m'
    C_BLUE=$'\033[34m' C_BOLD=$'\033[1m' C_RESET=$'\033[0m'
else
    C_RED="" C_GREEN="" C_YELLOW="" C_BLUE="" C_BOLD="" C_RESET=""
fi

log()  { printf '%s==>%s %s\n' "$C_BLUE" "$C_RESET" "$*" >&2; }
ok()   { printf '%s✓%s %s\n'   "$C_GREEN" "$C_RESET" "$*" >&2; }
warn() { printf '%s!%s %s\n'   "$C_YELLOW" "$C_RESET" "$*" >&2; }
fail() { printf '%s✗%s %s\n'   "$C_RED" "$C_RESET" "$*" >&2; exit 1; }

# -----------------------------------------------------------------------------
# preconditions
# -----------------------------------------------------------------------------

preflight() {
    [ "$(id -u)" -eq 0 ] || fail "must run as root on the Proxmox host"
    command -v pveversion >/dev/null 2>&1 || fail "pveversion not found — run this on a Proxmox VE host"
    command -v pct >/dev/null 2>&1        || fail "pct not found — is this a Proxmox VE host?"
    command -v pveam >/dev/null 2>&1      || fail "pveam not found — is this a Proxmox VE host?"
    command -v pvesm >/dev/null 2>&1      || fail "pvesm not found — is this a Proxmox VE host?"
    ok "running on $(pveversion | head -1)"
}

# -----------------------------------------------------------------------------
# config resolution
# -----------------------------------------------------------------------------

pick_ctid() {
    if [ -n "${CTID:-}" ]; then echo "$CTID"; return; fi
    if command -v pvesh >/dev/null 2>&1; then
        pvesh get /cluster/nextid 2>/dev/null && return
    fi
    local id=100
    while [ -f "/etc/pve/lxc/${id}.conf" ]; do id=$((id + 1)); done
    echo "$id"
}

pick_storage() {
    if [ -n "${STORAGE:-}" ]; then echo "$STORAGE"; return; fi
    pvesm status -content rootdir 2>/dev/null | awk 'NR>1 && $3 == "active" {print $1; exit}'
}

pick_template() {
    if [ -n "${TEMPLATE:-}" ]; then echo "$TEMPLATE"; return; fi
    log "refreshing template list"
    pveam update >/dev/null 2>&1 || warn "pveam update failed — using cached list"
    local latest
    latest=$(pveam available --section system 2>/dev/null \
        | awk '/debian-13-standard/ {print $2}' | sort -V | tail -1)
    [ -n "$latest" ] || fail "no debian-13-standard template found — try 'pveam update'"
    echo "$latest"
}

ensure_template_downloaded() {
    local template="$1" storage_for_tpl="local"
    if pveam list "$storage_for_tpl" 2>/dev/null | awk '{print $1}' | grep -q "${template}\$"; then
        ok "template already present: $template"
        return
    fi
    log "downloading template $template"
    pveam download "$storage_for_tpl" "$template"
    ok "template downloaded"
}

generate_password() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -base64 18 | tr -d '/+=\n'
    else
        head -c 18 /dev/urandom | base64 | tr -d '/+=\n'
    fi
}

# -----------------------------------------------------------------------------
# build config
# -----------------------------------------------------------------------------

build_config() {
    CTID="$(pick_ctid)"
    CT_HOSTNAME="${CT_HOSTNAME:-elevator-sim}"
    CORES="${CORES:-1}"
    RAM_MB="${RAM_MB:-512}"
    SWAP_MB="${SWAP_MB:-256}"
    DISK_GB="${DISK_GB:-4}"
    STORAGE="$(pick_storage)"
    [ -n "$STORAGE" ] || fail "could not detect storage — set STORAGE env"
    BRIDGE="${BRIDGE:-vmbr0}"
    IP="${IP:-dhcp}"
    GATEWAY="${GATEWAY:-}"
    NAMESERVER="${NAMESERVER:-}"
    SEARCHDOMAIN="${SEARCHDOMAIN:-}"
    TEMPLATE="$(pick_template)"
    CT_PASSWORD="${CT_PASSWORD:-$(generate_password)}"
    SSH_KEY_FILE="${SSH_KEY_FILE:-}"
    SSH_PUBKEY="${SSH_PUBKEY:-}"

    if [ -z "$SSH_KEY_FILE" ] && [ -n "$SSH_PUBKEY" ]; then
        case "$SSH_PUBKEY" in
            ssh-rsa\ *|ssh-ed25519\ *|ecdsa-sha2-*\ *|sk-*\ *) ;;
            *) fail "SSH_PUBKEY does not look like a public key" ;;
        esac
        TMP_PUBKEY="$(mktemp)"
        printf '%s\n' "$SSH_PUBKEY" > "$TMP_PUBKEY"
        chmod 600 "$TMP_PUBKEY"
        SSH_KEY_FILE="$TMP_PUBKEY"
    fi

    ELEVATOR_SIM_REPO="${ELEVATOR_SIM_REPO:-RyKaT07/elevator-sim}"
    ELEVATOR_SIM_BRANCH="${ELEVATOR_SIM_BRANCH:-main}"

    if [ "$IP" != "dhcp" ] && [ -z "$GATEWAY" ]; then
        fail "static IP ($IP) but GATEWAY is empty"
    fi
}

show_config() {
    echo
    printf '%s%selevator-sim LXC configuration%s\n' "$C_BOLD" "$C_BLUE" "$C_RESET"
    printf '  CTID:      %s\n' "$CTID"
    printf '  hostname:  %s\n' "$CT_HOSTNAME"
    printf '  template:  %s\n' "$TEMPLATE"
    printf '  storage:   %s\n' "$STORAGE"
    printf '  disk:      %s GB\n' "$DISK_GB"
    printf '  cores:     %s\n' "$CORES"
    printf '  ram:       %s MB\n' "$RAM_MB"
    printf '  swap:      %s MB\n' "$SWAP_MB"
    printf '  bridge:    %s\n' "$BRIDGE"
    printf '  ip:        %s\n' "$IP"
    [ -n "$GATEWAY" ]      && printf '  gateway:   %s\n' "$GATEWAY"
    [ -n "$NAMESERVER" ]   && printf '  dns:       %s\n' "$NAMESERVER"
    [ -n "$SEARCHDOMAIN" ] && printf '  search:    %s\n' "$SEARCHDOMAIN"
    printf '  repo:      github.com/%s@%s\n' "$ELEVATOR_SIM_REPO" "$ELEVATOR_SIM_BRANCH"
    echo
}

confirm_or_abort() {
    [ "${ASSUME_YES:-0}" = "1" ] && return
    [ -t 0 ] || return
    printf 'Proceed? [Y/n] '
    read -r answer
    case "${answer:-Y}" in
        Y|y|Yes|yes|'') ;;
        *) fail "aborted by user" ;;
    esac
}

# -----------------------------------------------------------------------------
# LXC create + start
# -----------------------------------------------------------------------------

create_lxc() {
    local template_path="local:vztmpl/${TEMPLATE}"
    local net="name=eth0,bridge=${BRIDGE},firewall=1"
    if [ "$IP" = "dhcp" ]; then
        net="${net},ip=dhcp"
    else
        net="${net},ip=${IP},gw=${GATEWAY}"
    fi

    local pct_args=(
        "$CTID" "$template_path"
        --hostname "$CT_HOSTNAME"
        --cores "$CORES"
        --memory "$RAM_MB"
        --swap "$SWAP_MB"
        --rootfs "${STORAGE}:${DISK_GB}"
        --unprivileged 1
        --features "nesting=1,keyctl=1"
        --net0 "$net"
        --ostype debian
        --start 0
        --onboot 1
        --password "$CT_PASSWORD"
    )

    [ -n "$NAMESERVER" ]   && pct_args+=(--nameserver "$NAMESERVER")
    [ -n "$SEARCHDOMAIN" ] && pct_args+=(--searchdomain "$SEARCHDOMAIN")
    if [ -n "$SSH_KEY_FILE" ]; then
        [ -f "$SSH_KEY_FILE" ] || fail "SSH_KEY_FILE not found: $SSH_KEY_FILE"
        pct_args+=(--ssh-public-keys "$SSH_KEY_FILE")
    fi

    log "creating LXC $CTID ($CT_HOSTNAME)"
    pct create "${pct_args[@]}"
    ok "LXC $CTID created"
}

start_lxc() {
    log "starting LXC $CTID"
    pct start "$CTID"
    ok "LXC started"
}

wait_for_network() {
    log "waiting for network"
    local i
    for i in $(seq 1 60); do
        if pct exec "$CTID" -- sh -c 'ping -c 1 -W 2 raw.githubusercontent.com >/dev/null 2>&1'; then
            ok "network up after ${i}s"
            return
        fi
        sleep 1
    done
    fail "LXC did not reach the internet within 60s — check bridge/DHCP"
}

# -----------------------------------------------------------------------------
# install inside LXC
# -----------------------------------------------------------------------------

install_inside() {
    log "installing curl + ca-certificates"
    pct exec "$CTID" -- bash -c \
        'DEBIAN_FRONTEND=noninteractive apt-get update -qq && \
         DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends curl ca-certificates' \
        || fail "apt-get failed inside LXC"

    local raw="https://raw.githubusercontent.com/${ELEVATOR_SIM_REPO}/${ELEVATOR_SIM_BRANCH}/scripts/install.sh"

    log "downloading elevator-sim installer"
    pct exec "$CTID" -- bash -c "curl -fsSL '${raw}' -o /tmp/elevator-sim-install.sh && chmod +x /tmp/elevator-sim-install.sh" \
        || fail "failed to download install.sh"

    log "running installer inside LXC"
    pct exec "$CTID" -- env \
        ELEVATOR_SIM_REPO="${ELEVATOR_SIM_REPO}" \
        ELEVATOR_SIM_BRANCH="${ELEVATOR_SIM_BRANCH}" \
        bash /tmp/elevator-sim-install.sh install \
        || fail "install.sh failed — see output above"

    pct exec "$CTID" -- rm -f /tmp/elevator-sim-install.sh || true
}

# -----------------------------------------------------------------------------
# summary
# -----------------------------------------------------------------------------

print_summary() {
    local lxc_ip
    lxc_ip="$(pct exec "$CTID" -- bash -c "hostname -I | awk '{print \$1}'" 2>/dev/null | tr -d '[:space:]')"

    echo
    printf '%s%s━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%s\n' "$C_BOLD" "$C_GREEN" "$C_RESET"
    printf '%s%s  elevator-sim is running%s\n' "$C_BOLD" "$C_GREEN" "$C_RESET"
    printf '%s%s━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%s\n' "$C_BOLD" "$C_GREEN" "$C_RESET"
    echo
    printf '  CTID:       %s\n' "$CTID"
    printf '  hostname:   %s\n' "$CT_HOSTNAME"
    printf '  LXC IP:     %s\n' "${lxc_ip:-unknown}"
    echo
    printf '  backend:    http://%s:8000/health\n' "${lxc_ip:-LXC_IP}"
    printf '  frontend:   http://%s:3000\n' "${lxc_ip:-LXC_IP}"
    echo
    printf '%s  SAVE THIS — will not be shown again:%s\n' "$C_YELLOW" "$C_RESET"
    printf '  root pw:    %s\n' "$CT_PASSWORD"
    echo
    cat <<EOF
Next steps
==========
1. Verify health check:
     curl http://${lxc_ip:-LXC_IP}:8000/health

2. Open frontend in browser:
     http://${lxc_ip:-LXC_IP}:3000

3. (Optional) Reverse proxy with TLS via Caddy on OPNsense:
     elevator.micasaserv.com → ${lxc_ip:-LXC_IP}:3000

4. Update later (from inside the LXC):
     sudo bash /opt/elevator-sim/scripts/install.sh update
EOF
}

# -----------------------------------------------------------------------------
# main
# -----------------------------------------------------------------------------

main() {
    preflight
    build_config
    show_config
    confirm_or_abort
    ensure_template_downloaded "$TEMPLATE"
    create_lxc
    start_lxc
    wait_for_network
    install_inside
    print_summary
}

main "$@"
