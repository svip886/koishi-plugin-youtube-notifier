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

### 1.1.9

- **修复**：增加了推送函数的 `await` 等待，确保消息能够稳定发出。
- **优化**：增加了详细的推送阶段日志，包含推送目标和发送方式（Notifier 或 Broadcast），方便排查发送失败的问题。

### 1.1.8

- **修复**：改进了直播判定逻辑，结合 Meta 标签与 URL 跳转双重验证，解决部分直播无法正确识别的问题。
- **优化**：增加了对 Cookie 同意弹窗的自动处理，并增加了调试日志显示抓取时的最终 URL。

### 1.1.7

- **优化**：将获取状态的成功反馈日志提升至 `info` 级别，方便直观确认代理抓取结果。
- **优化**：显著缩短了各项超时时间，提升了任务执行效率，并在 `debug` 模式下增加单次轮询的耗时统计。

### 1.1.6

- **优化**：强化了代理应用逻辑，增加了 `--proxy-bypass-list=<-loopback>` 确保所有流量走代理。
- **优化**：增加了浏览器启动时的详细代理日志，方便排查代理是否生效。

### 1.1.5

- **修复**：增加了 `protocolTimeout` 通信超时时间，并禁用了 GPU 和 `/dev/shm` 使用，修复了在某些受限环境下（如 Docker）启动浏览器时出现的 `ProtocolError` 问题。

### 1.1.4

- **优化**：将页面加载等待策略从 `networkidle2` 改为 `domcontentloaded`，并增加了超时重试与资源自动释放逻辑，显著提升了在网络环境较差时的稳定性。

### 1.1.3

- **修复**：针对 Linux root 环境（如 Docker）增加了 `--no-sandbox` 启动参数，修复在此类环境下配置代理时浏览器启动失败的问题。

### 1.1.2

- **修复**：修正了 `executablePath` 为空的错误。现在默认使用共享浏览器实例，仅在配置独立代理时启动新进程，并增加了进程路径回退获取逻辑。

### 1.1.1

- **修复**：增加了对浏览器可执行路径的有效性检查，并提供了更清晰的错误提示。

### 1.1.0

- **优化**：插件启动后立即执行一次检查，不再等待第一个轮询周期。
- **日志**：增加了监控启动、停止及未配置频道时的日志提示。

### 1.0.9

- **调试**：增加了详细的运行日志，方便排查监控失效问题。

### 1.0.8

- **修复**：迁移编译目录至 `lib`，显式声明 `type: commonjs` 并使用 `typings` 字段，完全匹配 Koishi 官方插件标准结构以彻底解决 ESM 加载冲突。

### 1.0.7

- **修复**：显式声明 `"type": "commonjs"` 以彻底解决 ESM 加载冲突。

### 1.0.6

- **回退**：将项目回退为 CommonJS 模式，以解决部分环境下的 `ERR_REQUIRE_ESM` 加载错误。

### 1.0.5

- **重要更新**：项目切换为 ESM (ECMAScript Module) 模式。
- **修复**：修正了 Puppeteer 浏览器启动逻辑，支持正确的 `executablePath` 获取。
- **修复**：修正了 HTTP 代理配置属性名为 `proxyAgent`。
- **优化**：优化了 npm 发布包体积，移除了不必要的源码、配置和缓存文件。
- **安全**：移除了仓库中的 `package-lock.json`。

### 1.0.0

- 初始版本发布。
- 支持 YouTube 频道社区动态监控。
- 支持 YouTube 直播状态监控。
- 支持 Puppeteer 抓取与自定义代理配置。
- 集成 Koishi 数据库与通知服务。

## 仓库地址

[GitHub Repository](https://github.com/svip886/koishi-plugin-youtube-notifier.git)
