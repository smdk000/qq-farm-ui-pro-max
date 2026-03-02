#!/bin/bash
set -e

# ==========================================
# QQ Farm UI Pro Max - 跨平台一键部署脚本
# 作者: Anthropic (AntiGravity) / smdk000
# 版本: v3.8.0
# ==========================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== 🚀 QQ Farm UI Pro Max 一键环境检查与部署套件 ===${NC}\n"

# 1. 检查架构与内核调优
ARCH=$(uname -m)
echo -e "📦 探测到系统架构: ${YELLOW}${ARCH}${NC}"

if [[ "${ARCH}" == "aarch64" || "${ARCH}" == "arm64" ]]; then
    echo -e "${YELLOW}⚠️ 检测到 ARM/树莓派 架构，正在检查虚拟内存配置以保护 Redis...${NC}"
    OVERCOMMIT=$(cat /proc/sys/vm/overcommit_memory 2>/dev/null || echo "1")
    if [ "$OVERCOMMIT" = "0" ]; then
        echo -e "${YELLOW}🔧 正在配置 vm.overcommit_memory = 1${NC}"
        sudo sysctl vm.overcommit_memory=1 || true
        # 尝试写入 rc.local 防止重启丢失
        (grep -q "vm.overcommit_memory=1" /etc/sysctl.conf) || echo "vm.overcommit_memory=1" | sudo tee -a /etc/sysctl.conf > /dev/null
    fi
fi

# 2. 检测并安装 Docker
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}🐳 未检测到 Docker，正在自动安装...${NC}"
    curl -fsSL https://get.docker.com | bash -s docker --mirror Aliyun
    sudo systemctl start docker || true
    sudo systemctl enable docker || true
    echo -e "${GREEN}✅ Docker 安装完成！${NC}"
else
    echo -e "${GREEN}✅ Docker 已安装。${NC}"
fi

# 检测 docker-compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${YELLOW}🐙 未检测到 Docker Compose，建议升级至包含 docker-compose-plugin 的 Docker 版本。${NC}"
fi

DOCKER_CMD="docker compose"
if command -v docker-compose &> /dev/null; then
    DOCKER_CMD="docker-compose"
fi

# 3. 参数解析与执行分发
ACTION=${1:-up}

if [ "$ACTION" = "up" ]; then
    echo -e "\n${GREEN}🚀 准备拉取最新多架构镜像并启动完整服务栈...${NC}"
    if [ ! -f ".env" ]; then
        echo -e "${YELLOW}🗂 未检测到 .env，正在依据 .env.example 自动生成默认环境模板...${NC}"
        cp .env.example .env
        echo -e "${GREEN}✅ .env 初始化完成！您可稍后修改密码与接口设定。${NC}"
    fi
    
    $DOCKER_CMD pull
    $DOCKER_CMD up -d
    
    echo -e "\n${GREEN}==========================================${NC}"
    echo -e "${GREEN}✨ 部署成功！后端微服务与前端管理面板已挂载...${NC}"
    echo -e "🔗 请在浏览器访问主节点: ${YELLOW}http://<服务器外网IP>:3000${NC}"
    echo -e "💡 Redis/MySQL 持久化数据已被妥善隔离至宿主机同级目录。"
    echo -e "${GREEN}==========================================${NC}"

elif [ "$ACTION" = "build" ]; then
    echo -e "\n${YELLOW}🏗 开启本地双架构/单机源码 Build 流程...${NC}"
    if [ ! -f ".env" ]; then cp .env.example .env; fi
    $DOCKER_CMD build
    $DOCKER_CMD up -d
    echo -e "\n${GREEN}✅ 本地源码编译且直启完成！请访问 ${YELLOW}http://<您的IP>:3000${NC}"

elif [ "$ACTION" = "down" ]; then
    echo -e "\n${YELLOW}🛑 正在安全关闭整个服务矩阵...${NC}"
    $DOCKER_CMD down
    echo -e "${GREEN}✅ 服务已停止，业务数据保留在本地卷中未受影响。${NC}"

else
    echo -e "${RED}❌ 未知命令: $ACTION${NC}"
    echo -e "可用指令: ${YELLOW}./deploy.sh [up|build|down]${NC}"
    exit 1
fi
