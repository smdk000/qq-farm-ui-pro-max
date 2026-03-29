const test = require('node:test');
const assert = require('node:assert/strict');

const WeChatPlatform = require('../src/platform/WeChatPlatform');

test('WeChatPlatform no longer disables auto steal solely by wx_car platform identity', () => {
    const platform = new WeChatPlatform('wx_car');

    assert.equal(platform.allowSyncAll(), false);
    assert.equal(platform.allowAutoSteal(), true);
});
