
const { createScheduler } = require('../scheduler');

const state = {
    isCheckingFriends: false,
    friendLoopRunning: false,
    externalSchedulerMode: false,
    lastResetDate: '',
    friendScheduler: createScheduler('friend'),
    activeStakeouts: new Map(),
    MAX_STAKEOUT_AHEAD_SEC: 4 * 3600,
    operationLimits: new Map(),
    OP_NAMES: {
        10001: '收获', 10002: '铲除', 10003: '放草', 10004: '放虫',
        10005: '除草', 10006: '除虫', 10007: '浇水', 10008: '偷菜',
    },
    canGetHelpExp: true,
    helpAutoDisabledByLimit: false,
    filterStats: { friendBlacklist: 0, friendWhitelist: 0, plantBlacklist: 0, plantWhitelist: 0, banned: 0 }
};

module.exports = state;
