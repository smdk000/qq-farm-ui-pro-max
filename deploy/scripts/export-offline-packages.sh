#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
REPO_SLUG="${REPO_SLUG:-smdk000/qq-farm-ui-pro-max}"
OFFICIAL_DOCKERHUB_APP_IMAGE="${OFFICIAL_DOCKERHUB_APP_IMAGE:-smdk000/qq-farm-bot-ui}"
OFFICIAL_GHCR_APP_IMAGE="${OFFICIAL_GHCR_APP_IMAGE:-ghcr.io/${REPO_SLUG}}"
MYSQL_IMAGE="${MYSQL_IMAGE:-mysql:8.0}"
REDIS_IMAGE="${REDIS_IMAGE:-redis:7-alpine}"
IPAD860_IMAGE="${IPAD860_IMAGE:-smdk000/ipad860:latest}"
OUTPUT_DIR="${OUTPUT_DIR:-${PROJECT_ROOT}/deploy/offline}"
APP_IMAGE_OVERRIDE="${APP_IMAGE_OVERRIDE:-}"
RETRY_COUNT="${RETRY_COUNT:-20}"
RETRY_DELAY_SECONDS="${RETRY_DELAY_SECONDS:-30}"
VERSION_INPUT="${VERSION:-v4.5.37}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        print_error "缺少命令: $1"
        exit 1
    fi
}

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --output-dir)
                OUTPUT_DIR="${2:-}"
                shift 2
                ;;
            --app-image)
                APP_IMAGE_OVERRIDE="${2:-}"
                shift 2
                ;;
            --ipad860-image)
                IPAD860_IMAGE="${2:-}"
                shift 2
                ;;
            *)
                if [ -z "${POSITIONAL_VERSION:-}" ]; then
                    POSITIONAL_VERSION="$1"
                    shift
                else
                    print_error "未知参数: $1"
                    exit 1
                fi
                ;;
        esac
    done

    if [ -n "${POSITIONAL_VERSION:-}" ]; then
        VERSION_INPUT="${POSITIONAL_VERSION}"
    fi
}

append_unique_candidate() {
    local candidate="$1"
    local existing=""

    [ -n "${candidate}" ] || return 0

    for existing in "${APP_IMAGE_CANDIDATES[@]:-}"; do
        if [ "${existing}" = "${candidate}" ]; then
            return 0
        fi
    done

    APP_IMAGE_CANDIDATES+=("${candidate}")
}

pull_with_retry() {
    local image="$1"
    local platform="$2"
    local attempt=1

    while [ "${attempt}" -le "${RETRY_COUNT}" ]; do
        if docker pull --platform "${platform}" "${image}"; then
            return 0
        fi

        if [ "${attempt}" -lt "${RETRY_COUNT}" ]; then
            print_warning "拉取 ${image} (${platform}) 失败，${RETRY_DELAY_SECONDS}s 后重试（${attempt}/${RETRY_COUNT}）..."
            sleep "${RETRY_DELAY_SECONDS}"
        fi

        attempt=$((attempt + 1))
    done

    return 1
}

resolve_platform_digest_ref() {
    local source_image="$1"
    local platform="$2"

    docker buildx imagetools inspect "${source_image}" 2>/dev/null | awk -v platform="${platform}" '
        $1 == "Name:" { name = $2 }
        $1 == "Platform:" && $2 == platform { print name; exit }
    '
}

materialize_platform_local_tag() {
    local source_image="$1"
    local platform="$2"
    local label="$3"
    local resolved_ref=""
    local version_slug="${RELEASE_VERSION//[^a-zA-Z0-9_.-]/-}"
    local platform_slug="${platform//\//-}"
    local local_tag="qq-farm-offline-cache:${label}-${version_slug}-${platform_slug}"

    resolved_ref="$(resolve_platform_digest_ref "${source_image}" "${platform}")"
    if [ -z "${resolved_ref}" ]; then
        resolved_ref="${source_image}"
    fi

    pull_with_retry "${resolved_ref}" "${platform}" >/dev/null || return 1

    docker tag "${resolved_ref}" "${local_tag}"
    echo "${local_tag}"
}

resolve_app_image_source() {
    local version_tag="$1"
    local candidate=""

    APP_IMAGE_CANDIDATES=()
    append_unique_candidate "${APP_IMAGE_OVERRIDE}"
    append_unique_candidate "${OFFICIAL_DOCKERHUB_APP_IMAGE}:${version_tag}"
    append_unique_candidate "${OFFICIAL_GHCR_APP_IMAGE}:${version_tag}"

    for candidate in "${APP_IMAGE_CANDIDATES[@]}"; do
        print_info "检测离线包主程序镜像来源: ${candidate}"
        if pull_with_retry "${candidate}" "linux/amd64"; then
            APP_IMAGE_SOURCE="${candidate}"
            print_success "离线包主程序镜像来源已确定: ${APP_IMAGE_SOURCE}"
            return 0
        fi
    done

    print_error "无法从 Docker Hub 或 GHCR 获取主程序镜像。"
    print_error "已尝试: ${APP_IMAGE_CANDIDATES[*]}"
    return 1
}

copy_deploy_bundle_files() {
    local target_dir="$1"

    mkdir -p "${target_dir}/init-db"
    cp "${PROJECT_ROOT}/deploy/docker-compose.yml" "${target_dir}/docker-compose.yml"
    cp "${PROJECT_ROOT}/deploy/.env.example" "${target_dir}/.env.example"
    cp "${PROJECT_ROOT}/deploy/README.md" "${target_dir}/README.md"
    cp "${PROJECT_ROOT}/deploy/init-db/01-init.sql" "${target_dir}/init-db/01-init.sql"
    cp "${PROJECT_ROOT}/scripts/deploy/fresh-install.sh" "${target_dir}/fresh-install.sh"
    cp "${PROJECT_ROOT}/scripts/deploy/update-app.sh" "${target_dir}/update-app.sh"
    cp "${PROJECT_ROOT}/scripts/deploy/install-or-update.sh" "${target_dir}/install-or-update.sh"
    cp "${PROJECT_ROOT}/scripts/deploy/safe-update.sh" "${target_dir}/safe-update.sh"
    cp "${PROJECT_ROOT}/scripts/deploy/update-agent.sh" "${target_dir}/update-agent.sh"
    cp "${PROJECT_ROOT}/scripts/deploy/install-update-agent-service.sh" "${target_dir}/install-update-agent-service.sh"
    cp "${PROJECT_ROOT}/scripts/deploy/manual-config-wizard.sh" "${target_dir}/manual-config-wizard.sh"
    cp "${PROJECT_ROOT}/scripts/deploy/stack-layout.sh" "${target_dir}/stack-layout.sh"
    cp "${PROJECT_ROOT}/scripts/deploy/verify-stack.sh" "${target_dir}/verify-stack.sh"
    cp "${PROJECT_ROOT}/scripts/deploy/repair-mysql.sh" "${target_dir}/repair-mysql.sh"
    cp "${PROJECT_ROOT}/scripts/deploy/repair-deploy.sh" "${target_dir}/repair-deploy.sh"
    cp "${PROJECT_ROOT}/scripts/deploy/quick-deploy.sh" "${target_dir}/quick-deploy.sh"
}

create_deploy_bundle() {
    local tmp_dir=""

    tmp_dir="$(mktemp -d)"
    copy_deploy_bundle_files "${tmp_dir}/qq-farm-deploy"
    tar -C "${tmp_dir}" -czf "${OUTPUT_DIR}/qq-farm-bot-deploy.tar.gz" qq-farm-deploy
    rm -rf "${tmp_dir}"
    print_success "部署文件已打包: ${OUTPUT_DIR}/qq-farm-bot-deploy.tar.gz"
}

export_stack_archive() {
    local arch="$1"
    local output_file="$2"
    local app_local_tag=""

    print_info "导出 ${arch} 离线镜像包..."

    app_local_tag="$(materialize_platform_local_tag "${APP_IMAGE_SOURCE}" "linux/${arch}" "app-${arch}")"
    pull_with_retry "${MYSQL_IMAGE}" "linux/${arch}" >/dev/null
    pull_with_retry "${REDIS_IMAGE}" "linux/${arch}" >/dev/null
    pull_with_retry "${IPAD860_IMAGE}" "linux/amd64" >/dev/null

    if [ "${arch}" = "arm64" ]; then
        print_warning "arm64 离线包中的 ipad860 仍为 linux/amd64，目标宿主机需支持 QEMU。"
    fi

    docker tag "${app_local_tag}" "${APP_IMAGE_SOURCE}"

    docker save \
        "${APP_IMAGE_SOURCE}" \
        "${MYSQL_IMAGE}" \
        "${REDIS_IMAGE}" \
        "${IPAD860_IMAGE}" \
        | gzip > "${output_file}"

    docker image rm -f "${app_local_tag}" >/dev/null 2>&1 || true

    print_success "镜像包已导出: ${output_file}"
}

write_install_script() {
    local target_dir="$1"
    local archive_name="$2"

    cat > "${target_dir}/install.sh" <<INSTALL_EOF
#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
cd "\${SCRIPT_DIR}"

if [ ! -f "\${SCRIPT_DIR}/.env" ] && [ -f "\${SCRIPT_DIR}/.env.example" ]; then
    cp "\${SCRIPT_DIR}/.env.example" "\${SCRIPT_DIR}/.env"
fi

set -a
# shellcheck disable=SC1091
. "\${SCRIPT_DIR}/.env"
set +a

chmod +x "\${SCRIPT_DIR}/fresh-install.sh" "\${SCRIPT_DIR}/update-app.sh" "\${SCRIPT_DIR}/install-or-update.sh" "\${SCRIPT_DIR}/safe-update.sh" "\${SCRIPT_DIR}/update-agent.sh" "\${SCRIPT_DIR}/install-update-agent-service.sh" "\${SCRIPT_DIR}/manual-config-wizard.sh" "\${SCRIPT_DIR}/stack-layout.sh" "\${SCRIPT_DIR}/verify-stack.sh" "\${SCRIPT_DIR}/repair-mysql.sh" "\${SCRIPT_DIR}/repair-deploy.sh" "\${SCRIPT_DIR}/quick-deploy.sh"
bash "\${SCRIPT_DIR}/install-or-update.sh" --non-interactive --image-archive "\${SCRIPT_DIR}/${archive_name}"
INSTALL_EOF

    chmod +x "${target_dir}/install.sh"
}

create_all_in_one_bundle() {
    local arch="$1"
    local archive_path="$2"
    local bundle_name="qq-farm-bot-release-${arch}"
    local output_file="${OUTPUT_DIR}/qq-farm-bot-${RELEASE_VERSION}-offline-${arch}.tar.gz"
    local tmp_dir=""

    tmp_dir="$(mktemp -d)"
    copy_deploy_bundle_files "${tmp_dir}/${bundle_name}"
    cp "${archive_path}" "${tmp_dir}/${bundle_name}/$(basename "${archive_path}")"
    write_install_script "${tmp_dir}/${bundle_name}" "$(basename "${archive_path}")"

    tar -C "${tmp_dir}" -czf "${output_file}" "${bundle_name}"
    rm -rf "${tmp_dir}"
    print_success "一体化离线包已导出: ${output_file}"
}

show_summary() {
    echo ""
    print_info "离线部署文件:"
    echo "  ${OUTPUT_DIR}/qq-farm-bot-deploy.tar.gz"
    echo "  ${OUTPUT_DIR}/qq-farm-bot-images-amd64.tar.gz"
    echo "  ${OUTPUT_DIR}/qq-farm-bot-images-arm64.tar.gz"
    echo "  ${OUTPUT_DIR}/qq-farm-bot-${RELEASE_VERSION}-offline-amd64.tar.gz"
    echo "  ${OUTPUT_DIR}/qq-farm-bot-${RELEASE_VERSION}-offline-arm64.tar.gz"
}

main() {
    parse_args "$@"

    require_cmd docker
    require_cmd gzip
    require_cmd tar
    require_cmd cp
    require_cmd mktemp

    NORMALIZED_VERSION="${VERSION_INPUT#v}"
    RELEASE_VERSION="v${NORMALIZED_VERSION}"

    mkdir -p "${OUTPUT_DIR}"
    resolve_app_image_source "${NORMALIZED_VERSION}"
    create_deploy_bundle
    export_stack_archive "amd64" "${OUTPUT_DIR}/qq-farm-bot-images-amd64.tar.gz"
    export_stack_archive "arm64" "${OUTPUT_DIR}/qq-farm-bot-images-arm64.tar.gz"
    create_all_in_one_bundle "amd64" "${OUTPUT_DIR}/qq-farm-bot-images-amd64.tar.gz"
    create_all_in_one_bundle "arm64" "${OUTPUT_DIR}/qq-farm-bot-images-arm64.tar.gz"
    show_summary
}

main "$@"
