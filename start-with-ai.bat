@echo off
REM OpenViking + 千问 3.5 Plus 服务启动脚本 (Windows)

echo 🚀 启动 OpenViking 上下文管理服务...

REM 进入 openviking-service 目录
cd /d "%~dp0openviking-service"

REM 创建虚拟环境（如果不存在）
if not exist "venv" (
    echo 📦 创建 Python 虚拟环境...
    python -m venv venv
)

REM 激活虚拟环境
call venv\Scripts\activate

REM 安装依赖
echo 📦 安装 Python 依赖...
pip install -r requirements.txt

REM 创建工作目录
mkdir openviking_data

REM 启动 OpenViking 服务
echo 🔥 启动 OpenViking 服务（端口 5000）...
start "OpenViking Service" cmd /c "python app.py"

REM 等待服务启动
echo ⏳ 等待 OpenViking 服务启动...
timeout /t 5 /nobreak >nul

REM 返回项目根目录
cd ..

REM 启动 Node.js 核心服务
echo 🔥 启动 Node.js 核心服务...
cd core
npm install
npm start

echo ⏹️  停止服务...
taskkill /FI "WINDOWTITLE eq OpenViking Service" /T /F >nul 2>&1

echo 👋 所有服务已停止
pause
