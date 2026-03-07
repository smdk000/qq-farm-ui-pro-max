const { sleep } = require('../utils/utils');
const QRCode = require('qrcode');

function createReloginReminderService(options) {
    const {
        store,
        miniProgramLoginSession,
        sendPushooMessage,
        log,
        addAccountLog,
        getAccounts,
        addOrUpdateAccount,
        resolveWorkerControls,
    } = options;

    const reloginWatchers = new Map(); // key: accountId:loginCode
    const lastReminderTime = new Map(); // key: accountId, value: timestamp

    function getOfflineAutoDeleteMs() {
        const cfg = store.getOfflineReminder ? store.getOfflineReminder() : null;
        const sec = Number.parseInt(cfg && cfg.offlineDeleteSec, 10) || 0;
        return sec * 1000;
    }

    function applyReloginCode({ accountId = '', accountName = '', authCode = '', uin = '', username = '' }) {
        const code = String(authCode || '').trim();
        if (!code) return;

        const data = getAccounts();
        const list = Array.isArray(data.accounts) ? data.accounts : [];
        const found = list.find(a => String(a.id) === String(accountId));
        const avatar = uin ? `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=640` : '';
        const controls = (typeof resolveWorkerControls === 'function') ? (resolveWorkerControls() || {}) : {};
        const startWorker = typeof controls.startWorker === 'function' ? controls.startWorker : null;
        const restartWorker = typeof controls.restartWorker === 'function' ? controls.restartWorker : null;

        if (found) {
            addOrUpdateAccount({
                id: found.id,
                name: found.name,
                code,
                platform: found.platform || 'qq',
                qq: uin || found.qq || found.uin || '',
                uin: uin || found.uin || found.qq || '',
                avatar: avatar || found.avatar || '',
            });
            if (restartWorker) {
                restartWorker({
                    ...found,
                    code,
                    qq: uin || found.qq || found.uin || '',
                    uin: uin || found.uin || found.qq || '',
                    avatar: avatar || found.avatar || '',
                });
            }
            addAccountLog('update', `重登录成功，已更新账号: ${found.name}`, found.id, found.name, { reason: 'relogin' });
            log('系统', `重登录成功，账号已更新并重启: ${found.name}`);
            return;
        }

        const created = addOrUpdateAccount({
            name: accountName || (uin ? String(uin) : '重登录账号'),
            code,
            platform: 'qq',
            qq: uin || '',
            uin: uin || '',
            avatar,
            username: username || '',
        });
        const newAcc = (created.accounts || [])[created.accounts.length - 1];
        if (newAcc) {
            if (startWorker) startWorker(newAcc);
            addAccountLog('add', `重登录成功，已新增账号: ${newAcc.name}`, newAcc.id, newAcc.name, { reason: 'relogin' });
            log('系统', `重登录成功，已新增账号并启动: ${newAcc.name}`, { accountId: String(newAcc.id), accountName: newAcc.name });
        }
    }

    function startReloginWatcher({ loginCode, accountId = '', accountName = '', username = '' }) {
        const code = String(loginCode || '').trim();
        if (!code) return;

        const key = `${accountId || 'unknown'}:${code}`;
        if (reloginWatchers.has(key)) return;
        reloginWatchers.set(key, { startedAt: Date.now() });
        log('系统', `已启动重登录监听: ${accountName || accountId || '未知账号'}`, { accountId: String(accountId || ''), accountName: accountName || '' });

        let stopped = false;
        const stop = () => {
            if (stopped) return;
            stopped = true;
            reloginWatchers.delete(key);
        };

        (async () => {
            const maxRounds = 120; // ~2分钟
            for (let i = 0; i < maxRounds; i += 1) {
                try {
                    const status = await miniProgramLoginSession.queryStatus(code);
                    if (!status || status.status === 'Wait') {
                        await sleep(1000);
                        continue;
                    }
                    if (status.status === 'Used') {
                        log('系统', `重登录二维码已失效: ${accountName || accountId || '未知账号'}`, { accountId: String(accountId || ''), accountName: accountName || '' });
                        stop();
                        return;
                    }
                    if (status.status === 'OK') {
                        const ticket = String(status.ticket || '').trim();
                        const uin = String(status.uin || '').trim();
                        if (!ticket) {
                            log('错误', '重登录监听失败: ticket 为空');
                            stop();
                            return;
                        }
                        const authCode = await miniProgramLoginSession.getAuthCode(ticket, '1112386029');
                        if (!authCode) {
                            log('错误', '重登录监听失败: 未获取到新 code');
                            stop();
                            return;
                        }
                        applyReloginCode({ accountId, accountName, authCode, uin, username });
                        stop();
                        return;
                    }
                    await sleep(1000);
                } catch {
                    await sleep(1000);
                }
            }
            log('系统', `重登录监听超时: ${accountName || accountId || '未知账号'}`, { accountId: String(accountId || ''), accountName: accountName || '' });
            stop();
        })();
    }

    async function triggerOfflineReminder(payload = {}) {
        try {
            const accountId = String(payload.accountId || '').trim();
            const accountData = getAccounts ? getAccounts() : {};
            const accountList = Array.isArray(accountData.accounts) ? accountData.accounts : (Array.isArray(accountData) ? accountData : []);
            const matchedAccount = accountList.find(a => String(a.id) === accountId);
            const ownerUsername = (matchedAccount && matchedAccount.username) || '';

            // 去重：避免短时间内重复发送推送（5分钟内）
            const now = Date.now();
            const lastTime = lastReminderTime.get(accountId);
            if (lastTime && (now - lastTime) < 5 * 60 * 1000) {
                log('系统', `账号 ${payload.accountName || accountId} 推送过于频繁，已跳过`, { accountId, accountName: payload.accountName || accountId });
                return;
            }
            lastReminderTime.set(accountId, now);

            const cfg = store.getOfflineReminder ? store.getOfflineReminder() : null;
            if (!cfg) return;

            const channelName = String(cfg.channel || '').trim().toLowerCase();
            const reloginUrlMode = String(cfg.reloginUrlMode || 'none').trim().toLowerCase();
            const endpoint = String(cfg.endpoint || '').trim();
            const channel = channelName;
            const token = String(cfg.token || '').trim();
            const baseTitle = String(cfg.title || '').trim();
            const accountName = String(payload.accountName || payload.accountId || '').trim();
            const title = accountName ? `${baseTitle} ${accountName}` : baseTitle;
            let content = String(cfg.msg || '').trim();

            // Phase 4: 特殊 P0 级告警覆盖文案
            if (payload.reason && payload.reason.startsWith('ban:')) {
                content = `【P0系统告警】账号 [${accountName}] 触发腾讯防刷安全策略(1002003)，系统已自动进入 30 分钟保护性自愈休眠。建议排查设置是否过快，此为最后防线。`;
            } else if (payload.reason && payload.reason.startsWith('kickout:')) {
                const pureReason = payload.reason.replace('kickout:', '');
                content = `【P0跑路告警】账号 [${accountName}] 被踢下线被登出，请紧急上线检查状态！可能异地登录或被封禁！原因: ${pureReason}`;
            }

            if (!channel || !title || !content) return;
            if (channel === 'webhook' && !endpoint) return;
            if (reloginUrlMode === 'qq_link' || reloginUrlMode === 'qr_code' || reloginUrlMode === 'all') {
                try {
                    const qr = await miniProgramLoginSession.requestLoginCode();
                    const loginCode = String((qr && qr.code) || '').trim();
                    const qqUrl = String((qr && (qr.url || qr.loginUrl)) || '').trim();
                    const qrCodeImage = String((qr && qr.image) || '').trim();
                    if (qqUrl) {
                        if (reloginUrlMode === 'qq_link') {
                            content = `${content}\n\n登录链接: ${qqUrl}`;
                        } else if (reloginUrlMode === 'qr_code') {
                            if (qrCodeImage) {
                                content = `${content}\n\n登录二维码:\n\n<img src="${qrCodeImage}" alt="登录二维码" width="300" height="300" />`;
                            }
                        } else if (reloginUrlMode === 'all') {
                            if (qrCodeImage) {
                                content = ` ${content}\n\n登录链接: ${qqUrl}\n登录二维码:\n <img src="${qrCodeImage}" alt="登录二维码" width="300" height="300" />`;
                            } else {
                                content = ` ${content}\n\n登录链接: ${qqUrl}`;
                            }
                        }
                    }
                    if (loginCode) {
                        startReloginWatcher({
                            loginCode,
                            accountId: String(payload.accountId || '').trim(),
                            accountName: String(payload.accountName || '').trim(),
                            username: ownerUsername,
                        });
                    }
                } catch (e) {
                    log('错误', `获取重登录链接失败: ${e.message}`);
                }
            }

            const ret = await sendPushooMessage({
                channel,
                endpoint,
                token,
                title,
                content,
            });

            if (ret && ret.ok) {
                const accountName = String(payload.accountName || payload.accountId || '');
                log('系统', `下线提醒发送成功: ${accountName}`);
            } else {
                log('错误', `下线提醒发送失败: ${ret && ret.msg ? ret.msg : 'unknown'}`);
            }
        } catch (e) {
            log('错误', `下线提醒发送异常: ${e.message}`);
        }
    }

    return {
        getOfflineAutoDeleteMs,
        triggerOfflineReminder,
        startReloginWatcher,
        applyReloginCode,
    };
}

module.exports = {
    createReloginReminderService,
};
