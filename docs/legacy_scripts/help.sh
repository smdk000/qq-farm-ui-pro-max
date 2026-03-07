#!/usr/bin/env bash
# 帮助信息
# 来源: NC 版 help.sh (T10c)，已适配本项目

cat << 'EOF'
==========================================
  QQ 农场 Bot - 帮助信息
==========================================

📋 可用脚本:

  ./quick-start.sh          快速启动向导 (环境检测 + 引导启动)
  ./reset-admin-password.sh 重置管理员密码
  ./show-users.sh           查看已注册用户
  ./help.sh                 显示此帮助信息

🐳 Docker 部署:

  docker compose up -d      启动 Docker 容器
  docker compose logs -f    查看容器日志
  docker compose down       停止容器

📁 项目结构:

  core/                     后端核心 (Node.js)
  web/                      前端 (Vue 3 + Vite)
  deploy/                   部署脚本
  docs/                     文档

🔗 常用地址:

  前端界面: http://localhost:3000
  API 端口: http://localhost:3000/api

📚 文档:

  README.md                 项目说明
  docs/                     详细文档目录

❓ 常见问题:

  Q: 忘记管理员密码怎么办?
  A: 运行 ./reset-admin-password.sh

  Q: MySQL 连接失败?
  A: 检查 MySQL 是否启动，密码是否正确

  Q: 前端打不开?
  A: 确认后端服务是否已启动，端口 3000 是否被占用

==========================================
EOF
