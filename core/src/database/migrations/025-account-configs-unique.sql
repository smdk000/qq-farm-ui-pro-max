-- 025-account-configs-unique.sql
-- 清理 account_configs 历史重复记录，并确保每个账号只有一条配置

DELETE c1
FROM account_configs c1
INNER JOIN account_configs c2
    ON c1.account_id = c2.account_id
   AND (
        c1.updated_at < c2.updated_at
        OR (c1.updated_at = c2.updated_at AND c1.id < c2.id)
   );

ALTER TABLE account_configs
ADD UNIQUE INDEX uniq_account_configs_account_id (account_id);
