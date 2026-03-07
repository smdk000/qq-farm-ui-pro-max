#!/bin/bash

# =====================================================
# QQ 农场智能助手 v4.3.0 - 全架构一键部署脚本
# 自动适配 x86_64 / ARM64，部署完整栈：
#   App + MySQL 8.0 + Redis 7 + ipad860（微信协议）
# =====================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

REPO_BASE="https://raw.githubusercontent.com/smdk000/qq-farm-bot-ui/main"
DEPLOY_DIR="${PWD}/qq-farm"

echo ""
echo "=========================================="
echo "  🌾 QQ 农场智能助手 v4.3.0"
echo "  全架构一键部署（App+MySQL+Redis+微信扫码）"
echo "=========================================="
echo ""

# 1. 检测 Docker
print_info "检查 Docker 安装..."
if ! command -v docker &>/dev/null; then
    print_error "Docker 未安装，正在尝试自动安装..."
    curl -fsSL https://get.docker.com | sh
    sudo systemctl enable docker
    sudo systemctl start docker
    print_success "Docker 安装完成"
fi
print_success "Docker: $(docker --version)"

# 2. 检测 Docker Compose
if ! docker compose version &>/dev/null 2>&1; then
    print_error "Docker Compose v2 未安装，请升级 Docker"
    exit 1
fi
print_success "Docker Compose: $(docker compose version --short)"

# 3. 检测架构
ARCH=$(uname -m)
print_info "服务器架构: ${ARCH}"

if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    print_warning "ARM64 架构检测到，启用内存超分配优化..."
    sudo sysctl -w vm.overcommit_memory=1 2>/dev/null || true
fi

# 4. 检测端口
PORT=${WEB_PORT:-3080}
if ss -tlnp 2>/dev/null | grep -q ":${PORT} " || lsof -i ":${PORT}" &>/dev/null 2>&1; then
    print_warning "端口 ${PORT} 已被占用"
    read -p "请输入新端口号 (直接回车使用 3081): " NEW_PORT
    PORT=${NEW_PORT:-3081}
fi

# 5. 创建部署目录
print_info "创建部署目录: ${DEPLOY_DIR}"
mkdir -p "${DEPLOY_DIR}/init-db"
cd "${DEPLOY_DIR}"

# 6. 下载编排文件
print_info "下载部署文件..."
curl -sL "${REPO_BASE}/deploy/docker-compose.yml" -o docker-compose.yml
curl -sL "${REPO_BASE}/deploy/.env" -o .env

# 下载 init-db（如有）
curl -sL "${REPO_BASE}/deploy/init-db/init.sql" -o init-db/init.sql 2>/dev/null || true

# 7. 写入端口
if [ "$PORT" != "3080" ]; then
    if [ "$(uname)" = "Darwin" ]; then
        sed -i '' "s/WEB_PORT=3080/WEB_PORT=${PORT}/" .env
    else
        sed -i "s/WEB_PORT=3080/WEB_PORT=${PORT}/" .env
    fi
fi

# 8. 拉取并启动
print_info "拉取镜像并启动服务（首次约需 3~5 分钟）..."
docker compose pull
docker compose up -d

# 9. 等待健康检查
print_info "等待服务就绪（约 30 秒）..."
sleep 30

# 10. 检查状态
echo ""
docker compose ps
echo ""

SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo "=========================================="
print_success "部署完成！"
echo "=========================================="
echo ""
echo "  📌 访问地址:  http://${SERVER_IP}:${PORT}"
echo "  🔑 默认密码:  qq007qq008"
echo ""
echo "  💡 常用命令（在 ${DEPLOY_DIR} 目录下执行）:"
echo "    查看日志:   docker compose logs -f"
echo "    停止服务:   docker compose down"
echo "    重启服务:   docker compose restart"
echo "    更新版本:   docker compose pull && docker compose up -d"
echo ""
echo "  ⚠️  重要："
echo "    - 密码修改:  编辑 .env 文件中的 ADMIN_PASSWORD"
echo "    - 数据备份:  docker compose down && tar czf backup.tar.gz ."
echo ""
