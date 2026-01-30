# koishi-plugin-youtube-notifier

[![npm](https://img.shields.io/npm/v/koishi-plugin-youtube-notifier?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-youtube-notifier)
[![GitHub](https://img.shields.io/github/license/svip886/koishi-plugin-youtube-notifier?style=flat-square)](https://github.com/svip886/koishi-plugin-youtube-notifier/blob/main/LICENSE)

YouTube 频道动态与直播开播提醒插件，支持 Puppeteer 抓取、数据库持久化及自定义代理。

## 功能特性

- **多频道监控**：支持同时监控多个 YouTube 频道的社区动态和直播状态。
- **多平台推送**：支持将消息推送到自定义的群组。
- **Puppeteer 驱动**：使用 Puppeteer 进行页面解析，支持复杂的页面渲染。
- **自定义代理**：支持配置 HTTP 代理，解决国内环境网络访问问题。
- **Notifier 集成**：支持 Koishi 的 `notifier` 服务，提供更好的通知展示。
- **状态持久化**：使用数据库记录上次推送状态，防止重复通知。

## 安装

```bash
npm install koishi-plugin-youtube-notifier
```

## 配置项

| 参数 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `channels` | `array` | `[]` | 订阅频道列表，包含 `id` (频道ID) 和 `targets` (推送群组ID列表) |
| `interval` | `number` | `300000` | 轮询间隔（毫秒），默认为 5 分钟 |
| `proxy` | `string` | - | 代理服务器地址，例如 `http://127.0.0.1:7890` |

## 依赖项

本插件需要以下服务支持：
- `puppeteer`: 用于网页抓取
- `database`: 用于状态持久化
- `notifier` (可选): 用于结构化通知

## 开源协议

MIT License.

## 更新日志

### 1.0.0

- 初始版本发布。
- 支持 YouTube 频道社区动态监控。
- 支持 YouTube 直播状态监控。
- 支持 Puppeteer 抓取与自定义代理配置。
- 集成 Koishi 数据库与通知服务。

## 仓库地址

[GitHub Repository](https://github.com/svip886/koishi-plugin-youtube-notifier.git)
