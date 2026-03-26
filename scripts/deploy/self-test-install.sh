#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_NAME="${STACK_NAME:-qq-farm}"
TMP_ROOT="${TMPDIR:-/tmp}"
SELFTEST_BASE_DIR=""
KEEP_ARTIFACTS=0
FORCE_BUILD_FALLBACK=0
RUN_UPDATE=1
RUN_MANUAL_WIZARD=1
WEB_PORT=""
SELFTEST_FAILED=1
SELFTEST_APP_IMAGE=""
DOCKER=(docker)
SUDO=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# shellcheck source=stack-layout.sh
. "${SCRIPT_DIR}/stack-layout.sh"

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --base-dir)
                SELFTEST_BASE_DIR="${2:-}"
                shift 2
                ;;
            --web-port)
                WEB_PORT="${2:-}"
                shift 2
                ;;
            --keep-artifacts)
                KEEP_ARTIFACTS=1
                shift
                ;;
            --force-build-fallback)
                FORCE_BUILD_FALLBACK=1
                shift
                ;;
            --skip-update)
                RUN_UPDATE=0
                shift
                ;;
            --skip-manual-wizard)
                RUN_MANUAL_WIZARD=0
                shift
                ;;
            *)
                print_error "未知参数: $1"
                exit 1
                ;;
        esac
    done
}

if [ "${EUID:-$(id -u)}" -ne 0 ] && command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
    SUDO="sudo"
fi

ensure_docker() {
    if ! command -v docker >/dev/null 2>&1; then
        print_error "未检测到 Docker，无法执行自测。"
        exit 1
    fi

    if docker info >/dev/null 2>&1; then
        DOCKER=(docker)
    elif [ -n "${SUDO}" ] && "${SUDO}" docker info >/dev/null 2>&1; then
        DOCKER=("${SUDO}" docker)
    else
        print_error "Docker daemon 不可访问。"
        exit 1
    fi

    "${DOCKER[@]}" compose version >/dev/null 2>&1 || {
        print_error "当前 Docker 缺少 compose v2，请升级 Docker。"
        exit 1
    }
}

port_in_use() {
    local port="$1"
    if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)${port}$"; then
        return 0
    fi
    if command -v lsof >/dev/null 2>&1 && lsof -iTCP:"${port}" -sTCP:LISTEN -nP >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

choose_web_port() {
    local port="${WEB_PORT:-38080}"
    while port_in_use "${port}"; do
        port="$((port + 1))"
    done
    WEB_PORT="${port}"
}

ensure_safe_environment() {
    local existing=""
    local stack_prefix=""
    stack_prefix="$(normalize_stack_name "${STACK_NAME}")"
    if command -v rg >/dev/null 2>&1; then
        existing="$(docker ps -a --format '{{.Names}}' | rg "^${stack_prefix}-" || true)"
    else
        existing="$(docker ps -a --format '{{.Names}}' | grep -E "^${stack_prefix}-" || true)"
    fi
    if [ -n "${existing}" ]; then
        print_error "检测到现有 qq-farm 容器，拒绝执行自测以避免冲突："
        printf '%s\n' "${existing}"
        exit 1
    fi
}

prepare_dirs() {
    if [ -z "${SELFTEST_BASE_DIR}" ]; then
        SELFTEST_BASE_DIR="$(mktemp -d "${TMP_ROOT%/}/qq-farm-selftest.XXXXXX")"
    else
        mkdir -p "${SELFTEST_BASE_DIR}"
    fi

    if [ "${FORCE_BUILD_FALLBACK}" = "1" ]; then
        SELFTEST_APP_IMAGE="smdk000/qq-farm-bot-ui:selftest-$(date +%Y%m%d%H%M%S)"
    fi
}

get_current_link() {
    stack_current_link_path "${SELFTEST_BASE_DIR}" "${STACK_NAME}"
}

get_deploy_dir() {
    local current_link=""
    current_link="$(get_current_link)"
    if [ -L "${current_link}" ] || [ -d "${current_link}" ]; then
        (cd "${current_link}" && pwd -P)
    fi
}

assert_backup_created() {
    local backup_root="${SELFTEST_BASE_DIR}/backups"
    if find "${backup_root}" -mindepth 1 -maxdepth 1 -type d >/dev/null 2>&1; then
        print_success "检测到更新备份目录: ${backup_root}"
        return 0
    fi
    print_error "未检测到 preserve 模式生成的备份目录: ${backup_root}"
    return 1
}

cleanup() {
    local deploy_dir=""
    deploy_dir="$(get_deploy_dir || true)"

    if [ "${KEEP_ARTIFACTS}" = "1" ] || [ "${SELFTEST_FAILED}" = "1" ]; then
        if [ -n "${SELFTEST_BASE_DIR}" ]; then
            print_warning "保留自测目录: ${SELFTEST_BASE_DIR}"
        fi
        return 0
    fi

    if [ -n "${deploy_dir}" ] && [ -f "${deploy_dir}/docker-compose.yml" ]; then
        print_info "清理自测容器与数据卷..."
        (cd "${deploy_dir}" && "${DOCKER[@]}" compose down -v --remove-orphans) >/dev/null 2>&1 || true
    fi

    if [ -n "${SELFTEST_APP_IMAGE}" ]; then
        "${DOCKER[@]}" image rm -f "${SELFTEST_APP_IMAGE}" >/dev/null 2>&1 || true
    fi

    if [ -n "${SELFTEST_BASE_DIR}" ] && [ -d "${SELFTEST_BASE_DIR}" ]; then
        rm -rf "${SELFTEST_BASE_DIR}"
    fi
}

run_install_test() {
    local cmd=(
        bash "${SCRIPT_DIR}/install-or-update.sh"
        "--action" "install"
        "--deploy-base-dir" "${SELFTEST_BASE_DIR}"
        "--non-interactive"
        "--web-port" "${WEB_PORT}"
    )

    if [ -n "${SELFTEST_APP_IMAGE}" ]; then
        cmd+=("--image" "${SELFTEST_APP_IMAGE}")
    fi

    print_info "开始自测安装..."
    COMPOSE_PULL_RETRIES=1 PULL_RETRY_DELAY_SECONDS=1 "${cmd[@]}"
}

run_update_test() {
    local cmd=(
        bash "${SCRIPT_DIR}/install-or-update.sh"
        "--action" "update"
        "--deploy-base-dir" "${SELFTEST_BASE_DIR}"
        "--preserve-current"
        "--non-interactive"
    )

    if [ -n "${SELFTEST_APP_IMAGE}" ]; then
        cmd+=("--image" "${SELFTEST_APP_IMAGE}")
    fi

    print_info "开始自测更新..."
    COMPOSE_PULL_RETRIES=1 PULL_RETRY_DELAY_SECONDS=1 "${cmd[@]}"
    assert_backup_created
}

run_manual_wizard_test() {
    local deploy_dir=""
    deploy_dir="$(get_deploy_dir)"
    print_info "开始自测手动修复向导（非交互默认值）..."
    bash "${SCRIPT_DIR}/manual-config-wizard.sh" --deploy-dir "${deploy_dir}" --non-interactive
}

main() {
    parse_args "$@"
    ensure_docker
    ensure_safe_environment
    choose_web_port
    prepare_dirs
    trap cleanup EXIT

    echo ""
    echo "=========================================="
    echo "  部署脚本端到端自测"
    echo "=========================================="
    echo "临时根目录: ${SELFTEST_BASE_DIR}"
    echo "Web 端口: ${WEB_PORT}"
    if [ -n "${SELFTEST_APP_IMAGE}" ]; then
        echo "主程序镜像: ${SELFTEST_APP_IMAGE}（强制走源码构建 fallback）"
    fi
    echo ""

    run_install_test

    if [ "${RUN_UPDATE}" = "1" ]; then
        run_update_test
    fi

    if [ "${RUN_MANUAL_WIZARD}" = "1" ]; then
        run_manual_wizard_test
    fi

    SELFTEST_FAILED=0
    echo ""
    print_success "端到端自测完成。"
    echo "临时根目录: ${SELFTEST_BASE_DIR}"
    echo ""
}

main "$@"
