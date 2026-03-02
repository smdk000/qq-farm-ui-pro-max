#!/usr/bin/env node

/**
 * AI 服务自动启动器
 * 集成到项目启动流程，无感知自动启动 AI 服务
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const AI_DAEMON_SCRIPT = path.join(__dirname, 'ai-services-daemon.js');
const LOG_FILE = path.join(__dirname, 'logs', 'ai-autostart.log');

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  
  // 确保日志目录存在
  const logDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  fs.appendFileSync(LOG_FILE, logMessage + '\n');
}

// 检查是否已启动
function isDaemonRunning() {
  const pidFile = path.join(__dirname, 'logs', 'ai-daemon.pid');
  if (!fs.existsSync(pidFile)) {
    return false;
  }
  
  const pid = parseInt(fs.readFileSync(pidFile, 'utf8'));
  try {
    // 检查进程是否存在
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // 进程不存在，删除 PID 文件
    fs.unlinkSync(pidFile);
    return false;
  }
}

// 启动守护进程
function startDaemon() {
  return new Promise((resolve, reject) => {
    if (isDaemonRunning()) {
      log('[AI 服务] 守护进程已在运行，无需重复启动');
      resolve();
      return;
    }
    
    log('[AI 服务] 正在启动 AI 服务守护进程...');
    
    const nodeProcess = spawn('node', [AI_DAEMON_SCRIPT], {
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore'],
      cwd: __dirname,
    });
    
    // 保存 PID
    const pidFile = path.join(__dirname, 'logs', 'ai-daemon.pid');
    fs.writeFileSync(pidFile, nodeProcess.pid.toString());
    
    log(`[AI 服务] 守护进程已启动 (PID: ${nodeProcess.pid})`);
    
    nodeProcess.unref(); // 让父进程可以独立退出
    
    // 等待一下确保启动成功
    setTimeout(() => {
      resolve();
    }, 2000);
  });
}

// 停止守护进程
function stopDaemon() {
  const pidFile = path.join(__dirname, 'logs', 'ai-daemon.pid');
  if (!fs.existsSync(pidFile)) {
    log('[AI 服务] 守护进程未运行');
    return;
  }
  
  const pid = parseInt(fs.readFileSync(pidFile, 'utf8'));
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', pid, '/f', '/t']);
    } else {
      process.kill(pid, 'SIGTERM');
    }
    fs.unlinkSync(pidFile);
    log('[AI 服务] 守护进程已停止');
  } catch (error) {
    log(`[AI 服务] 停止守护进程失败：${error.message}`);
  }
}

// 主函数
async function main() {
  const action = process.argv[2];
  
  switch (action) {
    case 'start':
      await startDaemon();
      break;
      
    case 'stop':
      stopDaemon();
      break;
      
    case 'restart':
      stopDaemon();
      setTimeout(() => startDaemon(), 1000);
      break;
      
    case 'status':
      if (isDaemonRunning()) {
        console.log('✅ AI 服务守护进程正在运行');
      } else {
        console.log('❌ AI 服务守护进程未运行');
      }
      break;
      
    default:
      // 默认启动
      await startDaemon();
  }
}

// 导出函数供其他模块调用
module.exports = {
  start: startDaemon,
  stop: stopDaemon,
  isRunning: isDaemonRunning,
};

// 如果是直接运行则执行 main
if (require.main === module) {
  main().catch((error) => {
    log(`[AI 服务] 错误：${error.message}`);
    process.exit(1);
  });
}
