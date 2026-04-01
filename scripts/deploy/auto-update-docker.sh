#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

VERSION_INPUT=""
RUN_CHECKS=1
BUILD_RELEASE_ASSETS=0
SKIP_WEB_BUILD=1
PUSH_GHCR=0
DOCKERHUB_USERNAME="${DOCKERHUB_USERNAME:-smdk000}"
DOCKERHUB_TOKEN="${DOCKERHUB_TOKEN:-${DOCKER_HUB_TOKEN:-}}"
GHCR_USERNAME="${GHCR_USERNAME:-${GITHUB_ACTOR:-}}"
GHCR_TOKEN="${GHCR_TOKEN:-${GITHUB_TOKEN:-}}"
PNPM_CMD=()

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
  bash scripts/deploy/auto-update-docker.sh [--version v4.5.59] [--with-release-assets] [--with-ghcr]

说明:
  1. 先执行公告/文档/关键回归检查
  2. 优先复用当前 Docker 登录态；如未登录，再使用 DOCKERHUB_TOKEN / GHCR_TOKEN
  3. 调用 scripts/docker/docker-build-multiarch.sh 构建并推送镜像
  4. 可选同时输出 Release 离线包

常用环境变量:
  DOCKERHUB_TOKEN   Docker Hub Access Token（可选；未提供时复用当前 docker login）
  DOCKERHUB_USERNAME Docker Hub 用户名，默认 smdk000
  GHCR_TOKEN        如需同步 GHCR 时可提供；未提供时复用当前 ghcr.io 登录态
  GHCR_USERNAME     GHCR 登录用户名，默认取 GITHUB_ACTOR

示例:
  docker login
  bash scripts/deploy/auto-update-docker.sh --version v4.5.59

  export DOCKERHUB_TOKEN='***'
  export GHCR_TOKEN='***'
  bash scripts/deploy/auto-update-docker.sh --version 4.5.59 --with-ghcr --with-release-assets
EOF
}

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        print_error "缺少命令: $1"
        exit 1
    fi
}

resolve_pnpm_cmd() {
    if command -v pnpm >/dev/null 2>&1; then
        PNPM_CMD=(pnpm)
        return 0
    fi
    if command -v npx >/dev/null 2>&1; then
        PNPM_CMD=(npx pnpm)
        return 0
    fi
    print_error "未检测到 pnpm，也无法通过 npx 调起 pnpm。"
    exit 1
}

run_pnpm() {
    "${PNPM_CMD[@]}" "$@"
}

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --version)
                VERSION_INPUT="${2:-}"
                shift 2
                ;;
            --skip-checks)
                RUN_CHECKS=0
                shift
                ;;
            --with-release-assets)
                BUILD_RELEASE_ASSETS=1
                shift
                ;;
            --with-web-build)
                SKIP_WEB_BUILD=0
                shift
                ;;
            --with-ghcr)
                PUSH_GHCR=1
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                if [ -z "${VERSION_INPUT}" ]; then
                    VERSION_INPUT="$1"
                    shift
                else
                    print_error "未知参数: $1"
                    usage
                    exit 1
                fi
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
}

run_checks() {
    print_info "执行公告/文档/关键回归检查..."
    (
        cd "${PROJECT_ROOT}"
        run_pnpm check:announcements
        run_pnpm check:doc-links
        node --test core/__tests__/admin-user-card-routes.test.js core/__tests__/wechat-platform-auto-steal.test.js core/__tests__/store-account-settings-persistence.test.js core/__tests__/store-system-settings.test.js
        run_pnpm -C web exec vue-tsc --noEmit
    )
}

docker_login() {
    require_cmd docker

    if [ -n "${DOCKERHUB_TOKEN}" ]; then
        print_info "登录 Docker Hub..."
        printf '%s' "${DOCKERHUB_TOKEN}" | docker login -u "${DOCKERHUB_USERNAME}" --password-stdin >/dev/null
    else
        print_warning "未检测到 DOCKERHUB_TOKEN，改为复用当前 Docker Hub 登录态。若尚未 docker login，推送阶段会失败。"
    fi

    if [ "${PUSH_GHCR}" = "1" ]; then
        if [ -n "${GHCR_TOKEN}" ] && [ -n "${GHCR_USERNAME}" ]; then
            print_info "登录 GHCR..."
            printf '%s' "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin >/dev/null
        else
            print_warning "未检测到 GHCR_TOKEN / GHCR_USERNAME，改为复用当前 GHCR 登录态。若尚未 docker login ghcr.io，推送阶段会失败。"
        fi
    fi
}

build_images() {
    local args=("--version" "${VERSION}")
    if [ "${SKIP_WEB_BUILD}" = "1" ]; then
        args+=("--skip-web-build")
    fi
    if [ "${PUSH_GHCR}" != "1" ]; then
        args+=("--docker-hub-only")
    fi

    print_info "开始构建并推送 Docker 镜像 ${VERSION_TAG}..."
    (
        cd "${PROJECT_ROOT}"
        bash scripts/docker/docker-build-multiarch.sh "${args[@]}"
    )
}

build_release_assets() {
    print_info "输出 Release 离线包..."
    (
        cd "${PROJECT_ROOT}"
        bash scripts/release/build-release-assets.sh --version "${VERSION_TAG}"
    )
}

show_summary() {
    cat <<EOF

========================================
Docker 发布完成
========================================
版本: ${VERSION_TAG}
Docker Hub:
  - smdk000/qq-farm-bot-ui:${VERSION}
  - smdk000/qq-farm-bot-ui:latest
EOF

    if [ "${PUSH_GHCR}" = "1" ]; then
        cat <<EOF
GHCR:
  - ghcr.io/smdk000/qq-farm-ui-pro-max:${VERSION}
  - ghcr.io/smdk000/qq-farm-ui-pro-max:latest
EOF
    fi

    cat <<EOF

推荐后续更新命令:
  /opt/qq-farm-current/update-app.sh --image smdk000/qq-farm-bot-ui:${VERSION}

多实例同步更新示例:
  STACK_NAME=qq-farm-2600 /opt/qq-farm-2600-current/update-app.sh --image smdk000/qq-farm-bot-ui:${VERSION}
  STACK_NAME=qq-farm-2500 /opt/qq-farm-2500-current/update-app.sh --image smdk000/qq-farm-bot-ui:${VERSION}

说明:
  - 当前脚本不会自动提交 Git 或创建 tag，适合本地代码已更新后直接发镜像。
  - 如需发镜像后顺手滚动更新多台服务器，可继续执行 `bash scripts/deploy/publish-and-rollout.sh --version ${VERSION_TAG}`。
  - 如需触发 GitHub Release / Actions，请在代码推送并打 tag 后再执行远端发布链路。
========================================
EOF
}

main() {
    parse_args "$@"
    resolve_version
    resolve_pnpm_cmd

    print_info "准备发布 Docker 镜像 ${VERSION_TAG}"

    if [ "${RUN_CHECKS}" = "1" ]; then
        run_checks
    else
        print_warning "已跳过本地检查。"
    fi

    docker_login
    build_images

    if [ "${BUILD_RELEASE_ASSETS}" = "1" ]; then
        build_release_assets
    fi

    show_summary
    print_success "Docker 自动发布流程执行完成。"
}

main "$@"
