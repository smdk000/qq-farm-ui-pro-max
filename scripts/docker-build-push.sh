#!/bin/bash

# QQ 农场助手 - Docker 构建和推送脚本
# 使用方法: ./scripts/docker-build-push.sh [版本号]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
VERSION=${1:-"3.3.0"}
IMAGE_NAME="qq-farm-bot-ui"
DOCKERFILE="core/Dockerfile"
REGISTRY="docker.io"  # 可修改为您的镜像仓库地址
REPO="${REGISTRY}/${IMAGE_NAME}"

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

# 检查 Docker 是否登录
check_docker_login() {
    if ! docker info &> /dev/null; then
        print_error "Docker 未运行或未登录"
        print_info "请先运行: docker login"
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
    
    if [ ! -f "pnpm-lock.yaml" ]; then
        print_warning "pnpm-lock.yaml 不存在，可能需要先安装依赖"
    fi
    
    print_success "项目结构检查通过"
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

# 构建 Docker 镜像
build_image() {
    local tag=$1
    print_info "构建 Docker 镜像：${tag}..."
    
    docker build \
        -t "${tag}" \
        -t "${REPO}:${VERSION}" \
        -t "${REPO}:latest" \
        -f "$DOCKERFILE" \
        .
    
    print_success "Docker 镜像构建完成：${tag}"
}

# 推送镜像到仓库
push_image() {
    local tag=$1
    print_info "推送 Docker 镜像到仓库..."
    
    docker push "${tag}"
    docker push "${REPO}:${VERSION}"
    docker push "${REPO}:latest"
    
    print_success "Docker 镜像推送完成"
    print_info "镜像标签:"
    echo "  - ${tag}"
    echo "  - ${REPO}:${VERSION}"
    echo "  - ${REPO}:latest"
}

# 创建镜像清单（多平台支持）
create_manifest() {
    print_info "创建多平台镜像清单..."
    
    # 如果有其他架构的镜像，可以创建 manifest
    # docker manifest create ${REPO}:${VERSION} ${REPO}:${VERSION}-amd64 ${REPO}:${VERSION}-arm64
    # docker manifest push ${REPO}:${VERSION}
    
    print_success "镜像清单创建完成（如需要）"
}

# 清理中间镜像
cleanup() {
    print_info "清理悬空镜像..."
    docker image prune -f
    print_success "清理完成"
}

# 显示镜像信息
show_info() {
    print_info "镜像信息:"
    echo ""
    docker images | grep "${IMAGE_NAME}"
    echo ""
}

# 主函数
main() {
    echo "========================================"
    echo "  QQ 农场助手 - Docker 构建和推送脚本"
    echo "  版本：${VERSION}"
    echo "========================================"
    echo ""
    
    # 检查
    print_info "执行环境检查..."
    check_docker
    check_docker_login
    check_project
    echo ""
    
    # 询问是否构建前端
    read -p "是否需要构建 Web 前端？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        build_web
        echo ""
    fi
    
    # 构建镜像
    TAG="${REPO}:${VERSION}"
    build_image "$TAG"
    echo ""
    
    # 显示镜像信息
    show_info
    
    # 询问是否推送
    read -p "是否推送到 Docker 仓库？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        push_image "$TAG"
        echo ""
    fi
    
    # 询问是否清理
    read -p "是否清理悬空镜像？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cleanup
        echo ""
    fi
    
    # 完成
    echo "========================================"
    print_success "Docker 构建和推送完成！"
    echo "========================================"
    echo ""
    print_info "使用示例:"
    echo ""
    echo "  # 快速启动"
    echo "  docker run -d \\"
    echo "    --name qq-farm-bot \\"
    echo "    -p 3080:3000 \\"
    echo "    -v ./data:/app/core/data \\"
    echo "    -e ADMIN_PASSWORD=your_password \\"
    echo "    ${REPO}:${VERSION}"
    echo ""
    echo "  # 或使用 Docker Compose"
    echo "  docker-compose up -d"
    echo ""
}

# 执行主函数
main
