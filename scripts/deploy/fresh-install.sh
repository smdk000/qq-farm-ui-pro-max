#!/usr/bin/env bash

set -Eeuo pipefail

APP_NAME="QQ 农场智能助手"
APP_SERVICE="qq-farm-bot"
STACK_CONTAINERS=("qq-farm-bot" "qq-farm-mysql" "qq-farm-redis" "qq-farm-ipad860")
REPO_SLUG="${REPO_SLUG:-smdk000/qq-farm-ui-pro-max}"
REPO_REF="${REPO_REF:-main}"
RAW_BASE_URL="${RAW_BASE_URL:-https://raw.githubusercontent.com/${REPO_SLUG}/${REPO_REF}}"
DATE_STAMP="$(date +%Y_%m_%d)"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/${DATE_STAMP}/qq-farm-bot}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." 2>/dev/null && pwd || pwd)"
USE_LOCAL_BUNDLE=0
DOCKER=(docker)
SUDO=""

trap 'print_error "脚本执行失败，请检查上方日志。"' ERR

if [ -f "${REPO_ROOT}/deploy/docker-compose.yml" ] \
    && [ -f "${REPO_ROOT}/deploy/.env.example" ] \
    && [ -f "${REPO_ROOT}/deploy/init-db/01-init.sql" ]; then
    USE_LOCAL_BUNDLE=1
fi

if [ "${EUID:-$(id -u)}" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
fi

run_root() {
    if [ -n "${SUDO}" ]; then
        "${SUDO}" "$@"
    else
        "$@"
    fi
}

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        print_error "缺少命令: $1"
        exit 1
    fi
}

ensure_docker() {
    if ! command -v docker >/dev/null 2>&1; then
        print_warning "未检测到 Docker，开始自动安装。"
        require_cmd curl
        curl -fsSL https://get.docker.com | run_root sh
        run_root systemctl enable docker >/dev/null 2>&1 || true
        run_root systemctl start docker >/dev/null 2>&1 || true
    fi

    if docker info >/dev/null 2>&1; then
        DOCKER=(docker)
    elif [ -n "${SUDO}" ] && "${SUDO}" docker info >/dev/null 2>&1; then
        DOCKER=("${SUDO}" docker)
    else
        print_error "Docker 已安装，但当前用户无法访问 Docker daemon。"
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
    local port="${WEB_PORT:-3080}"
    while port_in_use "${port}"; do
        print_warning "端口 ${port} 已被占用。"
        read -r -p "请输入新的 Web 端口（直接回车使用 $((port + 1))）: " new_port
        port="${new_port:-$((port + 1))}"
    done
    echo "${port}"
}

ensure_clean_target() {
    local existing=()
    for name in "${STACK_CONTAINERS[@]}"; do
        if "${DOCKER[@]}" container inspect "${name}" >/dev/null 2>&1; then
            existing+=("${name}")
        fi
    done

    if [ "${#existing[@]}" -gt 0 ]; then
        print_error "检测到已有部署容器: ${existing[*]}"
        print_error "全新部署脚本不会覆盖现有环境，请改用 update-app.sh 或手动处理旧容器。"
        exit 1
    fi
}

download_file() {
    local remote_path="$1"
    local target_path="$2"
    curl -fsSL "${RAW_BASE_URL}/${remote_path}" -o "${target_path}"
}

copy_or_download_bundle() {
    local target_dir="$1"

    run_root mkdir -p "${target_dir}/init-db"
    if [ ! -w "${target_dir}" ] && [ -n "${SUDO}" ]; then
        run_root chown -R "$(id -u):$(id -g)" "${target_dir}"
    fi

    if [ "${USE_LOCAL_BUNDLE}" -eq 1 ]; then
        cp "${REPO_ROOT}/deploy/docker-compose.yml" "${target_dir}/docker-compose.yml"
        cp "${REPO_ROOT}/deploy/.env.example" "${target_dir}/.env.example"
        cp "${REPO_ROOT}/deploy/init-db/01-init.sql" "${target_dir}/init-db/01-init.sql"
        cp "${REPO_ROOT}/deploy/README.md" "${target_dir}/README.md"
        cp "${REPO_ROOT}/scripts/deploy/update-app.sh" "${target_dir}/update-app.sh"
    else
        download_file "deploy/docker-compose.yml" "${target_dir}/docker-compose.yml"
        download_file "deploy/.env.example" "${target_dir}/.env.example"
        download_file "deploy/init-db/01-init.sql" "${target_dir}/init-db/01-init.sql"
        download_file "deploy/README.md" "${target_dir}/README.md"
        download_file "scripts/deploy/update-app.sh" "${target_dir}/update-app.sh"
    fi

    cp "${target_dir}/.env.example" "${target_dir}/.env"
    chmod +x "${target_dir}/update-app.sh"
}

set_env_value() {
    local key="$1"
    local value="$2"
    local file="$3"
    local escaped="${value//&/\\&}"
    if grep -q "^${key}=" "${file}"; then
        sed -i.bak "s|^${key}=.*|${key}=${escaped}|" "${file}"
        rm -f "${file}.bak"
    else
        printf '%s=%s\n' "${key}" "${value}" >> "${file}"
    fi
}

sync_env_from_shell() {
    local file="$1"
    local keys=(
        ADMIN_PASSWORD
        MYSQL_ROOT_PASSWORD
        MYSQL_DATABASE
        MYSQL_USER
        MYSQL_PASSWORD
        MYSQL_POOL_LIMIT
        REDIS_PASSWORD
        COOKIE_SECURE
        CORS_ORIGINS
        JWT_SECRET
        WX_API_KEY
        WX_API_URL
        WX_APP_ID
        LOG_LEVEL
        TZ
    )

    local key
    for key in "${keys[@]}"; do
        if [ -n "${!key:-}" ]; then
            set_env_value "${key}" "${!key}" "${file}"
        fi
    done
}

wait_for_container() {
    local name="$1"
    local timeout="${2:-180}"
    local started_at
    started_at="$(date +%s)"

    while true; do
        local status="missing"
        local health="none"

        if status="$("${DOCKER[@]}" inspect -f '{{.State.Status}}' "${name}" 2>/dev/null)"; then
            health="$("${DOCKER[@]}" inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${name}" 2>/dev/null || true)"
        fi

        if [ "${status}" = "running" ] && { [ "${health}" = "healthy" ] || [ "${health}" = "none" ]; }; then
            print_success "${name} 已就绪 (${health})"
            return 0
        fi

        if [ $(( $(date +%s) - started_at )) -ge "${timeout}" ]; then
            print_error "${name} 在 ${timeout}s 内未就绪。"
            "${DOCKER[@]}" logs --tail 80 "${name}" || true
            return 1
        fi

        sleep 5
    done
}

main() {
    echo ""
    echo "=========================================="
    echo "  ${APP_NAME} - 全新服务器一键部署"
    echo "=========================================="
    echo ""

    require_cmd date
    require_cmd mkdir
    require_cmd chmod
    require_cmd sed
    require_cmd grep
    require_cmd curl

    ensure_docker
    ensure_clean_target

    local arch
    arch="$(uname -m)"
    print_info "服务器架构: ${arch}"
    if [ "${arch}" = "aarch64" ] || [ "${arch}" = "arm64" ]; then
        print_warning "当前为 ARM64，ipad860 将以 linux/amd64 模式运行，请确认宿主机支持 QEMU 模拟。"
        run_root sysctl -w vm.overcommit_memory=1 >/dev/null 2>&1 || true
    fi

    local web_port
    web_port="$(choose_web_port)"

    print_info "部署目录: ${DEPLOY_DIR}"
    run_root mkdir -p "${DEPLOY_DIR}"
    if [ ! -w "${DEPLOY_DIR}" ] && [ -n "${SUDO}" ]; then
        run_root chown -R "$(id -u):$(id -g)" "${DEPLOY_DIR}"
    fi

    copy_or_download_bundle "${DEPLOY_DIR}"
    set_env_value "WEB_PORT" "${web_port}" "${DEPLOY_DIR}/.env"
    sync_env_from_shell "${DEPLOY_DIR}/.env"

    cd "${DEPLOY_DIR}"

    print_info "拉取镜像并启动服务..."
    "${DOCKER[@]}" compose pull
    "${DOCKER[@]}" compose up -d

    wait_for_container "qq-farm-mysql" 240
    wait_for_container "qq-farm-redis" 120
    wait_for_container "qq-farm-ipad860" 180
    wait_for_container "qq-farm-bot" 240

    if command -v curl >/dev/null 2>&1; then
        curl -fsS "http://127.0.0.1:${web_port}/api/ping" >/dev/null 2>&1 || print_warning "接口探活未通过，请稍后执行: curl http://127.0.0.1:${web_port}/api/ping"
    fi

    echo ""
    "${DOCKER[@]}" compose ps
    echo ""
    print_success "部署完成。"
    echo "目录: ${DEPLOY_DIR}"
    echo "访问地址: http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost'):${web_port}"
    echo "默认管理员: admin"
    echo "管理员密码: 见 ${DEPLOY_DIR}/.env 中的 ADMIN_PASSWORD"
    echo "后续仅更新主程序: cd ${DEPLOY_DIR} && ./update-app.sh"
    echo ""
}

main "$@"
