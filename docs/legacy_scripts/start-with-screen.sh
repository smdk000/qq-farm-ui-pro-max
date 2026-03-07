#!/usr/bin/env bash
# Screen 会话启动 (T10g)
# 来源: NC 版 start-with-screen.sh，已适配本项目

SESSION_NAME="qqfarm"

if ! command -v screen &> /dev/null; then
    echo "🔧 发现未安装 screen，尝试安装..."
    if command -v apt &> /dev/null; then
        sudo apt update && sudo apt install -y screen
    elif command -v yum &> /dev/null; then
        sudo yum install -y screen
    elif command -v brew &> /dev/null; then
        brew install screen
    else
        echo "❌ 无法自动安装 screen，请手动安装后重试"
        exit 1
    fi
fi

if screen -list | grep -q "\.${SESSION_NAME}"; then
    echo "⚠️ 已经有一个名为 '${SESSION_NAME}' 的 screen 会话在运行。"
    echo "   如果需要查看，请运行: screen -r ${SESSION_NAME}"
    echo "   如果需要强行停止并重启，请运行: screen -S ${SESSION_NAME} -X quit && ./start-with-screen.sh"
    exit 1
fi

echo "🚀 正在使用 screen 启动项目..."
screen -dmS "$SESSION_NAME" bash -c "pnpm dev:core; exec bash"

echo "=========================================="
echo "✅ 项目已在后台 screen 会话中启动！"
echo ""
echo "常用命令:"
echo "  screen -r $SESSION_NAME    # 进入会话查看日志和交互"
echo "  (在 session 中按 Ctrl+A 然后按 D 可以退出窗口保持后台运行)"
echo "  screen -S $SESSION_NAME -X quit  # 终止项目"
echo "=========================================="
