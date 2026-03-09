#!/usr/bin/env bash

set -Eeuo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-$(pwd)}"
DEPLOY_BASE_DIR="${DEPLOY_BASE_DIR:-/opt}"
CURRENT_LINK="${CURRENT_LINK:-${DEPLOY_BASE_DIR}/qq-farm-bot-current}"
MYSQL_SERVICE="${MYSQL_SERVICE:-mysql}"
MYSQL_CONTAINER_NAME="${MYSQL_CONTAINER_NAME:-qq-farm-mysql}"
BACKUP_BEFORE_REPAIR="${BACKUP_BEFORE_REPAIR:-0}"
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

trap 'print_error "MySQL 修复脚本执行失败，请检查上方日志。"' ERR

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --deploy-dir)
                DEPLOY_DIR="${2:-}"
                shift 2
                ;;
            --backup)
                BACKUP_BEFORE_REPAIR=1
                shift
                ;;
            --no-backup)
                BACKUP_BEFORE_REPAIR=0
                shift
                ;;
            *)
                print_error "未知参数: $1"
                exit 1
                ;;
        esac
    done
}

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

resolve_deploy_dir() {
    if [ -f "${DEPLOY_DIR}/docker-compose.yml" ]; then
        return 0
    fi

    if [ -L "${CURRENT_LINK}" ] || [ -d "${CURRENT_LINK}" ]; then
        if [ -f "${CURRENT_LINK}/docker-compose.yml" ]; then
            DEPLOY_DIR="${CURRENT_LINK}"
            return 0
        fi
    fi

    local latest=""
    latest="$(find "${DEPLOY_BASE_DIR}" -mindepth 2 -maxdepth 2 -type d -name qq-farm-bot 2>/dev/null | sort | tail -n 1)"
    if [ -n "${latest}" ] && [ -f "${latest}/docker-compose.yml" ]; then
        DEPLOY_DIR="${latest}"
        return 0
    fi

    print_error "未找到可用部署目录。请通过 --deploy-dir 指定，或先执行 fresh-install.sh。"
    exit 1
}

load_deploy_env() {
    local file="$1"
    if [ -f "${file}" ]; then
        set -a
        # shellcheck disable=SC1090
        . "${file}"
        set +a
    fi
}

compose_has_service() {
    local service_name="$1"
    if ! "${DOCKER[@]}" compose config --services >/tmp/qq-farm-compose-services.$$ 2>/dev/null; then
        return 1
    fi
    if grep -Fxq "${service_name}" /tmp/qq-farm-compose-services.$$; then
        rm -f /tmp/qq-farm-compose-services.$$
        return 0
    fi
    rm -f /tmp/qq-farm-compose-services.$$
    return 1
}

compose_service_has_container() {
    local service_name="$1"
    local container_id=""

    container_id="$("${DOCKER[@]}" compose ps -q "${service_name}" 2>/dev/null || true)"
    [ -n "${container_id}" ]
}

mysql_cli_exec() {
    local mode="$1"
    shift

    if [ "${mode}" = "compose" ]; then
        "${DOCKER[@]}" compose exec -T "${MYSQL_SERVICE}" "$@"
        return 0
    fi

    "${DOCKER[@]}" exec -i "${MYSQL_CONTAINER_NAME}" "$@"
}

detect_mysql_exec_mode() {
    if compose_has_service "${MYSQL_SERVICE}" && compose_service_has_container "${MYSQL_SERVICE}"; then
        echo "compose"
        return 0
    fi

    if "${DOCKER[@]}" container inspect "${MYSQL_CONTAINER_NAME}" >/dev/null 2>&1; then
        echo "container"
        return 0
    fi

    print_error "未找到可用的 MySQL 服务或容器：service=${MYSQL_SERVICE}, container=${MYSQL_CONTAINER_NAME}"
    exit 1
}

wait_for_mysql() {
    local timeout="${1:-240}"
    local started_at
    started_at="$(date +%s)"

    while true; do
        local status="missing"
        local health="none"

        if status="$("${DOCKER[@]}" inspect -f '{{.State.Status}}' "${MYSQL_CONTAINER_NAME}" 2>/dev/null)"; then
            health="$("${DOCKER[@]}" inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${MYSQL_CONTAINER_NAME}" 2>/dev/null || true)"
        fi

        if [ "${status}" = "running" ] && { [ "${health}" = "healthy" ] || [ "${health}" = "none" ]; }; then
            print_success "${MYSQL_CONTAINER_NAME} 已就绪 (${health})"
            return 0
        fi

        if [ $(( $(date +%s) - started_at )) -ge "${timeout}" ]; then
            print_error "${MYSQL_CONTAINER_NAME} 在 ${timeout}s 内未就绪。"
            "${DOCKER[@]}" logs --tail 120 "${MYSQL_CONTAINER_NAME}" || true
            return 1
        fi

        sleep 5
    done
}

mysql_exec() {
    local sql="$1"
    local exec_mode
    exec_mode="$(detect_mysql_exec_mode)"
    mysql_cli_exec "${exec_mode}" \
        mysql --default-character-set=utf8mb4 -u root -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" -Nse "${sql}"
}

mysql_file() {
    local sql_file="$1"
    local exec_mode
    exec_mode="$(detect_mysql_exec_mode)"
    mysql_cli_exec "${exec_mode}" \
        mysql --default-character-set=utf8mb4 -u root -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" < "${sql_file}"
}

column_exists() {
    local table_name="$1"
    local column_name="$2"
    mysql_exec "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table_name}' AND COLUMN_NAME = '${column_name}';"
}

table_exists() {
    local table_name="$1"
    mysql_exec "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table_name}';"
}

index_exists() {
    local table_name="$1"
    local index_name="$2"
    mysql_exec "SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table_name}' AND INDEX_NAME = '${index_name}';"
}

constraint_exists() {
    local table_name="$1"
    local constraint_name="$2"
    mysql_exec "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table_name}' AND CONSTRAINT_NAME = '${constraint_name}';"
}

ensure_column() {
    local table_name="$1"
    local column_name="$2"
    local alter_sql="$3"
    local label="$4"

    if [ "$(column_exists "${table_name}" "${column_name}")" = "0" ]; then
        print_info "补齐 ${label}"
        mysql_exec "${alter_sql}"
    fi
}

backup_database() {
    local backup_dir="${DEPLOY_DIR}/backups"
    local backup_file="${backup_dir}/mysql-repair-$(date +%Y%m%d_%H%M%S).sql"
    local exec_mode

    mkdir -p "${backup_dir}"
    print_info "备份当前 MySQL 数据到 ${backup_file}"
    exec_mode="$(detect_mysql_exec_mode)"
    mysql_cli_exec "${exec_mode}" \
        mysqldump -u root -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" > "${backup_file}"
    print_success "数据库备份完成"
}

apply_schema_repairs() {
    local init_sql="${DEPLOY_DIR}/init-db/01-init.sql"

    if [ ! -f "${init_sql}" ]; then
        print_error "缺少初始化 SQL: ${init_sql}"
        exit 1
    fi

    print_info "先执行最新初始化 SQL，确保缺失表被创建"
    mysql_file "${init_sql}"

    ensure_column "users" "status" \
        "ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active' AFTER role" \
        "users.status"
    ensure_column "accounts" "code" \
        "ALTER TABLE accounts ADD COLUMN code VARCHAR(512) DEFAULT '' AFTER uin" \
        "accounts.code"
    ensure_column "accounts" "username" \
        "ALTER TABLE accounts ADD COLUMN username VARCHAR(100) DEFAULT NULL AFTER auth_data" \
        "accounts.username"
    ensure_column "accounts" "avatar" \
        "ALTER TABLE accounts ADD COLUMN avatar VARCHAR(512) DEFAULT NULL AFTER username" \
        "accounts.avatar"
    ensure_column "account_configs" "account_mode" \
        "ALTER TABLE account_configs ADD COLUMN account_mode VARCHAR(20) DEFAULT 'main' AFTER account_id" \
        "account_configs.account_mode"
    ensure_column "account_configs" "harvest_delay_min" \
        "ALTER TABLE account_configs ADD COLUMN harvest_delay_min INT DEFAULT 180 AFTER account_mode" \
        "account_configs.harvest_delay_min"
    ensure_column "account_configs" "harvest_delay_max" \
        "ALTER TABLE account_configs ADD COLUMN harvest_delay_max INT DEFAULT 300 AFTER harvest_delay_min" \
        "account_configs.harvest_delay_max"
    ensure_column "account_configs" "advanced_settings" \
        "ALTER TABLE account_configs ADD COLUMN advanced_settings JSON DEFAULT NULL AFTER steal_friend_filter_mode" \
        "account_configs.advanced_settings"
    ensure_column "cards" "days" \
        "ALTER TABLE cards ADD COLUMN days INT DEFAULT NULL AFTER description" \
        "cards.days"
    ensure_column "cards" "batch_no" \
        "ALTER TABLE cards ADD COLUMN batch_no VARCHAR(64) DEFAULT NULL AFTER code" \
        "cards.batch_no"
    ensure_column "cards" "batch_name" \
        "ALTER TABLE cards ADD COLUMN batch_name VARCHAR(100) DEFAULT NULL AFTER batch_no" \
        "cards.batch_name"
    ensure_column "cards" "source" \
        "ALTER TABLE cards ADD COLUMN source VARCHAR(32) NOT NULL DEFAULT 'manual' AFTER days" \
        "cards.source"
    ensure_column "cards" "channel" \
        "ALTER TABLE cards ADD COLUMN channel VARCHAR(64) DEFAULT '' AFTER source" \
        "cards.channel"
    ensure_column "cards" "note" \
        "ALTER TABLE cards ADD COLUMN note TEXT DEFAULT NULL AFTER channel" \
        "cards.note"
    ensure_column "cards" "created_by" \
        "ALTER TABLE cards ADD COLUMN created_by VARCHAR(100) DEFAULT NULL AFTER note" \
        "cards.created_by"
    ensure_column "cards" "used_at" \
        "ALTER TABLE cards ADD COLUMN used_at DATETIME DEFAULT NULL AFTER used_by" \
        "cards.used_at"
    ensure_column "cards" "expires_at" \
        "ALTER TABLE cards ADD COLUMN expires_at DATETIME DEFAULT NULL AFTER enabled" \
        "cards.expires_at"
    ensure_column "cards" "updated_at" \
        "ALTER TABLE cards ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at" \
        "cards.updated_at"
    ensure_column "announcements" "version" \
        "ALTER TABLE announcements ADD COLUMN version VARCHAR(50) DEFAULT '' AFTER title" \
        "announcements.version"
    ensure_column "announcements" "publish_date" \
        "ALTER TABLE announcements ADD COLUMN publish_date VARCHAR(50) DEFAULT '' AFTER version" \
        "announcements.publish_date"

    if [ "$(index_exists "accounts" "idx_accounts_username")" = "0" ]; then
        print_info "补齐 accounts.username 索引"
        mysql_exec "ALTER TABLE accounts ADD INDEX idx_accounts_username (username)"
    fi

    if [ "$(index_exists "cards" "idx_cards_batch_no")" = "0" ]; then
        print_info "补齐 cards.batch_no 索引"
        mysql_exec "ALTER TABLE cards ADD INDEX idx_cards_batch_no (batch_no)"
    fi

    if [ "$(index_exists "cards" "idx_cards_source_enabled")" = "0" ]; then
        print_info "补齐 cards.source/enabled 索引"
        mysql_exec "ALTER TABLE cards ADD INDEX idx_cards_source_enabled (source, enabled)"
    fi

    if [ "$(index_exists "cards" "idx_cards_created_by")" = "0" ]; then
        print_info "补齐 cards.created_by 索引"
        mysql_exec "ALTER TABLE cards ADD INDEX idx_cards_created_by (created_by)"
    fi

    if [ "$(constraint_exists "accounts" "fk_accounts_username")" = "0" ]; then
        print_info "补齐 accounts.username 外键"
        mysql_exec "UPDATE accounts SET username = NULL WHERE username IS NOT NULL AND username NOT IN (SELECT username FROM users)"
        mysql_exec "ALTER TABLE accounts ADD CONSTRAINT fk_accounts_username FOREIGN KEY (username) REFERENCES users(username) ON DELETE SET NULL ON UPDATE CASCADE"
    fi

    mysql_exec "UPDATE users SET status = 'active' WHERE status IS NULL OR status = ''"
    mysql_exec "
        UPDATE cards
        SET days = CASE type
            WHEN 'D' THEN 1
            WHEN 'W' THEN 7
            WHEN 'M' THEN 30
            WHEN 'T' THEN 1
            ELSE NULL
        END
        WHERE days IS NULL
    "
    mysql_exec "UPDATE cards SET source = 'manual' WHERE source IS NULL OR source = ''"
    mysql_exec "UPDATE cards SET channel = '' WHERE channel IS NULL"
    mysql_exec "UPDATE cards SET updated_at = created_at WHERE updated_at IS NULL"
    mysql_exec "UPDATE cards SET used_at = created_at WHERE used_by IS NOT NULL AND used_at IS NULL"

    if [ "$(table_exists "cards")" = "1" ]; then
        print_info "回填 cards.expires_at 历史数据"
        mysql_exec "
            CREATE TEMPORARY TABLE tmp_card_expire_fix (
                id INT PRIMARY KEY,
                expires_at DATETIME NULL
            ) ENGINE=MEMORY;

            INSERT INTO tmp_card_expire_fix (id, expires_at)
            WITH RECURSIVE ordered_cards AS (
                SELECT
                    c.id,
                    c.used_by,
                    c.type,
                    COALESCE(c.days, CASE c.type
                        WHEN 'D' THEN 1
                        WHEN 'W' THEN 7
                        WHEN 'M' THEN 30
                        WHEN 'T' THEN 1
                        ELSE NULL
                    END) AS normalized_days,
                    COALESCE(c.used_at, c.created_at) AS effective_used_at,
                    ROW_NUMBER() OVER (
                        PARTITION BY c.used_by
                        ORDER BY COALESCE(c.used_at, c.created_at), c.id
                    ) AS seq_no
                FROM cards c
                WHERE c.used_by IS NOT NULL
            ),
            card_chain AS (
                SELECT
                    oc.id,
                    oc.used_by,
                    oc.seq_no,
                    CASE
                        WHEN oc.type = 'F' THEN NULL
                        WHEN oc.normalized_days IS NULL OR oc.normalized_days <= 0 THEN NULL
                        ELSE DATE_ADD(oc.effective_used_at, INTERVAL oc.normalized_days DAY)
                    END AS expires_at
                FROM ordered_cards oc
                WHERE oc.seq_no = 1

                UNION ALL

                SELECT
                    oc.id,
                    oc.used_by,
                    oc.seq_no,
                    CASE
                        WHEN oc.type = 'F' THEN NULL
                        WHEN oc.normalized_days IS NULL OR oc.normalized_days <= 0 THEN NULL
                        WHEN cc.expires_at IS NOT NULL AND cc.expires_at > oc.effective_used_at
                            THEN DATE_ADD(cc.expires_at, INTERVAL oc.normalized_days DAY)
                        ELSE DATE_ADD(oc.effective_used_at, INTERVAL oc.normalized_days DAY)
                    END AS expires_at
                FROM ordered_cards oc
                INNER JOIN card_chain cc
                    ON cc.used_by = oc.used_by
                    AND oc.seq_no = cc.seq_no + 1
            )
            SELECT id, expires_at FROM card_chain;

            UPDATE cards c
            INNER JOIN tmp_card_expire_fix t ON t.id = c.id
            SET c.expires_at = t.expires_at
            WHERE NOT (c.expires_at <=> t.expires_at);

            DROP TEMPORARY TABLE IF EXISTS tmp_card_expire_fix;
        "
    fi
}

main() {
    parse_args "$@"
    ensure_docker
    resolve_deploy_dir
    load_deploy_env "${DEPLOY_DIR}/.env"

    if [ -z "${MYSQL_ROOT_PASSWORD:-}" ] || [ -z "${MYSQL_DATABASE:-}" ]; then
        print_error "部署目录 .env 缺少 MYSQL_ROOT_PASSWORD 或 MYSQL_DATABASE。"
        exit 1
    fi

    cd "${DEPLOY_DIR}"
    wait_for_mysql 240

    if [ "${BACKUP_BEFORE_REPAIR}" = "1" ]; then
        backup_database
    fi

    apply_schema_repairs
    print_success "MySQL 旧结构修复完成。"
    echo "部署目录: ${DEPLOY_DIR}"
}

main "$@"
