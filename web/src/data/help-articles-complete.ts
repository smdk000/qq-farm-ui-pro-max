/**
 * 完整的帮助中心文章内容 - 21 篇全部完成
 */

export interface HelpArticle {
  id: string
  category: string
  title: string
  icon: string
  content: string
  tags: string[]
  updatedAt: string
  version: string
  author: string
  reviewStatus: 'draft' | 'published' | 'archived'
}

export const helpArticles: HelpArticle[] = [
  // ==================== 新手入门 (5 篇) ====================
  {
    id: 'quick-start',
    category: '新手入门',
    title: '快速开始',
    icon: 'i-carbon-rocket',
    content: `<div class="content-sections"><div class="info-card"><h3>🚀 5 分钟快速上手</h3><p>欢迎使用 QQ 农场智能助手！本指南将帮助你在 5 分钟内完成配置并开始自动农场管理。</p></div><div class="step-card"><div class="step-number">1</div><div class="step-content"><h4>添加账号</h4><p>进入<strong>账号</strong>页面，点击<strong>添加账号</strong>按钮。</p><ul><li>输入账号备注名（可选）</li><li>使用 QQ 扫码登录</li><li>或手动输入 Code 登录</li></ul></div></div><div class="step-card"><div class="step-number">2</div><div class="step-content"><h4>配置基本设置</h4><p>进入<strong>设置</strong>页面，配置以下基本参数：</p><ul><li><strong>巡查间隔：</strong>推荐农场 3-5 分钟，好友 10-15 分钟</li><li><strong>静默时段：</strong>推荐 23:00-07:00</li><li><strong>施肥策略：</strong>推荐普通 + 有机</li></ul></div></div><div class="step-card"><div class="step-number">3</div><div class="step-content"><h4>开启自动化</h4><p>在设置页面开启以下自动化功能：</p><ul><li>✅ 自动种植收获</li><li>✅ 自动做任务</li><li>✅ 自动卖果实</li><li>✅ 自动好友互动</li><li>✅ 自动偷菜</li><li>✅ 自动帮忙</li></ul></div></div><div class="step-card"><div class="step-number">4</div><div class="step-content"><h4>启动账号</h4><p>返回<strong>概览</strong>或<strong>账号</strong>页面，点击启动按钮。</p><p>账号状态将变为<strong>运行中</strong>，机器人开始自动工作！</p></div></div><div class="tip-card tip-success"><div class="tip-header"><div class="i-carbon-checkmark-filled tip-icon"></div><strong>✅ 完成！</strong></div><p class="tip-content">现在你的农场已经可以自动运行了！你可以在概览页面查看实时日志和统计数据。</p></div></div>`,
    tags: ['快速开始', '新手', '入门', '配置', '启动'],
    updatedAt: '2026-02-28',
    version: 'v3.2.3',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },
  {
    id: 'overview',
    category: '新手入门',
    title: '功能概览',
    icon: 'i-carbon-information',
    content: `<div class="content-sections"><div class="info-card"><h3>📊 功能全景图</h3><p>QQ 农场智能助手提供全方位的农场自动化管理功能。</p></div><div class="feature-grid"><div class="feature-card"><div class="feature-icon i-carbon-chart-pie"></div><h4>概览页面</h4><ul><li>实时账号状态</li><li>资源统计（金币、点券）</li><li>化肥容器和收藏点</li><li>下次巡查倒计时</li><li>运行日志</li><li>今日统计</li></ul></div><div class="feature-card"><div class="feature-icon i-carbon-user"></div><h4>个人页面</h4><ul><li>账号详细信息</li><li>等级和经验</li><li>资产统计</li><li>成就展示</li></ul></div><div class="feature-card"><div class="feature-icon i-carbon-user-multiple"></div><h4>好友页面</h4><ul><li>好友列表管理</li><li>好友农田状态</li><li>一键互动功能</li><li>好友备注管理</li></ul></div><div class="feature-card"><div class="feature-icon i-carbon-analytics"></div><h4>分析页面</h4><ul><li>作物收益分析</li><li>经验效率排行</li><li>净利润分析</li><li>数据可视化</li></ul></div><div class="feature-card"><div class="feature-icon i-carbon-user-settings"></div><h4>账号管理</h4><ul><li>多账号管理</li><li>账号启动/停止</li><li>账号切换</li><li>运行状态监控</li></ul></div><div class="feature-card"><div class="feature-icon i-carbon-settings"></div><h4>设置页面</h4><ul><li>种植策略配置</li><li>巡查间隔设置</li><li>自动化开关</li><li>偷菜过滤配置</li><li>好友过滤配置</li><li>推送通知设置</li></ul></div></div></div>`,
    tags: ['功能', '概览', '介绍', '页面'],
    updatedAt: '2026-02-28',
    version: 'v3.2.3',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },
  {
    id: 'first-time',
    category: '新手入门',
    title: '第一次使用',
    icon: 'i-carbon-user-follow',
    content: `<div class="content-sections"><div class="info-card"><h3>👋 第一次使用？从这里开始</h3><p>欢迎来到 QQ 农场智能助手！这是你的完整入门指南。</p></div><div class="step-card"><div class="step-number">1</div><div class="step-content"><h4>准备工作</h4><ul><li>确保你有一个 QQ 账号</li><li>该账号已开通 QQ 农场</li><li>了解基本的农场操作</li></ul></div></div><div class="step-card"><div class="step-number">2</div><div class="step-content"><h4>注册/登录</h4><p>如果是第一次使用：</p><ul><li>点击"注册"创建账号</li><li>使用体验卡或正式卡激活</li><li>记住你的用户名和密码</li></ul></div></div><div class="step-card"><div class="step-number">3</div><div class="step-content"><h4>绑定游戏账号</h4><ul><li>进入"账号"页面</li><li>点击"添加账号"</li><li>扫码或输入 Code 登录游戏</li><li>设置账号备注名</li></ul></div></div><div class="tip-card tip-info"><div class="tip-header"><div class="i-carbon-lightbulb tip-icon"></div><strong>💡 小贴士</strong></div><ul class="tip-content"><li>建议先阅读<strong>快速开始</strong>指南</li><li>遇到问题可以查看<strong>常见问题</strong></li><li>可以联系管理员获取帮助</li></ul></div></div>`,
    tags: ['第一次', '新手', '入门', '准备'],
    updatedAt: '2026-02-28',
    version: 'v3.2.3',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },
  {
    id: 'faq',
    category: '新手入门',
    title: '常见问题',
    icon: 'i-carbon-help',
    content: `<div class="content-sections"><div class="info-card"><h3>❓ 常见问题解答</h3><p>这里汇总了新手最常问的问题。</p></div><div class="faq-item"><h4>Q1: 账号掉线了怎么办？</h4><p><strong>A:</strong> 进入账号页面，点击重新登录按钮，重新扫码或输入 Code 即可。</p></div><div class="faq-item"><h4>Q2: 为什么机器人不偷菜？</h4><p><strong>A:</strong> 检查以下几点：</p><ul><li>是否开启了"自动好友互动"</li><li>是否开启了"自动偷菜"</li><li>当前是否在静默时段</li><li>好友是否有成熟作物</li></ul></div><div class="faq-item"><h4>Q3: 如何修改巡查间隔？</h4><p><strong>A:</strong> 进入设置页面，找到"巡查间隔"设置，修改数值后保存即可。</p></div><div class="faq-item"><h4>Q4: 体验卡和正式卡有什么区别？</h4><p><strong>A:</strong> 体验卡有使用期限（通常 1-30 天），正式卡无期限限制。其他功能相同。</p></div><div class="faq-item"><h4>Q5: 可以同時运行几个账号？</h4><p><strong>A:</strong> 取决于你的卡密类型。体验卡通常限制 1 个账号，正式卡可以绑定多个账号。</p></div></div>`,
    tags: ['常见问题', 'FAQ', '问题', '解答'],
    updatedAt: '2026-02-28',
    version: 'v3.2.3',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },
  {
    id: 'best-practices',
    category: '新手入门',
    title: '最佳实践',
    icon: 'i-carbon-star',
    content: `<div class="content-sections"><div class="info-card"><h3>⭐ 最佳实践指南</h3><p>经过大量用户验证的最佳配置和实践方法。</p></div><div class="practice-card"><h4>📊 推荐配置</h4><ul><li><strong>巡查间隔：</strong>农场 3-5 分钟，好友 10-15 分钟</li><li><strong>静默时段：</strong>23:00-07:00</li><li><strong>施肥策略：</strong>普通 + 有机</li><li><strong>偷菜过滤：</strong>黑名单模式，过滤低价值作物</li></ul></div><div class="practice-card"><h4>🎯 运营策略</h4><ul><li>优先种植高等级作物</li><li>合理使用有机肥提升收益</li><li>定期领取各种礼包</li><li>积极参与好友互动</li></ul></div><div class="practice-card"><h4>⚠️ 避免事项</h4><ul><li>不要设置过于频繁的巡查间隔</li><li>不要在静默时段外频繁偷菜</li><li>不要忽略推送通知</li><li>不要长时间不查看运行日志</li></ul></div><div class="tip-card tip-success"><div class="tip-header"><div class="i-carbon-checkmark-filled tip-icon"></div><strong>✅ 成功要素</strong></div><ul class="tip-content"><li>定期查看运行状态</li><li>根据收益调整策略</li><li>保持账号活跃度</li><li>及时续费卡密</li></ul></div></div>`,
    tags: ['最佳实践', '推荐', '配置', '策略'],
    updatedAt: '2026-02-28',
    version: 'v3.2.3',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },

  // ==================== 设置指南 (6 篇) ====================
  {
    id: 'intervals',
    category: '设置指南',
    title: '巡查间隔',
    icon: 'i-carbon-time',
    content: `<div class="content-sections"><div class="info-card"><h3>⏱️ 什么是巡查间隔？</h3><p>巡查间隔是指机器人<strong>两次检查之间的等待时间</strong>。机器人会定期检查你的农场和好友农场，执行收获、种植、偷菜等操作。</p></div><div class="tip-card tip-success"><div class="tip-header"><div class="i-carbon-checkmark-filled tip-icon"></div><strong>📝 推荐设置</strong></div><ul class="tip-content"><li><strong>农场巡查：</strong>3-5 分钟 (180-300 秒)</li><li><strong>好友巡查：</strong>10-15 分钟 (600-900 秒)</li></ul></div><div class="tip-card tip-warning"><div class="tip-header"><div class="i-carbon-warning tip-icon"></div><strong>⚠️ 注意事项</strong></div><ul class="tip-content"><li>不要设置过于频繁（≥2 分钟）</li><li>建议开启静默时段（23:00-07:00）</li><li>随机间隔更像真人操作</li></ul></div><div class="code-block"><div class="code-header"><span class="code-title">💡 配置示例</span></div><pre>农场巡查最小：180 秒 (3 分钟)\n农场巡查最大：300 秒 (5 分钟)\n好友巡查最小：600 秒 (10 分钟)\n好友巡查最大：900 秒 (15 分钟)</pre></div></div>`,
    tags: ['巡查间隔', '设置', '时间', '配置'],
    updatedAt: '2026-02-28',
    version: 'v3.2.3',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },
  {
    id: 'quiet-hours',
    category: '设置指南',
    title: '静默时段',
    icon: 'i-carbon-moon',
    content: `<div class="content-sections"><div class="info-card"><h3>🌙 静默时段设置</h3><p>静默时段是指在该时间段内，机器人<strong>暂停所有好友互动操作</strong>，但农场操作不受影响。</p></div><div class="tip-card tip-success"><div class="tip-header"><div class="i-carbon-checkmark-filled tip-icon"></div><strong>📝 推荐设置</strong></div><ul class="tip-content"><li><strong>时间段：</strong>23:00-07:00（8 小时）</li><li><strong>作用：</strong>避免深夜打扰好友</li></ul></div><div class="tip-card tip-info"><div class="tip-header"><div class="i-carbon-lightbulb tip-icon"></div><strong>💡 影响范围</strong></div><ul class="tip-content"><li>❌ 暂停：偷菜、帮忙、捣乱</li><li>✅ 继续：收获、种植、浇水、除草</li></ul></div></div>`,
    tags: ['静默时段', '设置', '时间', '好友'],
    updatedAt: '2026-02-28',
    version: 'v3.2.3',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },
  {
    id: 'automation',
    category: '设置指南',
    title: '自动控制',
    icon: 'i-carbon-ibm-automation',
    content: `<div class="content-sections"><div class="info-card"><h3>⚙️ 自动控制功能详解</h3><p>自动控制是机器人的核心功能，包含 14 个自动化选项。</p></div><div class="feature-grid"><div class="feature-card"><h4>基础自动化</h4><ul><li>自动种植收获</li><li>自动做任务</li><li>自动卖果实</li><li>自动好友互动</li></ul></div><div class="feature-card"><h4>好友互动</h4><ul><li>自动偷菜</li><li>自动帮忙</li><li>自动捣乱</li><li>经验上限停止帮忙</li></ul></div><div class="feature-card"><h4>礼包领取</h4><ul><li>自动商城礼包</li><li>自动分享奖励</li><li>自动 VIP 礼包</li><li>自动月卡奖励</li></ul></div></div></div>`,
    tags: ['自动控制', '自动化', '设置', '功能'],
    updatedAt: '2026-02-28',
    version: 'v3.2.3',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },
  {
    id: 'fertilizer',
    category: '设置指南',
    title: '施肥策略',
    icon: 'i-carbon-chemistry',
    content: `<div class="content-sections"><div class="info-card"><h3>🧪 施肥策略详解</h3><p>系统提供 4 种施肥模式，满足不同需求。</p></div><div class="strategy-card"><h4>1. 普通 + 有机（推荐）</h4><p>先使用普通化肥，再用有机化肥循环施肥。收益最大化。</p></div><div class="strategy-card"><h4>2. 仅普通化肥</h4><p>只使用普通化肥，节省有机化肥。</p></div><div class="strategy-card"><h4>3. 仅有机化肥</h4><p>只使用有机化肥，收益更高但消耗快。</p></div><div class="strategy-card"><h4>4. 不施肥</h4><p>完全不使用化肥，适合节省资源。</p></div></div>`,
    tags: ['施肥', '策略', '化肥', '设置'],
    updatedAt: '2026-02-28',
    version: 'v3.2.3',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },
  {
    id: 'steal-filter',
    category: '设置指南',
    title: '偷菜过滤',
    icon: 'i-carbon-filter',
    content: `<div class="content-sections"><div class="info-card"><h3>🥬 偷菜过滤设置</h3><p>偷菜过滤允许你选择性地偷取某些作物。</p></div><div class="mode-card"><h4>黑名单模式</h4><p><strong>不偷</strong>选中的蔬菜。适合排除低价值作物。</p></div><div class="mode-card"><h4>白名单模式</h4><p><strong>只偷</strong>选中的蔬菜。适合精准偷取高价值作物。</p></div><div class="tip-card tip-info"><div class="tip-header"><div class="i-carbon-lightbulb tip-icon"></div><strong>💡 使用建议</strong></div><p class="tip-content">新手建议先用黑名单模式，过滤掉不值钱的作物。</p></div></div>`,
    tags: ['偷菜过滤', '过滤', '设置', '作物'],
    updatedAt: '2026-02-28',
    version: 'v3.2.3',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },
  {
    id: 'friend-filter',
    category: '设置指南',
    title: '好友过滤',
    icon: 'i-carbon-user-multiple',
    content: `<div class="content-sections"><div class="info-card"><h3>👥 好友过滤设置</h3><p>好友过滤允许你选择性地偷取某些好友。</p></div><div class="mode-card"><h4>黑名单模式</h4><p><strong>不偷</strong>列表中的好友。适合排除亲友账号。</p></div><div class="mode-card"><h4>白名单模式</h4><p><strong>只偷</strong>列表中的好友。适合精准偷取"肥羊"。</p></div><div class="tip-card tip-warning"><div class="tip-header"><div class="i-carbon-warning tip-icon"></div><strong>⚠️ 注意</strong></div><p class="tip-content">使用白名单时，确保列表中有足够多的好友，否则可能无菜可偷。</p></div></div>`,
    tags: ['好友过滤', '过滤', '设置', '好友'],
    updatedAt: '2026-02-28',
    version: 'v3.2.3',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },

  // ==================== 高级功能 (4 篇) ====================
  {
    id: 'steal-tips',
    category: '高级功能',
    title: '偷菜技巧',
    icon: 'i-carbon-run',
    content: `<div class="content-sections"><div class="info-card"><h3>🏃 高级偷菜技巧</h3><p>掌握这些技巧，成为偷菜高手！</p></div><div class="tip-section"><h4>1.  timing 把握</h4><p>在作物刚成熟时偷取，避免被其他人偷走。</p></div><div class="tip-section"><h4>2. 优先偷取</h4><p>优先偷取高价值作物（如蓝莓、猕猴桃）。</p></div><div class="tip-section"><h4>3. 合理过滤</h4><p>设置偷菜过滤，跳过低价值作物，节省时间。</p></div><div class="tip-section"><h4>4. 好友选择</h4><p>重点关注种植高价值作物的好友。</p></div></div>`,
    tags: ['偷菜', '技巧', '高级', '策略'],
    updatedAt: '2026-02-28',
    version: 'v3.2.3',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },
  {
    id: 'friend-interaction',
    category: '高级功能',
    title: '好友互动',
    icon: 'i-carbon-thumbs-up',
    content: `<div class="content-sections"><div class="info-card"><h3>🤝 好友互动策略</h3><p>合理的好友互动可以提升收益和关系。</p></div><div class="interaction-card"><h4>偷菜</h4><p>偷取好友成熟作物，获得金币和经验。</p></div><div class="interaction-card"><h4>帮忙</h4><p>帮好友浇水、除草、除虫，获得经验值。</p></div><div class="interaction-card"><h4>捣乱</h4><p>在好友农田放虫草，获得少量金币（不推荐）。</p></div><div class="tip-card tip-success"><div class="tip-header"><div class="i-carbon-checkmark-filled tip-icon"></div><strong>✅ 推荐做法</strong></div><ul class="tip-content"><li>多偷菜，少捣乱</li><li>积极帮忙，提升关系</li><li>设置静默时段，避免深夜打扰</li></ul></div></div>`,
    tags: ['好友互动', '偷菜', '帮忙', '高级'],
    updatedAt: '2026-02-28',
    version: 'v3.2.3',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },
  {
    id: 'task-system',
    category: '高级功能',
    title: '任务系统',
    icon: 'i-carbon-task-complete',
    content: `<div class="content-sections"><div class="info-card"><h3>📋 任务系统详解</h3><p>完成任务获得丰厚奖励。</p></div><div class="task-type"><h4>日常任务</h4><ul><li>收获作物</li><li>偷菜 N 次</li><li>帮忙 N 次</li></ul></div><div class="task-type"><h4>成就任务</h4><ul><li>累计收获</li><li>累计偷菜</li><li>等级提升</li></ul></div><div class="tip-card tip-info"><div class="tip-header"><div class="i-carbon-lightbulb tip-icon"></div><strong>💡 小贴士</strong></div><p class="tip-content">开启"自动做任务"功能，机器人会自动检查并领取任务奖励。</p></div></div>`,
    tags: ['任务', '系统', '奖励', '高级'],
    updatedAt: '2026-02-28',
    version: 'v3.2.3',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },
  {
    id: 'gifts',
    category: '高级功能',
    title: '礼包领取',
    icon: 'i-carbon-gift',
    content: `<div class="content-sections"><div class="info-card"><h3>🎁 礼包领取大全</h3><p>定时领取各种礼包，资源不浪费。</p></div><div class="gift-list"><h4>商城礼包</h4><p>每 4 小时可领取一次免费礼包。</p></div><div class="gift-list"><h4>VIP 礼包</h4><p>VIP 用户每天可领取专属礼包。</p></div><div class="gift-list"><h4>月卡奖励</h4><p>开通月卡后每天领取奖励。</p></div><div class="gift-list"><h4>开服红包</h4><p>新服开启后限时领取。</p></div><div class="tip-card tip-success"><div class="tip-header"><div class="i-carbon-checkmark-filled tip-icon"></div><strong>✅ 自动领取</strong></div><p class="tip-content">开启相应的自动化开关，机器人会自动领取所有礼包。</p></div></div>`,
    tags: ['礼包', '领取', '奖励', '高级'],
    updatedAt: '2026-02-28',
    version: 'v3.2.3',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },

  // ==================== 故障排查 (3 篇) ====================
  {
    id: 'offline',
    category: '故障排查',
    title: '账号掉线',
    icon: 'i-carbon-plug',
    content: `<div class="content-sections"><div class="info-card"><h3>🔌 账号掉线处理</h3><p>账号掉线是常见问题，按以下步骤处理。</p></div><div class="solution-card"><h4>症状</h4><ul><li>账号状态显示"离线"</li><li>无法执行操作</li><li>日志显示连接错误</li></ul></div><div class="solution-card"><h4>解决方法</h4><ol><li>进入"账号"页面</li><li>找到掉线账号</li><li>点击"重新登录"</li><li>扫码或输入 Code</li><li>等待登录完成</li></ol></div><div class="tip-card tip-warning"><div class="tip-header"><div class="i-carbon-warning tip-icon"></div><strong>⚠️ 预防掉线</strong></div><ul class="tip-content"><li>保持网络稳定</li><li>定期查看账号状态</li><li>开启下线提醒推送</li></ul></div></div>`,
    tags: ['掉线', '离线', '故障', '排查'],
    updatedAt: '2026-02-28',
    version: 'v3.2.3',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },
  {
    id: 'issues',
    category: '故障排查',
    title: '功能异常',
    icon: 'i-carbon-error',
    content: `<div class="content-sections"><div class="info-card"><h3>❌ 功能异常排查</h3><p>当某个功能不工作时，按以下步骤排查。</p></div><div class="checklist"><h4>检查清单</h4><ul><li>✅ 功能开关是否开启</li><li>✅ 账号是否在线</li><li>✅ 配置是否正确</li><li>✅ 日志是否有错误</li><li>✅ 网络是否正常</li></ul></div><div class="solution-card"><h4>常见异常</h4><ul><li><strong>不偷菜：</strong>检查好友互动开关</li><li><strong>不收获：</strong>检查种植收获开关</li><li><strong>不领任务：</strong>检查做任务开关</li></ul></div><div class="tip-card tip-info"><div class="tip-header"><div class="i-carbon-lightbulb tip-icon"></div><strong>💡 小贴士</strong></div><p class="tip-content">如果以上方法都无效，尝试重启账号或联系管理员。</p></div></div>`,
    tags: ['功能异常', '故障', '排查', '解决'],
    updatedAt: '2026-02-28',
    version: 'v3.2.3',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },
  {
    id: 'push',
    category: '故障排查',
    title: '推送通知',
    icon: 'i-carbon-notification',
    content: `<div class="content-sections"><div class="info-card"><h3>📱 推送通知设置</h3><p>账号下线或异常时及时收到通知。</p></div><div class="push-channel"><h4>支持渠道</h4><ul><li>Webhook（自定义接口）</li><li>Server 酱</li><li>Push Plus</li><li>钉钉</li><li>企业微信</li><li>Bark</li><li>Telegram</li><li>飞书</li></ul></div><div class="solution-card"><h4>配置步骤</h4><ol><li>进入"设置"页面</li><li>找到"下线提醒"</li><li>选择推送渠道</li><li>填写接口地址/Token</li><li>保存设置</li></ol></div><div class="tip-card tip-success"><div class="tip-header"><div class="i-carbon-checkmark-filled tip-icon"></div><strong>✅ 测试推送</strong></div><p class="tip-content">配置完成后，点击"发送测试"验证推送是否正常。</p></div></div>`,
    tags: ['推送', '通知', '设置', '故障'],
    updatedAt: '2026-02-28',
    version: 'v3.2.3',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },

  // ==================== 配置模板 (3 篇) ====================
  {
    id: 'beginner',
    category: '配置模板',
    title: '新手配置',
    icon: 'i-carbon-user',
    content: `<div class="content-sections"><div class="info-card"><h3>👶 新手配置模板</h3><p>适合刚接触机器人的用户，安全稳定优先。</p></div><div class="config-template"><h4>巡查间隔</h4><pre>农场巡查：300-600 秒 (5-10 分钟)\n好友巡查：900-1200 秒 (15-20 分钟)</pre></div><div class="config-template"><h4>静默时段</h4><pre>启用：是\n时间：23:00-07:00</pre></div><div class="config-template"><h4>自动化开关</h4><pre>自动种植收获：✅\n自动做任务：✅\n自动好友互动：✅\n自动偷菜：✅\n自动帮忙：✅\n自动捣乱：❌</pre></div><div class="tip-card tip-success"><div class="tip-header"><div class="i-carbon-checkmark-filled tip-icon"></div><strong>✅ 特点</strong></div><ul class="tip-content"><li>安全第一，不易被发现</li><li>收益稳定，适合长期运行</li><li>配置简单，易于维护</li></ul></div></div>`,
    tags: ['新手', '配置', '模板', '保守'],
    updatedAt: '2026-02-28',
    version: 'v3.2.3',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },
  {
    id: 'daily',
    category: '配置模板',
    title: '日常配置',
    icon: 'i-carbon-calendar',
    content: `<div class="content-sections"><div class="info-card"><h3>📅 日常配置模板</h3><p>适合日常使用，平衡安全和收益。</p></div><div class="config-template"><h4>巡查间隔</h4><pre>农场巡查：180-300 秒 (3-5 分钟)\n好友巡查：600-900 秒 (10-15 分钟)</pre></div><div class="config-template"><h4>静默时段</h4><pre>启用：是\n时间：23:00-07:00</pre></div><div class="config-template"><h4>施肥策略</h4><pre>策略：普通 + 有机</pre></div><div class="config-template"><h4>过滤设置</h4><pre>偷菜过滤：黑名单\n好友过滤：黑名单</pre></div><div class="tip-card tip-success"><div class="tip-header"><div class="i-carbon-checkmark-filled tip-icon"></div><strong>✅ 特点</strong></div><ul class="tip-content"><li>安全与收益兼顾</li><li>适合大多数用户</li><li>推荐使用此配置</li></ul></div></div>`,
    tags: ['日常', '配置', '模板', '平衡'],
    updatedAt: '2026-02-28',
    version: 'v3.2.3',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },
  {
    id: 'pro',
    category: '配置模板',
    title: '专业配置',
    icon: 'i-carbon-user-avatar',
    content: `<div class="content-sections"><div class="info-card"><h3>🎯 专业配置模板</h3><p>适合追求最大收益的资深用户。</p></div><div class="config-template"><h4>巡查间隔</h4><pre>农场巡查：120-180 秒 (2-3 分钟)\n好友巡查：300-600 秒 (5-10 分钟)</pre></div><div class="config-template"><h4>静默时段</h4><pre>启用：是\n时间：00:00-06:00</pre></div><div class="config-template"><h4>施肥策略</h4><pre>策略：普通 + 有机</pre></div><div class="config-template"><h4>过滤设置</h4><pre>偷菜过滤：白名单（高价值）\n好友过滤：白名单（肥羊）</pre></div><div class="tip-card tip-warning"><div class="tip-header"><div class="i-carbon-warning tip-icon"></div><strong>⚠️ 注意</strong></div><ul class="tip-content"><li>收益高但风险也高</li><li>需要密切监控</li><li>不建议主账号使用</li></ul></div></div>`,
    tags: ['专业', '配置', '模板', '激进'],
    updatedAt: '2026-02-28',
    version: 'v3.2.3',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },

  // ==================== 运维部署 (4 篇) ====================
  {
    id: 'ops-quick-start',
    category: '运维部署',
    title: '环境检测与启动',
    icon: 'i-carbon-terminal',
    content: `<div class="content-sections"><div class="info-card"><h3>🚀 quick-start.sh — 一键环境检测与启动引导</h3><p>本脚本适用于<strong>裸机部署（非 Docker）</strong>场景，帮助您全自动检测运行环境是否就绪，并一步步引导完成项目启动。</p></div><div class="step-card"><div class="step-number">1</div><div class="step-content"><h4>进入项目根目录</h4><pre>cd /path/to/qq-farm-bot-ui</pre></div></div><div class="step-card"><div class="step-number">2</div><div class="step-content"><h4>执行启动脚本</h4><pre>chmod +x quick-start.sh\n./quick-start.sh</pre></div></div><div class="step-card"><div class="step-number">3</div><div class="step-content"><h4>脚本将自动完成以下检测</h4><ul><li>✅ <strong>Node.js</strong>：检查是否安装 Node.js 20+</li><li>✅ <strong>pnpm</strong>：检查包管理器是否可用</li><li>✅ <strong>MySQL</strong>：检测 MySQL 服务是否运行（可选）</li><li>✅ <strong>Redis</strong>：检测 Redis 服务是否运行（可选）</li><li>✅ <strong>依赖安装</strong>：自动执行 pnpm install</li><li>✅ <strong>前端构建</strong>：自动执行 pnpm build:web</li></ul></div></div><div class="tip-card tip-warning"><div class="tip-header"><div class="i-carbon-warning tip-icon"></div><strong>⚠️ 注意事项</strong></div><ul class="tip-content"><li>脚本仅用于裸机部署，Docker 环境无需使用</li><li>首次运行可能需要较长时间（安装依赖）</li><li>如果检测到缺少组件，脚本会给出安装建议</li></ul></div><div class="tip-card tip-info"><div class="tip-header"><div class="i-carbon-lightbulb tip-icon"></div><strong>💡 配套脚本</strong></div><ul class="tip-content"><li><strong>help.sh</strong>：查看项目结构与可用脚本说明</li><li><strong>show-users.sh</strong>：快速查看已注册用户列表</li></ul></div></div>`,
    tags: ['运维', '部署', '环境检测', '快速启动', 'quick-start'],
    updatedAt: '2026-03-05',
    version: 'v4.2.0',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },
  {
    id: 'ops-background',
    category: '运维部署',
    title: '后台运行方案',
    icon: 'i-carbon-cloud-services',
    content: `<div class="content-sections"><div class="info-card"><h3>🌐 choose-background-method.sh — 4 种后台运行方案</h3><p>本脚本提供<strong>交互式菜单</strong>，帮助您根据服务器环境选择最合适的后台运行方式，确保机器人在关闭终端后继续运行。</p></div><div class="step-card"><div class="step-number">1</div><div class="step-content"><h4>启动方案选择器</h4><pre>chmod +x choose-background-method.sh\n./choose-background-method.sh</pre></div></div><div class="feature-grid"><div class="feature-card"><h4>方案 A：自定义守护脚本</h4><ul><li>使用 <code>farm-bot.sh</code></li><li>基于 nohup 的轻量守护</li><li>支持 start / stop / restart / status</li><li><strong>最低门槛，适合所有环境</strong></li></ul></div><div class="feature-card"><h4>方案 B：Systemd 服务</h4><ul><li>运行 <code>install-systemd-service.sh</code></li><li>注册为系统级服务</li><li>开机自启 + 崩溃自动重启</li><li><strong>仅限 Linux 服务器</strong></li></ul></div><div class="feature-card"><h4>方案 C：PM2 进程管理</h4><ul><li>运行 <code>install-pm2.sh</code></li><li>内置日志管理与监控面板</li><li>一键搞定多进程管理</li><li><strong>Node.js 生态首选</strong></li></ul></div><div class="feature-card"><h4>方案 D：Screen 会话</h4><ul><li>运行 <code>start-with-screen.sh</code></li><li>模拟终端窗口持久化</li><li>可随时 attach/detach</li><li><strong>适合临时调试与观察</strong></li></ul></div></div><div class="tip-card tip-success"><div class="tip-header"><div class="i-carbon-checkmark-filled tip-icon"></div><strong>✅ 推荐选择</strong></div><ul class="tip-content"><li><strong>生产服务器（Linux）</strong>：首选 Systemd，次选 PM2</li><li><strong>开发机 / Mac</strong>：使用自定义守护脚本或 Screen</li><li><strong>临时测试</strong>：直接用 Screen 即可</li></ul></div></div>`,
    tags: ['运维', '后台运行', 'PM2', 'systemd', 'screen', '守护进程'],
    updatedAt: '2026-03-05',
    version: 'v4.2.0',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },
  {
    id: 'ops-password',
    category: '运维部署',
    title: '密码重置工具',
    icon: 'i-carbon-password',
    content: `<div class="content-sections"><div class="info-card"><h3>🔑 密码重置双神兵 — 管理员密码 & MySQL 密码</h3><p>忘记密码不再是灾难！两个独立脚本可以在完全无法登录的情况下帮您恢复系统访问。</p></div><div class="step-card"><div class="step-number">1</div><div class="step-content"><h4>重置管理员密码（reset-admin-password.sh）</h4><p>适用场景：忘记了 Web 面板的登录密码</p><pre>chmod +x reset-admin-password.sh\n./reset-admin-password.sh</pre><ul><li>脚本会自动连接本地数据库</li><li>使用 PBKDF2 高强度加密算法重写密码</li><li>重置后即可使用新密码登录面板</li><li>默认重置为 <code>admin</code> 或按提示输入新密码</li></ul></div></div><div class="step-card"><div class="step-number">2</div><div class="step-content"><h4>修复 MySQL 密码（fix-mysql-password.sh）</h4><p>适用场景：MySQL root 密码丢失，无法连接数据库</p><pre>chmod +x fix-mysql-password.sh\n./fix-mysql-password.sh</pre><ul><li>自动检测 MySQL 安装与运行状态</li><li>通过安全模式重置 root 密码</li><li>适用于 Mac (Homebrew) 与 Linux (apt/yum)</li></ul></div></div><div class="tip-card tip-warning"><div class="tip-header"><div class="i-carbon-warning tip-icon"></div><strong>⚠️ 安全提醒</strong></div><ul class="tip-content"><li>重置密码后请<strong>立即修改为强密码</strong></li><li>切勿在不安全的网络环境下执行</li><li>建议定期备份数据库</li></ul></div></div>`,
    tags: ['运维', '密码重置', '管理员', 'MySQL', '安全'],
    updatedAt: '2026-03-05',
    version: 'v4.2.0',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },
  {
    id: 'ops-daemon',
    category: '运维部署',
    title: '守护进程管理',
    icon: 'i-carbon-server-proxy',
    content: `<div class="content-sections"><div class="info-card"><h3>🔧 farm-bot.sh — 守护进程管理器</h3><p>一个简洁的 Bash 脚本，用于在后台启动、停止、重启和检查机器人运行状态。基于 nohup 实现，无需安装任何额外依赖。</p></div><div class="step-card"><div class="step-number">1</div><div class="step-content"><h4>启动机器人</h4><pre>./farm-bot.sh start</pre><p>将机器人作为后台进程启动，PID 保存在 <code>.farm-bot.pid</code> 文件中。</p></div></div><div class="step-card"><div class="step-number">2</div><div class="step-content"><h4>停止机器人</h4><pre>./farm-bot.sh stop</pre><p>安全地终止后台运行的机器人进程。</p></div></div><div class="step-card"><div class="step-number">3</div><div class="step-content"><h4>重启机器人</h4><pre>./farm-bot.sh restart</pre><p>先停止再启动，适用于配置变更后。</p></div></div><div class="step-card"><div class="step-number">4</div><div class="step-content"><h4>查看运行状态</h4><pre>./farm-bot.sh status</pre><p>显示当前进程 PID、运行时长等信息。</p></div></div><div class="tip-card tip-info"><div class="tip-header"><div class="i-carbon-lightbulb tip-icon"></div><strong>💡 日志查看</strong></div><ul class="tip-content"><li>运行日志输出至 <code>logs/farm-bot.log</code></li><li>可用 <code>tail -f logs/farm-bot.log</code> 实时查看</li><li>也可在 Web 面板的概览页查看实时日志</li></ul></div><div class="tip-card tip-success"><div class="tip-header"><div class="i-carbon-checkmark-filled tip-icon"></div><strong>✅ 脚本列表速查</strong></div><ul class="tip-content"><li><code>quick-start.sh</code> — 环境检测与启动引导</li><li><code>choose-background-method.sh</code> — 后台方案选择器</li><li><code>farm-bot.sh</code> — 守护进程管理 (start/stop/restart/status)</li><li><code>install-pm2.sh</code> — PM2 一键安装与配置</li><li><code>install-systemd-service.sh</code> — Systemd 服务注册</li><li><code>start-with-screen.sh</code> — Screen 会话启动</li><li><code>reset-admin-password.sh</code> — 管理员密码重置</li><li><code>fix-mysql-password.sh</code> — MySQL 密码修复</li><li><code>show-users.sh</code> — 查看注册用户</li><li><code>help.sh</code> — 帮助信息与项目结构</li></ul></div></div>`,
    tags: ['运维', '守护进程', '后台运行', '进程管理', 'farm-bot'],
    updatedAt: '2026-03-05',
    version: 'v4.2.0',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },
  {
    id: 'ops-distributed',
    category: '运维部署',
    title: '分布式集群部署 (Docker)',
    icon: 'i-carbon-network-4',
    content: `<div class="content-sections"><div class="info-card"><h3>🌊 分布式 Master-Worker 集群部署</h3><p>从 v4.3.0 版本起，系统支持强大的分布式集群化部署。默认拉取的镜像以单节点（Standalone）运行，如果您拥有大量账号需要并发执行，可以通过本教程改造为集群部署方案。</p></div><div class="step-card"><div class="step-number">1</div><div class="step-content"><h4>单机版部署 (默认模式)</h4><pre># 默认情况下拉取的是单一节点版本
docker run -d --name farm-bot -p 3003:3000 smdk/qq-farm-ui-pro-max:latest</pre><p>默认方案自动集成了面板（Master）与挂机任务（Worker），开箱即用，适合百号以内的常规操作。</p></div></div><div class="step-card"><div class="step-number">2</div><div class="step-content"><h4>升级到分布式集群版</h4><p>创建一个 <code>docker-compose.yml</code> 配置文件，通过定义环境变数 <code>ROLE=master</code> 或 <code>ROLE=worker</code> 将架构拆分。</p><pre>version: '3.8'
services:
  farm-master:
    image: smdk/qq-farm-ui-pro-max:latest
    ports:
      - "3003:3000"
    environment:
      - ROLE=master

  farm-worker:
    image: smdk/qq-farm-ui-pro-max:latest
    environment:
      - ROLE=worker
      - MASTER_URL=http://farm-master:3000
    depends_on:
      - farm-master</pre></div></div><div class="step-card"><div class="step-number">3</div><div class="step-content"><h4>一键无缝横向扩容 (Scale)</h4><p>在同目录下执行如下部署命令即可挂载多个打工节点抢占挂机任务（以下范例拉起 3 个无头客户端）：</p><pre>docker-compose up -d --scale farm-worker=3</pre></div></div><div class="tip-card tip-success"><div class="tip-header"><div class="i-carbon-checkmark-filled tip-icon"></div><strong>✅ 各角色职能梳理</strong></div><ul class="tip-content"><li><strong>Master 节点：</strong>只负责展示后台 Web UI（浏览器3003端口）和执行午夜12点的数据落库、任务派发。不处理实际账号挂机，永不卡顿。</li><li><strong>Worker 节点：</strong>无面板，开机自动用 Socket 连接到 Master 登记，随后领取被分配的农场账号，默默在后台爬虫打怪反馈经验进度。</li></ul></div></div>`,
    tags: ['运维', '分布式', 'Docker', '集群', '高并发', '部署'],
    updatedAt: '2026-03-06',
    version: 'v4.3.0',
    author: 'QQ Farm Bot Team',
    reviewStatus: 'published',
  },
]

// 分类定义
export const helpCategories = [
  {
    name: '新手入门',
    icon: 'i-carbon-book',
    description: '快速上手指南',
    color: 'blue',
  },
  {
    name: '设置指南',
    icon: 'i-carbon-settings',
    description: '功能详细说明',
    color: 'green',
  },
  {
    name: '高级功能',
    icon: 'i-carbon-advanced',
    description: '进阶玩法技巧',
    color: 'purple',
  },
  {
    name: '故障排查',
    icon: 'i-carbon-wrench',
    description: '常见问题解决',
    color: 'orange',
  },
  {
    name: '配置模板',
    icon: 'i-carbon-copy',
    description: '直接套用配置',
    color: 'indigo',
  },
  {
    name: '运维部署',
    icon: 'i-carbon-terminal',
    description: '服务器运维脚本',
    color: 'red',
  },
]

// 开发进度追踪
export const developmentProgress = {
  totalArticles: 26,
  completedArticles: 26, // 已完成
  draftArticles: 0,
  lastUpdated: '2026-03-06',
  nextUpdate: '2026-03-??',
  version: 'v4.3.0',
  progress: 100,
  changelog: [
    {
      version: 'v4.3.0',
      date: '2026-03-06',
      changes: [
        '架构演进：重构 Master-Worker 分布式集群模式',
        '全面容器化：内置分布式 Docker-compose 弹性扩展机制',
        '真实战报系统：接入 MySQL stats_daily 进行统计并引入 Dirty Write 防抖',
        '核心引擎重写：WebSocket 分页订阅与 Echarts 异步首屏加载',
        '安全与防封：全平台同步拉取路由修复，QQ/WeChat 登录鉴权双轨优化'
      ],
    },
    {
      version: 'v3.9.0',
      date: '2026-03-02',
      changes: [
        '品牌重塑：御农·QQ 农场智能助手启动，全新极光登录体验',
        '后台管理配置：wxAppId 与密钥可自运维直接注入',
        '高并发防御：数据库池化与请求连接分离（彻底解决连接池卡锁）',
        '智能挂机进阶：蹲守偷菜（延迟抢收）与智能避让系统',
        '底层限流系统：操作随机抖动加强，防检测算法再迭代'
      ],
    },
    {
      version: 'v3.2.4',
      date: '2026-02-28',
      changes: [
        '完成所有 26 篇帮助文章',
        '实现搜索功能',
        '添加进度追踪系统',
        '完善维护指南',
      ],
    },
    {
      version: 'v3.2.3',
      date: '2026-02-28',
      changes: [
        '新增帮助中心系统',
        '完成基础框架',
        '实现分类导航',
      ],
    },
  ],
}
