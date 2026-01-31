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

### 2.0.0

- **重大重构**：移除 Puppeteer 依赖，改用轻量级 HTTP 方案
  - 资源占用降低 90% 以上
  - 检测速度提升 10 倍（< 2秒 vs > 20秒）
  - 移植自 [fideo-live-record](https://github.com/chenfan0/fideo-live-record) 的解析逻辑
- **功能增强**：新增丰富的直播信息推送（主播名、标题、观看人数）
- **新增配置**：增加 `cookie` 配置项用于提高 API 稳定性

## 仓库地址

[GitHub Repository](https://github.com/svip886/koishi-plugin-youtube-notifier.git)
