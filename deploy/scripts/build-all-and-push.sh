#!/bin/bash

# =====================================================
# QQ 农场助手 - 全量镜像构建 & 推送脚本
# =====================================================
# 构建所有服务镜像并推送到 Docker Hub
# 使用方法：./scripts/build-all-and-push.sh [版本号]
# 
# 注意：需要先 `docker login` 登录 Docker Hub
# =====================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置
VERSION=${1:-"4.5.46"}
DOCKERHUB_USER="smdk000"
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# 镜像名称
BOT_IMAGE="${DOCKERHUB_USER}/qq-farm-bot-ui"
IPAD860_IMAGE="${DOCKERHUB_USER}/ipad860"

# 打印函数
print_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[✅ OK]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[⚠ WARN]${NC} $1"; }
print_error()   { echo -e "${RED}[❌ ERR]${NC} $1"; }

# 环境检查
check_env() {
    print_info "环境检查..."

    # Docker
    if ! command -v docker &>/dev/null; then
        print_error "Docker 未安装"; exit 1
    fi
    print_success "Docker: $(docker --version)"

    # Buildx
    if ! docker buildx version &>/dev/null; then
        print_error "Docker Buildx 未安装"; exit 1
    fi
    print_success "Buildx: $(docker buildx version)"

    # Docker 登录状态
    if ! docker info 2>/dev/null | grep -q "Username"; then
        print_warning "Docker Hub 可能未登录，请确认已执行 docker login"
    else
        print_success "Docker Hub 已登录"
    fi
}

# 创建或复用 Buildx builder
setup_builder() {
    print_info "配置 Buildx builder..."

    if docker buildx inspect qq-farm-builder &>/dev/null 2>&1; then
        docker buildx use qq-farm-builder
        print_success "使用已有 builder: qq-farm-builder"
    else
        docker buildx create --use --name qq-farm-builder --driver docker-container
        print_success "创建新 builder: qq-farm-builder"
    fi

    docker buildx inspect --bootstrap qq-farm-builder >/dev/null 2>&1 || true
}

# ========== 构建主应用镜像 ==========
build_bot() {
    print_info "========== 构建主应用镜像 =========="
    print_info "镜像: ${BOT_IMAGE}:${VERSION}"
    print_info "Dockerfile: core/Dockerfile"
    print_info "上下文: ${PROJECT_ROOT}"

    cd "${PROJECT_ROOT}"

    docker buildx build \
        --platform linux/amd64,linux/arm64 \
        -t "${BOT_IMAGE}:${VERSION}" \
        -t "${BOT_IMAGE}:latest" \
        -f core/Dockerfile \
        --push \
        .

    print_success "主应用镜像构建并推送完成: ${BOT_IMAGE}:${VERSION}"
}

# ========== 构建 Ipad860 镜像 ==========
build_ipad860() {
    print_info "========== 构建 Ipad860 镜像 =========="
    print_info "镜像: ${IPAD860_IMAGE}:${VERSION}"
    print_info "Dockerfile: services/ipad860/Dockerfile.multi"
    print_info "注意: 仅支持 linux/amd64（.so 共享库限制）"

    cd "${PROJECT_ROOT}/services/ipad860"

    docker buildx build \
        --platform linux/amd64 \
        -t "${IPAD860_IMAGE}:${VERSION}" \
        -t "${IPAD860_IMAGE}:latest" \
        -f Dockerfile.multi \
        --push \
        .

    print_success "Ipad860 镜像构建并推送完成: ${IPAD860_IMAGE}:${VERSION}"
}

# ========== 导出离线包 ==========
export_offline() {
    print_info "========== 导出离线安装包 =========="

    bash "${PROJECT_ROOT}/deploy/scripts/export-offline-packages.sh" \
        "${VERSION}" \
        --output-dir "${PROJECT_ROOT}/deploy/offline" \
        --app-image "${BOT_IMAGE}:${VERSION}" \
        --ipad860-image "${IPAD860_IMAGE}:latest"
}

# ========== 显示结果摘要 ==========
show_summary() {
    echo ""
    echo "=========================================="
    echo -e "${GREEN}  ✅ 全部完成！${NC}"
    echo "=========================================="
    echo ""
    print_info "Docker Hub 镜像:"
    echo "  ${BOT_IMAGE}:${VERSION}"
    echo "  ${BOT_IMAGE}:latest"
    echo "  ${IPAD860_IMAGE}:${VERSION}"
    echo "  ${IPAD860_IMAGE}:latest"
    echo ""
    print_info "离线包:"
    echo "  deploy/offline/qq-farm-bot-deploy.tar.gz"
    echo "  deploy/offline/qq-farm-bot-images-amd64.tar.gz"
    echo "  deploy/offline/qq-farm-bot-images-arm64.tar.gz"
    echo "  deploy/offline/qq-farm-bot-v${VERSION}-offline-amd64.tar.gz"
    echo "  deploy/offline/qq-farm-bot-v${VERSION}-offline-arm64.tar.gz"
    echo ""
    print_info "用户部署命令（在线）:"
    echo "  docker compose up -d"
    echo ""
    print_info "用户部署命令（离线）:"
    echo "  tar xzf qq-farm-bot-v${VERSION}-offline-amd64.tar.gz"
    echo "  cd qq-farm-bot-release-amd64"
    echo "  ./install.sh"
    echo ""
    print_info "Docker Hub 查看:"
    echo "  https://hub.docker.com/r/${DOCKERHUB_USER}/qq-farm-bot-ui"
    echo "  https://hub.docker.com/r/${DOCKERHUB_USER}/ipad860"
    echo ""
}

# ========== 主流程 ==========
main() {
    echo "=========================================="
    echo "  QQ 农场助手 - 全量构建 & 推送"
    echo "  版本: v${VERSION}"
    echo "=========================================="
    echo ""

    check_env
    echo ""

    setup_builder
    echo ""

    echo "构建选项:"
    echo "  1) 全部构建（主应用 + Ipad860 + 离线包）"
    echo "  2) 仅构建主应用"
    echo "  3) 仅构建 Ipad860"
    echo "  4) 仅导出离线包（需先构建镜像）"
    echo ""
    read -p "请选择 (1/2/3/4): " choice

    case $choice in
        1)
            build_bot
            echo ""
            build_ipad860
            echo ""
            export_offline
            ;;
        2)
            build_bot
            ;;
        3)
            build_ipad860
            ;;
        4)
            export_offline
            ;;
        *)
            print_error "无效选择"
            exit 1
            ;;
    esac

    echo ""
    show_summary
}

main
