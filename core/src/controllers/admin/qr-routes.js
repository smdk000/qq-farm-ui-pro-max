function normalizeQrcodeData(data) {
    let qrcodeData = data || '';
    if (qrcodeData) {
        qrcodeData = qrcodeData.replace(/^data:image\/(png|jpg|jpeg);base64,/i, '');
        qrcodeData = `data:image/png;base64,${qrcodeData}`;
    }
    return qrcodeData;
}

async function requestJsonWithTimeout({
    fetchRef,
    AbortControllerRef,
    setTimeoutRef,
    clearTimeoutRef,
}, url, options, timeoutMs) {
    const controller = new AbortControllerRef();
    const timer = setTimeoutRef(() => controller.abort(), timeoutMs);
    try {
        const response = await fetchRef(url, {
            ...options,
            signal: controller.signal,
        });
        return await response.json();
    } finally {
        clearTimeoutRef(timer);
    }
}

function parseWechatServerError(checkRes) {
    let errMsg = '';
    try {
        const wxErrXml = checkRes.Data?.baseResponse?.errMsg?.string || '';
        if (wxErrXml.includes('CDATA[')) {
            const match = wxErrXml.match(/<!\[CDATA\[(.*?)\]\]>/);
            if (match && match[1]) {
                errMsg = match[1];
            }
        }
    } catch { }
    return errMsg;
}

function getThirdPartyConfig(store) {
    return store.getThirdPartyApiConfig ? store.getThirdPartyApiConfig() : {};
}

function buildQQUinAvatarUrl(uin, size = 640) {
    const qq = String(uin || '').trim();
    if (!qq) return '';
    return `https://q1.qlogo.cn/g?b=qq&nk=${qq}&s=${Math.max(1, Number(size) || 640)}`;
}

function buildQQOpenIdAvatarUrl(openId, appid = '1112386029', size = 100) {
    const token = String(openId || '').trim();
    if (!token) return '';
    return `https://thirdqq.qlogo.cn/qqapp/${encodeURIComponent(String(appid || '1112386029'))}/${encodeURIComponent(token)}/${Math.max(1, Number(size) || 100)}`;
}

function getQrExpiresAt(platform = '', sourceData = null) {
    const normalizedPlatform = String(platform || '').trim().toLowerCase();
    const data = (sourceData && typeof sourceData === 'object') ? sourceData : {};
    const explicitSeconds = Number(data.expire_seconds || data.expireSeconds || data.ttlSec || data.ttl_sec || 0);
    const explicitMs = Number(data.expire_ms || data.expireMs || data.ttlMs || data.ttl_ms || 0);
    const remainingSeconds = Number(data.expiredTime || data.expired_time || data.leftSeconds || data.left_seconds || 0);
    if (Number.isFinite(explicitMs) && explicitMs > 0) {
        return Date.now() + explicitMs;
    }
    if (Number.isFinite(explicitSeconds) && explicitSeconds > 0) {
        return Date.now() + (explicitSeconds * 1000);
    }
    if (Number.isFinite(remainingSeconds) && remainingSeconds > 0 && remainingSeconds <= 86400) {
        return Date.now() + (remainingSeconds * 1000);
    }
    if (normalizedPlatform === 'qq') {
        return Date.now() + (2 * 60 * 1000);
    }
    if (normalizedPlatform === 'wx_ipad' || normalizedPlatform === 'wx_car') {
        return Date.now() + (3 * 60 * 1000);
    }
    return Date.now() + (2 * 60 * 1000);
}

function buildQrStatusPayload(platform, status, payload = {}, options = {}) {
    const safePayload = (payload && typeof payload === 'object') ? payload : {};
    const safeOptions = (options && typeof options === 'object') ? options : {};
    const messageByStatus = {
        Wait: '等待扫码',
        Check: '已扫码，请在手机确认',
        OK: '登录成功',
        Used: '二维码已失效，请刷新',
        Error: safePayload.error || '二维码状态异常',
    };
    return {
        status,
        code: String(safePayload.code || safeOptions.code || '').trim(),
        ticket: String(safePayload.ticket || '').trim(),
        uin: String(safePayload.uin || '').trim(),
        openId: String(safePayload.openId || '').trim(),
        nickname: String(safePayload.nickname || '').trim(),
        avatar: String(safePayload.avatar || '').trim(),
        expiresAt: Math.max(0, Number(safePayload.expiresAt || safeOptions.expiresAt || 0)),
        retryable: safePayload.retryable !== undefined
            ? !!safePayload.retryable
            : (status !== 'OK' && status !== 'Check'),
        message: String(safePayload.message || messageByStatus[status] || '').trim(),
        error: String(safePayload.error || '').trim(),
    };
}

function isWechatTransientQrState(checkRes) {
    const message = String(checkRes?.Message || '').trim();
    return message.includes('扫码状态返回的交互key不存在');
}

function registerQrRoutes({
    app,
    store,
    configRef,
    processRef,
    fetchRef,
    AbortControllerRef,
    setTimeoutRef,
    clearTimeoutRef,
    sleepRef,
    miniProgramLoginSession,
    consoleRef,
}) {
    app.post('/api/qr/create', async (req, res) => {
        const { platform = 'qq', uin = '' } = req.body || {};
        const trimmedUin = String(uin || '').trim();
        try {
            if (platform === 'wx_ipad' || platform === 'wx_car') {
                const thirdPartyCfg = getThirdPartyConfig(store);
                const ipad860Url = thirdPartyCfg.ipad860Url
                    || processRef.env.IPAD860_URL
                    || 'http://127.0.0.1:8058';
                const endpoint = platform === 'wx_car'
                    ? '/api/Login/LoginGetQRCar'
                    : '/api/Login/LoginGetQR';

                const qrRes = await requestJsonWithTimeout(
                    { fetchRef, AbortControllerRef, setTimeoutRef, clearTimeoutRef },
                    `${ipad860Url}${endpoint}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({}),
                    },
                    15000,
                );

                if (qrRes.Code === 1 && qrRes.Data) {
                    return res.json({
                        ok: true,
                        data: {
                            ...buildQrStatusPayload(platform, 'Wait', {
                                expiresAt: getQrExpiresAt(platform, qrRes.Data),
                                retryable: true,
                                message: '请使用微信扫码（车机/平板协议）',
                            }),
                            qrcode: normalizeQrcodeData(qrRes.Data.QrBase64 || ''),
                            code: qrRes.Data.Uuid || '',
                            platform,
                        },
                    });
                }
                return res.json({ ok: false, error: qrRes.Message || '获取二维码失败' });
            }

            if (platform === 'wx') {
                const thirdPartyCfg = getThirdPartyConfig(store);
                const wxApiKey = thirdPartyCfg.wxApiKey || configRef.wxApiKey;
                const wxApiUrl = thirdPartyCfg.wxApiUrl || configRef.wxApiUrl;

                const wxRes = await requestJsonWithTimeout(
                    { fetchRef, AbortControllerRef, setTimeoutRef, clearTimeoutRef },
                    `${wxApiUrl}?api_key=${encodeURIComponent(wxApiKey)}&action=getqr`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({}),
                    },
                    15000,
                );

                if (wxRes.code === 0 && wxRes.data) {
                    return res.json({
                        ok: true,
                        data: {
                            ...buildQrStatusPayload('wx', 'Wait', {
                                expiresAt: getQrExpiresAt('wx', wxRes.data),
                                retryable: true,
                                message: '请使用微信扫码',
                            }),
                            qrcode: normalizeQrcodeData(wxRes.data.QrBase64 || ''),
                            code: wxRes.data.Uuid || wxRes.data.uuid,
                            platform: 'wx',
                        },
                    });
                }
                return res.json({ ok: false, error: wxRes.msg || '获取微信二维码失败' });
            }

            const result = await miniProgramLoginSession.requestLoginCode(trimmedUin);
            return res.json({
                ok: true,
                data: {
                    ...buildQrStatusPayload('qq', 'Wait', {
                        expiresAt: getQrExpiresAt('qq', result),
                        retryable: true,
                        message: trimmedUin ? '请使用手机 QQ 扫码' : '请使用手机 QQ 扫码，建议先填写 QQ 号',
                    }),
                    ...result,
                },
            });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/qr/check', async (req, res) => {
        const { code, platform = 'qq', uin = '' } = req.body || {};
        const trimmedUin = String(uin || '').trim();
        if (!code) {
            return res.status(400).json({ ok: false, error: 'Missing code' });
        }

        try {
            if (platform === 'wx_ipad' || platform === 'wx_car') {
                const thirdPartyCfg = getThirdPartyConfig(store);
                const ipad860Url = thirdPartyCfg.ipad860Url
                    || processRef.env.IPAD860_URL
                    || 'http://127.0.0.1:8058';
                const wxAppId = thirdPartyCfg.wxAppId || configRef.wxAppId;

                const checkRes = await requestJsonWithTimeout(
                    { fetchRef, AbortControllerRef, setTimeoutRef, clearTimeoutRef },
                    `${ipad860Url}/api/Login/LoginCheckQR?uuid=${encodeURIComponent(code)}`,
                    { method: 'POST' },
                    10000,
                );

                consoleRef.log('[Ipad860 CheckQR] 完整响应:', JSON.stringify(checkRes));

                if (checkRes.Code === 0 && checkRes.Success) {
                    const data = checkRes.Data || {};
                    const status = data.status;
                    const expiresAt = getQrExpiresAt(platform, data);

                    if (status === 0) {
                        return res.json({
                            ok: true,
                            data: buildQrStatusPayload(platform, 'Wait', {}, { code, expiresAt }),
                        });
                    }
                    if (status === 1) {
                        const NickName = data.nickName || '';
                        const HeadImgUrl = data.headImgUrl || '';
                        return res.json({
                            ok: true,
                            data: buildQrStatusPayload(platform, 'Check', { nickname: NickName, avatar: HeadImgUrl }, { code, expiresAt }),
                        });
                    }

                    const wxid = data?.acctSectResp?.userName || data?.WxId || data?.UserName || '';
                    const nickname = data?.acctSectResp?.nickName || data?.NickName || '';
                    const headUrl = data?.HeadUrl || '';

                    if (!wxid) {
                        consoleRef.error('[Ipad860] 登录成功但未能解析出 wxid:', JSON.stringify(data));
                        return res.json({
                            ok: true,
                            data: buildQrStatusPayload(platform, 'Error', { error: '解析微信ID失败', retryable: true }, { code, expiresAt }),
                        });
                    }

                    let jsRes = null;
                    let lastError = null;
                    for (let attempt = 1; attempt <= 3; attempt++) {
                        try {
                            jsRes = await requestJsonWithTimeout(
                                { fetchRef, AbortControllerRef, setTimeoutRef, clearTimeoutRef },
                                `${ipad860Url}/api/Wxapp/JSLogin`,
                                {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ Wxid: wxid, Appid: wxAppId }),
                                },
                                10000,
                            );

                            consoleRef.log(`[Ipad860 JSLogin] 第 ${attempt} 次响应:`, JSON.stringify(jsRes));

                            if (jsRes && jsRes.Code === 0 && jsRes.Success) {
                                break;
                            }
                        } catch (err) {
                            lastError = err;
                            consoleRef.error(`[Ipad860 JSLogin] 第 ${attempt} 次失败: ${err.message}`);
                        }
                        if (attempt < 3) {
                            await sleepRef(1000);
                        }
                    }

                    if (jsRes && jsRes.Code === 0 && jsRes.Success && jsRes.Data) {
                        const authCode = jsRes.Data.code || jsRes.Data.Code || '';
                        consoleRef.log(`[Ipad860 JSLogin] 登录成功! wxid=${wxid}, code=${authCode}, nickname=${nickname}`);
                        return res.json({
                            ok: true,
                            data: buildQrStatusPayload(platform, 'OK', { code: authCode, uin: wxid, avatar: headUrl, nickname, retryable: false }),
                        });
                    }

                    const errMsg = (jsRes && jsRes.Message) || (lastError ? lastError.message : 'JSLogin 失败');
                    consoleRef.error(`[Ipad860 JSLogin] 最终失败: ${errMsg}`);
                    return res.json({
                        ok: true,
                        data: buildQrStatusPayload(platform, 'Error', { error: errMsg, retryable: true }, { code, expiresAt }),
                    });
                }

                if (checkRes.Code === -8) {
                    const expiresAt = getQrExpiresAt(platform, checkRes.Data);
                    const errMsg = parseWechatServerError(checkRes);
                    if (errMsg) {
                        consoleRef.error(`[Ipad860] 微信服务器拦截: ${errMsg}`);
                        return res.json({
                            ok: true,
                            data: buildQrStatusPayload(platform, 'Error', { error: `微信拦截: ${errMsg}`, retryable: true }, { code, expiresAt }),
                        });
                    }
                    if (isWechatTransientQrState(checkRes)) {
                        return res.json({
                            ok: true,
                            data: buildQrStatusPayload(platform, 'Wait', { message: '等待扫码' }, { code, expiresAt }),
                        });
                    }
                    return res.json({
                        ok: true,
                        data: buildQrStatusPayload(platform, 'Used', { retryable: true }, { code, expiresAt }),
                    });
                }

                return res.json({
                    ok: true,
                    data: buildQrStatusPayload(platform, 'Wait', {}, { code, expiresAt: getQrExpiresAt(platform, checkRes.Data) }),
                });
            }

            if (platform === 'wx') {
                const thirdPartyCfg = getThirdPartyConfig(store);
                const wxApiKey = thirdPartyCfg.wxApiKey || configRef.wxApiKey;
                const wxApiUrl = thirdPartyCfg.wxApiUrl || configRef.wxApiUrl;
                const wxAppId = thirdPartyCfg.wxAppId || configRef.wxAppId;

                const wxCheckRes = await requestJsonWithTimeout(
                    { fetchRef, AbortControllerRef, setTimeoutRef, clearTimeoutRef },
                    `${wxApiUrl}?api_key=${encodeURIComponent(wxApiKey)}&action=checkqr`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ uuid: code }),
                    },
                    10000,
                );

                consoleRef.log('[WX checkqr] 完整响应:', JSON.stringify(wxCheckRes));

                if (wxCheckRes.code === 0) {
                    const wxid = (wxCheckRes.data && wxCheckRes.data.wxid)
                        || (wxCheckRes.raw && wxCheckRes.raw.Data && wxCheckRes.raw.Data.wxid)
                        || wxCheckRes.wxid
                        || '';
                    const nickname = (wxCheckRes.data && wxCheckRes.data.nickname)
                        || (wxCheckRes.raw && wxCheckRes.raw.Data && wxCheckRes.raw.Data.nickname)
                        || wxCheckRes.nickname
                        || '';

                    consoleRef.log(`[WX checkqr] 提取到 wxid=${wxid}, nickname=${nickname}`);

                    if (!wxid) {
                        consoleRef.error('[WX checkqr] code=0 但 wxid 为空! 完整 data:', JSON.stringify(wxCheckRes.data), '完整 raw:', JSON.stringify(wxCheckRes.raw));
                        return res.json({ ok: true, data: buildQrStatusPayload(platform, 'Wait', {}, { code }) });
                    }

                    let wxLoginRes = null;
                    let lastError = null;
                    for (let attempt = 1; attempt <= 3; attempt++) {
                        try {
                            wxLoginRes = await requestJsonWithTimeout(
                                { fetchRef, AbortControllerRef, setTimeoutRef, clearTimeoutRef },
                                `${wxApiUrl}?api_key=${encodeURIComponent(wxApiKey)}&action=jslogin`,
                                {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ wxid, appid: wxAppId }),
                                },
                                10000,
                            );

                            consoleRef.log(`[WX jslogin] 第 ${attempt} 次响应:`, JSON.stringify(wxLoginRes));

                            if (wxLoginRes && wxLoginRes.code === 0) {
                                break;
                            }
                        } catch (err) {
                            lastError = err;
                            consoleRef.error(`[WX jslogin] 第 ${attempt} 次失败: ${err.message}`);
                        }
                        if (attempt < 3) {
                            await sleepRef(1000);
                        }
                    }

                    if (wxLoginRes && wxLoginRes.code === 0 && wxLoginRes.data) {
                        const authCode = String(
                            wxLoginRes.data.code
                            || (wxLoginRes.data.raw ? (wxLoginRes.data.raw.code || wxLoginRes.data.raw.Code) : '')
                            || '',
                        );
                        const loginNickname = wxLoginRes.data.nickname || nickname;
                        const loginWxid = wxLoginRes.data.wxid || wxid;
                        consoleRef.log(`[WX jslogin] 登录成功! wxid=${loginWxid}, code=${authCode}, nickname=${loginNickname}`);
                        return res.json({
                            ok: true,
                            data: buildQrStatusPayload(platform, 'OK', { code: authCode, uin: loginWxid, avatar: '', nickname: loginNickname, retryable: false }),
                        });
                    }

                    const errMsg = (wxLoginRes && wxLoginRes.msg) || (lastError ? lastError.message : '获取微信授权失败');
                    consoleRef.error(`[WX jslogin] 最终失败: ${errMsg}`);
                    return res.json({
                        ok: true,
                        data: buildQrStatusPayload(platform, 'Error', { error: errMsg, retryable: true }, { code }),
                    });
                }

                if (wxCheckRes.code === 1 || wxCheckRes.code === -1) {
                    return res.json({ ok: true, data: buildQrStatusPayload(platform, 'Wait', {}, { code }) });
                }
                if (wxCheckRes.code === 2) {
                    return res.json({ ok: true, data: buildQrStatusPayload(platform, 'Used', { retryable: true }, { code }) });
                }
                return res.json({
                    ok: true,
                    data: buildQrStatusPayload(platform, 'Error', { error: wxCheckRes.msg || '异常状态', retryable: true }, { code }),
                });
            }

            const result = await miniProgramLoginSession.queryStatus(code, trimmedUin);

            if (result.status === 'OK') {
                const ticket = result.ticket;
                const qqUin = String(result.uin || '').trim();
                const openId = String(result.openId || '').trim();
                const nickname = String(result.nickname || '').trim();
                const appid = '1112386029';

                const authCode = result.authCode || await miniProgramLoginSession.getAuthCode(ticket, appid);
                if (!authCode) {
                    return res.json({
                        ok: true,
                        data: buildQrStatusPayload('qq', 'Error', { error: '获取 QQ 授权码失败，请重新扫码', retryable: true }, { code }),
                    });
                }
                consoleRef.log(`[QR登录] 代理登录成功, authCode=${authCode ? `${authCode.substring(0, 20)}...` : '空'}`);

                let avatar = String(result.avatar || '').trim();
                if (!avatar && qqUin) {
                    avatar = buildQQUinAvatarUrl(qqUin, 640);
                }
                if (!avatar && openId) {
                    avatar = buildQQOpenIdAvatarUrl(openId, appid, 100);
                }

                return res.json({
                    ok: true,
                    data: buildQrStatusPayload('qq', 'OK', { code: authCode, ticket, uin: qqUin, openId, avatar, nickname, retryable: false }),
                });
            }
            if (result.status === 'Used') {
                return res.json({ ok: true, data: buildQrStatusPayload('qq', 'Used', { retryable: true }, { code }) });
            }
            if (result.status === 'Wait') {
                return res.json({ ok: true, data: buildQrStatusPayload('qq', 'Wait', {}, { code }) });
            }
            return res.json({
                ok: true,
                data: buildQrStatusPayload('qq', 'Error', { error: result.msg, retryable: true }, { code }),
            });
        } catch (e) {
            consoleRef.error('[API /api/qr/check] Error:', e.message);
            return res.status(500).json({ ok: false, error: e.message });
        }
    });
}

module.exports = {
    registerQrRoutes,
};
