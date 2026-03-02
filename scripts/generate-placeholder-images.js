#!/usr/bin/env node

/**
 * 生成 README 占位图片脚本
 * 用途：为 README.md 中的图片链接创建占位 SVG 图片
 * 使用：node generate-placeholder-images.js
 */

const fs = require('fs');
const path = require('path');

// 图片配置列表
const images = [
  { filename: 'login.png', title: '登录页面', description: 'QQ 农场智能助手 - 登录/注册页面' },
  { filename: 'dashboard.png', title: 'Dashboard', description: 'QQ 农场智能助手 - 主界面' },
  { filename: 'analytics.png', title: '数据分析', description: 'QQ 农场智能助手 - 分析页面' },
  { filename: 'help-center.png', title: '帮助中心', description: 'QQ 农场智能助手 - 帮助中心页面' },
  { filename: 'settings.png', title: '设置页面', description: 'QQ 农场智能助手 - 设置页面' },
  { filename: 'users.png', title: '用户管理', description: 'QQ 农场智能助手 - 用户管理页面' },
  { filename: 'cards.png', title: '卡密管理', description: 'QQ 农场智能助手 - 卡密管理页面' },
  { filename: 'steal-settings.png', title: '偷菜设置', description: 'QQ 农场智能助手 - 偷菜过滤设置页面' },
];

// 生成 SVG 占位图
function generatePlaceholderSVG(title, description) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <!-- 背景渐变 -->
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <rect width="1920" height="1080" fill="url(#bg)"/>
  
  <!-- 标题文字 -->
  <text x="960" y="450" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" font-weight="bold" fill="white">
    ${title}
  </text>
  
  <!-- 副标题 -->
  <text x="960" y="550" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" fill="rgba(255,255,255,0.9)">
    ${description}
  </text>
  
  <!-- 提示文字 -->
  <text x="960" y="700" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="rgba(255,255,255,0.8)">
    请在此处放置实际截图
  </text>
  
  <!-- 装饰性图标 -->
  <g transform="translate(960, 300)">
    <rect x="-100" y="-100" width="200" height="200" rx="20" fill="rgba(255,255,255,0.1)" stroke="white" stroke-width="4"/>
    <text x="0" y="40" text-anchor="middle" font-size="80" fill="white">📷</text>
  </g>
  
  <!-- 底部说明 -->
  <text x="960" y="950" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="rgba(255,255,255,0.6)">
    QQ 农场智能助手 v3.2.5
  </text>
</svg>
`;
}

// 主函数
function main() {
  const picDir = path.join(__dirname, 'pic');
  
  // 确保 pic 目录存在
  if (!fs.existsSync(picDir)) {
    console.log('创建 pic 目录...');
    fs.mkdirSync(picDir, { recursive: true });
  }
  
  console.log('正在生成占位图片...\n');
  
  let successCount = 0;
  
  for (const img of images) {
    try {
      const svgFilename = img.filename.replace('.png', '.svg');
      const svgPath = path.join(picDir, svgFilename);
      const svgContent = generatePlaceholderSVG(img.title, img.description);
      
      fs.writeFileSync(svgPath, svgContent, 'utf8');
      console.log(`✅ 已生成：${svgFilename}`);
      successCount++;
    } catch (error) {
      console.error(`❌ 生成失败 ${img.filename}:`, error.message);
    }
  }
  
  console.log(`\n生成完成！共 ${successCount}/${images.length} 张图片`);
  console.log('\n提示：');
  console.log('1. 这些是占位图片，建议您用实际截图替换它们');
  console.log('2. 截图后保存为 PNG 格式，文件名保持一致');
  console.log('3. 查看 pic/README_IMAGES.md 了解更多截图建议');
}

// 执行
main();
