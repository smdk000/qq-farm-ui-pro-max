# QQ 农场智能助手 - API 接口文档

> 版本：v1.0  
> 更新日期：2026-03-01  
> 基础 URL: `http://localhost:3000/api`

---

## 📋 目录

- [概述](#概述)
- [认证机制](#认证机制)
- [账号管理 API](#账号管理-api)
- [用户管理 API](#用户管理-api)
- [卡密管理 API](#卡密管理-api)
- [农场操作 API](#农场操作-api)
- [日志与监控 API](#日志与监控-api)
- [配置管理 API](#配置管理-api)
- [错误处理](#错误处理)

---

## 📖 概述

### 基本信息

- **协议**: HTTP/HTTPS
- **数据格式**: JSON
- **字符编码**: UTF-8
- **认证方式**: Token 认证（X-Admin-Token）

### 基础 URL

**开发环境:**
```
http://localhost:3000/api
```

**生产环境:**
```
http://your-domain.com/api
```

### 通用响应格式

**成功响应:**
```json
{
  "ok": true,
  "data": {
    // 具体数据
  }
}
```

**错误响应:**
```json
{
  "ok": false,
  "error": "错误信息"
}
```

---

## 🔐 认证机制

### Token 认证

所有需要认证的接口需要在请求头中携带 Token：

```
X-Admin-Token: your-token-here
```

### 获取 Token

**接口:** `POST /login`

**请求:**
```json
{
  "username": "admin",
  "password": "admin"
}
```

**响应:**
```json
{
  "ok": true,
  "data": {
    "token": "abc123...",
    "user": {
      "username": "admin",
      "role": "admin",
      "card": null
    }
  }
}
```

### 账号所有权验证

操作特定账号时，需要在请求头中添加：

```
X-Account-ID: account-id-here
```

---

## 👤 账号管理 API

### 获取账号列表

**接口:** `GET /accounts`

**认证:** ✅ 需要

**响应:**
```json
{
  "ok": true,
  "data": {
    "accounts": [
      {
        "id": "123456",
        "qid": "123456",
        "remark": "主账号",
        "username": "user1",
        "isOnline": true,
        "lastOnlineTime": 1709280000000
      }
    ]
  }
}
```

---

### 添加账号

**接口:** `POST /accounts`

**认证:** ✅ 需要

**请求:**
```json
{
  "qid": "123456",
  "password": "password123",
  "remark": "主账号"
}
```

**响应:**
```json
{
  "ok": true,
  "data": {
    "id": "123456",
    "qid": "123456",
    "remark": "主账号"
  }
}
```

---

### 更新账号

**接口:** `PUT /accounts/:id`

**认证:** ✅ 需要

**请求:**
```json
{
  "remark": "更新后的备注",
  "password": "新密码（可选）"
}
```

**响应:**
```json
{
  "ok": true
}
```

---

### 删除账号

**接口:** `DELETE /accounts/:id`

**认证:** ✅ 需要

**响应:**
```json
{
  "ok": true
}
```

---

### 启动账号

**接口:** `POST /accounts/:id/start`

**认证:** ✅ 需要

**响应:**
```json
{
  "ok": true
}
```

---

### 停止账号

**接口:** `POST /accounts/:id/stop`

**认证:** ✅ 需要

**响应:**
```json
{
  "ok": true
}
```

---

### 获取账号状态

**接口:** `GET /status`

**认证:** ✅ 需要  
**Header:** `X-Account-ID: account-id`

**响应:**
```json
{
  "ok": true,
  "data": {
    "status": {
      "level": 10,
      "exp": 5000,
      "coins": 10000,
      "lands": [
        {
          "landId": 1,
          "cropId": 101,
          "phase": 3,
          "growTime": 3600
        }
      ]
    },
    "levelProgress": {
      "currentLevelExp": 5000,
      "nextLevelExp": 6000,
      "progress": 0.83
    }
  }
}
```

---

### 获取农场详情

**接口:** `GET /farm`

**认证:** ✅ 需要  
**Header:** `X-Account-ID: account-id`

**响应:**
```json
{
  "ok": true,
  "data": {
    "lands": [
      {
        "id": 1,
        "cropId": 101,
        "cropName": "胡萝卜",
        "phase": 3,
        "phaseName": "成熟",
        "growTime": 0,
        "totalGrowTime": 7200,
        "isDead": false,
        "isWeeded": true,
        "isWatered": true
      }
    ]
  }
}
```

---

### 获取好友列表

**接口:** `GET /friends`

**认证:** ✅ 需要  
**Header:** `X-Account-ID: account-id`

**响应:**
```json
{
  "ok": true,
  "data": {
    "friends": [
      {
        "gid": "789012",
        "nickname": "好友 A",
        "level": 15,
        "stealCount": 5,
        "canSteal": true
      }
    ]
  }
}
```

---

### 获取背包物品

**接口:** `GET /bag`

**认证:** ✅ 需要  
**Header:** `X-Account-ID: account-id`

**响应:**
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": 1001,
        "name": "普通肥料",
        "count": 50,
        "type": "fertilizer"
      },
      {
        "id": 1002,
        "name": "有机肥料",
        "count": 20,
        "type": "fertilizer"
      }
    ]
  }
}
```

---

## 👥 用户管理 API

### 用户注册

**接口:** `POST /auth/register`

**认证:** ❌ 不需要

**请求:**
```json
{
  "username": "newuser",
  "password": "password123",
  "cardCode": "CARD-XXXX-XXXX"
}
```

**响应:**
```json
{
  "ok": true,
  "data": {
    "token": "abc123...",
    "user": {
      "username": "newuser",
      "role": "user",
      "card": {
        "type": "M",
        "expiresAt": 1711872000000
      }
    }
  }
}
```

---

### 获取用户列表（仅管理员）

**接口:** `GET /users`

**认证:** ✅ 需要（管理员）

**响应:**
```json
{
  "ok": true,
  "data": {
    "users": [
      {
        "id": 1,
        "username": "user1",
        "role": "user",
        "createdAt": 1709280000000,
        "card": {
          "type": "M",
          "expiresAt": 1711872000000,
          "enabled": true
        }
      }
    ]
  }
}
```

---

### 更新用户（仅管理员）

**接口:** `PUT /users/:id`

**认证:** ✅ 需要（管理员）

**请求:**
```json
{
  "enabled": true,
  "expiresAt": 1714464000000
}
```

**响应:**
```json
{
  "ok": true
}
```

---

### 删除用户（仅管理员）

**接口:** `DELETE /users/:id`

**认证:** ✅ 需要（管理员）

**响应:**
```json
{
  "ok": true
}
```

---

## 💳 卡密管理 API

### 生成卡密（仅管理员）

**接口:** `POST /cards/generate`

**认证:** ✅ 需要（管理员）

**请求:**
```json
{
  "type": "M",
  "days": 30,
  "count": 10
}
```

**响应:**
```json
{
  "ok": true,
  "data": {
    "cards": [
      "CARD-XXXX-XXXX-1",
      "CARD-XXXX-XXXX-2"
    ]
  }
}
```

**卡密类型说明:**
- `D` - 天卡（1 天）
- `W` - 周卡（7 天）
- `M` - 月卡（30 天）
- `F` - 永久卡

---

### 获取卡密列表（仅管理员）

**接口:** `GET /cards`

**认证:** ✅ 需要（管理员）

**响应:**
```json
{
  "ok": true,
  "data": {
    "cards": [
      {
        "id": 1,
        "code": "CARD-XXXX-XXXX",
        "type": "M",
        "days": 30,
        "usedBy": null,
        "usedAt": null,
        "enabled": true
      }
    ]
  }
}
```

---

### 验证卡密

**接口:** `POST /cards/verify`

**认证:** ❌ 不需要

**请求:**
```json
{
  "cardCode": "CARD-XXXX-XXXX"
}
```

**响应:**
```json
{
  "ok": true,
  "data": {
    "valid": true,
    "type": "M",
    "days": 30
  }
}
```

---

## 🌾 农场操作 API

### 收获作物

**接口:** `POST /farm/harvest`

**认证:** ✅ 需要  
**Header:** `X-Account-ID: account-id`

**请求:**
```json
{
  "landIds": [1, 2, 3]
}
```

**响应:**
```json
{
  "ok": true,
  "data": {
    "successCount": 3,
    "items": [
      {
        "landId": 1,
        "cropId": 101,
        "exp": 100,
        "coins": 50
      }
    ]
  }
}
```

---

### 种植作物

**接口:** `POST /farm/plant`

**认证:** ✅ 需要  
**Header:** `X-Account-ID: account-id`

**请求:**
```json
{
  "landIds": [1, 2, 3],
  "seedId": 101
}
```

**响应:**
```json
{
  "ok": true
}
```

---

### 浇水

**接口:** `POST /farm/water`

**认证:** ✅ 需要  
**Header:** `X-Account-ID: account-id`

**请求:**
```json
{
  "landIds": [1, 2, 3]
}
```

**响应:**
```json
{
  "ok": true
}
```

---

### 除草

**接口:** `POST /farm/weed`

**认证:** ✅ 需要  
**Header:** `X-Account-ID: account-id`

**请求:**
```json
{
  "landIds": [1, 2, 3]
}
```

**响应:**
```json
{
  "ok": true
}
```

---

### 除虫

**接口:** `POST /farm/bug`

**认证:** ✅ 需要  
**Header:** `X-Account-ID: account-id`

**请求:**
```json
{
  "landIds": [1, 2, 3]
}
```

**响应:**
```json
{
  "ok": true
}
```

---

### 施肥

**接口:** `POST /farm/fertilize`

**认证:** ✅ 需要  
**Header:** `X-Account-ID: account-id`

**请求:**
```json
{
  "landIds": [1, 2, 3],
  "fertilizerId": 1011
}
```

**响应:**
```json
{
  "ok": true
}
```

---

### 偷菜

**接口:** `POST /friend/steal`

**认证:** ✅ 需要  
**Header:** `X-Account-ID: account-id`

**请求:**
```json
{
  "friendGid": "789012",
  "landIds": [1, 2]
}
```

**响应:**
```json
{
  "ok": true,
  "data": {
    "successCount": 2,
    "items": [
      {
        "cropId": 101,
        "count": 5
      }
    ]
  }
}
```

---

## 📊 日志与监控 API

### 获取实时日志

**接口:** `GET /logs`

**认证:** ✅ 需要

**查询参数:**
- `accountId` - 账号 ID（可选）
- `module` - 模块（farm/friend/task 等）
- `level` - 日志级别（info/warn/error）
- `keyword` - 关键词
- `startTime` - 开始时间（时间戳）
- `endTime` - 结束时间（时间戳）
- `limit` - 数量限制（默认 100）

**请求示例:**
```
GET /logs?module=farm&level=info&limit=50
```

**响应:**
```json
{
  "ok": true,
  "data": {
    "logs": [
      {
        "time": "2026-03-01T10:00:00.000Z",
        "module": "farm",
        "level": "info",
        "msg": "收获作物成功",
        "accountId": "123456",
        "accountName": "主账号"
      }
    ]
  }
}
```

---

### 获取统计数据

**接口:** `GET /stats`

**认证:** ✅ 需要  
**Header:** `X-Account-ID: account-id`

**响应:**
```json
{
  "ok": true,
  "data": {
    "daily": {
      "harvest": 50,
      "plant": 30,
      "water": 100,
      "steal": 20
    },
    "weekly": {
      "harvest": 350,
      "plant": 210,
      "water": 700,
      "steal": 140
    }
  }
}
```

---

### 获取分析数据

**接口:** `GET /analytics/crops`

**认证:** ✅ 需要

**查询参数:**
- `sortBy` - 排序维度（exp/profit/level）
- `order` - 排序方向（asc/desc）

**请求示例:**
```
GET /analytics/crops?sortBy=profit&order=desc
```

**响应:**
```json
{
  "ok": true,
  "data": {
    "crops": [
      {
        "id": 101,
        "name": "胡萝卜",
        "expPerHour": 120,
        "profitPerHour": 50,
        "levelRequired": 1
      }
    ]
  }
}
```

---

## ⚙️ 配置管理 API

### 获取账号配置

**接口:** `GET /accounts/:id/config`

**认证:** ✅ 需要  
**Header:** `X-Account-ID: account-id`

**响应:**
```json
{
  "ok": true,
  "data": {
    "automation": {
      "enabled": true,
      "autoHarvest": true,
      "autoPlant": true,
      "autoWater": true
    },
    "stealFilter": {
      "enabled": true,
      "mode": "blacklist",
      "plantIds": ["101", "102"]
    },
    "quietHours": {
      "enabled": true,
      "start": "22:00",
      "end": "08:00"
    }
  }
}
```

---

### 更新账号配置

**接口:** `PUT /accounts/:id/config`

**认证:** ✅ 需要  
**Header:** `X-Account-ID: account-id`

**请求:**
```json
{
  "automation": {
    "enabled": true,
    "autoHarvest": true
  },
  "stealFilter": {
    "enabled": true,
    "mode": "blacklist",
    "plantIds": ["101", "102", "103"]
  }
}
```

**响应:**
```json
{
  "ok": true
}
```

---

### 获取系统配置

**接口:** `GET /system/config`

**认证:** ✅ 需要（管理员）

**响应:**
```json
{
  "ok": true,
  "data": {
    "version": "3.2.5",
    "adminPasswordSet": true,
    "databaseVersion": 2,
    "workerCount": 2
  }
}
```

---

### 更新系统配置

**接口:** `PUT /system/config`

**认证:** ✅ 需要（管理员）

**请求:**
```json
{
  "ui": {
    "background": "url(...)",
    "logo": "url(...)"
  }
}
```

**响应:**
```json
{
  "ok": true
}
```

---

## ❌ 错误处理

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未认证或 Token 无效 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

### 错误码列表

| 错误码 | 说明 |
|--------|------|
| `Unauthorized` | 未认证 |
| `账号不存在` | 指定的账号 ID 不存在 |
| `无权操作此账号` | 普通用户尝试操作他人账号 |
| `账号已过期` | 用户卡密已过期 |
| `账号已被封禁` | 用户账号被封禁 |
| `卡密无效` | 卡密格式错误或不存在 |
| `卡密已使用` | 卡密已被使用 |
| `账号未运行` | 尝试操作未启动的账号 |
| `API Timeout` | 游戏服务器响应超时 |

### 错误响应示例

```json
{
  "ok": false,
  "error": "账号未运行",
  "code": "ACCOUNT_NOT_RUNNING"
}
```

---

## 🔌 WebSocket API

### 实时日志推送

**连接:** `ws://localhost:3000`

**事件:**
- `log:new` - 新日志
- `status:update` - 状态更新
- `account-log:new` - 账号日志

**示例:**
```javascript
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('已连接');
});

socket.on('log:new', (log) => {
  console.log('新日志:', log);
});

socket.on('status:update', (data) => {
  console.log('状态更新:', data);
});
```

---

## 📝 使用示例

### Node.js 示例

```javascript
const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';
let token = '';

// 登录
async function login() {
  const res = await axios.post(`${API_BASE}/login`, {
    username: 'admin',
    password: 'admin'
  });
  token = res.data.data.token;
  console.log('登录成功');
}

// 获取账号列表
async function getAccounts() {
  const res = await axios.get(`${API_BASE}/accounts`, {
    headers: { 'X-Admin-Token': token }
  });
  return res.data.data.accounts;
}

// 启动账号
async function startAccount(accountId) {
  await axios.post(`${API_BASE}/accounts/${accountId}/start`, null, {
    headers: { 'X-Admin-Token': token }
  });
  console.log('账号已启动');
}

// 主流程
(async () => {
  await login();
  const accounts = await getAccounts();
  console.log('账号列表:', accounts);
  
  if (accounts.length > 0) {
    await startAccount(accounts[0].id);
  }
})();
```

---

### Python 示例

```python
import requests

API_BASE = 'http://localhost:3000/api'
token = ''

def login():
    global token
    res = requests.post(f'{API_BASE}/login', json={
        'username': 'admin',
        'password': 'admin'
    })
    token = res.json()['data']['token']
    print('登录成功')

def get_accounts():
    res = requests.get(f'{API_BASE}/accounts', headers={
        'X-Admin-Token': token
    })
    return res.json()['data']['accounts']

def start_account(account_id):
    requests.post(f'{API_BASE}/accounts/{account_id}/start', headers={
        'X-Admin-Token': token
    })
    print('账号已启动')

if __name__ == '__main__':
    login()
    accounts = get_accounts()
    print('账号列表:', accounts)
    
    if accounts:
        start_account(accounts[0]['id'])
```

---

## 📚 相关文档

- [部署指南](./DEPLOYMENT_GUIDE.md)
- [故障排除](./TROUBLESHOOTING.md)
- [配置模板](./CONFIG_TEMPLATES.md)

---

**最后更新**: 2026-03-01  
**维护人员**: QQ 农场智能助手团队
