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
APP_SERVICE="${APP_SERVICE:-qq-farm-bot}"
COMPOSE_APP_SERVICE="${COMPOSE_APP_SERVICE:-${APP_SERVICE}}"
APP_CONTAINER_NAME_INPUT="${APP_CONTAINER_NAME:-}"
APP_CONTAINER_NAME="${APP_CONTAINER_NAME_INPUT:-${STACK_NAME}-bot}"
MYSQL_SERVICE="${MYSQL_SERVICE:-mysql}"
MYSQL_CONTAINER_NAME_INPUT="${MYSQL_CONTAINER_NAME:-}"
MYSQL_CONTAINER_NAME="${MYSQL_CONTAINER_NAME_INPUT:-${STACK_NAME}-mysql}"
REDIS_SERVICE="${REDIS_SERVICE:-redis}"
REDIS_CONTAINER_NAME_INPUT="${REDIS_CONTAINER_NAME:-}"
REDIS_CONTAINER_NAME="${REDIS_CONTAINER_NAME_INPUT:-${STACK_NAME}-redis}"
IPAD860_SERVICE="${IPAD860_SERVICE:-ipad860}"
IPAD860_CONTAINER_NAME_INPUT="${IPAD860_CONTAINER_NAME:-}"
IPAD860_CONTAINER_NAME="${IPAD860_CONTAINER_NAME_INPUT:-${STACK_NAME}-ipad860}"
DOCKER=(docker)
SUDO=""
FAILED_CHECKS=()
CURRENT_LINK_EXPLICIT=0
APP_CONTAINER_NAME_EXPLICIT=0
MYSQL_CONTAINER_NAME_EXPLICIT=0
REDIS_CONTAINER_NAME_EXPLICIT=0
IPAD860_CONTAINER_NAME_EXPLICIT=0
STACK_DIR_NAME=""
APP_ROLE="${APP_ROLE:-${ROLE:-standalone}}"
MYSQL_HOST="${MYSQL_HOST:-mysql}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
REDIS_HOST="${REDIS_HOST:-redis}"
REDIS_PORT="${REDIS_PORT:-6379}"
IPAD860_URL="${IPAD860_URL:-http://ipad860:8058}"
MASTER_URL="${MASTER_URL:-}"

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
if [ -n "${APP_CONTAINER_NAME_INPUT}" ]; then
    APP_CONTAINER_NAME_EXPLICIT=1
fi
if [ -n "${MYSQL_CONTAINER_NAME_INPUT}" ]; then
    MYSQL_CONTAINER_NAME_EXPLICIT=1
fi
if [ -n "${REDIS_CONTAINER_NAME_INPUT}" ]; then
    REDIS_CONTAINER_NAME_EXPLICIT=1
fi
if [ -n "${IPAD860_CONTAINER_NAME_INPUT}" ]; then
    IPAD860_CONTAINER_NAME_EXPLICIT=1
fi

refresh_stack_layout() {
    STACK_NAME="$(normalize_stack_name "${STACK_NAME:-qq-farm}")"
    STACK_DIR_NAME="$(stack_dir_name "${STACK_NAME}")"
    if [ "${APP_CONTAINER_NAME_EXPLICIT}" != "1" ]; then
        APP_CONTAINER_NAME="$(stack_container_name "${STACK_NAME}" "bot")"
    fi
    if [ "${MYSQL_CONTAINER_NAME_EXPLICIT}" != "1" ]; then
        MYSQL_CONTAINER_NAME="$(stack_container_name "${STACK_NAME}" "mysql")"
    fi
    if [ "${REDIS_CONTAINER_NAME_EXPLICIT}" != "1" ]; then
        REDIS_CONTAINER_NAME="$(stack_container_name "${STACK_NAME}" "redis")"
    fi
    if [ "${IPAD860_CONTAINER_NAME_EXPLICIT}" != "1" ]; then
        IPAD860_CONTAINER_NAME="$(stack_container_name "${STACK_NAME}" "ipad860")"
    fi
    if [ "${CURRENT_LINK_EXPLICIT}" != "1" ]; then
        CURRENT_LINK="$(stack_current_link_path "${DEPLOY_BASE_DIR}" "${STACK_NAME}")"
    fi
}

mask_secret() {
    local value="$1"
    if [ -z "${value}" ]; then
        printf '(empty)'
        return 0
    fi
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

canonicalize_dir() {
    local dir="$1"
    if [ -d "${dir}" ]; then
        (cd "${dir}" && pwd -P)
    fi
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

    local latest=""
    latest="$(find "${DEPLOY_BASE_DIR}" -mindepth 2 -maxdepth 2 -type d -name "${STACK_DIR_NAME:-$(stack_dir_name "${STACK_NAME}")}" 2>/dev/null | sort | tail -n 1)"
    if [ -n "${latest}" ] && [ -f "${latest}/docker-compose.yml" ]; then
        DEPLOY_DIR="$(canonicalize_dir "${latest}")"
        load_deploy_env "${DEPLOY_DIR}/.env"
        return 0
    fi

    print_error "未找到可用部署目录。请通过 --deploy-dir 指定，或先执行安装脚本。"
    exit 1
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
        if [ -n "${MYSQL_CONTAINER_NAME:-}" ]; then
            MYSQL_CONTAINER_NAME_EXPLICIT=1
        fi
        if [ -n "${REDIS_CONTAINER_NAME:-}" ]; then
            REDIS_CONTAINER_NAME_EXPLICIT=1
        fi
        if [ -n "${IPAD860_CONTAINER_NAME:-}" ]; then
            IPAD860_CONTAINER_NAME_EXPLICIT=1
        fi
        refresh_stack_layout
    fi
}

record_failure() {
    FAILED_CHECKS+=("$1")
    print_error "$1"
}

record_success() {
    print_success "$1"
}

container_status() {
    "${DOCKER[@]}" inspect -f '{{.State.Status}}' "$1" 2>/dev/null || echo "missing"
}

container_health() {
    "${DOCKER[@]}" inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$1" 2>/dev/null || echo "none"
}

check_container() {
    local container_name="$1"
    local label="$2"
    local require_healthy="${3:-0}"
    local status=""
    local health=""

    status="$(container_status "${container_name}")"
    health="$(container_health "${container_name}")"

    if [ "${status}" != "running" ]; then
        record_failure "${label} 容器未运行: ${container_name} (${status})"
        return 1
    fi

    if [ "${require_healthy}" = "1" ] && [ "${health}" != "healthy" ] && [ "${health}" != "none" ]; then
        record_failure "${label} 容器健康检查未通过: ${container_name} (${health})"
        return 1
    fi

    record_success "${label} 容器正常: ${container_name} (${status}/${health})"
    return 0
}

value_in_list() {
    local target="$1"
    shift || true
    local item=""
    for item in "$@"; do
        if [ "${target}" = "${item}" ]; then
            return 0
        fi
    done
    return 1
}

is_local_mysql_target() {
    value_in_list "${MYSQL_HOST}" \
        "mysql" \
        "127.0.0.1" \
        "localhost" \
        "${MYSQL_CONTAINER_NAME}" \
        "${STACK_NAME}-mysql"
}

is_local_redis_target() {
    value_in_list "${REDIS_HOST}" \
        "redis" \
        "127.0.0.1" \
        "localhost" \
        "${REDIS_CONTAINER_NAME}" \
        "${STACK_NAME}-redis"
}

ipad860_host() {
    local rest="${IPAD860_URL#*://}"
    rest="${rest%%/*}"
    printf '%s\n' "${rest}"
}

is_local_ipad860_target() {
    local host=""
    host="$(ipad860_host)"
    value_in_list "${host}" \
        "ipad860" \
        "ipad860:8058" \
        "127.0.0.1" \
        "127.0.0.1:8058" \
        "localhost" \
        "localhost:8058" \
        "${IPAD860_CONTAINER_NAME}" \
        "${IPAD860_CONTAINER_NAME}:8058" \
        "${STACK_NAME}-ipad860" \
        "${STACK_NAME}-ipad860:8058"
}

app_exec_node() {
    local script="$1"
    shift || true
    local env_args=()
    local pair=""
    for pair in "$@"; do
        env_args+=(-e "${pair}")
    done
    "${DOCKER[@]}" compose exec -T "${env_args[@]}" "${COMPOSE_APP_SERVICE}" node -e "${script}"
}

check_app_service() {
    print_info "检查主程序..."
    check_container "${APP_CONTAINER_NAME}" "主程序" "1" || true

    if is_worker_role; then
        record_success "Worker 角色已跳过本地管理面板探活，容器健康检查已覆盖进程存活"
        return 0
    fi

    if command -v curl >/dev/null 2>&1; then
        if curl -fsS "http://127.0.0.1:${WEB_PORT}/api/ping" >/dev/null 2>&1; then
            record_success "主程序外部端口探活通过: http://127.0.0.1:${WEB_PORT}/api/ping"
        else
            record_failure "主程序外部端口探活失败: http://127.0.0.1:${WEB_PORT}/api/ping"
        fi
    else
        if app_exec_node "const http=require('node:http'); const req=http.get('http://127.0.0.1:3000/api/ping', (res) => { res.resume(); process.exit(res.statusCode>=200&&res.statusCode<500?0:1); }); req.on('error', () => process.exit(1)); req.setTimeout(5000, () => { req.destroy(); process.exit(1); });" >/dev/null 2>&1; then
            record_success "主程序容器内探活通过: http://127.0.0.1:3000/api/ping"
        else
            record_failure "主程序容器内探活失败: http://127.0.0.1:3000/api/ping"
        fi
    fi
}

check_worker_master_connectivity() {
    if ! is_worker_role; then
        return 0
    fi

    if [ -z "${MASTER_URL:-}" ]; then
        record_failure "Worker 角色缺少 MASTER_URL 配置"
        return 1
    fi

    if app_exec_node "const target=process.env.QQ_VERIFY_URL; const u=new URL(target); const client=require(u.protocol === 'https:' ? 'node:https' : 'node:http'); const req=client.get(target, (res) => { res.resume(); process.exit(res.statusCode>=200&&res.statusCode<500?0:1); }); req.on('error', () => process.exit(1)); req.setTimeout(5000, () => { req.destroy(); process.exit(1); });" "QQ_VERIFY_URL=${MASTER_URL%/}/api/ping" >/dev/null 2>&1; then
        record_success "Worker 到 Master 探活通过: ${MASTER_URL%/}/api/ping"
    else
        record_failure "Worker 到 Master 探活失败: ${MASTER_URL%/}/api/ping"
    fi
}

check_mysql_service() {
    print_info "检查 MySQL..."

    if is_local_mysql_target; then
        check_container "${MYSQL_CONTAINER_NAME}" "MySQL" "1" || true

        if "${DOCKER[@]}" exec -i "${MYSQL_CONTAINER_NAME}" mysqladmin --protocol=TCP -h 127.0.0.1 -u root -p"${MYSQL_ROOT_PASSWORD}" ping >/dev/null 2>&1; then
            record_success "MySQL root 连通正常: root@127.0.0.1:3306"
        else
            record_failure "MySQL root 连通失败: root@127.0.0.1:3306"
        fi
    else
        print_info "MySQL 使用外部目标 ${MYSQL_HOST}:${MYSQL_PORT}，跳过本地容器检查"
    fi

    if app_exec_node "const mysql=require('mysql2/promise'); let conn; (async()=>{ conn=await mysql.createConnection({ host: process.env.QQ_VERIFY_MYSQL_HOST, port: Number(process.env.QQ_VERIFY_MYSQL_PORT || '3306'), user: process.env.QQ_VERIFY_MYSQL_USER, password: process.env.QQ_VERIFY_MYSQL_PASSWORD, database: process.env.QQ_VERIFY_MYSQL_DATABASE, connectTimeout: 5000 }); await conn.query('SELECT 1'); await conn.end(); process.exit(0); })().catch(async()=>{ try { if (conn) await conn.end(); } catch {} process.exit(1); });" \
        "QQ_VERIFY_MYSQL_HOST=${MYSQL_HOST}" \
        "QQ_VERIFY_MYSQL_PORT=${MYSQL_PORT}" \
        "QQ_VERIFY_MYSQL_USER=${MYSQL_USER}" \
        "QQ_VERIFY_MYSQL_PASSWORD=${MYSQL_PASSWORD}" \
        "QQ_VERIFY_MYSQL_DATABASE=${MYSQL_DATABASE}" >/dev/null 2>&1; then
        record_success "MySQL 业务账号连通正常: ${MYSQL_USER}@${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DATABASE}"
    else
        record_failure "MySQL 业务账号连通失败: ${MYSQL_USER}@${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DATABASE}"
    fi
}

check_redis_service() {
    print_info "检查 Redis..."

    if is_local_redis_target; then
        check_container "${REDIS_CONTAINER_NAME}" "Redis" "0" || true

        if [ -n "${REDIS_PASSWORD:-}" ]; then
            if "${DOCKER[@]}" exec -i -e REDISCLI_AUTH="${REDIS_PASSWORD}" "${REDIS_CONTAINER_NAME}" redis-cli ping >/dev/null 2>&1; then
                record_success "Redis 密码连通正常: redis:6379"
            else
                record_failure "Redis 密码连通失败: redis:6379"
            fi
        else
            if "${DOCKER[@]}" exec -i "${REDIS_CONTAINER_NAME}" redis-cli ping >/dev/null 2>&1; then
                record_success "Redis 连通正常: redis:6379"
            else
                record_failure "Redis 连通失败: redis:6379"
            fi
        fi
    else
        print_info "Redis 使用外部目标 ${REDIS_HOST}:${REDIS_PORT}，跳过本地容器检查"
    fi

    if app_exec_node "const Redis=require('ioredis'); const client=new Redis({ host: process.env.QQ_VERIFY_REDIS_HOST, port: Number(process.env.QQ_VERIFY_REDIS_PORT || '6379'), password: process.env.QQ_VERIFY_REDIS_PASSWORD || undefined, lazyConnect: true, connectTimeout: 5000, maxRetriesPerRequest: 1, enableReadyCheck: true }); (async()=>{ await client.connect(); const pong=await client.ping(); await client.quit(); process.exit(pong === 'PONG' ? 0 : 1); })().catch(async()=>{ try { client.disconnect(); } catch {} process.exit(1); });" \
        "QQ_VERIFY_REDIS_HOST=${REDIS_HOST}" \
        "QQ_VERIFY_REDIS_PORT=${REDIS_PORT}" \
        "QQ_VERIFY_REDIS_PASSWORD=${REDIS_PASSWORD:-}" >/dev/null 2>&1; then
        record_success "Redis 连通正常: ${REDIS_HOST}:${REDIS_PORT}"
    else
        record_failure "Redis 连通失败: ${REDIS_HOST}:${REDIS_PORT}"
    fi
}

check_ipad860_service() {
    print_info "检查微信扫码服务..."

    if is_local_ipad860_target; then
        check_container "${IPAD860_CONTAINER_NAME}" "微信扫码服务" "0" || true

        local configured_pass=""
        configured_pass="$("${DOCKER[@]}" exec -i "${IPAD860_CONTAINER_NAME}" sh -lc "grep '^redispass = ' /app/conf/app.conf | sed -E 's/^redispass = \\\"(.*)\\\"$/\\1/'" 2>/dev/null || true)"
        if [ "${configured_pass}" = "${REDIS_PASSWORD:-}" ]; then
            record_success "ipad860 Redis 密码配置一致"
        else
            record_failure "ipad860 Redis 密码配置不一致"
        fi
    else
        print_warning "微信扫码服务使用外部目标 ${IPAD860_URL}，跳过本地容器配置比对"
    fi

    if app_exec_node "const target=process.env.QQ_VERIFY_URL; const u=new URL(target); const client=require(u.protocol === 'https:' ? 'node:https' : 'node:http'); const req=client.get(target, (res) => { res.resume(); process.exit(res.statusCode>=200&&res.statusCode<500?0:1); }); req.on('error', () => process.exit(1)); req.setTimeout(5000, () => { req.destroy(); process.exit(1); });" "QQ_VERIFY_URL=${IPAD860_URL}" >/dev/null 2>&1; then
        record_success "主程序到微信扫码服务探活通过: ${IPAD860_URL}"
    else
        record_failure "主程序到微信扫码服务探活失败: ${IPAD860_URL}"
    fi
}

print_summary() {
    local access_host=""
    access_host="$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost')"

    echo ""
    echo "=========================================="
    echo "  安装/更新后环境核验摘要"
    echo "=========================================="
    echo "部署目录: ${DEPLOY_DIR}"
    echo "应用角色: $(current_app_role)"
    if ! is_worker_role; then
        echo "访问地址: http://${access_host}:${WEB_PORT}"
    fi
    echo "主程序镜像: ${APP_IMAGE:-unknown}"
    echo "MySQL: host=${MYSQL_HOST} port=${MYSQL_PORT} db=${MYSQL_DATABASE} user=${MYSQL_USER} password=$(mask_secret "${MYSQL_PASSWORD}")"
    if is_local_mysql_target; then
        echo "MySQL Root: user=root password=$(mask_secret "${MYSQL_ROOT_PASSWORD}")"
    fi
    echo "Redis: host=${REDIS_HOST} port=${REDIS_PORT} password=$(mask_secret "${REDIS_PASSWORD:-}")"
    echo "微信扫码服务: url=${IPAD860_URL} redispass=$(mask_secret "${REDIS_PASSWORD:-}")"
    if is_worker_role; then
        echo "Master: ${MASTER_URL:-"(empty)"}"
    fi
    echo "第三方扫码接口: WX_API_KEY=$(mask_secret "${WX_API_KEY:-}") WX_API_URL=${WX_API_URL:-"(empty)"} WX_APP_ID=${WX_APP_ID:-"(empty)"}"
    echo ""
}

print_failure_guidance() {
    echo "请重点核对以下配置:"
    echo "- ${DEPLOY_DIR}/.env"
    echo "- MYSQL_HOST / MYSQL_PORT / MYSQL_DATABASE / MYSQL_USER / MYSQL_PASSWORD"
    if is_local_mysql_target; then
        echo "- MYSQL_ROOT_PASSWORD"
    fi
    echo "- REDIS_HOST / REDIS_PORT / REDIS_PASSWORD"
    echo "- IPAD860_URL"
    echo "- WX_API_KEY / WX_API_URL / WX_APP_ID"
    if is_worker_role; then
        echo "- MASTER_URL / WORKER_TOKEN / WORKER_NODE_ID"
    else
        echo "- WEB_PORT / ADMIN_PASSWORD"
    fi
    echo ""
    echo "修正后可重新执行:"
    echo "- ${DEPLOY_DIR}/manual-config-wizard.sh --deploy-dir ${DEPLOY_DIR}"
    echo "- ${DEPLOY_DIR}/verify-stack.sh --deploy-dir ${DEPLOY_DIR}"
    echo "- ${DEPLOY_DIR}/repair-mysql.sh --deploy-dir ${DEPLOY_DIR}"
    echo "- ${DEPLOY_DIR}/repair-deploy.sh --deploy-dir ${DEPLOY_DIR}"
}

main() {
    parse_args "$@"
    ensure_docker
    resolve_deploy_dir
    load_deploy_env "${DEPLOY_DIR}/.env"
    WEB_PORT="${WEB_PORT:-3080}"
    APP_IMAGE="${APP_IMAGE:-smdk000/qq-farm-bot-ui:4.5.25}"
    APP_ROLE="${APP_ROLE:-${ROLE:-standalone}}"
    MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-qq007qq008}"
    MYSQL_DATABASE="${MYSQL_DATABASE:-qq_farm}"
    MYSQL_USER="${MYSQL_USER:-qq_farm_user}"
    MYSQL_PASSWORD="${MYSQL_PASSWORD:-qq007qq008}"
    MYSQL_HOST="${MYSQL_HOST:-mysql}"
    MYSQL_PORT="${MYSQL_PORT:-3306}"
    REDIS_PASSWORD="${REDIS_PASSWORD:-}"
    REDIS_HOST="${REDIS_HOST:-redis}"
    REDIS_PORT="${REDIS_PORT:-6379}"
    IPAD860_URL="${IPAD860_URL:-http://ipad860:8058}"
    MASTER_URL="${MASTER_URL:-}"
    WX_API_KEY="${WX_API_KEY:-}"
    WX_API_URL="${WX_API_URL:-}"
    WX_APP_ID="${WX_APP_ID:-}"
    cd "${DEPLOY_DIR}"

    print_summary
    check_app_service
    check_worker_master_connectivity
    check_mysql_service
    check_redis_service
    check_ipad860_service

    echo ""
    "${DOCKER[@]}" compose ps || true
    echo ""

    if [ "${#FAILED_CHECKS[@]}" -eq 0 ]; then
        print_success "安装/更新后核验全部通过。"
        return 0
    fi

    print_error "安装/更新后核验失败，共 ${#FAILED_CHECKS[@]} 项异常。"
    print_failure_guidance
    return 1
}

main "$@"
