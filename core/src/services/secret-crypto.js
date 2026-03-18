const crypto = require('node:crypto');
const fs = require('node:fs');
const { ensureDataDir, getDataFile } = require('../config/runtime-paths');
const { createModuleLogger } = require('./logger');

const logger = createModuleLogger('secret-crypto');
const SECRET_FILE = getDataFile('.config-secret');
const SECRET_PREFIX = 'enc:v1:';

let cachedSecretKey = null;

function readSecretKeyFromFile() {
    try {
        if (!fs.existsSync(SECRET_FILE)) {
            return null;
        }
        const stored = fs.readFileSync(SECRET_FILE, 'utf8').trim();
        if (/^[0-9a-f]{64}$/i.test(stored)) {
            try {
                fs.chmodSync(SECRET_FILE, 0o600);
            } catch {
                // ignore chmod failures on unsupported platforms
            }
            return Buffer.from(stored, 'hex');
        }
    } catch (error) {
        logger.warn(`读取本地配置密钥失败: ${error.message}`);
    }
    return null;
}

function generateSecretKey() {
    ensureDataDir();
    const secret = crypto.randomBytes(32);
    try {
        fs.writeFileSync(SECRET_FILE, secret.toString('hex'), { mode: 0o600 });
    } catch (error) {
        logger.warn(`写入本地配置密钥失败，将仅保留当前进程内存密钥: ${error.message}`);
    }
    return secret;
}

function getSecretKey() {
    if (cachedSecretKey) {
        return cachedSecretKey;
    }
    cachedSecretKey = readSecretKeyFromFile() || generateSecretKey();
    return cachedSecretKey;
}

function isEncryptedSecretValue(value) {
    return String(value || '').startsWith(SECRET_PREFIX);
}

function encryptSecretValue(value) {
    const plainText = String(value || '').trim();
    if (!plainText) {
        return '';
    }
    if (isEncryptedSecretValue(plainText)) {
        return plainText;
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getSecretKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${SECRET_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSecretValue(value) {
    const raw = String(value || '').trim();
    if (!raw) {
        return '';
    }
    if (!isEncryptedSecretValue(raw)) {
        return raw;
    }

    const encoded = raw.slice(SECRET_PREFIX.length);
    const [ivHex, tagHex, encryptedHex] = encoded.split(':');
    if (!ivHex || !tagHex || !encryptedHex) {
        return '';
    }

    try {
        const decipher = crypto.createDecipheriv(
            'aes-256-gcm',
            getSecretKey(),
            Buffer.from(ivHex, 'hex'),
        );
        decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(encryptedHex, 'hex')),
            decipher.final(),
        ]);
        return decrypted.toString('utf8').trim();
    } catch (error) {
        logger.warn(`解密本地配置密钥失败，将回退为空值: ${error.message}`);
        return '';
    }
}

module.exports = {
    encryptSecretValue,
    decryptSecretValue,
    isEncryptedSecretValue,
    SECRET_PREFIX,
};
