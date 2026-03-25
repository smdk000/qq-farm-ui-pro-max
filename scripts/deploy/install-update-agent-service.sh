#!/usr/bin/env bash

set -Eeuo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-$(pwd)}"
DEPLOY_BASE_DIR="${DEPLOY_BASE_DIR:-/opt}"
STACK_NAME="${STACK_NAME:-qq-farm}"
CURRENT_LINK_INPUT="${CURRENT_LINK:-}"
CURRENT_LINK="${CURRENT_LINK_INPUT:-${DEPLOY_BASE_DIR}/qq-farm-current}"
REPO_SLUG="${REPO_SLUG:-smdk000/qq-farm-ui-pro-max}"
REPO_REF="${REPO_REF:-main}"
RAW_BASE_URL="${RAW_BASE_URL:-https://raw.githubusercontent.com/${REPO_SLUG}/${REPO_REF}}"
SERVICE_NAME_INPUT="${SERVICE_NAME:-}"
SERVICE_NAME="${SERVICE_NAME_INPUT:-qq-farm-update-agent}"
AGENT_INTERVAL="${AGENT_INTERVAL:-15}"
RUN_UNINSTALL=0
ENABLE_AND_START=1
SUDO=""
CURRENT_LINK_EXPLICIT=0
SERVICE_NAME_EXPLICIT=0

print_info() { echo "[INFO] $1"; }
print_success() { echo "[OK] $1"; }
print_warning() { echo "[WARN] $1"; }
print_error() { echo "[ERROR] $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_LAYOUT_PATH="${SCRIPT_DIR}/stack-layout.sh"
if [ ! -f "${STACK_LAYOUT_PATH}" ]; then
    BOOTSTRAP_DIR="${TMPDIR:-/tmp}/qq-farm-deploy-bootstrap/${REPO_SLUG//\//_}/${REPO_REF}"
    mkdir -p "${BOOTSTRAP_DIR}"
    STACK_LAYOUT_PATH="${BOOTSTRAP_DIR}/stack-layout.sh"
    if [ ! -f "${STACK_LAYOUT_PATH}" ]; then
        command -v curl >/dev/null 2>&1 || {
            echo "[ERROR] 缺少 stack-layout.sh 且系统未安装 curl，无法继续执行。" >&2
            exit 1
        }
        curl -fsSL "${RAW_BASE_URL}/scripts/deploy/stack-layout.sh" -o "${STACK_LAYOUT_PATH}"
    fi
fi
# shellcheck source=stack-layout.sh
. "${STACK_LAYOUT_PATH}"

if [ -n "${CURRENT_LINK_INPUT}" ]; then
    CURRENT_LINK_EXPLICIT=1
fi
if [ -n "${SERVICE_NAME_INPUT}" ]; then
    SERVICE_NAME_EXPLICIT=1
fi

refresh_stack_layout() {
    STACK_NAME="$(normalize_stack_name "${STACK_NAME:-qq-farm}")"
    if [ "${CURRENT_LINK_EXPLICIT}" != "1" ]; then
        CURRENT_LINK="$(stack_current_link_path "${DEPLOY_BASE_DIR}" "${STACK_NAME}")"
    fi
    if [ "${SERVICE_NAME_EXPLICIT}" != "1" ]; then
        SERVICE_NAME="$(stack_agent_service_name "${STACK_NAME}")"
    fi
}

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --deploy-dir)
                DEPLOY_DIR="${2:-}"
                shift 2
                ;;
            --stack-name)
                STACK_NAME="${2:-}"
                shift 2
                ;;
            --service-name)
                SERVICE_NAME="${2:-}"
                SERVICE_NAME_EXPLICIT=1
                shift 2
                ;;
            --interval)
                AGENT_INTERVAL="${2:-15}"
                shift 2
                ;;
            --uninstall)
                RUN_UNINSTALL=1
                shift
                ;;
            --write-only)
                ENABLE_AND_START=0
                shift
                ;;
            *)
                print_error "Unknown argument: $1"
                exit 1
                ;;
        esac
    done

    refresh_stack_layout
}

if [ "${EUID:-$(id -u)}" -ne 0 ] && command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
    SUDO="sudo"
fi

run_root() {
    if [ -n "${SUDO}" ]; then
        "${SUDO}" "$@"
    else
        "$@"
    fi
}

canonicalize_dir() {
    local dir="$1"
    if [ -d "${dir}" ]; then
        (cd "${dir}" && pwd -P)
    fi
}

resolve_deploy_dir() {
    if [ -f "${DEPLOY_DIR}/update-agent.sh" ]; then
        DEPLOY_DIR="$(canonicalize_dir "${DEPLOY_DIR}")"
        if [ -f "${DEPLOY_DIR}/.env" ]; then
            set -a
            # shellcheck disable=SC1090
            . "${DEPLOY_DIR}/.env"
            set +a
            refresh_stack_layout
        fi
        return 0
    fi

    if [ -L "${CURRENT_LINK}" ] || [ -d "${CURRENT_LINK}" ]; then
        if [ -f "${CURRENT_LINK}/update-agent.sh" ]; then
            DEPLOY_DIR="$(canonicalize_dir "${CURRENT_LINK}")"
            return 0
        fi
    fi

    print_error "Could not find update-agent.sh. Use --deploy-dir to point at an active deployment."
    exit 1
}

write_unit_file() {
    local unit_file="/etc/systemd/system/${SERVICE_NAME}.service"

    run_root tee "${unit_file}" >/dev/null <<EOF
[Unit]
Description=QQ Farm Bot Update Agent
After=docker.service network-online.target
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=${DEPLOY_DIR}
ExecStart=/bin/bash ${DEPLOY_DIR}/update-agent.sh --loop --interval ${AGENT_INTERVAL} --deploy-dir ${DEPLOY_DIR}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

    print_success "Systemd unit written: ${unit_file}"
}

install_service() {
    write_unit_file
    run_root systemctl daemon-reload
    if [ "${ENABLE_AND_START}" = "1" ]; then
        run_root systemctl enable --now "${SERVICE_NAME}"
        print_success "Service enabled and started: ${SERVICE_NAME}"
    else
        print_warning "Unit written only. Start manually with: systemctl enable --now ${SERVICE_NAME}"
    fi
}

uninstall_service() {
    local unit_file="/etc/systemd/system/${SERVICE_NAME}.service"
    run_root systemctl disable --now "${SERVICE_NAME}" >/dev/null 2>&1 || true
    run_root rm -f "${unit_file}"
    run_root systemctl daemon-reload
    print_success "Service removed: ${SERVICE_NAME}"
}

main() {
    parse_args "$@"
    resolve_deploy_dir

    if [ "${RUN_UNINSTALL}" = "1" ]; then
        uninstall_service
        return 0
    fi

    install_service
}

main "$@"
