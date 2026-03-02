#!/bin/bash

# QQ 农场助手 - Docker 镜像构建和推送脚本
# 支持推送到 Docker Hub 和 GitHub Container Registry

set -e

# 配置
VERSION="${1:-v3.6.0}"
DOCKERHUB_USER="smdk000"
DOCKERHUB_IMAGE="${DOCKERHUB_USER}/qq-farm-bot-ui"
GHCR_IMAGE="ghcr.io/${DOCKERHUB_USER}/qq-farm-bot-ui"
DOCKERFILE="core/Dockerfile"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo "========================================"
echo "  QQ 农场助手 - Docker 镜像构建和推送"
echo "  版本：${VERSION}"
echo "========================================"
echo ""

# 检查 Docker
if ! command -v docker &> /dev/null; then
    print_error "Docker 未安装"
    exit 1
fi
print_success "Docker 已安装：$(docker --version)"

# 检查 Buildx
if ! docker buildx version &> /dev/null; then
    print_error "Docker Buildx 未安装"
    exit 1
fi
print_success "Docker Buildx 已安装"

# 检查 Docker 登录
if ! docker info &> /dev/null; then
    print_error "Docker 未运行或未登录"
    print_info "请先运行：docker login"
    exit 1
fi
print_success "Docker 已登录"

# 创建 builder
print_info "创建 Docker Buildx builder..."
if docker buildx inspect qq-farm-builder &> /dev/null; then
    docker buildx use qq-farm-builder
    print_info "使用现有 builder"
else
    docker buildx create --use --name qq-farm-builder
    print_success "Builder 创建成功"
fi

docker buildx inspect --bootstrap qq-farm-builder &> /dev/null || true
print_success "Builder 已启动"

# 询问推送目标
echo ""
print_info "选择推送目标:"
echo "1) 推送到 Docker Hub"
echo "2) 推送到 GitHub Container Registry"
echo "3) 推送到两个仓库"
read -p "请选择 (1/2/3): " -n 1 -r
echo

PUSH_TO_DOCKERHUB=false
PUSH_TO_GHCR=false

if [[ $REPLY =~ ^[13]$ ]]; then
    PUSH_TO_DOCKERHUB=true
fi

if [[ $REPLY =~ ^[23]$ ]]; then
    PUSH_TO_GHCR=true
fi

# 构建和推送
echo ""
print_info "开始构建多平台镜像..."

BUILD_ARGS="--platform linux/amd64,linux/arm64"
BUILD_ARGS="${BUILD_ARGS} -t ${DOCKERHUB_IMAGE}:${VERSION}"
BUILD_ARGS="${BUILD_ARGS} -t ${DOCKERHUB_IMAGE}:latest"

if [ "$PUSH_TO_GHCR" = true ]; then
    BUILD_ARGS="${BUILD_ARGS} -t ${GHCR_IMAGE}:${VERSION}"
    BUILD_ARGS="${BUILD_ARGS} -t ${GHCR_IMAGE}:latest"
fi

if [ "$PUSH_TO_DOCKERHUB" = true ] || [ "$PUSH_TO_GHCR" = true ]; then
    BUILD_ARGS="${BUILD_ARGS} --push"
    print_info "构建并推送镜像..."
else
    print_warning "未选择推送目标，仅构建本地镜像"
    BUILD_ARGS="${BUILD_ARGS} --load"
fi

docker buildx build \
    ${BUILD_ARGS} \
    -f "$DOCKERFILE" \
    .

print_success "构建完成"

# 显示镜像信息
echo ""
print_info "镜像信息:"
echo ""

if [ "$PUSH_TO_DOCKERHUB" = true ]; then
    echo "Docker Hub:"
    echo "  - ${DOCKERHUB_IMAGE}:${VERSION}"
    echo "  - ${DOCKERHUB_IMAGE}:latest"
    echo "  查看地址：https://hub.docker.com/r/${DOCKERHUB_USER}/qq-farm-bot-ui/tags"
    echo ""
fi

if [ "$PUSH_TO_GHCR" = true ]; then
    echo "GitHub Container Registry:"
    echo "  - ${GHCR_IMAGE}:${VERSION}"
    echo "  - ${GHCR_IMAGE}:latest"
    echo "  查看地址：https://github.com/users/${DOCKERHUB_USER}/packages/container/package/qq-farm-bot-ui"
    echo ""
fi

# 部署说明
echo "========================================"
echo "  🚀 部署命令"
echo "========================================"
echo ""

echo "ARM 服务器部署:"
echo "  curl -O https://raw.githubusercontent.com/smdk000/qq-farm-bot-ui/main/scripts/deploy-arm.sh"
echo "  chmod +x deploy-arm.sh"
echo "  ./deploy-arm.sh"
echo ""

echo "x86 服务器部署:"
echo "  curl -O https://raw.githubusercontent.com/smdk000/qq-farm-bot-ui/main/scripts/deploy-x86.sh"
echo "  chmod +x deploy-x86.sh"
echo "  ./deploy-x86.sh"
echo ""

echo "========================================"
print_success "Docker 构建和推送完成！"
echo "========================================"
