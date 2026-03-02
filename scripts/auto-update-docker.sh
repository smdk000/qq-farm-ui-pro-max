#!/bin/bash

# QQ 农场助手 - Docker 镜像自动更新脚本
# 用于代码更新后自动构建和推送 Docker 镜像

set -e

# 配置
NEW_VERSION="${1:-v3.6.1}"
COMMIT_MESSAGE="${2:-自动更新 Docker 镜像}"

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
echo "  QQ 农场助手 - Docker 镜像自动更新"
echo "  版本：${NEW_VERSION}"
echo "========================================"
echo ""

# 检查 Git
if ! command -v git &> /dev/null; then
    print_error "Git 未安装"
    exit 1
fi

# 检查当前分支
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
    print_warning "当前不在 main 分支，是否切换？"
    read -p "切换到 main 分支？(y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git checkout main
        git pull origin main
    else
        print_error "请在 main 分支上运行此脚本"
        exit 1
    fi
fi

# 检查是否有未提交的更改
if ! git diff-index --quiet HEAD --; then
    print_info "检测到未提交的更改..."
    git add .
    git commit -m "$COMMIT_MESSAGE"
    print_success "更改已提交"
fi

# 拉取最新代码
print_info "拉取最新代码..."
git pull origin main

# 推送代码（可选触发构建）
print_info "推送代码到 GitHub..."
git push origin main
print_success "代码已推送"

# 询问是否创建标签
echo ""
read -p "是否创建版本标签 ${NEW_VERSION}？(y/n): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    # 检查标签是否已存在
    if git rev-parse "${NEW_VERSION}" &> /dev/null; then
        print_warning "标签 ${NEW_VERSION} 已存在"
        read -p "是否删除并重新创建？(y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git tag -d "${NEW_VERSION}"
            git push origin :refs/tags/${NEW_VERSION}
            print_success "旧标签已删除"
        else
            print_error "操作取消"
            exit 1
        fi
    fi

    # 创建并推送标签
    print_info "创建标签 ${NEW_VERSION}..."
    git tag -a "${NEW_VERSION}" -m "${COMMIT_MESSAGE}"
    git push origin "${NEW_VERSION}"
    print_success "标签已创建并推送"
    
    echo ""
    print_info "GitHub Actions 将自动构建并推送 Docker 镜像"
    print_info "查看进度：https://github.com/smdk000/qq-farm-ui-pro-max/actions"
else
    print_info "未创建标签，代码推送将触发基于 main 分支的构建"
fi

# 显示部署信息
echo ""
echo "========================================"
echo "  📊 部署信息"
echo "========================================"
echo ""
echo "Docker Hub:"
echo "  - smdk000/qq-farm-bot-ui:${NEW_VERSION}"
echo "  - smdk000/qq-farm-bot-ui:latest"
echo "  查看：https://hub.docker.com/r/smdk000/qq-farm-bot-ui/tags"
echo ""
echo "GitHub Container Registry:"
echo "  - ghcr.io/smdk000/qq-farm-bot-ui:${NEW_VERSION}"
echo "  - ghcr.io/smdk000/qq-farm-bot-ui:latest"
echo "  查看：https://github.com/users/smdk000/packages/container/package/qq-farm-bot-ui"
echo ""
echo "========================================"
echo "  🚀 部署命令"
echo "========================================"
echo ""
echo "ARM 服务器:"
echo "  curl -O https://raw.githubusercontent.com/smdk000/qq-farm-bot-ui/main/scripts/deploy-arm.sh"
echo "  chmod +x deploy-arm.sh"
echo "  ./deploy-arm.sh"
echo ""
echo "x86 服务器:"
echo "  curl -O https://raw.githubusercontent.com/smdk000/qq-farm-bot-ui/main/scripts/deploy-x86.sh"
echo "  chmod +x deploy-x86.sh"
echo "  ./deploy-x86.sh"
echo ""
echo "========================================"
print_success "自动更新流程已启动！"
echo "========================================"
echo ""
print_info "请等待 GitHub Actions 完成构建（约 10-20 分钟）"
print_info "构建完成后，使用上述部署命令更新服务器"
