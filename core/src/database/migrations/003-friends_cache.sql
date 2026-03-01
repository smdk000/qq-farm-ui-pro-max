-- QQ 农场机器人数据库迁移脚本
-- 003-friends_cache.sql
-- 日期：2026-03-01
-- 说明：创建好友信息缓存表，用于降低获取好友列表的风控压力并加速前端渲染。

CREATE TABLE IF NOT EXISTS account_friends_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL, -- 所属账号ID
    friend_gid TEXT NOT NULL, -- 好友的 GID
    friend_uin TEXT, -- 好友的 UIN (QQ号)
    name TEXT, -- 好友昵称或备注名
    avatar_url TEXT, -- 好友头像链接
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- 缓存更新日期
    UNIQUE (account_id, friend_gid)
);

CREATE INDEX IF NOT EXISTS idx_account_friends_cache_account_id ON account_friends_cache (account_id);