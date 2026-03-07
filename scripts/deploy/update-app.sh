#!/usr/bin/env bash

set -Eeuo pipefail

APP_SERVICE="qq-farm-bot"
DEPLOY_DIR="${DEPLOY_DIR:-$(pwd)}"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'
DOCKER=(docker)
SUDO=""

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

trap 'print_error "主程序更新失败，请检查上方日志。"' ERR

if [ "${EUID:-$(id -u)}" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
fi

ensure_docker() {
    if ! command -v docker >/dev/null 2>&1; then
        print_error "未检测到 Docker。"
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

wait_for_app() {
    local timeout="${1:-240}"
    local started_at
    started_at="$(date +%s)"

    while true; do
        local status="missing"
        local health="none"

        if status="$("${DOCKER[@]}" inspect -f '{{.State.Status}}' "${APP_SERVICE}" 2>/dev/null)"; then
            health="$("${DOCKER[@]}" inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${APP_SERVICE}" 2>/dev/null || true)"
        fi

        if [ "${status}" = "running" ] && { [ "${health}" = "healthy" ] || [ "${health}" = "none" ]; }; then
            print_success "${APP_SERVICE} 已恢复运行。"
            return 0
        fi

        if [ $(( $(date +%s) - started_at )) -ge "${timeout}" ]; then
            print_error "${APP_SERVICE} 在 ${timeout}s 内未恢复健康。"
            "${DOCKER[@]}" logs --tail 120 "${APP_SERVICE}" || true
            return 1
        fi

        sleep 5
    done
}

main() {
    ensure_docker

    if [ ! -f "${DEPLOY_DIR}/docker-compose.yml" ]; then
        print_error "未找到 ${DEPLOY_DIR}/docker-compose.yml，请在部署目录内执行本脚本。"
        exit 1
    fi

    cd "${DEPLOY_DIR}"

    local old_image=""
    local new_image=""
    old_image="$("${DOCKER[@]}" inspect -f '{{.Image}}' "${APP_SERVICE}" 2>/dev/null || true)"

    print_info "仅更新主程序容器，不会重启 MySQL / Redis / ipad860。"
    "${DOCKER[@]}" compose pull "${APP_SERVICE}"
    "${DOCKER[@]}" compose up -d --no-deps "${APP_SERVICE}"
    wait_for_app 240

    new_image="$("${DOCKER[@]}" inspect -f '{{.Image}}' "${APP_SERVICE}" 2>/dev/null || true)"

    echo ""
    "${DOCKER[@]}" compose ps
    echo ""
    print_success "主程序更新完成。"
    echo "旧镜像 ID: ${old_image:-unknown}"
    echo "新镜像 ID: ${new_image:-unknown}"
    echo "未变更服务: qq-farm-mysql / qq-farm-redis / qq-farm-ipad860"
    echo ""
}

main "$@"
