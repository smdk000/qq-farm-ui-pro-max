#!/usr/bin/env bash

set -Eeuo pipefail

APP_NAME="QQ 农场智能助手"
APP_SERVICE="qq-farm-bot"
REPO_SLUG="${REPO_SLUG:-smdk000/qq-farm-ui-pro-max}"
REPO_REF="${REPO_REF:-main}"
RAW_BASE_URL="${RAW_BASE_URL:-https://raw.githubusercontent.com/${REPO_SLUG}/${REPO_REF}}"
SOURCE_ARCHIVE_URL="${SOURCE_ARCHIVE_URL:-https://codeload.github.com/${REPO_SLUG}/tar.gz/${REPO_REF}}"
DATE_STAMP="$(date +%Y_%m_%d)"
DEPLOY_BASE_DIR="${DEPLOY_BASE_DIR:-/opt}"
STACK_NAME="${STACK_NAME:-qq-farm}"
DEPLOY_DIR="${DEPLOY_DIR:-${DEPLOY_BASE_DIR}/${DATE_STAMP}/qq-farm-bot}"
CURRENT_LINK_INPUT="${CURRENT_LINK:-}"
SOURCE_CACHE_DIR_INPUT="${SOURCE_CACHE_DIR:-}"
CURRENT_LINK="${CURRENT_LINK_INPUT:-${DEPLOY_BASE_DIR}/qq-farm-current}"
LEGACY_CURRENT_LINK=""
SOURCE_CACHE_DIR="${SOURCE_CACHE_DIR_INPUT:-${DEPLOY_BASE_DIR}/.qq-farm-build-src/${REPO_REF}}"
SOURCE_CACHE_REFRESH="${SOURCE_CACHE_REFRESH:-auto}"
OFFICIAL_DOCKERHUB_APP_IMAGE="${OFFICIAL_DOCKERHUB_APP_IMAGE:-smdk000/qq-farm-bot-ui}"
OFFICIAL_GHCR_APP_IMAGE="${OFFICIAL_GHCR_APP_IMAGE:-ghcr.io/${REPO_SLUG}}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'
COMPOSE_PULL_RETRIES="${COMPOSE_PULL_RETRIES:-3}"
PULL_RETRY_DELAY_SECONDS="${PULL_RETRY_DELAY_SECONDS:-10}"
ADMIN_PASSWORD_EXPLICIT=0
ADMIN_PASSWORD_OVERRIDE=""
DEPLOY_DIR_EXPLICIT=0
CURRENT_LINK_EXPLICIT=0
SOURCE_CACHE_DIR_EXPLICIT=0
STACK_DIR_NAME=""
APP_CONTAINER_NAME=""
MYSQL_CONTAINER_NAME=""
REDIS_CONTAINER_NAME=""
IPAD860_CONTAINER_NAME=""
STACK_CONTAINERS=()

if [ -n "${CURRENT_LINK_INPUT}" ]; then
    CURRENT_LINK_EXPLICIT=1
fi
if [ -n "${SOURCE_CACHE_DIR_INPUT}" ]; then
    SOURCE_CACHE_DIR_EXPLICIT=1
fi

if [ "${ADMIN_PASSWORD+x}" = "x" ] && [ -n "${ADMIN_PASSWORD}" ]; then
    ADMIN_PASSWORD_EXPLICIT=1
    ADMIN_PASSWORD_OVERRIDE="${ADMIN_PASSWORD}"
fi

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

refresh_stack_layout() {
    STACK_NAME="$(normalize_stack_name "${STACK_NAME:-qq-farm}")"
    STACK_DIR_NAME="$(stack_dir_name "${STACK_NAME}")"
    APP_CONTAINER_NAME="$(stack_container_name "${STACK_NAME}" "bot")"
    MYSQL_CONTAINER_NAME="$(stack_container_name "${STACK_NAME}" "mysql")"
    REDIS_CONTAINER_NAME="$(stack_container_name "${STACK_NAME}" "redis")"
    IPAD860_CONTAINER_NAME="$(stack_container_name "${STACK_NAME}" "ipad860")"
    STACK_CONTAINERS=("${APP_CONTAINER_NAME}" "${MYSQL_CONTAINER_NAME}" "${REDIS_CONTAINER_NAME}" "${IPAD860_CONTAINER_NAME}")

    if [ "${DEPLOY_DIR_EXPLICIT}" != "1" ]; then
        DEPLOY_DIR="${DEPLOY_BASE_DIR}/${DATE_STAMP}/${STACK_DIR_NAME}"
    fi
    if [ "${CURRENT_LINK_EXPLICIT}" != "1" ]; then
        CURRENT_LINK="$(stack_current_link_path "${DEPLOY_BASE_DIR}" "${STACK_NAME}")"
        LEGACY_CURRENT_LINK="$(stack_legacy_current_link_path "${DEPLOY_BASE_DIR}" "${STACK_NAME}")"
    else
        LEGACY_CURRENT_LINK="$(stack_legacy_current_link_for_current_link "${CURRENT_LINK}" "${STACK_NAME}")"
    fi
}

mask_secret() {
    local value="$1"
    if [ "${#value}" -le 2 ]; then
        printf '***'
        return 0
    fi
    printf '%s%s%s' "${value:0:1}" "$(printf '%*s' "$(( ${#value} - 2 ))" '' | tr ' ' '*')" "${value: -1}"
}

current_app_role() {
    printf '%s\n' "${APP_ROLE:-${ROLE:-standalone}}"
}

is_worker_role() {
    [ "$(current_app_role)" = "worker" ]
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." 2>/dev/null && pwd || pwd)"
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
USE_LOCAL_BUNDLE=0
LOCAL_BUNDLE_DIR=""
LOCAL_SCRIPT_BUNDLE_DIR=""
DOCKER=(docker)
SUDO=""
SKIP_DOCKER_PULL="${SKIP_DOCKER_PULL:-0}"
NON_INTERACTIVE="${NON_INTERACTIVE:-0}"
SKIP_IMAGE_ARCH_CHECK="${SKIP_IMAGE_ARCH_CHECK:-0}"
IMAGE_ARCHIVE_OVERRIDE="${IMAGE_ARCHIVE_OVERRIDE:-${IMAGE_ARCHIVE:-}}"
APP_IMAGE_SELECTED=""

trap 'print_error "脚本执行失败，请检查上方日志。"' ERR

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --web-port)
                WEB_PORT="${2:-}"
                shift 2
                ;;
            --deploy-dir)
                DEPLOY_DIR="${2:-}"
                DEPLOY_DIR_EXPLICIT=1
                shift 2
                ;;
            --deploy-base-dir)
                DEPLOY_BASE_DIR="${2:-}"
                shift 2
                ;;
            --stack-name)
                STACK_NAME="${2:-}"
                shift 2
                ;;
            --non-interactive)
                NON_INTERACTIVE=1
                shift
                ;;
            --image-archive)
                IMAGE_ARCHIVE_OVERRIDE="${2:-}"
                shift 2
                ;;
            *)
                print_error "未知参数: $1"
                exit 1
                ;;
        esac
    done

    refresh_stack_layout
    if [ "${SOURCE_CACHE_DIR_EXPLICIT}" != "1" ]; then
        SOURCE_CACHE_DIR="${DEPLOY_BASE_DIR}/.qq-farm-build-src/${REPO_REF}"
    fi
}

if [ -f "${REPO_ROOT}/deploy/docker-compose.yml" ] \
    && [ -f "${REPO_ROOT}/deploy/.env.example" ] \
    && [ -f "${REPO_ROOT}/deploy/init-db/01-init.sql" ]; then
    USE_LOCAL_BUNDLE=1
    LOCAL_BUNDLE_DIR="${REPO_ROOT}/deploy"
    LOCAL_SCRIPT_BUNDLE_DIR="${REPO_ROOT}/scripts/deploy"
elif [ -f "${SCRIPT_DIR}/docker-compose.yml" ] \
    && [ -f "${SCRIPT_DIR}/.env.example" ] \
    && [ -f "${SCRIPT_DIR}/init-db/01-init.sql" ]; then
    USE_LOCAL_BUNDLE=1
    LOCAL_BUNDLE_DIR="${SCRIPT_DIR}"
    LOCAL_SCRIPT_BUNDLE_DIR="${SCRIPT_DIR}"
fi

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
        if [ "${NON_INTERACTIVE}" = "1" ]; then
            port="$((port + 1))"
            print_warning "非交互模式下自动切换到端口 ${port}"
            continue
        fi
        read -r -p "请输入新的 Web 端口（直接回车使用 $((port + 1))）: " new_port
        port="${new_port:-$((port + 1))}"
    done
    echo "${port}"
}

ensure_target_dir_ready() {
    if [ -d "${DEPLOY_DIR}" ] && find "${DEPLOY_DIR}" -mindepth 1 -maxdepth 1 >/dev/null 2>&1; then
        print_error "部署目录已存在且非空: ${DEPLOY_DIR}"
        print_error "请更换 DEPLOY_DIR，或先清理旧目录后再执行。"
        exit 1
    fi
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
    if [ -n "${SUDO}" ]; then
        run_root chown -R "$(id -u):$(id -g)" "${target_dir}"
    fi

    if [ "${USE_LOCAL_BUNDLE}" -eq 1 ]; then
        cp "${LOCAL_BUNDLE_DIR}/docker-compose.yml" "${target_dir}/docker-compose.yml"
        cp "${LOCAL_BUNDLE_DIR}/.env.example" "${target_dir}/.env.example"
        cp "${LOCAL_BUNDLE_DIR}/init-db/01-init.sql" "${target_dir}/init-db/01-init.sql"
        cp "${LOCAL_BUNDLE_DIR}/README.md" "${target_dir}/README.md"
        cp "${LOCAL_SCRIPT_BUNDLE_DIR}/update-app.sh" "${target_dir}/update-app.sh"
        cp "${LOCAL_SCRIPT_BUNDLE_DIR}/repair-mysql.sh" "${target_dir}/repair-mysql.sh"
        cp "${LOCAL_SCRIPT_BUNDLE_DIR}/repair-deploy.sh" "${target_dir}/repair-deploy.sh"
        cp "${LOCAL_SCRIPT_BUNDLE_DIR}/fresh-install.sh" "${target_dir}/fresh-install.sh"
        cp "${LOCAL_SCRIPT_BUNDLE_DIR}/quick-deploy.sh" "${target_dir}/quick-deploy.sh"
        cp "${LOCAL_SCRIPT_BUNDLE_DIR}/install-or-update.sh" "${target_dir}/install-or-update.sh"
        cp "${LOCAL_SCRIPT_BUNDLE_DIR}/safe-update.sh" "${target_dir}/safe-update.sh"
        cp "${LOCAL_SCRIPT_BUNDLE_DIR}/update-agent.sh" "${target_dir}/update-agent.sh"
        cp "${LOCAL_SCRIPT_BUNDLE_DIR}/install-update-agent-service.sh" "${target_dir}/install-update-agent-service.sh"
        cp "${LOCAL_SCRIPT_BUNDLE_DIR}/manual-config-wizard.sh" "${target_dir}/manual-config-wizard.sh"
        cp "${LOCAL_SCRIPT_BUNDLE_DIR}/stack-layout.sh" "${target_dir}/stack-layout.sh"
        cp "${LOCAL_SCRIPT_BUNDLE_DIR}/verify-stack.sh" "${target_dir}/verify-stack.sh"
        cp "${LOCAL_SCRIPT_BUNDLE_DIR}/smoke-system-update-center.sh" "${target_dir}/smoke-system-update-center.sh"
    else
        download_file "deploy/docker-compose.yml" "${target_dir}/docker-compose.yml"
        download_file "deploy/.env.example" "${target_dir}/.env.example"
        download_file "deploy/init-db/01-init.sql" "${target_dir}/init-db/01-init.sql"
        download_file "deploy/README.md" "${target_dir}/README.md"
        download_file "scripts/deploy/update-app.sh" "${target_dir}/update-app.sh"
        download_file "scripts/deploy/repair-mysql.sh" "${target_dir}/repair-mysql.sh"
        download_file "scripts/deploy/repair-deploy.sh" "${target_dir}/repair-deploy.sh"
        download_file "scripts/deploy/fresh-install.sh" "${target_dir}/fresh-install.sh"
        download_file "scripts/deploy/quick-deploy.sh" "${target_dir}/quick-deploy.sh"
        download_file "scripts/deploy/install-or-update.sh" "${target_dir}/install-or-update.sh"
        download_file "scripts/deploy/safe-update.sh" "${target_dir}/safe-update.sh"
        download_file "scripts/deploy/update-agent.sh" "${target_dir}/update-agent.sh"
        download_file "scripts/deploy/install-update-agent-service.sh" "${target_dir}/install-update-agent-service.sh"
        download_file "scripts/deploy/manual-config-wizard.sh" "${target_dir}/manual-config-wizard.sh"
        download_file "scripts/deploy/stack-layout.sh" "${target_dir}/stack-layout.sh"
        download_file "scripts/deploy/verify-stack.sh" "${target_dir}/verify-stack.sh"
        download_file "scripts/deploy/smoke-system-update-center.sh" "${target_dir}/smoke-system-update-center.sh"
    fi

    cp "${target_dir}/.env.example" "${target_dir}/.env"
    chmod +x "${target_dir}/update-app.sh"
    chmod +x "${target_dir}/repair-mysql.sh"
    chmod +x "${target_dir}/repair-deploy.sh"
    chmod +x "${target_dir}/fresh-install.sh"
    chmod +x "${target_dir}/quick-deploy.sh"
    chmod +x "${target_dir}/install-or-update.sh"
    chmod +x "${target_dir}/safe-update.sh"
    chmod +x "${target_dir}/update-agent.sh"
    chmod +x "${target_dir}/install-update-agent-service.sh"
    chmod +x "${target_dir}/manual-config-wizard.sh"
    chmod +x "${target_dir}/stack-layout.sh"
    chmod +x "${target_dir}/verify-stack.sh"
    chmod +x "${target_dir}/smoke-system-update-center.sh"
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
        STACK_NAME
        APP_ROLE
        SHARED_DOCKER_NETWORK
        SHARED_DOCKER_NETWORK_EXTERNAL
        MASTER_URL
        WORKER_TOKEN
        WORKER_NODE_ID
        WORKER_HEARTBEAT_INTERVAL_MS
        APP_IMAGE
        MYSQL_IMAGE
        REDIS_IMAGE
        IPAD860_IMAGE
        MYSQL_HOST
        MYSQL_PORT
        MYSQL_ROOT_PASSWORD
        MYSQL_DATABASE
        MYSQL_USER
        MYSQL_PASSWORD
        MYSQL_POOL_LIMIT
        REDIS_HOST
        REDIS_PORT
        REDIS_PASSWORD
        IPAD860_URL
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

is_truthy() {
    case "${1:-0}" in
        1|true|TRUE|yes|YES|on|ON)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

is_immutable_repo_ref() {
    local ref="${1:-}"

    [[ "${ref}" =~ ^[0-9a-fA-F]{40}$ ]] && return 0
    [[ "${ref}" =~ ^refs/tags/ ]] && return 0
    [[ "${ref}" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z._-]+)?$ ]] && return 0
    return 1
}

should_refresh_source_cache() {
    case "${SOURCE_CACHE_REFRESH:-auto}" in
        1|true|TRUE|yes|YES|on|ON|always|ALWAYS)
            return 0
            ;;
        0|false|FALSE|no|NO|off|OFF|never|NEVER)
            return 1
            ;;
    esac

    if [ "${SOURCE_CACHE_DIR_EXPLICIT}" = "1" ]; then
        return 1
    fi

    if is_immutable_repo_ref "${REPO_REF}"; then
        return 1
    fi

    return 0
}

normalize_arch() {
    case "${1:-}" in
        x86_64|amd64)
            printf 'amd64\n'
            ;;
        aarch64|arm64)
            printf 'arm64\n'
            ;;
        *)
            printf '%s\n' "${1:-unknown}"
            ;;
    esac
}

get_host_arch() {
    normalize_arch "$(uname -m)"
}

image_exists() {
    local image="$1"
    "${DOCKER[@]}" image inspect "${image}" >/dev/null 2>&1
}

get_local_image_arch() {
    local image="$1"
    "${DOCKER[@]}" image inspect --format '{{.Architecture}}' "${image}" 2>/dev/null | head -n 1
}

load_image_archive() {
    local archive="$1"

    [ -n "${archive}" ] || return 0

    if [ ! -f "${archive}" ]; then
        print_error "离线镜像包不存在: ${archive}"
        return 1
    fi

    print_info "加载离线镜像包: ${archive}"
    case "${archive}" in
        *.tar)
            "${DOCKER[@]}" load -i "${archive}"
            ;;
        *.tar.gz|*.tgz)
            if ! command -v gzip >/dev/null 2>&1; then
                print_error "缺少 gzip，无法导入压缩镜像包: ${archive}"
                return 1
            fi
            gzip -dc "${archive}" | "${DOCKER[@]}" load
            ;;
        *)
            print_error "仅支持 .tar / .tar.gz / .tgz 格式的离线镜像包: ${archive}"
            return 1
            ;;
    esac

    SKIP_DOCKER_PULL=1
    print_success "离线镜像包已导入，自动切换为本地镜像模式。"
}

extract_image_tag() {
    local image="$1"
    local last_segment=""

    if [[ "${image}" == *@* ]]; then
        return 1
    fi

    last_segment="${image##*/}"
    if [[ "${last_segment}" == *:* ]]; then
        printf '%s\n' "${last_segment##*:}"
    else
        printf 'latest\n'
    fi
}

APP_IMAGE_CANDIDATES=()

append_unique_app_image_candidate() {
    local candidate="$1"
    local existing=""

    [ -n "${candidate}" ] || return 0

    for existing in "${APP_IMAGE_CANDIDATES[@]-}"; do
        if [ "${existing}" = "${candidate}" ]; then
            return 0
        fi
    done

    APP_IMAGE_CANDIDATES+=("${candidate}")
}

build_app_image_candidates() {
    local requested_image="$1"
    local tag=""

    APP_IMAGE_CANDIDATES=()
    append_unique_app_image_candidate "${requested_image}"

    if tag="$(extract_image_tag "${requested_image}")"; then
        append_unique_app_image_candidate "${OFFICIAL_DOCKERHUB_APP_IMAGE}:${tag}"
        append_unique_app_image_candidate "${OFFICIAL_GHCR_APP_IMAGE}:${tag}"
    fi
}

select_local_app_image_candidate() {
    local candidate=""

    for candidate in "${APP_IMAGE_CANDIDATES[@]-}"; do
        if image_exists "${candidate}"; then
            printf '%s\n' "${candidate}"
            return 0
        fi
    done

    return 1
}

is_local_only_image_ref() {
    case "$1" in
        */*)
            return 1
            ;;
        *)
            return 0
            ;;
    esac
}

use_selected_app_image() {
    local requested_image="$1"
    local selected_image="$2"

    APP_IMAGE="${selected_image}"
    APP_IMAGE_SELECTED="${selected_image}"
    set_env_value "APP_IMAGE" "${selected_image}" "${DEPLOY_DIR}/.env"

    if [ "${selected_image}" != "${requested_image}" ]; then
        print_warning "主程序镜像已回退到可用来源: ${selected_image}"
    else
        print_info "主程序镜像: ${selected_image}"
    fi
}

ensure_app_image_architecture_matches() {
    local image="$1"
    local host_arch=""
    local image_arch=""

    if ! image_exists "${image}"; then
        print_error "主程序镜像未在本地找到，无法执行架构检查: ${image}"
        return 1
    fi

    host_arch="$(get_host_arch)"
    image_arch="$(normalize_arch "$(get_local_image_arch "${image}")")"

    if [ -z "${image_arch}" ] || [ "${image_arch}" = "unknown" ]; then
        print_warning "无法识别主程序镜像架构，跳过预检: ${image}"
        return 0
    fi

    if [ "${host_arch}" != "${image_arch}" ]; then
        if is_truthy "${SKIP_IMAGE_ARCH_CHECK}"; then
            print_warning "已跳过主程序镜像架构检查: ${image_arch} on ${host_arch}"
            return 0
        fi

        print_error "主程序镜像架构与服务器不匹配: image=${image_arch}, host=${host_arch}"
        print_error "请导入对应架构的离线包，或改用正确的镜像标签后重试。"
        print_error "如确需跳过，请显式设置 SKIP_IMAGE_ARCH_CHECK=1。"
        return 1
    fi

    print_success "主程序镜像架构检查通过: ${image_arch}"
}

run_announcement_check_if_available() {
    local checker="${REPO_ROOT}/scripts/utils/check-announcements.js"

    if [ ! -f "${checker}" ]; then
        print_info "未检测到公告自检脚本，跳过公告预检。"
        return 0
    fi

    if ! command -v node >/dev/null 2>&1; then
        print_warning "检测到公告自检脚本但系统缺少 node，已跳过公告预检。"
        return 0
    fi

    print_info "执行公告预检..."
    node "${checker}"
    print_success "公告预检通过。"
}

load_deploy_env() {
    local file="$1"
    if [ -f "${file}" ]; then
        set -a
        # shellcheck disable=SC1090
        . "${file}"
        set +a
        refresh_stack_layout
    fi
}

get_support_images() {
    printf '%s\n' \
        "${MYSQL_IMAGE:-mysql:8.0}" \
        "${REDIS_IMAGE:-redis:7-alpine}" \
        "${IPAD860_IMAGE:-smdk000/ipad860:latest}"
}

pull_one_image() {
    local image="$1"
    local attempt=1

    while [ "${attempt}" -le "${COMPOSE_PULL_RETRIES}" ]; do
        if "${DOCKER[@]}" pull "${image}"; then
            return 0
        fi
        if [ "${attempt}" -lt "${COMPOSE_PULL_RETRIES}" ]; then
            print_warning "拉取 ${image} 失败，${PULL_RETRY_DELAY_SECONDS}s 后重试（${attempt}/${COMPOSE_PULL_RETRIES}）..."
            sleep "${PULL_RETRY_DELAY_SECONDS}"
        fi
        attempt=$((attempt + 1))
    done

    return 1
}

ipad860_build_assets_available() {
    local context="$1"
    local required=(
        "08sae.dat"
        "rqtx.dat"
        "lib/libv08.so"
        "lib/libz.so"
        "lib/key"
        "conf"
    )
    local path=""

    for path in "${required[@]}"; do
        if [ ! -e "${context}/${path}" ]; then
            return 1
        fi
    done

    return 0
}

source_checkout_ready() {
    local root_dir="$1"
    local component="${2:-app}"

    case "${component}" in
        app)
            [ -f "${root_dir}/pnpm-workspace.yaml" ] \
                && [ -f "${root_dir}/pnpm-lock.yaml" ] \
                && [ -f "${root_dir}/package.json" ] \
                && [ -f "${root_dir}/core/Dockerfile" ] \
                && [ -f "${root_dir}/web/package.json" ]
            ;;
        ipad860)
            [ -f "${root_dir}/services/ipad860/Dockerfile" ] \
                && ipad860_build_assets_available "${root_dir}/services/ipad860"
            ;;
        stack)
            [ -f "${root_dir}/pnpm-workspace.yaml" ] \
                && [ -f "${root_dir}/pnpm-lock.yaml" ] \
                && [ -f "${root_dir}/package.json" ] \
                && [ -f "${root_dir}/core/Dockerfile" ] \
                && [ -f "${root_dir}/web/package.json" ] \
                && [ -f "${root_dir}/services/ipad860/Dockerfile" ] \
                && ipad860_build_assets_available "${root_dir}/services/ipad860"
            ;;
        *)
            return 1
            ;;
    esac
}

copy_local_source_checkout() {
    local source_root="$1"
    local cache_dir="$2"
    local component="${3:-app}"
    local paths=()

    case "${component}" in
        app)
            paths=(pnpm-workspace.yaml pnpm-lock.yaml package.json core web scripts/service)
            ;;
        ipad860)
            paths=(services/ipad860)
            ;;
        stack)
            paths=(pnpm-workspace.yaml pnpm-lock.yaml package.json core web scripts/service services/ipad860)
            ;;
        *)
            return 1
            ;;
    esac

    (
        cd "${source_root}"
        tar \
            --exclude='.git' \
            --exclude='node_modules' \
            --exclude='deploy/offline' \
            --exclude='logs' \
            --exclude='core/data' \
            -cf - "${paths[@]}"
    ) | (
        cd "${cache_dir}"
        tar -xf -
    )
}

prepare_source_checkout() {
    local component="${1:-app}"
    local cache_dir="${SOURCE_CACHE_DIR}"
    local cache_parent
    cache_parent="$(dirname "${cache_dir}")"
    local archive="/tmp/qq-farm-source-${REPO_REF//\//_}.tar.gz"
    local first_entry=""
    local strip_args=()
    local cache_ready=0
    local staged_dir=""
    local target_dir="${cache_dir}"

    if source_checkout_ready "${cache_dir}" "${component}"; then
        cache_ready=1
        if ! should_refresh_source_cache; then
            return 0
        fi
        staged_dir="${cache_dir}.refresh.$$"
        target_dir="${staged_dir}"
        print_warning "检测到 REPO_REF=${REPO_REF} 为可变引用，正在刷新源码缓存..."
    fi

    run_root mkdir -p "${cache_parent}"
    if [ -n "${SUDO}" ]; then
        run_root chown -R "$(id -u):$(id -g)" "${cache_parent}"
    fi

    run_root rm -rf "${target_dir}"
    run_root mkdir -p "${target_dir}"
    if [ -n "${SUDO}" ]; then
        run_root chown -R "$(id -u):$(id -g)" "${target_dir}"
    fi

    if [ "${component}" = "ipad860" ] && source_checkout_ready "${REPO_ROOT}" "${component}"; then
        print_warning "镜像仓库不可用，改用本地源码工作区补齐 ipad860 构建资产..."
        copy_local_source_checkout "${REPO_ROOT}" "${target_dir}" "${component}"
        if [ -n "${staged_dir}" ]; then
            run_root rm -rf "${cache_dir}"
            run_root mv "${staged_dir}" "${cache_dir}"
        fi
        return 0
    fi

    print_warning "镜像仓库不可用，开始下载源码包用于本地构建..."
    if curl -fsSL "${SOURCE_ARCHIVE_URL}" -o "${archive}"; then
        first_entry="$(tar -tzf "${archive}" | head -n 1 || true)"
        if [[ "${first_entry}" == */* ]]; then
            strip_args=(--strip-components=1)
        fi
        tar -xzf "${archive}" "${strip_args[@]}" -C "${target_dir}"
        if source_checkout_ready "${target_dir}" "${component}"; then
            if [ -n "${staged_dir}" ]; then
                run_root rm -rf "${cache_dir}"
                run_root mv "${staged_dir}" "${cache_dir}"
            fi
            return 0
        fi
    fi

    if source_checkout_ready "${REPO_ROOT}" "${component}"; then
        print_warning "源码包不可用或不完整，改用本地源码工作区进行构建..."
        run_root rm -rf "${target_dir}"
        run_root mkdir -p "${target_dir}"
        if [ -n "${SUDO}" ]; then
            run_root chown -R "$(id -u):$(id -g)" "${target_dir}"
        fi
        copy_local_source_checkout "${REPO_ROOT}" "${target_dir}" "${component}"
        if [ -n "${staged_dir}" ]; then
            run_root rm -rf "${cache_dir}"
            run_root mv "${staged_dir}" "${cache_dir}"
        fi
        return 0
    fi

    if [ -n "${staged_dir}" ] && [ "${cache_ready}" = "1" ]; then
        print_warning "源码缓存刷新失败，继续复用现有缓存: ${cache_dir}"
        run_root rm -rf "${staged_dir}"
        return 0
    fi

    if [ "${component}" = "ipad860" ]; then
        print_error "GitHub 源码包不包含 ipad860 所需的大文件资产，且当前机器没有完整本地源码。"
    else
        print_error "无法准备主程序源码缓存，请检查 GitHub 网络连通性。"
    fi
    return 1
}

validate_ipad860_build_context() {
    local context="$1"

    mkdir -p "${context}/swagger"

    if ipad860_build_assets_available "${context}"; then
        return 0
    fi

    print_error "ipad860 源码构建缺少运行时资产，无法在当前环境可靠回退构建。"
    print_error "GitHub 源码归档默认不包含 rqtx.dat / lib / swagger 等大文件。"
    print_error "请优先 docker load 导入 smdk000/ipad860:latest，或在完整本地仓库中执行安装。"
    return 1
}

build_image_from_source() {
    local image="$1"
    local component=""
    local context=""
    local dockerfile=""

    case "${image}" in
        */qq-farm-bot-ui:*|qq-farm-bot-ui:*|smdk000/qq-farm-bot-ui:*)
            component="app"
            context="${SOURCE_CACHE_DIR}"
            dockerfile="${SOURCE_CACHE_DIR}/core/Dockerfile"
            ;;
        */ipad860:*|ipad860:*|smdk000/ipad860:*)
            component="ipad860"
            context="${SOURCE_CACHE_DIR}/services/ipad860"
            dockerfile="${SOURCE_CACHE_DIR}/services/ipad860/Dockerfile"
            ;;
        *)
            return 1
            ;;
    esac

    prepare_source_checkout "${component}"
    case "${component}" in
        app)
            ensure_official_image "node:20-alpine" || return 1
            ;;
        ipad860)
            validate_ipad860_build_context "${context}" || return 1
            ensure_official_image "golang:1.24-bookworm" || return 1
            ensure_official_image "ubuntu:24.04" || return 1
            ;;
    esac
    print_warning "镜像 ${image} 拉取失败，开始从源码构建..."
    "${DOCKER[@]}" build -t "${image}" -f "${dockerfile}" "${context}"
}

ensure_official_image() {
    local image="$1"
    print_info "拉取官方镜像: ${image}"

    if pull_one_image "${image}"; then
        return 0
    fi

    if image_exists "${image}"; then
        print_warning "官方镜像拉取失败，改用本地缓存: ${image}"
        return 0
    fi

    print_error "官方镜像拉取失败: ${image}"
    print_error "请确认服务器可正常访问 Docker Hub，或手动提前导入该镜像。"
    return 1
}

pull_image_or_build() {
    local image="$1"
    print_info "拉取官方镜像: ${image}"

    if pull_one_image "${image}"; then
        return 0
    fi

    if image_exists "${image}"; then
        print_warning "官方镜像拉取失败，改用本地缓存: ${image}"
        return 0
    fi

    if build_image_from_source "${image}"; then
        return 0
    fi

    return 1
}

resolve_app_image() {
    local requested_image="$1"
    local candidate=""

    build_app_image_candidates "${requested_image}"

    if is_local_only_image_ref "${requested_image}" && image_exists "${requested_image}"; then
        print_info "检测到本地测试镜像，直接使用本地缓存: ${requested_image}"
        use_selected_app_image "${requested_image}" "${requested_image}"
        return 0
    fi

    if is_truthy "${SKIP_DOCKER_PULL}"; then
        candidate="$(select_local_app_image_candidate || true)"
        if [ -z "${candidate}" ]; then
            print_error "已启用本地镜像模式，但没有找到可用主程序镜像缓存。"
            print_error "已尝试的本地标签: ${APP_IMAGE_CANDIDATES[*]-}"
            return 1
        fi

        print_info "使用本地主程序镜像缓存: ${candidate}"
        use_selected_app_image "${requested_image}" "${candidate}"
        return 0
    fi

    for candidate in "${APP_IMAGE_CANDIDATES[@]-}"; do
        print_info "尝试拉取主程序镜像: ${candidate}"
        if pull_one_image "${candidate}"; then
            use_selected_app_image "${requested_image}" "${candidate}"
            return 0
        fi
    done

    candidate="$(select_local_app_image_candidate || true)"
    if [ -n "${candidate}" ]; then
        print_warning "镜像仓库均不可用，回退到本地主程序镜像缓存: ${candidate}"
        use_selected_app_image "${requested_image}" "${candidate}"
        return 0
    fi

    if build_image_from_source "${requested_image}"; then
        use_selected_app_image "${requested_image}" "${requested_image}"
        return 0
    fi

    print_error "主程序镜像处理失败，已尝试 APP_IMAGE / Docker Hub / GHCR / 本地缓存 / 源码构建。"
    return 1
}

ensure_support_image_available() {
    local image="$1"

    if is_truthy "${SKIP_DOCKER_PULL}"; then
        if image_exists "${image}"; then
            print_info "使用本地镜像缓存: ${image}"
            return 0
        fi

        print_error "已启用本地镜像模式，但缺少镜像: ${image}"
        print_error "请先执行 docker load 导入完整离线包，或取消 SKIP_DOCKER_PULL 后重试。"
        return 1
    fi

    pull_image_or_build "${image}"
}

pull_required_images() {
    if is_truthy "${SKIP_DOCKER_PULL}"; then
        print_info "检测到 SKIP_DOCKER_PULL=${SKIP_DOCKER_PULL}，跳过镜像拉取，直接使用本地镜像。"
    fi

    local requested_app_image="${APP_IMAGE:-${OFFICIAL_DOCKERHUB_APP_IMAGE}:4.5.42}"
    local image=""

    resolve_app_image "${requested_app_image}" || return 1
    ensure_app_image_architecture_matches "${APP_IMAGE}" || return 1

    while IFS= read -r image; do
        [ -n "${image}" ] || continue
        ensure_support_image_available "${image}" || {
            print_error "镜像拉取最终失败: ${image}"
            print_error "请检查 GitHub / Docker Hub 官方网络连通性，或在 .env 中覆盖镜像地址。"
            return 1
        }
    done < <(get_support_images)
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

mark_current_release() {
    local target_dir="$1"
    local current_parent
    current_parent="$(dirname "${CURRENT_LINK}")"
    run_root mkdir -p "${current_parent}"
    run_root ln -sfn "${target_dir}" "${CURRENT_LINK}"
    if [ -n "${LEGACY_CURRENT_LINK}" ] && [ "${LEGACY_CURRENT_LINK}" != "${CURRENT_LINK}" ]; then
        run_root ln -sfn "${target_dir}" "${LEGACY_CURRENT_LINK}"
    fi
}

apply_admin_password_override() {
    if is_worker_role; then
        print_info "当前为 worker 角色，跳过管理员密码同步。"
        return 0
    fi

    if [ "${ADMIN_PASSWORD_EXPLICIT}" != "1" ] || [ -z "${ADMIN_PASSWORD_OVERRIDE}" ]; then
        return 0
    fi

    print_info "检测到显式 ADMIN_PASSWORD，正在同步 admin 账号密码..."
    "${DOCKER[@]}" exec -i -e ADMIN_PASSWORD="${ADMIN_PASSWORD_OVERRIDE}" "${APP_CONTAINER_NAME}" node - <<'NODE'
const password = String(process.env.ADMIN_PASSWORD || '');
if (!password) {
    process.exit(0);
}

const security = require('./src/services/security');
const { initMysql, getPool } = require('./src/services/mysql-db');

(async () => {
    await initMysql();
    const pool = getPool();
    try {
        const passwordHash = security.hashPassword(password);
        const [rows] = await pool.query('SELECT id FROM users WHERE username = ? LIMIT 1', ['admin']);

        if (rows.length > 0) {
            await pool.query(
                'UPDATE users SET password_hash = ?, role = ?, status = ? WHERE username = ?',
                [passwordHash, 'admin', 'active', 'admin']
            );
            console.log('[deploy] admin password updated');
            return;
        }

        await pool.query(
            'INSERT INTO users (username, password_hash, role, status) VALUES (?, ?, ?, ?)',
            ['admin', passwordHash, 'admin', 'active']
        );
        console.log('[deploy] admin password created');
    } finally {
        security.stopLoginLockCleanup?.();
        await pool.end();
    }
})().catch((err) => {
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
});
NODE

    local masked
    masked="$(mask_secret "${ADMIN_PASSWORD_OVERRIDE}")"
    print_success "管理员密码已同步到数据库: ${masked}"
}

main() {
    parse_args "$@"

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

    run_announcement_check_if_available
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
    ensure_target_dir_ready
    run_root mkdir -p "${DEPLOY_DIR}"
    if [ -n "${SUDO}" ]; then
        run_root chown -R "$(id -u):$(id -g)" "${DEPLOY_DIR}"
    fi

    copy_or_download_bundle "${DEPLOY_DIR}"
    set_env_value "WEB_PORT" "${web_port}" "${DEPLOY_DIR}/.env"
    sync_env_from_shell "${DEPLOY_DIR}/.env"
    load_deploy_env "${DEPLOY_DIR}/.env"
    if [ -z "${IMAGE_ARCHIVE_OVERRIDE}" ] && [ -n "${IMAGE_ARCHIVE:-}" ]; then
        IMAGE_ARCHIVE_OVERRIDE="${IMAGE_ARCHIVE}"
    fi
    load_image_archive "${IMAGE_ARCHIVE_OVERRIDE}"

    cd "${DEPLOY_DIR}"

    print_info "拉取镜像并启动服务..."
    pull_required_images
    "${DOCKER[@]}" compose up -d

    wait_for_container "${MYSQL_CONTAINER_NAME}" 240
    wait_for_container "${REDIS_CONTAINER_NAME}" 120
    wait_for_container "${IPAD860_CONTAINER_NAME}" 180
    print_info "执行 MySQL 结构修复脚本..."
    bash "${DEPLOY_DIR}/repair-mysql.sh" --deploy-dir "${DEPLOY_DIR}"
    wait_for_container "${APP_CONTAINER_NAME}" 240
    apply_admin_password_override

    if ! is_worker_role && command -v curl >/dev/null 2>&1; then
        curl -fsS "http://127.0.0.1:${web_port}/api/ping" >/dev/null 2>&1 || print_warning "接口探活未通过，请稍后执行: curl http://127.0.0.1:${web_port}/api/ping"
    elif is_worker_role; then
        print_info "当前为 worker 角色，跳过 /api/ping 探活。"
    fi

    mark_current_release "${DEPLOY_DIR}"

    echo ""
    "${DOCKER[@]}" compose ps
    echo ""
    print_success "部署完成。"
    echo "目录: ${DEPLOY_DIR}"
    echo "当前版本链接: ${CURRENT_LINK}"
    if [ -n "${LEGACY_CURRENT_LINK}" ] && [ "${LEGACY_CURRENT_LINK}" != "${CURRENT_LINK}" ]; then
        echo "历史兼容链接: ${LEGACY_CURRENT_LINK}"
    fi
    echo "实例名称: ${STACK_NAME}"
    echo "应用角色: $(current_app_role)"
    echo "访问地址: http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost'):${web_port}"
    echo "统一安装/更新入口: ${CURRENT_LINK}/install-or-update.sh"
    echo "部署包修复脚本: ${CURRENT_LINK}/repair-deploy.sh"
    echo "数据库修复脚本: ${CURRENT_LINK}/repair-mysql.sh"
    echo "安全升级脚本: ${CURRENT_LINK}/safe-update.sh"
    echo "手动修复向导: ${CURRENT_LINK}/manual-config-wizard.sh"
    echo "安装后核验脚本: ${CURRENT_LINK}/verify-stack.sh"
    echo "更新中心 smoke: ${CURRENT_LINK}/smoke-system-update-center.sh --username admin --password '你的管理员密码' --deploy-dir ${CURRENT_LINK}"
    echo "默认管理员: admin"
    echo "管理员密码: 见 ${DEPLOY_DIR}/.env 中的 ADMIN_PASSWORD"
    echo "后续仅更新主程序: ${CURRENT_LINK}/update-app.sh"
    echo "后台更新代理: ${CURRENT_LINK}/update-agent.sh --once"
    echo "安装代理常驻服务: ${CURRENT_LINK}/install-update-agent-service.sh"
    echo ""
}

main "$@"
