#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

VERSION_INPUT=""
IMAGE_INPUT=""
WITH_GHCR=0
WITH_RELEASE_ASSETS=0
SKIP_PUBLISH=0
SKIP_CHECKS=0
SKIP_VERIFY=0
ALLOW_RELOGIN_RISK=0
TARGETS=()
REMOTE_HELPER=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

usage() {
    cat <<'EOF'
用法:
  export QQ_FARM_PRIMARY_PASSWORD='***'
  export QQ_FARM_CLUSTER_PASSWORD='***'
  bash scripts/deploy/publish-and-rollout.sh --version v4.5.59 --with-ghcr \
    --target "10.31.1.254|root|QQ_FARM_PRIMARY_PASSWORD|update|qq-farm|/opt/qq-farm-current|" \
    --target "10.31.2.242|smdk000|QQ_FARM_CLUSTER_PASSWORD|update|qq-farm-2400|/opt/qq-farm-2400-current|" \
    --target "10.31.2.242|smdk000|QQ_FARM_CLUSTER_PASSWORD|update|qq-farm-2500|/opt/qq-farm-2500-current|" \
    --target "10.31.2.242|smdk000|QQ_FARM_CLUSTER_PASSWORD|update|qq-farm-2600|/opt/qq-farm-2600-current|"

目标格式:
  host|user|password_env|action|stack_name|current_link|web_port

字段说明:
  host          服务器地址，例如 10.31.1.254
  user          SSH 用户
  password_env  本地环境变量名，脚本会从该环境变量读取 SSH 密码
  action        install 或 update
  stack_name    远端栈名，例如 qq-farm / qq-farm-2400
  current_link  远端 current 链接，例如 /opt/qq-farm-current
  web_port      仅 install 时使用；update 可留空

说明:
  - 默认先调用 auto-update-docker.sh 构建并推送镜像，再逐台执行远端安装/更新。
  - 如需只做服务器滚动更新，可加 --skip-publish。
  - 如需跳过远端 verify-stack.sh，可加 --skip-verify。
EOF
}

cleanup() {
    if [ -n "${REMOTE_HELPER}" ] && [ -f "${REMOTE_HELPER}" ]; then
        rm -f "${REMOTE_HELPER}"
    fi
}

trap cleanup EXIT

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        print_error "缺少命令: $1"
        exit 1
    fi
}

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --version)
                VERSION_INPUT="${2:-}"
                shift 2
                ;;
            --image)
                IMAGE_INPUT="${2:-}"
                shift 2
                ;;
            --with-ghcr)
                WITH_GHCR=1
                shift
                ;;
            --with-release-assets)
                WITH_RELEASE_ASSETS=1
                shift
                ;;
            --skip-publish)
                SKIP_PUBLISH=1
                shift
                ;;
            --skip-checks)
                SKIP_CHECKS=1
                shift
                ;;
            --skip-verify)
                SKIP_VERIFY=1
                shift
                ;;
            --allow-relogin-risk)
                ALLOW_RELOGIN_RISK=1
                shift
                ;;
            --target)
                TARGETS+=("${2:-}")
                shift 2
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                print_error "未知参数: $1"
                usage
                exit 1
                ;;
        esac
    done
}

resolve_version() {
    local raw_version="${VERSION_INPUT:-}"
    if [ -z "${raw_version}" ]; then
        require_cmd node
        raw_version="$(node -p "require('${PROJECT_ROOT}/core/package.json').version")"
    fi
    VERSION="${raw_version#v}"
    VERSION_TAG="v${VERSION}"
    APP_IMAGE="${IMAGE_INPUT:-smdk000/qq-farm-bot-ui:${VERSION}}"
}

publish_image() {
    local args=("--version" "${VERSION}")

    if [ "${SKIP_CHECKS}" = "1" ]; then
        args+=("--skip-checks")
    fi
    if [ "${WITH_GHCR}" = "1" ]; then
        args+=("--with-ghcr")
    fi
    if [ "${WITH_RELEASE_ASSETS}" = "1" ]; then
        args+=("--with-release-assets")
    fi

    print_info "开始发布镜像 ${APP_IMAGE}"
    (
        cd "${PROJECT_ROOT}"
        bash scripts/deploy/auto-update-docker.sh "${args[@]}"
    )
}

create_remote_helper() {
    REMOTE_HELPER="$(mktemp "${TMPDIR:-/tmp}/qq-farm-rollout.XXXXXX")"
    cat > "${REMOTE_HELPER}" <<'EOF'
#!/usr/bin/env bash

set -Eeuo pipefail

ACTION="$1"
STACK_NAME="$2"
CURRENT_LINK="$3"
APP_IMAGE="$4"
WEB_PORT="$5"
SKIP_VERIFY="$6"
ALLOW_RELOGIN_RISK="$7"

REPO_SLUG="${REPO_SLUG:-smdk000/qq-farm-ui-pro-max}"
REPO_REF="${REPO_REF:-main}"
INSTALL_URL="https://raw.githubusercontent.com/${REPO_SLUG}/${REPO_REF}/scripts/deploy/install-or-update.sh"
BOOTSTRAP_SCRIPT=""

curl_flags=(
    --http1.1
    --retry 4
    --retry-delay 1
    --retry-all-errors
    --connect-timeout 10
    --max-time 90
    -fsSL
)

cleanup_bootstrap() {
    if [ -n "${BOOTSTRAP_SCRIPT}" ] && [ -f "${BOOTSTRAP_SCRIPT}" ]; then
        rm -f "${BOOTSTRAP_SCRIPT}"
    fi
}

trap cleanup_bootstrap EXIT

download_install_script() {
    BOOTSTRAP_SCRIPT="$(mktemp "${TMPDIR:-/tmp}/qq-farm-install-or-update.XXXXXX")"
    curl "${curl_flags[@]}" "${INSTALL_URL}" -o "${BOOTSTRAP_SCRIPT}"
    chmod +x "${BOOTSTRAP_SCRIPT}"
    printf '%s\n' "${BOOTSTRAP_SCRIPT}"
}

resolve_install_script() {
    local candidate=""

    for candidate in \
        "${CURRENT_LINK}/install-or-update.sh" \
        "/opt/qq-farm-current/install-or-update.sh" \
        "/opt/qq-farm-bot-current/install-or-update.sh"
    do
        if [ -x "${candidate}" ]; then
            printf '%s\n' "${candidate}"
            return 0
        fi
    done

    download_install_script
}

common_args=(--stack-name "${STACK_NAME}" --non-interactive --image "${APP_IMAGE}")
if [ "${ALLOW_RELOGIN_RISK}" = "1" ]; then
    common_args+=(--allow-relogin-risk)
fi
if [ -n "${WEB_PORT}" ]; then
    common_args+=(--web-port "${WEB_PORT}")
fi

export STACK_NAME CURRENT_LINK

INSTALL_SCRIPT="$(resolve_install_script)"

case "${ACTION}" in
    install)
        bash "${INSTALL_SCRIPT}" --action install "${common_args[@]}"
        ;;
    update)
        bash "${INSTALL_SCRIPT}" --action update --preserve-current "${common_args[@]}"
        ;;
    *)
        echo "[ERROR] 未知 action: ${ACTION}" >&2
        exit 1
        ;;
esac

if [ "${SKIP_VERIFY}" != "1" ]; then
    if [ -x "${CURRENT_LINK}/verify-stack.sh" ]; then
        bash "${CURRENT_LINK}/verify-stack.sh" --stack-name "${STACK_NAME}"
    else
        echo "[WARN] 未找到 ${CURRENT_LINK}/verify-stack.sh，跳过核验。"
    fi
fi
EOF
    chmod +x "${REMOTE_HELPER}"
}

expect_copy() {
    local local_path="$1"
    local host="$2"
    local user="$3"
    local password="$4"
    local remote_path="$5"

    SSH_LOCAL_PATH="${local_path}" \
    SSH_HOST="${host}" \
    SSH_USER="${user}" \
    SSH_PASSWORD="${password}" \
    SSH_REMOTE_PATH="${remote_path}" \
    expect <<'EOF'
set timeout -1
set local_path $env(SSH_LOCAL_PATH)
set host $env(SSH_HOST)
set user $env(SSH_USER)
set password $env(SSH_PASSWORD)
set remote_path $env(SSH_REMOTE_PATH)

spawn scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null $local_path "${user}@${host}:${remote_path}"
expect {
    -re {yes/no} { send "yes\r"; exp_continue }
    -re {[Pp]assword:} { send -- "$password\r"; exp_continue }
    eof
}
catch wait result
set exit_status [lindex $result 3]
exit $exit_status
EOF
}

expect_exec() {
    local host="$1"
    local user="$2"
    local password="$3"
    local command="$4"

    SSH_HOST="${host}" \
    SSH_USER="${user}" \
    SSH_PASSWORD="${password}" \
    SSH_COMMAND="${command}" \
    expect <<'EOF'
set timeout -1
set host $env(SSH_HOST)
set user $env(SSH_USER)
set password $env(SSH_PASSWORD)
set command $env(SSH_COMMAND)

spawn ssh -tt -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "${user}@${host}" $command
expect {
    -re {yes/no} { send "yes\r"; exp_continue }
    -re {[Pp]assword:} { send -- "$password\r"; exp_continue }
    eof
}
catch wait result
set exit_status [lindex $result 3]
exit $exit_status
EOF
}

deploy_target() {
    local spec="$1"
    local host=""
    local user=""
    local password_env=""
    local action=""
    local stack_name=""
    local current_link=""
    local web_port=""
    local password=""
    local remote_path=""
    local remote_command=""

    IFS='|' read -r host user password_env action stack_name current_link web_port <<< "${spec}"

    if [ -z "${host}" ] || [ -z "${user}" ] || [ -z "${password_env}" ] || [ -z "${action}" ] || [ -z "${stack_name}" ] || [ -z "${current_link}" ]; then
        print_error "目标格式不完整: ${spec}"
        exit 1
    fi

    password="${!password_env:-}"
    if [ -z "${password}" ]; then
        print_error "环境变量 ${password_env} 未设置，无法连接 ${host}"
        exit 1
    fi

    case "${action}" in
        install|update)
            ;;
        *)
            print_error "目标 ${host} 的 action 只能是 install 或 update，实际为 ${action}"
            exit 1
            ;;
    esac

    remote_path="/tmp/qq-farm-rollout-${stack_name//[^a-zA-Z0-9_.-]/_}-$$.sh"
    print_info "上传远端执行脚本到 ${user}@${host}:${remote_path}"
    expect_copy "${REMOTE_HELPER}" "${host}" "${user}" "${password}" "${remote_path}"

    remote_command="chmod +x '${remote_path}' && '${remote_path}' '${action}' '${stack_name}' '${current_link}' '${APP_IMAGE}' '${web_port}' '${SKIP_VERIFY}' '${ALLOW_RELOGIN_RISK}'; rc=\$?; rm -f '${remote_path}'; exit \$rc"
    print_info "开始在 ${host} 执行 ${action} -> ${stack_name}"
    expect_exec "${host}" "${user}" "${password}" "${remote_command}"
    print_success "${host} ${stack_name} 执行完成"
}

main() {
    parse_args "$@"
    resolve_version
    require_cmd ssh
    require_cmd scp
    require_cmd expect

    create_remote_helper

    if [ "${SKIP_PUBLISH}" != "1" ]; then
        publish_image
    else
        print_warning "已跳过镜像发布，仅执行远端滚动更新。"
    fi

    if [ "${#TARGETS[@]}" -eq 0 ]; then
        print_warning "未提供任何 --target；流程到此结束。"
        exit 0
    fi

    for target in "${TARGETS[@]}"; do
        deploy_target "${target}"
    done

    echo ""
    print_success "镜像发布与远端滚动流程完成。"
    echo "版本: ${VERSION_TAG}"
    echo "镜像: ${APP_IMAGE}"
}

main "$@"
