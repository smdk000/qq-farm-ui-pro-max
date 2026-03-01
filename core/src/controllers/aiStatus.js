/**
 * AI 服务状态监控和日志系统
 * 提供 HTTP 接口查看服务状态和日志
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const router = express.Router();

const CONFIG = {
  openVikingUrl: process.env.OPENVIKING_URL || 'http://localhost:5000',
  logDir: path.join(__dirname, '..', 'logs'),
  maxLogLines: 1000,
};

/**
 * 获取 AI 服务状态
 */
router.get('/status', async (req, res) => {
  try {
    const status = {
      daemon: {
        running: false,
        pid: null,
      },
      openViking: {
        running: false,
        healthy: false,
        url: CONFIG.openVikingUrl,
      },
      timestamp: new Date().toISOString(),
    };
    
    // 检查守护进程
    const pidFile = path.join(__dirname, '..', 'logs', 'ai-daemon.pid');
    if (fs.existsSync(pidFile)) {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf8'));
      try {
        process.kill(pid, 0);
        status.daemon.running = true;
        status.daemon.pid = pid;
      } catch (error) {
        // 进程不存在
        fs.unlinkSync(pidFile);
      }
    }
    
    // 检查 OpenViking 服务
    try {
      const response = await axios.get(`${CONFIG.openVikingUrl}/health`, {
        timeout: 5000,
      });
      status.openViking.running = true;
      status.openViking.healthy = response.data.status === 'healthy';
      status.openViking.workspace = response.data.workspace;
    } catch (error) {
      status.openViking.running = false;
      status.openViking.healthy = false;
    }
    
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 获取服务日志
 */
router.get('/logs', (req, res) => {
  try {
    const { type = 'ai-services', lines = 100 } = req.query;
    const logFile = path.join(CONFIG.logDir, `${type}.log`);
    
    if (!fs.existsSync(logFile)) {
      return res.json({
        success: true,
        data: {
          lines: [],
          message: '日志文件不存在',
        },
      });
    }
    
    const content = fs.readFileSync(logFile, 'utf8');
    const allLines = content.split('\n').filter(line => line.trim());
    const recentLines = allLines.slice(-parseInt(lines));
    
    res.json({
      success: true,
      data: {
        lines: recentLines,
        total: allLines.length,
        file: logFile,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 获取实时日志（WebSocket）
 */
router.get('/logs/stream', (req, res) => {
  // 这里可以实现 Server-Sent Events 或 WebSocket
  // 简单实现：返回最近的日志
  const { type = 'ai-services' } = req.query;
  const logFile = path.join(CONFIG.logDir, `${type}.log`);
  
  if (!fs.existsSync(logFile)) {
    return res.send('日志文件不存在');
  }
  
  const content = fs.readFileSync(logFile, 'utf8');
  const lines = content.split('\n').slice(-50);
  
  res.set('Content-Type', 'text/plain');
  res.send(lines.join('\n'));
});

/**
 * 重启 AI 服务
 */
router.post('/restart', async (req, res) => {
  try {
    const { exec } = require('child_process');
    
    exec('node ai-autostart.js restart', (error, stdout, stderr) => {
      if (error) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
        return;
      }
      
      res.json({
        success: true,
        message: 'AI 服务重启指令已发送',
        output: stdout,
      });
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 停止 AI 服务
 */
router.post('/stop', async (req, res) => {
  try {
    const { exec } = require('child_process');
    
    exec('node ai-autostart.js stop', (error, stdout, stderr) => {
      if (error) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
        return;
      }
      
      res.json({
        success: true,
        message: 'AI 服务停止指令已发送',
        output: stdout,
      });
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 启动 AI 服务
 */
router.post('/start', async (req, res) => {
  try {
    const { exec } = require('child_process');
    
    exec('node ai-autostart.js start', (error, stdout, stderr) => {
      if (error) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
        return;
      }
      
      res.json({
        success: true,
        message: 'AI 服务启动指令已发送',
        output: stdout,
      });
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
