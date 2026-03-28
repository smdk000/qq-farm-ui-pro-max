const crypto = require('node:crypto');

const { CONFIG } = require('../../config/config');
const { getImportedSyncAllSource, setImportedSyncAllSource } = require('../../models/store');
const { getUserState } = require('../../utils/network');
const { types } = require('../../utils/proto');
const cryptoWasm = require('../../utils/crypto-wasm');
const { log, logWarn } = require('../../utils/utils');

const IMPORT_HEX_MAX_LENGTH = 200000;
const FRIEND_SERVICE_NAME = 'gamepb.friendpb.FriendService';
const SYNC_ALL_METHOD_NAME = 'SyncAll';
const SYNC_ALL_MESSAGE_TYPE = 1;

function createImportError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function normalizeHexInput(input) {
    return String(input || '').replace(/[^0-9a-f]/gi, '');
}

function hexToBuffer(hexRaw) {
    const cleaned = normalizeHexInput(hexRaw);
    if (!cleaned) {
        throw createImportError('FRIEND_SYNC_IMPORT_HEX_EMPTY', '请粘贴完整的好友同步 Hex 数据');
    }
    if (cleaned.length > IMPORT_HEX_MAX_LENGTH) {
        throw createImportError('FRIEND_SYNC_IMPORT_HEX_INVALID', 'Hex 内容过大，请拆分后重试');
    }
    if (cleaned.length % 2 !== 0) {
        throw createImportError('FRIEND_SYNC_IMPORT_HEX_INVALID', 'Hex 长度无效，请确认复制完整');
    }
    return Buffer.from(cleaned, 'hex');
}

function normalizeSyncAllOpenIds(values) {
    const source = Array.isArray(values) ? values : [];
    const normalized = [];
    const seen = new Set();
    for (const item of source) {
        const value = String(item || '').trim().toUpperCase();
        if (!value || value.length > 128) continue;
        if (!/^[0-9A-Z_-]+$/.test(value)) continue;
        if (seen.has(value)) continue;
        seen.add(value);
        normalized.push(value);
    }
    return normalized;
}

async function parseSyncAllRequestHex(hexInput) {
    const wire = hexToBuffer(hexInput);
    let gate = null;
    try {
        gate = types.GateMessage.decode(wire);
    } catch (error) {
        throw createImportError('FRIEND_SYNC_IMPORT_GATE_DECODE_FAILED', '导入数据格式不正确，请确认粘贴的是 QQ 好友同步请求 Hex');
    }

    const meta = gate && gate.meta ? gate.meta : null;
    const serviceName = String(meta && meta.service_name || '').trim();
    const methodName = String(meta && meta.method_name || '').trim();
    const messageType = Number(meta && meta.message_type || 0);

    if (String(CONFIG.platform || '').trim().toLowerCase() !== 'qq') {
        throw createImportError('FRIEND_SYNC_IMPORT_QQ_ONLY', '当前功能仅支持 QQ 账号导入好友同步 Hex');
    }

    if (serviceName !== FRIEND_SERVICE_NAME || methodName !== SYNC_ALL_METHOD_NAME || messageType !== SYNC_ALL_MESSAGE_TYPE) {
        const actualTarget = [serviceName || 'unknown_service', methodName || 'unknown_method'].join('.');
        throw createImportError(
            'FRIEND_SYNC_IMPORT_NOT_SYNCALL_REQUEST',
            `当前导入内容是 ${actualTarget}，不是 ${FRIEND_SERVICE_NAME}.${SYNC_ALL_METHOD_NAME}，请重新抓取“好友 SyncAll 请求”后再导入`,
        );
    }

    let decrypted = null;
    try {
        decrypted = await cryptoWasm.decryptBuffer(gate.body);
    } catch (error) {
        throw createImportError('FRIEND_SYNC_IMPORT_DECRYPT_FAILED', '导入数据无法识别，请确认数据完整且来自当前版本的好友同步请求');
    }

    let request = null;
    try {
        request = types.SyncAllFriendsRequest.decode(decrypted);
    } catch (error) {
        throw createImportError('FRIEND_SYNC_IMPORT_PROTO_DECODE_FAILED', '导入数据内容损坏或不完整，请重新复制一次完整数据后再试');
    }

    const requestObject = types.SyncAllFriendsRequest.toObject(request, {
        longs: String,
        bytes: String,
        arrays: true,
        objects: true,
    });
    const openIds = normalizeSyncAllOpenIds(requestObject.open_ids);
    if (openIds.length === 0) {
        throw createImportError('FRIEND_SYNC_IMPORT_OPEN_IDS_EMPTY', '这份数据里没有解析到可用的好友标识 open_id');
    }

    return {
        openIds,
        meta: {
            serviceName,
            methodName,
            messageType,
            clientSeq: Number(meta && meta.client_seq || 0),
            serverSeq: Number(meta && meta.server_seq || 0),
            wireBytes: wire.length,
            bodyBytes: decrypted.length,
        },
    };
}

async function importFriendsByHex(hexInput) {
    const userState = getUserState();
    const accountId = String((userState && userState.accountId) || CONFIG.accountId || process.env.FARM_ACCOUNT_ID || '').trim();
    if (!accountId) {
        throw createImportError('FRIEND_SYNC_IMPORT_CONTEXT_MISSING', '当前账号上下文缺失，无法导入好友同步 Hex');
    }

    const normalizedHex = normalizeHexInput(hexInput);
    log('好友', `收到好友 SyncAll Hex 导入请求`, {
        module: 'friend',
        event: 'friend_syncall_import',
        result: 'received',
        accountId,
        hexLength: normalizedHex.length,
    });

    let parsed = null;
    try {
        parsed = await parseSyncAllRequestHex(hexInput);
    } catch (error) {
        logWarn('好友', `好友 SyncAll Hex 导入失败: ${error.message || error}`, {
            module: 'friend',
            event: 'friend_syncall_import',
            result: 'failed',
            accountId,
            errorCode: String(error && error.code || '').trim() || undefined,
        });
        throw error;
    }

    log('好友', `好友 SyncAll Hex 解析成功：识别到 ${parsed.openIds.length} 个 open_id`, {
        module: 'friend',
        event: 'friend_syncall_import',
        result: 'parsed',
        accountId,
        openIdCount: parsed.openIds.length,
        serviceName: parsed.meta.serviceName,
        methodName: parsed.meta.methodName,
    });

    const timestamp = Date.now();
    const previous = getImportedSyncAllSource(accountId);
    const nextSource = {
        ...previous,
        active: true,
        sourceHash: crypto.createHash('sha1').update(normalizedHex).digest('hex'),
        openIds: parsed.openIds,
        openIdCount: parsed.openIds.length,
        importedAt: previous.importedAt || timestamp,
        updatedAt: timestamp,
        lastErrorCode: '',
        meta: parsed.meta,
    };
    const stored = setImportedSyncAllSource(accountId, nextSource);

    log('好友', `好友 SyncAll 导入源已保存到当前账号`, {
        module: 'friend',
        event: 'friend_syncall_import',
        result: 'stored',
        accountId,
        openIdCount: stored.openIdCount,
        active: stored.active,
    });

    return {
        ok: true,
        source: stored,
        results: {
            success: parsed.openIds.slice(0, 20).map(openId => ({
                openId,
                message: '已导入并启用 SyncAll 好友同步源',
            })),
            skipped: [],
            total: parsed.openIds.length,
            successCount: parsed.openIds.length,
            skippedCount: 0,
        },
        meta: {
            importOpenIdCount: parsed.openIds.length,
            syncSource: 'imported_syncall',
            parsedMeta: parsed.meta,
        },
    };
}

module.exports = {
    importFriendsByHex,
    parseSyncAllRequestHex,
    normalizeSyncAllOpenIds,
};
