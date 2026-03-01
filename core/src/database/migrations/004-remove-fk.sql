-- 004-remove-fk.sql
-- 移除 account_friends_cache 表的外键约束，防止因为 accounts 表数据未同步而导致更新崩溃

PRAGMA foreign_keys = off;

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS account_friends_cache_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL, -- 所属账号ID
    friend_gid TEXT NOT NULL, -- 好友的 GID
    friend_uin TEXT, -- 好友的 UIN (QQ号)
    name TEXT, -- 好友昵称或备注名
    avatar_url TEXT, -- 好友头像链接
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- 缓存更新日期
    UNIQUE (account_id, friend_gid)
);

INSERT INTO
    account_friends_cache_new
SELECT *
FROM account_friends_cache;

DROP TABLE account_friends_cache;

ALTER TABLE account_friends_cache_new
RENAME TO account_friends_cache;

CREATE INDEX IF NOT EXISTS idx_account_friends_cache_account_id ON account_friends_cache (account_id);

COMMIT;

PRAGMA foreign_keys = on;