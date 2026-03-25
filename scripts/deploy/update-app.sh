#!/usr/bin/env bash

set -Eeuo pipefail

APP_SERVICE="${APP_SERVICE:-qq-farm-bot}"
COMPOSE_APP_SERVICE="${COMPOSE_APP_SERVICE:-${APP_SERVICE}}"
STACK_NAME="${STACK_NAME:-qq-farm}"
APP_CONTAINER_NAME_INPUT="${APP_CONTAINER_NAME:-}"
APP_CONTAINER_NAME="${APP_CONTAINER_NAME_INPUT:-${STACK_NAME}-bot}"
DEPLOY_DIR="${DEPLOY_DIR:-$(pwd)}"
DEPLOY_BASE_DIR="${DEPLOY_BASE_DIR:-/opt}"
CURRENT_LINK_INPUT="${CURRENT_LINK:-}"
CURRENT_LINK="${CURRENT_LINK_INPUT:-${DEPLOY_BASE_DIR}/qq-farm-current}"
LEGACY_CURRENT_LINK=""
REPO_SLUG="${REPO_SLUG:-smdk000/qq-farm-ui-pro-max}"
REPO_REF="${REPO_REF:-main}"
RAW_BASE_URL="${RAW_BASE_URL:-https://raw.githubusercontent.com/${REPO_SLUG}/${REPO_REF}}"
SOURCE_ARCHIVE_URL="${SOURCE_ARCHIVE_URL:-https://codeload.github.com/${REPO_SLUG}/tar.gz/${REPO_REF}}"
APP_IMAGE_OVERRIDE="${APP_IMAGE_OVERRIDE:-}"
IMAGE_ARCHIVE_OVERRIDE="${IMAGE_ARCHIVE_OVERRIDE:-${IMAGE_ARCHIVE:-}}"
PRESERVE_COMPOSE_LAYOUT="${PRESERVE_COMPOSE_LAYOUT:-0}"
OFFICIAL_DOCKERHUB_APP_IMAGE="${OFFICIAL_DOCKERHUB_APP_IMAGE:-smdk000/qq-farm-bot-ui}"
OFFICIAL_GHCR_APP_IMAGE="${OFFICIAL_GHCR_APP_IMAGE:-ghcr.io/${REPO_SLUG}}"
ALLOW_RELOGIN_RISK="${ALLOW_RELOGIN_RISK:-0}"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'
DOCKER=(docker)
SUDO=""
COMPOSE_PULL_RETRIES="${COMPOSE_PULL_RETRIES:-3}"
PULL_RETRY_DELAY_SECONDS="${PULL_RETRY_DELAY_SECONDS:-10}"
SKIP_DOCKER_PULL="${SKIP_DOCKER_PULL:-0}"
SKIP_DB_REPAIR="${SKIP_DB_REPAIR:-0}"
SKIP_IMAGE_ARCH_CHECK="${SKIP_IMAGE_ARCH_CHECK:-0}"
SOURCE_CACHE_DIR="${SOURCE_CACHE_DIR:-${DEPLOY_BASE_DIR}/.qq-farm-build-src/${REPO_REF}}"
SOURCE_CACHE_REFRESH="${SOURCE_CACHE_REFRESH:-auto}"
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
ADMIN_PASSWORD_EXPLICIT=0
ADMIN_PASSWORD_OVERRIDE=""
APP_IMAGE_SELECTED=""
CURRENT_LINK_EXPLICIT=0
APP_CONTAINER_NAME_EXPLICIT=0
STACK_DIR_NAME=""
APP_STOPPED_FOR_DB_REPAIR=0

if [ -n "${CURRENT_LINK_INPUT}" ]; then
    CURRENT_LINK_EXPLICIT=1
fi
if [ -n "${APP_CONTAINER_NAME_INPUT}" ]; then
    APP_CONTAINER_NAME_EXPLICIT=1
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
    if [ "${APP_CONTAINER_NAME_EXPLICIT}" != "1" ]; then
        APP_CONTAINER_NAME="$(stack_container_name "${STACK_NAME}" "bot")"
    fi
    if [ "${CURRENT_LINK_EXPLICIT}" != "1" ]; then
        CURRENT_LINK="$(stack_current_link_path "${DEPLOY_BASE_DIR}" "${STACK_NAME}")"
    fi
    LEGACY_CURRENT_LINK="$(stack_legacy_current_link_path "${DEPLOY_BASE_DIR}" "${STACK_NAME}")"
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

should_report_update_phase() {
    [ "${UPDATE_ENABLE_PHASE_REPORTING:-0}" = "1" ] && [ -n "${UPDATE_AGENT_JOB_ID:-}" ]
}

run_update_bridge() {
    "${DOCKER[@]}" compose exec -T \
        -e LOG_LEVEL=error \
        -e FARM_FALLBACK_CONSOLE_LEVEL=silent \
        -e UPDATE_AGENT_ID="${UPDATE_AGENT_ID:-}" \
        "${COMPOSE_APP_SERVICE}" \
        node scripts/update-agent-bridge.js "$@"
}

report_update_phase() {
    local phase="$1"
    local summary="$2"
    local progress="${3:-0}"
    local payload_json="${4:-}"

    if ! should_report_update_phase; then
        return 0
    fi

    local command=(
        set-job-status
        --agent-id "${UPDATE_AGENT_ID:-}"
        --managed-node-ids "${UPDATE_AGENT_MANAGED_NODE_IDS:-}"
        --job-id "${UPDATE_AGENT_JOB_ID}"
        --status running
        --phase "${phase}"
        --summary "${summary}"
        --log-message "${summary}"
        --progress "${progress}"
    )
    if [ -n "${payload_json}" ]; then
        command+=(--log-payload-json "${payload_json}")
    fi
    run_update_bridge "${command[@]}" >/dev/null 2>&1 || true
}

write_update_metadata() {
    local old_image="$1"
    local new_image="$2"

    if [ -z "${UPDATE_METADATA_FILE:-}" ]; then
        return 0
    fi

    cat > "${UPDATE_METADATA_FILE}" <<EOF
OLD_IMAGE='${old_image//\'/\'\\\'\'}'
NEW_IMAGE='${new_image//\'/\'\\\'\'}'
DEPLOY_DIR_REPORTED='${DEPLOY_DIR//\'/\'\\\'\'}'
CURRENT_LINK_REPORTED='${CURRENT_LINK//\'/\'\\\'\'}'
EOF
}

handle_update_error() {
    local exit_code="$?"

    if [ "${APP_STOPPED_FOR_DB_REPAIR}" = "1" ]; then
        print_warning "更新失败，尝试恢复原主程序容器..."
        "${DOCKER[@]}" start "${APP_CONTAINER_NAME}" >/dev/null 2>&1 || true
    fi

    print_error "主程序更新失败，请检查上方日志。"
    exit "${exit_code}"
}

trap handle_update_error ERR

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
            --image)
                APP_IMAGE_OVERRIDE="${2:-}"
                shift 2
                ;;
            --image-archive)
                IMAGE_ARCHIVE_OVERRIDE="${2:-}"
                shift 2
                ;;
            --preserve-compose)
                PRESERVE_COMPOSE_LAYOUT=1
                shift
                ;;
            --skip-db-repair)
                SKIP_DB_REPAIR=1
                shift
                ;;
            --allow-relogin-risk)
                ALLOW_RELOGIN_RISK=1
                shift
                ;;
            *)
                print_error "未知参数: $1"
                exit 1
                ;;
        esac
    done

    refresh_stack_layout
}

if [ "${EUID:-$(id -u)}" -ne 0 ] && command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
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

download_file() {
    local remote_path="$1"
    local target_path="$2"
    curl -fsSL "${RAW_BASE_URL}/${remote_path}" -o "${target_path}"
}

copy_file_if_needed() {
    local source_path="$1"
    local target_path="$2"

    if [ "${source_path}" = "${target_path}" ]; then
        return 0
    fi
    if [ -e "${source_path}" ] && [ -e "${target_path}" ] && [ "${source_path}" -ef "${target_path}" ]; then
        return 0
    fi

    cp "${source_path}" "${target_path}"
}

canonicalize_dir() {
    local dir="$1"
    if [ -d "${dir}" ]; then
        (cd "${dir}" && pwd -P)
    fi
}

mark_current_release() {
    local current_parent
    local target_dir
    current_parent="$(dirname "${CURRENT_LINK}")"
    target_dir="$(canonicalize_dir "${DEPLOY_DIR}")"
    mkdir -p "${current_parent}"
    ln -sfn "${target_dir}" "${CURRENT_LINK}"
    if [ -n "${LEGACY_CURRENT_LINK}" ] && [ "${LEGACY_CURRENT_LINK}" != "${CURRENT_LINK}" ]; then
        ln -sfn "${target_dir}" "${LEGACY_CURRENT_LINK}"
    fi
}

load_deploy_env() {
    local file="$1"
    if [ -f "${file}" ]; then
        set -a
        # shellcheck disable=SC1090
        . "${file}"
        set +a
        if [ -n "${APP_CONTAINER_NAME:-}" ]; then
            APP_CONTAINER_NAME_EXPLICIT=1
        fi
        refresh_stack_layout
    fi
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
        WEB_PORT
        APP_IMAGE
        MYSQL_HOST
        MYSQL_PORT
        COOKIE_SECURE
        CORS_ORIGINS
        JWT_SECRET
        REDIS_HOST
        REDIS_PORT
        REDIS_PASSWORD
        IPAD860_URL
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

prepare_source_checkout() {
    local cache_dir="${SOURCE_CACHE_DIR}"
    local cache_parent
    cache_parent="$(dirname "${cache_dir}")"
    local archive="/tmp/qq-farm-source-${REPO_REF//\//_}.tar.gz"
    local first_entry=""
    local strip_args=()
    local cache_ready=0
    local staged_dir=""
    local target_dir="${cache_dir}"

    if [ -f "${cache_dir}/pnpm-workspace.yaml" ] && [ -f "${cache_dir}/core/Dockerfile" ]; then
        cache_ready=1
        if ! should_refresh_source_cache; then
            return 0
        fi
        staged_dir="${cache_dir}.refresh.$$"
        target_dir="${staged_dir}"
        print_warning "检测到 REPO_REF=${REPO_REF} 为可变引用，正在刷新源码缓存..."
    fi

    if [ -n "${SUDO}" ]; then
        "${SUDO}" mkdir -p "${cache_parent}"
        "${SUDO}" chown -R "$(id -u):$(id -g)" "${cache_parent}"
    else
        mkdir -p "${cache_parent}"
    fi

    if [ -n "${SUDO}" ]; then
        "${SUDO}" rm -rf "${target_dir}"
        "${SUDO}" mkdir -p "${target_dir}"
        "${SUDO}" chown -R "$(id -u):$(id -g)" "${target_dir}"
    else
        rm -rf "${target_dir}"
        mkdir -p "${target_dir}"
    fi

    print_warning "镜像仓库不可用，开始下载源码包用于本地构建..."
    if curl -fsSL "${SOURCE_ARCHIVE_URL}" -o "${archive}"; then
        first_entry="$(tar -tzf "${archive}" | head -n 1 || true)"
        if [[ "${first_entry}" == */* ]]; then
            strip_args=(--strip-components=1)
        fi
        tar -xzf "${archive}" "${strip_args[@]}" -C "${target_dir}"
        if [ -f "${target_dir}/pnpm-workspace.yaml" ] && [ -f "${target_dir}/core/Dockerfile" ]; then
            if [ -n "${staged_dir}" ]; then
                if [ -n "${SUDO}" ]; then
                    "${SUDO}" rm -rf "${cache_dir}"
                    "${SUDO}" mv "${staged_dir}" "${cache_dir}"
                else
                    rm -rf "${cache_dir}"
                    mv "${staged_dir}" "${cache_dir}"
                fi
            fi
            return 0
        fi
    fi

    if [ -f "${REPO_ROOT}/pnpm-workspace.yaml" ] && [ -f "${REPO_ROOT}/core/Dockerfile" ]; then
        print_warning "源码包不可用或不完整，改用本地源码工作区进行构建..."
        if [ -n "${SUDO}" ]; then
            "${SUDO}" rm -rf "${target_dir}"
            "${SUDO}" mkdir -p "${target_dir}"
            "${SUDO}" chown -R "$(id -u):$(id -g)" "${target_dir}"
        else
            rm -rf "${target_dir}"
            mkdir -p "${target_dir}"
        fi
        (
            cd "${REPO_ROOT}"
            tar \
                --exclude='.git' \
                --exclude='node_modules' \
                --exclude='deploy/offline' \
                --exclude='logs' \
                --exclude='core/data' \
                -cf - pnpm-workspace.yaml pnpm-lock.yaml package.json core web scripts/service
        ) | (
            cd "${target_dir}"
            tar -xf -
        )
        if [ -n "${staged_dir}" ]; then
            if [ -n "${SUDO}" ]; then
                "${SUDO}" rm -rf "${cache_dir}"
                "${SUDO}" mv "${staged_dir}" "${cache_dir}"
            else
                rm -rf "${cache_dir}"
                mv "${staged_dir}" "${cache_dir}"
            fi
        fi
        return 0
    fi

    if [ -n "${staged_dir}" ] && [ "${cache_ready}" = "1" ]; then
        print_warning "源码缓存刷新失败，继续复用现有缓存: ${cache_dir}"
        if [ -n "${SUDO}" ]; then
            "${SUDO}" rm -rf "${staged_dir}"
        else
            rm -rf "${staged_dir}"
        fi
        return 0
    fi

    print_error "无法准备主程序源码缓存，请检查 GitHub 网络连通性。"
    return 1
}

build_image_from_source() {
    local image="$1"
    case "${image}" in
        */qq-farm-bot-ui:*|qq-farm-bot-ui:*|smdk000/qq-farm-bot-ui:*)
            prepare_source_checkout
            ensure_official_image "node:20-alpine" || return 1
            print_warning "镜像 ${image} 拉取失败，开始从源码构建..."
            "${DOCKER[@]}" build -t "${image}" -f "${SOURCE_CACHE_DIR}/core/Dockerfile" "${SOURCE_CACHE_DIR}"
            ;;
        *)
            return 1
            ;;
    esac
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

run_announcement_check_if_available() {
    local checker=""

    if [ -f "${SCRIPT_DIR}/../utils/check-announcements.js" ]; then
        checker="${SCRIPT_DIR}/../utils/check-announcements.js"
    elif [ -f "${REPO_ROOT}/scripts/utils/check-announcements.js" ]; then
        checker="${REPO_ROOT}/scripts/utils/check-announcements.js"
    fi

    if [ -z "${checker}" ]; then
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

resolve_deploy_dir() {
    if [ -f "${DEPLOY_DIR}/docker-compose.yml" ]; then
        DEPLOY_DIR="$(canonicalize_dir "${DEPLOY_DIR}")"
        load_deploy_env "${DEPLOY_DIR}/.env"
        return 0
    fi

    if [ -L "${CURRENT_LINK}" ] || [ -d "${CURRENT_LINK}" ]; then
        if [ -f "${CURRENT_LINK}/docker-compose.yml" ]; then
            DEPLOY_DIR="$(canonicalize_dir "${CURRENT_LINK}")"
            return 0
        fi
    fi

    if [ -n "${LEGACY_CURRENT_LINK}" ] && { [ -L "${LEGACY_CURRENT_LINK}" ] || [ -d "${LEGACY_CURRENT_LINK}" ]; }; then
        if [ -f "${LEGACY_CURRENT_LINK}/docker-compose.yml" ]; then
            DEPLOY_DIR="$(canonicalize_dir "${LEGACY_CURRENT_LINK}")"
            return 0
        fi
    fi

    local latest=""
    latest="$(find "${DEPLOY_BASE_DIR}" -mindepth 2 -maxdepth 2 -type d -name "${STACK_DIR_NAME:-$(stack_dir_name "${STACK_NAME}")}" 2>/dev/null | sort | tail -n 1)"
    if [ -n "${latest}" ] && [ -f "${latest}/docker-compose.yml" ]; then
        DEPLOY_DIR="${latest}"
        load_deploy_env "${DEPLOY_DIR}/.env"
        return 0
    fi

    print_error "未找到可用部署目录。请通过 --deploy-dir 指定，或先执行 fresh-install.sh。"
    exit 1
}

sync_bundle() {
    local target_dir="$1"
    local init_dir="${target_dir}/init-db"
    local bundle_dir=""
    local bundle_env_example=""
    local bundle_readme=""
    local bundle_init_sql=""
    local bundle_update=""
    local bundle_repair=""
    local bundle_repair_deploy=""
    local bundle_fresh=""
    local bundle_quick=""
    local bundle_install_or_update=""
    local bundle_safe_update=""
    local bundle_update_agent=""
    local bundle_install_update_agent=""
    local bundle_manual_config_wizard=""
    local bundle_stack_layout=""
    local bundle_verify_stack=""

    mkdir -p "${init_dir}"

    if [ -f "${target_dir}/docker-compose.yml" ] && [ -f "${target_dir}/.env" ]; then
        :
    else
        print_error "部署目录缺少 docker-compose.yml 或 .env: ${target_dir}"
        exit 1
    fi

    if [ -f "${SCRIPT_DIR}/fresh-install.sh" ] \
        && [ -f "${SCRIPT_DIR}/../../deploy/docker-compose.yml" ] \
        && [ -f "${SCRIPT_DIR}/../../deploy/.env.example" ]; then
        bundle_dir="${SCRIPT_DIR}/../../deploy"
        bundle_env_example="${bundle_dir}/.env.example"
        bundle_readme="${bundle_dir}/README.md"
        bundle_init_sql="${bundle_dir}/init-db/01-init.sql"
        bundle_update="${SCRIPT_DIR}/update-app.sh"
        bundle_repair="${SCRIPT_DIR}/repair-mysql.sh"
        bundle_repair_deploy="${SCRIPT_DIR}/repair-deploy.sh"
        bundle_fresh="${SCRIPT_DIR}/fresh-install.sh"
        bundle_quick="${SCRIPT_DIR}/quick-deploy.sh"
        bundle_install_or_update="${SCRIPT_DIR}/install-or-update.sh"
        bundle_safe_update="${SCRIPT_DIR}/safe-update.sh"
        bundle_update_agent="${SCRIPT_DIR}/update-agent.sh"
        bundle_install_update_agent="${SCRIPT_DIR}/install-update-agent-service.sh"
        bundle_manual_config_wizard="${SCRIPT_DIR}/manual-config-wizard.sh"
        bundle_stack_layout="${SCRIPT_DIR}/stack-layout.sh"
        bundle_verify_stack="${SCRIPT_DIR}/verify-stack.sh"
        bundle_system_update_smoke="${SCRIPT_DIR}/smoke-system-update-center.sh"
    elif [ -f "${SCRIPT_DIR}/docker-compose.yml" ] \
        && [ -f "${SCRIPT_DIR}/.env.example" ] \
        && [ -f "${SCRIPT_DIR}/init-db/01-init.sql" ]; then
        bundle_dir="${SCRIPT_DIR}"
        bundle_env_example="${bundle_dir}/.env.example"
        bundle_readme="${bundle_dir}/README.md"
        bundle_init_sql="${bundle_dir}/init-db/01-init.sql"
        bundle_update="${bundle_dir}/update-app.sh"
        bundle_repair="${bundle_dir}/repair-mysql.sh"
        bundle_repair_deploy="${bundle_dir}/repair-deploy.sh"
        bundle_fresh="${bundle_dir}/fresh-install.sh"
        bundle_quick="${bundle_dir}/quick-deploy.sh"
        bundle_install_or_update="${bundle_dir}/install-or-update.sh"
        bundle_safe_update="${bundle_dir}/safe-update.sh"
        bundle_update_agent="${bundle_dir}/update-agent.sh"
        bundle_install_update_agent="${bundle_dir}/install-update-agent-service.sh"
        bundle_manual_config_wizard="${bundle_dir}/manual-config-wizard.sh"
        bundle_stack_layout="${bundle_dir}/stack-layout.sh"
        bundle_verify_stack="${bundle_dir}/verify-stack.sh"
        bundle_system_update_smoke="${bundle_dir}/smoke-system-update-center.sh"
    fi

    if [ -n "${bundle_dir}" ]; then
        if [ "${PRESERVE_COMPOSE_LAYOUT}" != "1" ]; then
            copy_file_if_needed "${bundle_dir}/docker-compose.yml" "${target_dir}/docker-compose.yml"
            copy_file_if_needed "${bundle_env_example}" "${target_dir}/.env.example"
            copy_file_if_needed "${bundle_readme}" "${target_dir}/README.md"
            copy_file_if_needed "${bundle_init_sql}" "${init_dir}/01-init.sql"
        elif [ ! -f "${target_dir}/.env.example" ]; then
            copy_file_if_needed "${bundle_env_example}" "${target_dir}/.env.example"
        fi

        copy_file_if_needed "${bundle_update}" "${target_dir}/update-app.sh"
        if [ -n "${bundle_repair}" ] && [ -f "${bundle_repair}" ]; then
            copy_file_if_needed "${bundle_repair}" "${target_dir}/repair-mysql.sh"
        else
            download_file "scripts/deploy/repair-mysql.sh" "${target_dir}/repair-mysql.sh"
        fi
        if [ -n "${bundle_repair_deploy}" ] && [ -f "${bundle_repair_deploy}" ]; then
            copy_file_if_needed "${bundle_repair_deploy}" "${target_dir}/repair-deploy.sh"
        else
            download_file "scripts/deploy/repair-deploy.sh" "${target_dir}/repair-deploy.sh"
        fi
        copy_file_if_needed "${bundle_fresh}" "${target_dir}/fresh-install.sh"
        copy_file_if_needed "${bundle_quick}" "${target_dir}/quick-deploy.sh"
        if [ -n "${bundle_install_or_update}" ] && [ -f "${bundle_install_or_update}" ]; then
            copy_file_if_needed "${bundle_install_or_update}" "${target_dir}/install-or-update.sh"
        else
            download_file "scripts/deploy/install-or-update.sh" "${target_dir}/install-or-update.sh"
        fi
        if [ -n "${bundle_safe_update}" ] && [ -f "${bundle_safe_update}" ]; then
            copy_file_if_needed "${bundle_safe_update}" "${target_dir}/safe-update.sh"
        else
            download_file "scripts/deploy/safe-update.sh" "${target_dir}/safe-update.sh"
        fi
        if [ -n "${bundle_update_agent}" ] && [ -f "${bundle_update_agent}" ]; then
            copy_file_if_needed "${bundle_update_agent}" "${target_dir}/update-agent.sh"
        else
            download_file "scripts/deploy/update-agent.sh" "${target_dir}/update-agent.sh"
        fi
        if [ -n "${bundle_install_update_agent}" ] && [ -f "${bundle_install_update_agent}" ]; then
            copy_file_if_needed "${bundle_install_update_agent}" "${target_dir}/install-update-agent-service.sh"
        else
            download_file "scripts/deploy/install-update-agent-service.sh" "${target_dir}/install-update-agent-service.sh"
        fi
        if [ -n "${bundle_manual_config_wizard}" ] && [ -f "${bundle_manual_config_wizard}" ]; then
            copy_file_if_needed "${bundle_manual_config_wizard}" "${target_dir}/manual-config-wizard.sh"
        else
            download_file "scripts/deploy/manual-config-wizard.sh" "${target_dir}/manual-config-wizard.sh"
        fi
        if [ -n "${bundle_stack_layout}" ] && [ -f "${bundle_stack_layout}" ]; then
            copy_file_if_needed "${bundle_stack_layout}" "${target_dir}/stack-layout.sh"
        else
            download_file "scripts/deploy/stack-layout.sh" "${target_dir}/stack-layout.sh"
        fi
        if [ -n "${bundle_verify_stack}" ] && [ -f "${bundle_verify_stack}" ]; then
            copy_file_if_needed "${bundle_verify_stack}" "${target_dir}/verify-stack.sh"
        else
            download_file "scripts/deploy/verify-stack.sh" "${target_dir}/verify-stack.sh"
        fi
        if [ -n "${bundle_system_update_smoke}" ] && [ -f "${bundle_system_update_smoke}" ]; then
            copy_file_if_needed "${bundle_system_update_smoke}" "${target_dir}/smoke-system-update-center.sh"
        else
            download_file "scripts/deploy/smoke-system-update-center.sh" "${target_dir}/smoke-system-update-center.sh"
        fi
    else
        if [ "${PRESERVE_COMPOSE_LAYOUT}" != "1" ]; then
            download_file "deploy/docker-compose.yml" "${target_dir}/docker-compose.yml"
            download_file "deploy/.env.example" "${target_dir}/.env.example"
            download_file "deploy/README.md" "${target_dir}/README.md"
            download_file "deploy/init-db/01-init.sql" "${init_dir}/01-init.sql"
        elif [ ! -f "${target_dir}/.env.example" ]; then
            download_file "deploy/.env.example" "${target_dir}/.env.example"
        fi

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

    chmod +x "${target_dir}/update-app.sh" "${target_dir}/repair-mysql.sh" "${target_dir}/repair-deploy.sh" "${target_dir}/fresh-install.sh" "${target_dir}/quick-deploy.sh" "${target_dir}/install-or-update.sh" "${target_dir}/safe-update.sh" "${target_dir}/update-agent.sh" "${target_dir}/install-update-agent-service.sh" "${target_dir}/manual-config-wizard.sh" "${target_dir}/stack-layout.sh" "${target_dir}/verify-stack.sh" "${target_dir}/smoke-system-update-center.sh"
}

wait_for_app() {
    local timeout="${1:-240}"
    local started_at
    started_at="$(date +%s)"

    while true; do
        local status="missing"
        local health="none"

        if status="$("${DOCKER[@]}" inspect -f '{{.State.Status}}' "${APP_CONTAINER_NAME}" 2>/dev/null)"; then
            health="$("${DOCKER[@]}" inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${APP_CONTAINER_NAME}" 2>/dev/null || true)"
        fi

        if [ "${status}" = "running" ] && { [ "${health}" = "healthy" ] || [ "${health}" = "none" ]; }; then
            print_success "${APP_CONTAINER_NAME} 已恢复运行。"
            return 0
        fi

        if [ $(( $(date +%s) - started_at )) -ge "${timeout}" ]; then
            print_error "${APP_CONTAINER_NAME} 在 ${timeout}s 内未恢复健康。"
            "${DOCKER[@]}" logs --tail 120 "${APP_CONTAINER_NAME}" || true
            return 1
        fi

        sleep 5
    done
}

stop_app_before_db_repair() {
    local status="missing"

    status="$("${DOCKER[@]}" inspect -f '{{.State.Status}}' "${APP_CONTAINER_NAME}" 2>/dev/null || true)"
    if [ "${status}" != "running" ]; then
        return 0
    fi

    print_info "数据库修复前先停止主程序，避免在线改表与写入并发冲突。"
    "${DOCKER[@]}" stop "${APP_CONTAINER_NAME}" >/dev/null
    APP_STOPPED_FOR_DB_REPAIR=1
}

check_running_login_code_restart_risk() {
    local status="missing"
    local probe_output=""
    local blocker_count="0"

    if is_truthy "${ALLOW_RELOGIN_RISK}"; then
        print_warning "检测到 ALLOW_RELOGIN_RISK=${ALLOW_RELOGIN_RISK}，跳过运行中账号重登录风险检查。"
        return 0
    fi

    status="$("${DOCKER[@]}" inspect -f '{{.State.Status}}' "${APP_CONTAINER_NAME}" 2>/dev/null || true)"
    if [ "${status}" != "running" ]; then
        print_info "主程序容器当前未运行，跳过运行中账号重登录风险检查。"
        return 0
    fi

    print_info "检查运行中账号的重登录风险..."
    if ! probe_output="$("${DOCKER[@]}" compose exec -T "${COMPOSE_APP_SERVICE}" node - <<'NODE'
const { initMysql, getPool } = require('./src/services/mysql-db');

(async () => {
    await initMysql();
    const pool = getPool();
    try {
        const [rows] = await pool.query(`
            SELECT
                id,
                COALESCE(NULLIF(name, ''), NULLIF(nick, ''), CAST(id AS CHAR)) AS account_name,
                COALESCE(NULLIF(platform, ''), 'qq') AS platform,
                CASE
                    WHEN COALESCE(JSON_UNQUOTE(JSON_EXTRACT(auth_data, '$.authTicket')), '') <> '' THEN 'auth_ticket'
                    WHEN COALESCE(code, '') <> '' THEN 'login_code'
                    ELSE 'none'
                END AS credential_kind
            FROM accounts
            WHERE running = 1
              AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(auth_data, '$.authTicket')), '') = ''
              AND COALESCE(code, '') <> ''
            ORDER BY id ASC
        `);
        for (const row of rows) {
            const id = String(row.id || '').trim();
            const name = String(row.account_name || '').trim() || id;
            const platform = String(row.platform || 'qq').trim() || 'qq';
            const credentialKind = String(row.credential_kind || 'login_code').trim() || 'login_code';
            console.log(['BLOCKER', id, name, platform, credentialKind].join('\t'));
        }
        console.log(['COUNT', String(rows.length)].join('\t'));
    } finally {
        await pool.end();
    }
})().catch((error) => {
    console.error(`ERROR\t${error && error.message ? error.message : String(error)}`);
    process.exit(1);
});
NODE
    )"; then
        print_error "无法评估运行中账号的重登录风险，已中止更新以避免误停账号。"
        print_error "如你确认当前没有需要保护的运行中账号，可显式追加 --allow-relogin-risk 或设置 ALLOW_RELOGIN_RISK=1。"
        return 1
    fi

    while IFS=$'\t' read -r marker col1 col2 col3 col4; do
        case "${marker}" in
            COUNT)
                blocker_count="${col1:-0}"
                ;;
            BLOCKER)
                print_warning "检测到运行中一次性登录账号: id=${col1:-unknown}, name=${col2:-unknown}, platform=${col3:-unknown}, credential=${col4:-login_code}"
                ;;
        esac
    done <<< "${probe_output}"

    if [ "${blocker_count}" != "0" ]; then
        print_error "检测到 ${blocker_count} 个运行中账号仅保存一次性登录凭据；继续更新会在重启后高概率要求重新登录或重新扫码。"
        print_error "请先在后台手动停机并补码，或显式追加 --allow-relogin-risk / ALLOW_RELOGIN_RISK=1 后重试。"
        return 1
    fi

    print_success "未检测到运行中一次性登录账号，允许继续更新。"
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
    "${DOCKER[@]}" compose exec -T -e ADMIN_PASSWORD="${ADMIN_PASSWORD_OVERRIDE}" "${COMPOSE_APP_SERVICE}" node - <<'NODE'
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

compose_pull_with_retry() {
    local requested_image="${APP_IMAGE:-${OFFICIAL_DOCKERHUB_APP_IMAGE}:4.5.36}"

    if is_truthy "${SKIP_DOCKER_PULL}"; then
        print_info "检测到 SKIP_DOCKER_PULL=${SKIP_DOCKER_PULL}，跳过主程序镜像拉取，直接使用本地镜像。"
    fi

    if ! resolve_app_image "${requested_image}"; then
        print_error "主程序镜像处理最终失败: ${requested_image}"
        print_error "请检查 Docker Hub / GHCR 网络连通性，或通过 --image-archive 导入本地镜像包。"
        return 1
    fi

    ensure_app_image_architecture_matches "${APP_IMAGE}"
}

main() {
    parse_args "$@"
    run_announcement_check_if_available
    ensure_docker
    resolve_deploy_dir

    load_deploy_env "${DEPLOY_DIR}/.env"
    APP_SERVICE="${APP_SERVICE:-qq-farm-bot}"
    COMPOSE_APP_SERVICE="${COMPOSE_APP_SERVICE:-${APP_SERVICE}}"
    refresh_stack_layout
    if [ -n "${APP_IMAGE_OVERRIDE}" ]; then
        APP_IMAGE="${APP_IMAGE_OVERRIDE}"
    fi
    sync_bundle "${DEPLOY_DIR}"
    mark_current_release
    sync_env_from_shell "${DEPLOY_DIR}/.env"
    load_deploy_env "${DEPLOY_DIR}/.env"
    APP_SERVICE="${APP_SERVICE:-qq-farm-bot}"
    COMPOSE_APP_SERVICE="${COMPOSE_APP_SERVICE:-${APP_SERVICE}}"
    refresh_stack_layout
    if [ -n "${APP_IMAGE_OVERRIDE}" ]; then
        APP_IMAGE="${APP_IMAGE_OVERRIDE}"
    fi
    if [ -z "${IMAGE_ARCHIVE_OVERRIDE}" ] && [ -n "${IMAGE_ARCHIVE:-}" ]; then
        IMAGE_ARCHIVE_OVERRIDE="${IMAGE_ARCHIVE}"
    fi
    load_image_archive "${IMAGE_ARCHIVE_OVERRIDE}"

    cd "${DEPLOY_DIR}"

    local old_image=""
    local new_image=""
    old_image="$("${DOCKER[@]}" inspect -f '{{.Image}}' "${APP_CONTAINER_NAME}" 2>/dev/null || true)"

    print_info "仅更新主程序容器，不会重启 MySQL / Redis / ipad860。"
    report_update_phase "preflight" "Running update preflight checks" 24
    check_running_login_code_restart_risk
    if [ "${SKIP_DB_REPAIR}" = "1" ] || [ "${SKIP_DB_REPAIR}" = "true" ]; then
        print_warning "检测到 SKIP_DB_REPAIR=${SKIP_DB_REPAIR}，跳过数据库修复步骤。"
    else
        report_update_phase "stop_stack" "Stopping app for db repair" 42
        stop_app_before_db_repair
        print_info "先执行旧 MySQL 结构修复脚本..."
        bash "${DEPLOY_DIR}/repair-mysql.sh" --deploy-dir "${DEPLOY_DIR}"
    fi
    report_update_phase "pull_image" "Resolving target image" 56
    compose_pull_with_retry
    report_update_phase "apply_update" "Applying update with docker compose" 72
    "${DOCKER[@]}" compose up -d --no-deps "${COMPOSE_APP_SERVICE}"
    report_update_phase "start_stack" "Waiting for app container to become healthy" 84
    wait_for_app 240
    APP_STOPPED_FOR_DB_REPAIR=0
    apply_admin_password_override

    new_image="$("${DOCKER[@]}" inspect -f '{{.Image}}' "${APP_CONTAINER_NAME}" 2>/dev/null || true)"
    write_update_metadata "${old_image}" "${new_image}"

    echo ""
    "${DOCKER[@]}" compose ps
    echo ""
    print_success "主程序更新完成。"
    echo "部署目录: ${DEPLOY_DIR}"
    echo "当前版本链接: ${CURRENT_LINK}"
    if [ -n "${LEGACY_CURRENT_LINK}" ] && [ "${LEGACY_CURRENT_LINK}" != "${CURRENT_LINK}" ]; then
        echo "历史兼容链接: ${LEGACY_CURRENT_LINK}"
    fi
    echo "应用角色: $(current_app_role)"
    echo "Compose 服务: ${COMPOSE_APP_SERVICE}"
    echo "容器名称: ${APP_CONTAINER_NAME}"
    echo "旧镜像 ID: ${old_image:-unknown}"
    echo "新镜像 ID: ${new_image:-unknown}"
    echo "未变更服务: qq-farm-mysql / qq-farm-redis / qq-farm-ipad860"
    echo "统一安装/更新入口: ${DEPLOY_DIR}/install-or-update.sh"
    echo "安全升级脚本: ${DEPLOY_DIR}/safe-update.sh"
    echo "部署包修复脚本: ${DEPLOY_DIR}/repair-deploy.sh"
    echo "数据库修复脚本: ${DEPLOY_DIR}/repair-mysql.sh"
    echo "手动修复向导: ${DEPLOY_DIR}/manual-config-wizard.sh"
    echo "安装后核验脚本: ${DEPLOY_DIR}/verify-stack.sh"
    echo "更新中心 smoke: ${DEPLOY_DIR}/smoke-system-update-center.sh --base-url http://127.0.0.1:9527 --username admin --password '你的管理员密码' --deploy-dir ${DEPLOY_DIR}"
    echo "后台更新代理: ${DEPLOY_DIR}/update-agent.sh --once"
    echo "安装代理常驻服务: ${DEPLOY_DIR}/install-update-agent-service.sh"
    echo ""
}

main "$@"
