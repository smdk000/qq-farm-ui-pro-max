#!/bin/bash

# QQ 农场助手 - 多平台 Docker 构建和推送脚本
# 使用方法：./scripts/docker-build-multiarch.sh [版本号]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置
VERSION=${1:-"3.3.3"}
IMAGE_NAME="qq-farm-bot-ui"
DOCKERHUB_USER="smdk000"
REPO="${DOCKERHUB_USER}/${IMAGE_NAME}"
DOCKERFILE="core/Dockerfile"

# 打印带颜色的消息
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

# 检查 Docker 是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi
    print_success "Docker 已安装：$(docker --version)"
}

# 检查 Docker Buildx 是否可用
check_buildx() {
    if ! docker buildx version &> /dev/null; then
        print_error "Docker Buildx 未安装，请安装 Docker Buildx"
        exit 1
    fi
    print_success "Docker Buildx 已安装：$(docker buildx version)"
}

# 检查 Docker 是否登录
check_docker_login() {
    if ! docker info &> /dev/null; then
        print_error "Docker 未运行或未登录"
        print_info "请先运行：docker login"
        exit 1
    fi
    print_success "Docker 已登录"
}

# 检查项目结构
check_project() {
    print_info "检查项目结构..."
    
    if [ ! -f "$DOCKERFILE" ]; then
        print_error "Dockerfile 不存在：$DOCKERFILE"
        exit 1
    fi
    
    if [ ! -f "package.json" ]; then
        print_error "package.json 不存在"
        exit 1
    fi
    
    print_success "项目结构检查通过"
}

# 创建 Buildx builder
create_builder() {
    print_info "创建 Docker Buildx builder..."
    
    # 检查是否已存在 builder
    if docker buildx inspect qq-farm-builder &> /dev/null; then
        print_info "Builder 已存在，使用现有 builder"
        docker buildx use qq-farm-builder
    else
        docker buildx create --use --name qq-farm-builder
        print_success "Builder 创建成功"
    fi
    
    # 启动 builder
    docker buildx inspect --bootstrap qq-farm-builder &> /dev/null || true
    print_success "Builder 已启动"
}

# 构建 Web 前端
build_web() {
    print_info "构建 Web 前端..."
    
    if command -v pnpm &> /dev/null; then
        pnpm build:web
    elif command -v npm &> /dev/null; then
        npm run build:web
    else
        print_error "未找到 pnpm 或 npm，请先安装 Node.js 包管理器"
        exit 1
    fi
    
    print_success "Web 前端构建完成"
}

# 构建多平台 Docker 镜像
build_multiarch() {
    print_info "构建多平台 Docker 镜像 (linux/amd64, linux/arm64)..."
    
    docker buildx build \
        --platform linux/amd64,linux/arm64 \
        -t "${REPO}:${VERSION}" \
        -t "${REPO}:latest" \
        -f "$DOCKERFILE" \
        --push \
        .
    
    print_success "多平台 Docker 镜像构建并推送完成"
}

# 单独构建 AMD64 镜像
build_amd64() {
    print_info "构建 AMD64 Docker 镜像..."
    
    docker buildx build \
        --platform linux/amd64 \
        -t "${REPO}:${VERSION}-amd64" \
        -t "${REPO}:latest-amd64" \
        -f "$DOCKERFILE" \
        --push \
        .
    
    print_success "AMD64 Docker 镜像构建并推送完成"
}

# 单独构建 ARM64 镜像
build_arm64() {
    print_info "构建 ARM64 Docker 镜像..."
    
    docker buildx build \
        --platform linux/arm64 \
        -t "${REPO}:${VERSION}-arm64" \
        -t "${REPO}:latest-arm64" \
        -f "$DOCKERFILE" \
        --push \
        .
    
    print_success "ARM64 Docker 镜像构建并推送完成"
}

# 创建镜像清单
create_manifest() {
    print_info "创建多平台镜像清单..."
    
    # 为版本标签创建 manifest
    docker manifest create "${REPO}:${VERSION}" \
        "${REPO}:${VERSION}-amd64" \
        "${REPO}:${VERSION}-arm64"
    
    docker manifest annotate "${REPO}:${VERSION}" \
        "${REPO}:${VERSION}-arm64" --arch arm64 --os linux
    
    # 为 latest 标签创建 manifest
    docker manifest create "${REPO}:latest" \
        "${REPO}:latest-amd64" \
        "${REPO}:latest-arm64"
    
    docker manifest annotate "${REPO}:latest" \
        "${REPO}:latest-arm64" --arch arm64 --os linux
    
    # 推送 manifest
    docker manifest push "${REPO}:${VERSION}"
    docker manifest push "${REPO}:latest"
    
    print_success "镜像清单创建并推送完成"
}

# 显示镜像信息
show_info() {
    print_info "Docker 镜像信息:"
    echo ""
    print_info "镜像仓库：${REPO}"
    print_info "版本标签：${VERSION}"
    print_info "平台标签：latest"
    echo ""
    print_info "拉取命令:"
    echo "  # 自动选择对应平台"
    echo "  docker pull ${REPO}:${VERSION}"
    echo ""
    echo "  # 或指定平台"
    echo "  docker pull ${REPO}:${VERSION}-amd64  # AMD64/x86_64"
    echo "  docker pull ${REPO}:${VERSION}-arm64  # ARM64"
    echo ""
    print_info "运行示例:"
    echo "  docker run -d \\"
    echo "    --name qq-farm-bot \\"
    echo "    -p 3080:3000 \\"
    echo "    -v ./data:/app/core/data \\"
    echo "    -e ADMIN_PASSWORD=your_password \\"
    echo "    ${REPO}:${VERSION}"
    echo ""
}

# 清理
cleanup() {
    print_info "清理构建缓存..."
    docker buildx prune -f || true
    print_success "清理完成"
}

# 主函数
main() {
    echo "========================================"
    echo "  QQ 农场助手 - 多平台 Docker 构建"
    echo "  版本：${VERSION}"
    echo "  平台：AMD64 + ARM64"
    echo "========================================"
    echo ""
    
    # 检查
    print_info "执行环境检查..."
    check_docker
    check_buildx
    check_docker_login
    check_project
    echo ""
    
    # 创建 builder
    create_builder
    echo ""
    
    # 询问是否构建前端
    read -p "是否需要构建 Web 前端？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        build_web
        echo ""
    fi
    
    # 构建多平台镜像
    print_info "开始构建多平台镜像..."
    build_multiarch
    echo ""
    
    # 显示镜像信息
    show_info
    
    # 清理
    read -p "是否清理构建缓存？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cleanup
        echo ""
    fi
    
    # 完成
    echo "========================================"
    print_success "Docker 多平台构建完成！"
    echo "========================================"
    echo ""
    print_info "Docker Hub 查看地址:"
    echo "  https://hub.docker.com/r/${DOCKERHUB_USER}/${IMAGE_NAME}"
    echo ""
    print_info "GitHub 仓库地址:"
    echo "  https://github.com/smdk000/qq-farm-ui-pro-max"
    echo ""
}

# 执行主函数
main
