#!/usr/bin/env bash

set -Eeuo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-$(pwd)}"
DEPLOY_BASE_DIR="${DEPLOY_BASE_DIR:-/opt}"
STACK_NAME="${STACK_NAME:-qq-farm}"
CURRENT_LINK_INPUT="${CURRENT_LINK:-}"
CURRENT_LINK="${CURRENT_LINK_INPUT:-${DEPLOY_BASE_DIR}/qq-farm-current}"
LEGACY_CURRENT_LINK=""
REPO_SLUG="${REPO_SLUG:-smdk000/qq-farm-ui-pro-max}"
REPO_REF="${REPO_REF:-main}"
RAW_BASE_URL="${RAW_BASE_URL:-https://raw.githubusercontent.com/${REPO_SLUG}/${REPO_REF}}"
BACKUP_BEFORE_SYNC="${BACKUP_BEFORE_SYNC:-0}"
RUN_DB_REPAIR="${RUN_DB_REPAIR:-0}"
PRESERVE_COMPOSE_LAYOUT="${PRESERVE_COMPOSE_LAYOUT:-0}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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
CURRENT_LINK_EXPLICIT=0
STACK_DIR_NAME=""

if [ -n "${CURRENT_LINK_INPUT}" ]; then
    CURRENT_LINK_EXPLICIT=1
fi

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

refresh_stack_layout() {
    STACK_NAME="$(normalize_stack_name "${STACK_NAME:-qq-farm}")"
    STACK_DIR_NAME="$(stack_dir_name "${STACK_NAME}")"
    if [ "${CURRENT_LINK_EXPLICIT}" != "1" ]; then
        CURRENT_LINK="$(stack_current_link_path "${DEPLOY_BASE_DIR}" "${STACK_NAME}")"
    fi
    LEGACY_CURRENT_LINK="$(stack_legacy_current_link_path "${DEPLOY_BASE_DIR}" "${STACK_NAME}")"
}

trap 'print_error "部署包修复失败，请检查上方日志。"' ERR

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
            --backup)
                BACKUP_BEFORE_SYNC=1
                shift
                ;;
            --run-db-repair)
                RUN_DB_REPAIR=1
                shift
                ;;
            --preserve-compose)
                PRESERVE_COMPOSE_LAYOUT=1
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

download_file() {
    local remote_path="$1"
    local target_path="$2"
    curl -fsSL "${RAW_BASE_URL}/${remote_path}" -o "${target_path}"
}

resolve_deploy_dir() {
    if [ -f "${DEPLOY_DIR}/docker-compose.yml" ] || [ -f "${DEPLOY_DIR}/.env" ]; then
        DEPLOY_DIR="$(canonicalize_dir "${DEPLOY_DIR}")"
        return 0
    fi

    if [ -L "${CURRENT_LINK}" ] || [ -d "${CURRENT_LINK}" ]; then
        if [ -f "${CURRENT_LINK}/docker-compose.yml" ] || [ -f "${CURRENT_LINK}/.env" ]; then
            DEPLOY_DIR="$(canonicalize_dir "${CURRENT_LINK}")"
            return 0
        fi
    fi

    if [ -n "${LEGACY_CURRENT_LINK}" ] && { [ -L "${LEGACY_CURRENT_LINK}" ] || [ -d "${LEGACY_CURRENT_LINK}" ]; }; then
        if [ -f "${LEGACY_CURRENT_LINK}/docker-compose.yml" ] || [ -f "${LEGACY_CURRENT_LINK}/.env" ]; then
            DEPLOY_DIR="$(canonicalize_dir "${LEGACY_CURRENT_LINK}")"
            return 0
        fi
    fi

    local latest=""
    latest="$(find "${DEPLOY_BASE_DIR}" -mindepth 2 -maxdepth 2 -type d -name "${STACK_DIR_NAME:-$(stack_dir_name "${STACK_NAME}")}" 2>/dev/null | sort | tail -n 1)"
    if [ -n "${latest}" ]; then
        DEPLOY_DIR="${latest}"
        return 0
    fi
}

backup_bundle() {
    local backup_dir="${DEPLOY_DIR}/backups"
    local backup_file="${backup_dir}/deploy-bundle-$(date +%Y%m%d_%H%M%S).tar.gz"
    local files=()

    mkdir -p "${backup_dir}"

    for path in \
        docker-compose.yml \
        .env.example \
        README.md \
        update-app.sh \
        update-agent.sh \
        install-update-agent-service.sh \
        install-or-update.sh \
        safe-update.sh \
        manual-config-wizard.sh \
        repair-mysql.sh \
        repair-deploy.sh \
        stack-layout.sh \
        fresh-install.sh \
        quick-deploy.sh \
        verify-stack.sh \
        smoke-system-update-center.sh \
        init-db/01-init.sql; do
        if [ -e "${DEPLOY_DIR}/${path}" ]; then
            files+=("${path}")
        fi
    done

    if [ "${#files[@]}" -eq 0 ]; then
        print_warning "当前目录没有可备份的部署包文件，跳过备份。"
        return 0
    fi

    tar -czf "${backup_file}" -C "${DEPLOY_DIR}" "${files[@]}"
    print_success "部署包备份完成: ${backup_file}"
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

sync_bundle() {
    local init_dir="${DEPLOY_DIR}/init-db"
    local bundle_dir=""
    local bundle_env_example=""
    local bundle_readme=""
    local bundle_init_sql=""
    local bundle_update=""
    local bundle_repair_mysql=""
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

    if [ -f "${SCRIPT_DIR}/fresh-install.sh" ] \
        && [ -f "${SCRIPT_DIR}/repair-deploy.sh" ] \
        && [ -f "${SCRIPT_DIR}/../../deploy/docker-compose.yml" ] \
        && [ -f "${SCRIPT_DIR}/../../deploy/.env.example" ]; then
        bundle_dir="${SCRIPT_DIR}/../../deploy"
        bundle_env_example="${bundle_dir}/.env.example"
        bundle_readme="${bundle_dir}/README.md"
        bundle_init_sql="${bundle_dir}/init-db/01-init.sql"
        bundle_update="${SCRIPT_DIR}/update-app.sh"
        bundle_repair_mysql="${SCRIPT_DIR}/repair-mysql.sh"
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
        bundle_repair_mysql="${bundle_dir}/repair-mysql.sh"
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
            copy_file_if_needed "${bundle_dir}/docker-compose.yml" "${DEPLOY_DIR}/docker-compose.yml"
            copy_file_if_needed "${bundle_env_example}" "${DEPLOY_DIR}/.env.example"
            copy_file_if_needed "${bundle_readme}" "${DEPLOY_DIR}/README.md"
            copy_file_if_needed "${bundle_init_sql}" "${init_dir}/01-init.sql"
        elif [ ! -f "${DEPLOY_DIR}/.env.example" ]; then
            copy_file_if_needed "${bundle_env_example}" "${DEPLOY_DIR}/.env.example"
        fi

        copy_file_if_needed "${bundle_update}" "${DEPLOY_DIR}/update-app.sh"
        copy_file_if_needed "${bundle_repair_mysql}" "${DEPLOY_DIR}/repair-mysql.sh"
        copy_file_if_needed "${bundle_repair_deploy}" "${DEPLOY_DIR}/repair-deploy.sh"
        copy_file_if_needed "${bundle_fresh}" "${DEPLOY_DIR}/fresh-install.sh"
        copy_file_if_needed "${bundle_quick}" "${DEPLOY_DIR}/quick-deploy.sh"
        if [ -n "${bundle_install_or_update}" ] && [ -f "${bundle_install_or_update}" ]; then
            copy_file_if_needed "${bundle_install_or_update}" "${DEPLOY_DIR}/install-or-update.sh"
        else
            download_file "scripts/deploy/install-or-update.sh" "${DEPLOY_DIR}/install-or-update.sh"
        fi
        if [ -n "${bundle_safe_update}" ] && [ -f "${bundle_safe_update}" ]; then
            copy_file_if_needed "${bundle_safe_update}" "${DEPLOY_DIR}/safe-update.sh"
        else
            download_file "scripts/deploy/safe-update.sh" "${DEPLOY_DIR}/safe-update.sh"
        fi
        if [ -n "${bundle_update_agent}" ] && [ -f "${bundle_update_agent}" ]; then
            copy_file_if_needed "${bundle_update_agent}" "${DEPLOY_DIR}/update-agent.sh"
        else
            download_file "scripts/deploy/update-agent.sh" "${DEPLOY_DIR}/update-agent.sh"
        fi
        if [ -n "${bundle_install_update_agent}" ] && [ -f "${bundle_install_update_agent}" ]; then
            copy_file_if_needed "${bundle_install_update_agent}" "${DEPLOY_DIR}/install-update-agent-service.sh"
        else
            download_file "scripts/deploy/install-update-agent-service.sh" "${DEPLOY_DIR}/install-update-agent-service.sh"
        fi
        if [ -n "${bundle_manual_config_wizard}" ] && [ -f "${bundle_manual_config_wizard}" ]; then
            copy_file_if_needed "${bundle_manual_config_wizard}" "${DEPLOY_DIR}/manual-config-wizard.sh"
        else
            download_file "scripts/deploy/manual-config-wizard.sh" "${DEPLOY_DIR}/manual-config-wizard.sh"
        fi
        if [ -n "${bundle_stack_layout}" ] && [ -f "${bundle_stack_layout}" ]; then
            copy_file_if_needed "${bundle_stack_layout}" "${DEPLOY_DIR}/stack-layout.sh"
        else
            download_file "scripts/deploy/stack-layout.sh" "${DEPLOY_DIR}/stack-layout.sh"
        fi
        if [ -n "${bundle_verify_stack}" ] && [ -f "${bundle_verify_stack}" ]; then
            copy_file_if_needed "${bundle_verify_stack}" "${DEPLOY_DIR}/verify-stack.sh"
        else
            download_file "scripts/deploy/verify-stack.sh" "${DEPLOY_DIR}/verify-stack.sh"
        fi
        if [ -n "${bundle_system_update_smoke}" ] && [ -f "${bundle_system_update_smoke}" ]; then
            copy_file_if_needed "${bundle_system_update_smoke}" "${DEPLOY_DIR}/smoke-system-update-center.sh"
        else
            download_file "scripts/deploy/smoke-system-update-center.sh" "${DEPLOY_DIR}/smoke-system-update-center.sh"
        fi
    else
        if [ "${PRESERVE_COMPOSE_LAYOUT}" != "1" ]; then
            download_file "deploy/docker-compose.yml" "${DEPLOY_DIR}/docker-compose.yml"
            download_file "deploy/.env.example" "${DEPLOY_DIR}/.env.example"
            download_file "deploy/README.md" "${DEPLOY_DIR}/README.md"
            download_file "deploy/init-db/01-init.sql" "${init_dir}/01-init.sql"
        elif [ ! -f "${DEPLOY_DIR}/.env.example" ]; then
            download_file "deploy/.env.example" "${DEPLOY_DIR}/.env.example"
        fi

        download_file "scripts/deploy/update-app.sh" "${DEPLOY_DIR}/update-app.sh"
        download_file "scripts/deploy/repair-mysql.sh" "${DEPLOY_DIR}/repair-mysql.sh"
        download_file "scripts/deploy/repair-deploy.sh" "${DEPLOY_DIR}/repair-deploy.sh"
        download_file "scripts/deploy/fresh-install.sh" "${DEPLOY_DIR}/fresh-install.sh"
        download_file "scripts/deploy/quick-deploy.sh" "${DEPLOY_DIR}/quick-deploy.sh"
        download_file "scripts/deploy/install-or-update.sh" "${DEPLOY_DIR}/install-or-update.sh"
        download_file "scripts/deploy/safe-update.sh" "${DEPLOY_DIR}/safe-update.sh"
        download_file "scripts/deploy/update-agent.sh" "${DEPLOY_DIR}/update-agent.sh"
        download_file "scripts/deploy/install-update-agent-service.sh" "${DEPLOY_DIR}/install-update-agent-service.sh"
        download_file "scripts/deploy/manual-config-wizard.sh" "${DEPLOY_DIR}/manual-config-wizard.sh"
        download_file "scripts/deploy/stack-layout.sh" "${DEPLOY_DIR}/stack-layout.sh"
        download_file "scripts/deploy/verify-stack.sh" "${DEPLOY_DIR}/verify-stack.sh"
        download_file "scripts/deploy/smoke-system-update-center.sh" "${DEPLOY_DIR}/smoke-system-update-center.sh"
    fi

    if [ ! -f "${DEPLOY_DIR}/.env" ] && [ -f "${DEPLOY_DIR}/.env.example" ]; then
        cp "${DEPLOY_DIR}/.env.example" "${DEPLOY_DIR}/.env"
        print_warning "未检测到 .env，已根据 .env.example 生成默认配置，请尽快检查密码和端口。"
    fi

    chmod +x \
        "${DEPLOY_DIR}/update-app.sh" \
        "${DEPLOY_DIR}/update-agent.sh" \
        "${DEPLOY_DIR}/install-update-agent-service.sh" \
        "${DEPLOY_DIR}/install-or-update.sh" \
        "${DEPLOY_DIR}/safe-update.sh" \
        "${DEPLOY_DIR}/manual-config-wizard.sh" \
        "${DEPLOY_DIR}/stack-layout.sh" \
        "${DEPLOY_DIR}/repair-mysql.sh" \
        "${DEPLOY_DIR}/repair-deploy.sh" \
        "${DEPLOY_DIR}/fresh-install.sh" \
        "${DEPLOY_DIR}/quick-deploy.sh" \
        "${DEPLOY_DIR}/verify-stack.sh" \
        "${DEPLOY_DIR}/smoke-system-update-center.sh"
}

run_db_repair_if_requested() {
    if [ "${RUN_DB_REPAIR}" = "1" ]; then
        print_info "执行数据库修复脚本..."
        bash "${DEPLOY_DIR}/repair-mysql.sh" --deploy-dir "${DEPLOY_DIR}"
    fi
}

main() {
    parse_args "$@"
    resolve_deploy_dir

    mkdir -p "${DEPLOY_DIR}"

    if [ "${BACKUP_BEFORE_SYNC}" = "1" ]; then
        backup_bundle
    fi

    sync_bundle
    mark_current_release
    run_db_repair_if_requested

    echo ""
    print_success "部署包修复完成。"
    echo "部署目录: ${DEPLOY_DIR}"
    echo "当前版本链接: ${CURRENT_LINK}"
    if [ -n "${LEGACY_CURRENT_LINK}" ] && [ "${LEGACY_CURRENT_LINK}" != "${CURRENT_LINK}" ]; then
        echo "历史兼容链接: ${LEGACY_CURRENT_LINK}"
    fi
    echo "主程序更新命令: ${DEPLOY_DIR}/update-app.sh"
    echo "统一安装/更新入口: ${DEPLOY_DIR}/install-or-update.sh"
    echo "安全升级命令: ${DEPLOY_DIR}/safe-update.sh"
    echo "手动修复向导: ${DEPLOY_DIR}/manual-config-wizard.sh"
    echo "安装后核验脚本: ${DEPLOY_DIR}/verify-stack.sh"
    echo "更新中心 smoke: ${DEPLOY_DIR}/smoke-system-update-center.sh --base-url http://127.0.0.1:9527 --username admin --password '你的管理员密码' --deploy-dir ${DEPLOY_DIR}"
    echo "后台更新代理: ${DEPLOY_DIR}/update-agent.sh --once"
    echo "安装代理常驻服务: ${DEPLOY_DIR}/install-update-agent-service.sh"
    echo "数据库修复命令: ${DEPLOY_DIR}/repair-mysql.sh --backup"
    echo ""
}

main "$@"
