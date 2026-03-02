#!/bin/bash

# QQ 农场助手 - Docker 镜像同步脚本
# 使用方法: ./scripts/docker-sync.sh [目标仓库] [版本号]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置
VERSION=${2:-"3.3.0"}
SOURCE_IMAGE="qq-farm-bot-ui:${VERSION}"
TARGET_REGISTRY=${1:-"docker.io"}  # 默认 Docker Hub
TARGET_IMAGE="${TARGET_REGISTRY}/qq-farm-bot-ui:${VERSION}"

# 打印消息
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

# 检查 Docker
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker 未安装"
        exit 1
    fi
    print_success "Docker 已就绪"
}

# 拉取源镜像
pull_source() {
    print_info "拉取源镜像：${SOURCE_IMAGE}..."
    
    if docker image inspect "${SOURCE_IMAGE}" &> /dev/null; then
        print_success "本地已有镜像，跳过拉取"
    else
        docker pull "${SOURCE_IMAGE}"
        print_success "源镜像拉取完成"
    fi
}

# 标记镜像
tag_image() {
    print_info "标记镜像：${SOURCE_IMAGE} -> ${TARGET_IMAGE}..."
    
    docker tag "${SOURCE_IMAGE}" "${TARGET_IMAGE}"
    docker tag "${SOURCE_IMAGE}" "${TARGET_REGISTRY}/qq-farm-bot-ui:latest"
    
    print_success "镜像标记完成"
}

# 推送到目标仓库
push_image() {
    print_info "推送镜像到：${TARGET_REGISTRY}..."
    
    docker push "${TARGET_IMAGE}"
    docker push "${TARGET_REGISTRY}/qq-farm-bot-ui:latest"
    
    print_success "镜像推送完成"
}

# 验证推送
verify_push() {
    print_info "验证推送..."
    
    # 本地验证
    if docker manifest inspect "${TARGET_IMAGE}" &> /dev/null; then
        print_success "镜像验证通过"
    else
        print_warning "无法本地验证，请在目标仓库确认"
    fi
}

# 显示信息
show_info() {
    echo ""
    print_info "镜像信息:"
    docker images | grep "qq-farm-bot-ui"
    echo ""
}

# 主函数
main() {
    echo "========================================"
    echo "  QQ 农场助手 - Docker 镜像同步脚本"
    echo "  版本：${VERSION}"
    echo "  目标：${TARGET_REGISTRY}"
    echo "========================================"
    echo ""
    
    # 检查
    check_docker
    echo ""
    
    # 拉取
    pull_source
    echo ""
    
    # 标记
    tag_image
    echo ""
    
    # 显示
    show_info
    
    # 询问是否推送
    read -p "是否推送到 ${TARGET_REGISTRY}？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        push_image
        echo ""
        verify_push
    fi
    
    # 完成
    echo "========================================"
    print_success "Docker 镜像同步完成！"
    echo "========================================"
    echo ""
    print_info "镜像地址:"
    echo "  - ${TARGET_IMAGE}"
    echo "  - ${TARGET_REGISTRY}/qq-farm-bot-ui:latest"
    echo ""
}

# 执行
main
