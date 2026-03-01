@echo off
chcp 65001 >nul
cls

echo ======================================
echo   QQ 农场智能助手 - 快速启动
echo ======================================
echo.

:: 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 未检测到 Node.js，请先安装 Node.js 20+
    echo    访问：https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo ✅ Node.js 版本：%NODE_VERSION%

:: 检查 pnpm
where pnpm >nul 2>nul
if %errorlevel% neq 0 (
    echo ⚠️  未检测到 pnpm，尝试启用...
    corepack enable
)

for /f "tokens=*" %%i in ('pnpm -v') do set PNPM_VERSION=%%i
echo ✅ pnpm 版本：%PNPM_VERSION%

:: 检查依赖
if not exist "node_modules" (
    echo.
    echo 📦 首次运行，正在安装依赖...
    call pnpm install
)

:: 检查前端构建
if not exist "web\dist" (
    echo.
    echo 🔨 正在构建前端...
    call pnpm build:web
)

:: 设置管理员密码
echo.
echo 🔐 管理员密码配置：
echo    1. 使用默认密码：admin
echo    2. 自定义密码
set /p password_choice="请选择 (1/2): "

if "%password_choice%"=="2" (
    set /p ADMIN_PASSWORD="输入管理员密码："
    setx ADMIN_PASSWORD "%ADMIN_PASSWORD%"
    echo ✅ 密码已设置
    set ADMIN_PASSWORD=%ADMIN_PASSWORD%
)

:: 启动服务
echo.
echo 🚀 正在启动服务...
echo ======================================
echo.
echo 📌 访问地址：http://localhost:3000
echo 📌 默认账号：admin / admin
echo.
echo ⚠️  按 Ctrl+C 停止服务
echo ======================================
echo.

call pnpm dev:core
