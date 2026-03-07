#!/bin/bash
# =====================================================
# QQ 农场智能助手 - 仅更新主程序脚本
# 适用于已部署过的环境，只更新 qq-farm-bot 主应用
# MySQL / Redis / ipad860 保持不变，数据不丢失
# =====================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()      { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()     { echo -e "${RED}[ERROR]${NC} $1"; }

COMPOSE_CMD="docker compose"

banner() {
  echo -e "${CYAN}"
  echo "╔══════════════════════════════════════════════════╗"
  echo "║   QQ 农场智能助手 - 主程序更新                    ║"
  echo "║   仅更新 App 镜像，保留数据库和缓存               ║"
  echo "╚══════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

check_env() {
  if [ ! -f "docker-compose.yml" ]; then
    err "当前目录未找到 docker-compose.yml"
    err "请先 cd 到部署目录（如 cd ~/qq-farm）后再运行此脚本"
    exit 1
  fi

  if ! docker compose version &>/dev/null; then
    if docker-compose version &>/dev/null; then
      COMPOSE_CMD="docker-compose"
    else
      err "Docker Compose 未安装"
      exit 1
    fi
  fi
  ok "Docker Compose 就绪"
}

backup_data() {
  info "备份当前数据..."
  local backup_file="backup-$(date +%Y%m%d_%H%M%S).tar.gz"

  if docker volume ls -q 2>/dev/null | grep -q "bot-data"; then
    local data_path
    data_path=$(docker volume inspect qq-farm_bot-data 2>/dev/null | grep Mountpoint | awk -F'"' '{print $4}' || echo "")
    if [ -n "$data_path" ] && [ -d "$data_path" ]; then
      sudo tar -czf "$backup_file" -C "$(dirname "$data_path")" "$(basename "$data_path")" 2>/dev/null && \
        ok "数据已备份: ${backup_file}" || \
        warn "数据卷备份跳过（权限不足或数据卷为空）"
    else
      warn "未找到数据卷挂载点，跳过备份"
    fi
  else
    warn "未检测到数据卷，跳过备份"
  fi
}

update_app() {
  info "拉取最新主程序镜像..."
  docker pull smdk000/qq-farm-bot-ui:latest
  ok "最新镜像拉取完成"

  info "重启主程序容器（保留其他服务）..."
  $COMPOSE_CMD up -d --no-deps --pull always qq-farm-bot
  ok "主程序已更新并重启"

  info "等待服务就绪..."
  sleep 5

  local retry=0
  while [ $retry -lt 20 ]; do
    if docker exec qq-farm-bot wget --spider -q http://localhost:3000/api/ping 2>/dev/null; then
      ok "主程序健康检查通过"
      break
    fi
    sleep 3
    retry=$((retry + 1))
    echo -n "."
  done
  echo ""

  if [ $retry -ge 20 ]; then
    warn "健康检查超时，请手动检查: $COMPOSE_CMD logs qq-farm-bot"
  fi
}

show_status() {
  echo ""
  echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║              更新完成                             ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  $COMPOSE_CMD ps
  echo ""
  echo "  📋 查看日志: $COMPOSE_CMD logs -f qq-farm-bot"
  echo "  🔄 如需回滚: $COMPOSE_CMD down && docker pull smdk000/qq-farm-bot-ui:<旧版本号> && $COMPOSE_CMD up -d"
  echo ""
}

main() {
  banner
  check_env
  backup_data
  update_app
  show_status
}

main "$@"
