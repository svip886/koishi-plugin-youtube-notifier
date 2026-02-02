# koishi-plugin-youtube-notifier

[![npm](https://img.shields.io/npm/v/koishi-plugin-youtube-notifier?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-youtube-notifier)
[![GitHub](https://img.shields.io/github/license/svip886/koishi-plugin-youtube-notifier?style=flat-square)](https://github.com/svip886/koishi-plugin-youtube-notifier/blob/main/LICENSE)

YouTube 频道直播开播提醒插件，采用轻量级 HTTP 方案，参考 fideo-live-record 实现。

## 功能特性

- **轻量高效**：基于 HTTP 请求 + HTML 解析，无需 Puppeteer，资源占用降低 90% 以上
- **极速响应**：单次检测耗时 < 2 秒（代理环境下 < 5 秒）
- **多频道监控**：支持同时监控多个 YouTube 频道的直播状态
- **信息丰富**：可获取主播名称、直播标题、观看人数等详细信息
- **多平台推送**：支持将消息推送到自定义的群组
- **自定义代理**：支持配置 HTTP/SOCKS 代理，解决国内环境网络访问问题
- **Notifier 集成**：支持 Koishi 的 `notifier` 服务，提供更好的通知展示
- **状态持久化**：使用数据库记录上次推送状态，防止重复通知

## 安装

```bash
npm install koishi-plugin-youtube-notifier
```

## 配置项

| 参数 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `channels` | `array` | `[]` | 订阅频道列表，包含 `id` (频道ID) 和 `targets` (推送群组ID列表) |
| `interval` | `number` | `60000` | 轮询间隔（毫秒），默认为 1 分钟 |
| `proxy` | `string` | - | 代理服务器地址，例如 `http://127.0.0.1:7890` 或 `socks5://127.0.0.1:1080` |
| `cookie` | `string` | - | YouTube Cookie (可选，用于提高稳定性) |

## 依赖项

本插件需要以下服务支持：
- `database`: 用于状态持久化
- `notifier` (可选): 用于结构化通知

## 开源协议

MIT License.

## 更新日志

### 2.0.18

- **回滚**：撤销 v2.0.16/v2.0.17 的不稳定改动
- **恢复**：回到经过验证的 v2.0.13 逻辑
- **特性**：多重备选直播检测方案（canonical、ytInitialPlayerResponse、标记检测）

### 2.0.15

- **修复**：移除观看人数统计（YouTube HTML不提供实时数据）
- **改进**：开播时间改为本地统计，第一次发现直播时记录
- **改进**：日期格式改为详细格式 (2026-02-02 11:06:33)

### 2.0.13

- **修复**：开播时间强制使用北京时间 (Asia/Shanghai)

### 2.0.12

- **修复**：正则表达式添加 `\s*=` 允许等号两边有空格
- **调试**：添加更多日志输出，便于定位问题

### 2.0.11

- **调试**：将所有日志级别从 debug 改为 info，便于定位问题
- **优化**：减少超时时间到 15 秒，减少重试次数到 2 次

### 2.0.10

- **修复**：添加 `viewCount` 字段到数据库模型

### 2.0.9

- **调试**：添加更多调试日志以定位代理请求问题

### 2.0.8 (未发布)

- **调试**：添加更多调试日志以定位代理请求问题

### 2.0.7

- **重大修复**：移除 `socks-proxy-agent`，直接使用 Koishi 的 `proxyAgent` 配置代理
- **优化**：移除外部依赖（axios、socks-proxy-agent），完全依赖 Koishi 内置 HTTP 插件

### 2.0.6

- **修复**：数据库更新时移除 `id` 字段，解决 `cannot modify primary key` 错误

### 2.0.5

- **优化**：超时时间从 20 秒增加到 30 秒
- **优化**：添加自动重试机制（最多 3 次，间隔 1 秒）
- **优化**：请求失败时返回离线状态，避免中断轮询

### 2.0.4

- **新增**：开播时间使用 24 小时制显示（如 `14:30`）
- **新增**：每 30 分钟提醒一次正在直播（显示已直播时长）
- **新增**：直播结束提醒显示总时长（如 `2小时30分钟`）

### 2.0.3

- **新增**：显示开播时间信息（如 `89 分钟前开始串流`）
- **新增**：直播结束提醒（检测到 `isLive` 从 `true` 变为 `false` 时触发）
- **优化**：保存 `dateText` 和 `liveStartTime` 到数据库

### 2.0.2

- **修复**：使用 `socks-proxy-agent` 正确处理 SOCKS5 代理，解决协议不匹配问题
- **优化**：改进正则表达式匹配逻辑，提高 JSON 解析成功率
- **优化**：优先使用 `videoDetails.isLive` 判定直播状态，增加备用 videoId 获取方案

### 2.0.0

- **重大重构**：移除 Puppeteer 依赖，改用轻量级 HTTP 方案
  - 资源占用降低 90% 以上
  - 检测速度提升 10 倍（< 2秒 vs > 20秒）
  - 移植自 [fideo-live-record](https://github.com/chenfan0/fideo-live-record) 的解析逻辑
- **功能增强**：新增丰富的直播信息推送（主播名、标题、观看人数）
- **新增配置**：增加 `cookie` 配置项用于提高 API 稳定性

## 仓库地址

[GitHub Repository](https://github.com/svip886/koishi-plugin-youtube-notifier.git)
