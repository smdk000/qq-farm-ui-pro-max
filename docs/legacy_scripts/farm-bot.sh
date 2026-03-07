#!/usr/bin/env bash
# 简易守护进程脚本 (T10d)
# 来源: NC 版 farm-bot.sh，已适配本项目

PID_FILE=".farm-bot.pid"
LOG_FILE="logs/daemon.log"

start() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" &>/dev/null; then
            echo "❌ 服务已经在运行中 (PID: $PID)"
            return 1
        fi
    fi

    echo "🚀 正在启动服务..."
    mkdir -p logs
    nohup pnpm dev:core > "$LOG_FILE" 2>&1 &
    PID=$!
    echo $PID > "$PID_FILE"
    echo "✅ 服务已放入后台运行 (PID: $PID)"
    echo "📄 查看日志: tail -f $LOG_FILE"
}

stop() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" &>/dev/null; then
            echo "🛑 正在停止服务 (PID: $PID)..."
            kill "$PID"
            sleep 2
            rm -f "$PID_FILE"
            echo "✅ 服务已停止"
            return 0
        fi
    fi
    echo "⚠️ 未发现运行中的服务"
    rm -f "$PID_FILE"
}

status() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" &>/dev/null; then
            echo "🟢 服务运行中 (PID: $PID)"
            return 0
        fi
    fi
    echo "🔴 服务未运行"
}

case "$1" in
    start) start ;;
    stop) stop ;;
    restart) stop; start ;;
    status) status ;;
    *)
        echo "用法: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
