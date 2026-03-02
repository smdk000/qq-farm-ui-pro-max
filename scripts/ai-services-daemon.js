#!/usr/bin/env node

/**
 * AI 服务守护进程
 * 自动启动并监控 OpenViking 和 AI 助手服务
 * 无感知、自动执行、故障自重启
 */

const { spawn, fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// 配置
const CONFIG = {
  openVikingPort: process.env.OPENVIKING_PORT || 5000,
  openVikingUrl: process.env.OPENVIKING_URL || 'http://localhost:5000',
  restartDelay: 3000, // 重启延迟 3 秒
  healthCheckInterval: 30000, // 健康检查间隔 30 秒
  maxRestarts: 5, // 最大重启次数
  healthCheckTimeout: 5000, // 健康检查超时 5 秒
};

// 进程状态
let processes = {
  openViking: null,
  restartCounts: {
    openViking: 0,
  },
};

// 日志函数
function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${type}] ${message}`;
  console.log(logMessage);
  
  // 写入日志文件
  const logDir = path.join(__dirname, '..', 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logFile = path.join(logDir, 'ai-services.log');
  fs.appendFileSync(logFile, logMessage + '\n');
}

// 检查 OpenViking 服务健康状态
async function checkHealth() {
  try {
    const response = await axios.get(`${CONFIG.openVikingUrl}/health`, {
      timeout: CONFIG.healthCheckTimeout,
    });
    return response.data.status === 'healthy';
  } catch (error) {
    return false;
  }
}

// 启动 OpenViking 服务
function startOpenViking() {
  return new Promise((resolve, reject) => {
    const openVikingDir = path.join(__dirname, '..', 'openviking-service');
    const venvPython = process.platform === 'win32'
      ? path.join(openVikingDir, 'venv', 'Scripts', 'python.exe')
      : path.join(openVikingDir, 'venv', 'bin', 'python');
    
    // 检查虚拟环境
    if (!fs.existsSync(venvPython)) {
      log('Python 虚拟环境不存在，正在创建...', 'WARN');
      createVenv(openVikingDir)
        .then(() => installDependencies(openVikingDir))
        .then(() => startService())
        .catch(reject);
      return;
    }
    
    startService();
    
    function startService() {
      const pythonProcess = spawn(
        venvPython,
        ['app.py'],
        {
          cwd: openVikingDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env },
        }
      );
      
      processes.openViking = pythonProcess;
      
      pythonProcess.stdout.on('data', (data) => {
        log(`[OpenViking] ${data.toString().trim()}`);
      });
      
      pythonProcess.stderr.on('data', (data) => {
        log(`[OpenViking] ${data.toString().trim()}`, 'ERROR');
      });
      
      pythonProcess.on('error', (error) => {
        log(`[OpenViking] 进程错误：${error.message}`, 'ERROR');
        reject(error);
      });
      
      pythonProcess.on('exit', (code) => {
        log(`[OpenViking] 进程退出，代码：${code}`, 'WARN');
        processes.openViking = null;
        
        // 自动重启
        if (code !== 0 && processes.restartCounts.openViking < CONFIG.maxRestarts) {
          processes.restartCounts.openViking++;
          log(`[OpenViking] 将在 ${CONFIG.restartDelay}ms 后重启 (第${processes.restartCounts.openViking}次尝试)`, 'WARN');
          setTimeout(() => startOpenViking(), CONFIG.restartDelay);
        } else if (processes.restartCounts.openViking >= CONFIG.maxRestarts) {
          log('[OpenViking] 达到最大重启次数，停止重启', 'ERROR');
        }
      });
      
      // 等待服务启动
      setTimeout(async () => {
        const healthy = await checkHealth();
        if (healthy) {
          log('[OpenViking] 服务启动成功', 'SUCCESS');
          processes.restartCounts.openViking = 0; // 重置重启计数
          resolve();
        } else {
          log('[OpenViking] 服务启动超时', 'ERROR');
          reject(new Error('OpenViking 启动超时'));
        }
      }, 5000);
    }
  });
}

// 创建虚拟环境
async function createVenv(dir) {
  return new Promise((resolve, reject) => {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const venvProcess = spawn(pythonCmd, ['-m', 'venv', 'venv'], {
      cwd: dir,
      stdio: 'inherit',
    });
    
    venvProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`创建虚拟环境失败，退出码：${code}`));
      }
    });
  });
}

// 安装依赖
async function installDependencies(dir) {
  return new Promise((resolve, reject) => {
    const pipCmd = process.platform === 'win32'
      ? path.join(dir, 'venv', 'Scripts', 'pip.exe')
      : path.join(dir, 'venv', 'bin', 'pip');
    
    const pipProcess = spawn(pipCmd, ['install', '-r', 'requirements.txt'], {
      cwd: dir,
      stdio: 'inherit',
    });
    
    pipProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`安装依赖失败，退出码：${code}`));
      }
    });
  });
}

// 定期健康检查
function startHealthCheck() {
  setInterval(async () => {
    if (!processes.openViking) {
      log('[健康检查] OpenViking 进程不存在，尝试重启...', 'WARN');
      processes.restartCounts.openViking = 0; // 重置计数
      await startOpenViking();
      return;
    }
    
    const healthy = await checkHealth();
    if (!healthy) {
      log('[健康检查] OpenViking 服务不健康，尝试重启...', 'WARN');
      
      // 杀死进程
      if (processes.openViking.pid) {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', processes.openViking.pid, '/f', '/t']);
        } else {
          process.kill(processes.openViking.pid, 'SIGKILL');
        }
      }
      
      // 重启
      processes.restartCounts.openViking = 0; // 重置计数
      await startOpenViking();
    }
  }, CONFIG.healthCheckInterval);
  
  log(`[健康检查] 已启动，间隔：${CONFIG.healthCheckInterval / 1000}秒`);
}

// 优雅关闭
function gracefulShutdown(signal) {
  log(`[守护进程] 收到信号：${signal}，正在关闭服务...`);
  
  const shutdown = () => {
    if (processes.openViking) {
      log('[守护进程] 关闭 OpenViking 服务...');
      
      // 调用 shutdown 接口
      axios.post(`${CONFIG.openVikingUrl}/shutdown`)
        .catch(() => {}) // 忽略错误
        .finally(() => {
          if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', processes.openViking.pid, '/f', '/t']);
          } else {
            process.kill(processes.openViking.pid, 'SIGTERM');
          }
        });
    }
    
    setTimeout(() => {
      log('[守护进程] 已关闭所有服务');
      process.exit(0);
    }, 2000);
  };
  
  shutdown();
}

// 主函数
async function main() {
  log('[守护进程] AI 服务守护进程启动', 'SUCCESS');
  log('[守护进程] 配置:', 'INFO');
  log(`  - OpenViking 端口：${CONFIG.openVikingPort}`);
  log(`  - 健康检查间隔：${CONFIG.healthCheckInterval / 1000}秒`);
  log(`  - 最大重启次数：${CONFIG.maxRestarts}`);
  
  // 启动 OpenViking 服务
  try {
    await startOpenViking();
    log('[守护进程] OpenViking 服务已就绪', 'SUCCESS');
  } catch (error) {
    log(`[守护进程] 启动 OpenViking 失败：${error.message}`, 'ERROR');
    process.exit(1);
  }
  
  // 启动健康检查
  startHealthCheck();
  
  // 监听关闭信号
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  
  if (process.platform === 'win32') {
    process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));
  }
}

// 运行
main().catch((error) => {
  log(`[守护进程] 启动失败：${error.message}`, 'ERROR');
  process.exit(1);
});
