#!/bin/bash

# macOS launchd 配置文件生成器
# 用于开机自动启动 AI 服务

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHD_LABEL="com.qqfarm.ai-services"
LAUNCHD_PLIST="$HOME/Library/LaunchAgents/${LAUNCHD_LABEL}.plist"

# 创建 LaunchAgents 目录
mkdir -p "$HOME/Library/LaunchAgents"

# 生成 plist 文件
cat > "$LAUNCHD_PLIST" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.qqfarm.ai-services</string>
    
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/smdk000/文稿/qq/qq-farm-bot-ui-main/ai-services-daemon.js</string>
    </array>
    
    <key>WorkingDirectory</key>
    <string>/Users/smdk000/文稿/qq/qq-farm-bot-ui-main</string>
    
    <key>RunAtLoad</key>
    <true/>
    
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
        <key>Crashed</key>
        <true/>
    </dict>
    
    <key>StandardOutPath</key>
    <string>/Users/smdk000/文稿/qq/qq-farm-bot-ui-main/logs/ai-services.log</string>
    
    <key>StandardErrorPath</key>
    <string>/Users/smdk000/文稿/qq/qq-farm-bot-ui-main/logs/ai-services-error.log</string>
    
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
    
    <key>LowPriorityIO</key>
    <true/>
    
    <key>Nice</key>
    <integer>10</integer>
</dict>
</plist>
EOF

echo "✅ macOS launchd 配置文件已生成：$LAUNCHD_PLIST"
echo ""
echo "📝 加载服务命令："
echo "   launchctl load -w $LAUNCHD_PLIST"
echo ""
echo "📝 卸载服务命令："
echo "   launchctl unload -w $LAUNCHD_PLIST"
echo ""
echo "📝 查看服务状态："
echo "   launchctl list | grep $LAUNCHD_LABEL"
