#!/usr/bin/env bash
# 后台运行方案选择向导 (T8)
# 来源: NC 版 choose-background-method.sh，已适配本项目

echo "=========================================="
echo "  QQ 农场 Bot - 后台运行方案选择"
echo "=========================================="
echo ""
echo "请选择后台运行方案:"
echo ""
echo "  1) 自定义脚本 (推荐，最简单)"
echo "     - 无需额外安装软件"
echo "     - 支持 start/stop/restart/status"
echo ""
echo "  2) systemd 服务 (推荐，生产环境)"
echo "     - 系统级服务，开机自启，自动重启"
echo "     - 需要 root 权限"
echo ""
echo "  3) PM2 进程管理器 (推荐，Node.js 项目)"
echo "     - 专业进程管理，强大监控"
echo "     - 会自动安装 PM2"
echo ""
echo "  4) screen 会话 (简单，临时使用)"
echo "     - 最简单的方式，可随时切入查看"
echo ""
echo "  5) 退出"
echo ""

read -p "请选择 [1-5]: " choice

case $choice in
    1)
        echo -e "\n✅ 这将使用自定义守护脚本启动"
        read -p "按 Enter 键继续..."
        ./farm-bot.sh start
        ;;
    2)
        echo -e "\n⚠️ 此方案需要 root 权限"
        read -p "是否继续? [Y/n]: " confirm
        if [[ ! "$confirm" =~ ^[Nn]$ ]]; then
            ./install-systemd-service.sh
        fi
        ;;
    3)
        echo -e "\nℹ️ 此方案会自动全局安装 PM2（如未安装）"
        read -p "是否继续? [Y/n]: " confirm
        if [[ ! "$confirm" =~ ^[Nn]$ ]]; then
            ./install-pm2.sh
        fi
        ;;
    4)
        echo -e "\nℹ️ 此方案会自动安装 screen（如果未安装）"
        read -p "是否继续? [Y/n]: " confirm
        if [[ ! "$confirm" =~ ^[Nn]$ ]]; then
            ./start-with-screen.sh
        fi
        ;;
    5)
        echo "已退出"
        exit 0
        ;;
    *)
        echo "❌ 无效选择"
        exit 1
        ;;
esac
