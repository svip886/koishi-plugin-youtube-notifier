import { Context, Schema } from 'koishi'
import { SocksProxyAgent } from 'socks-proxy-agent'
import {} from '@koishijs/plugin-proxy-agent'

export const name = 'youtube-notifier'
export const inject = {
  required: ['database'],
  optional: ['notifier'],
}

export interface Config {
  channels: { id: string; targets: string[] }[]
  interval: number
  proxy?: string
  cookie?: string
}

export const Config: Schema<Config> = Schema.object({
  channels: Schema.array(Schema.object({
    id: Schema.string().required().description('YouTube 频道 ID (例如 UC-hM6YJuNYV19LAJg37K9Bw)'),
    targets: Schema.array(Schema.string()).description('推送目标群组 ID'),
  })).description('订阅频道列表'),
  interval: Schema.number().default(60000).description('轮询间隔 (毫秒)'),
  proxy: Schema.string().description('代理服务器地址 (例如 http://127.0.0.1:7890 或 socks5://127.0.0.1:1080)'),
  cookie: Schema.string().description('YouTube Cookie (可选，用于提高稳定性)'),
})

declare module 'koishi' {
  interface Tables {
    youtube_status: YoutubeStatus
  }
  interface Context {
    notifier: Notifier
  }
}

export interface Notifier {
  create(options: { title: string; content: string; target: string }): Promise<void>
}

export interface YoutubeStatus {
  id: string
  lastLiveId: string
  title: string
  author: string
  isLive: boolean
}

interface YoutubeResponse {
  videoDetails?: {
    title?: string
    author?: string
    viewCount?: string
    shortDescription?: string
    isLive?: boolean
    videoId?: string
  }
  liveStreamingDetails?: {
    actualStartTime?: string
    concurrentViewers?: string
  }
  streamingData?: {
    hlsManifestUrl?: string
    formats?: any[]
  }
}

interface ChannelStatus {
  isLive: boolean
  title: string
  author: string
  viewCount: string
  lastLiveId: string
}

async function getChannelStatus(ctx: Context, channelId: string, proxy?: string, cookie?: string): Promise<ChannelStatus> {
  const logger = ctx.logger('youtube-notifier')
  logger.debug(`正在获取频道状态: ${channelId}`)

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  }
  if (cookie) headers['cookie'] = cookie

  try {
    const requestOptions: any = {
      headers,
      timeout: 20000,
    }
    
    // 使用 socks-proxy-agent 处理 SOCKS5 代理
    if (proxy) {
      if (proxy.startsWith('socks5://') || proxy.startsWith('socks://') || proxy.startsWith('socks4://')) {
        const agent = new SocksProxyAgent(proxy)
        requestOptions.httpAgent = agent
        requestOptions.httpsAgent = agent
      } else {
        // HTTP 代理
        requestOptions.proxyAgent = proxy
      }
    }

    const htmlContent = await ctx.http.get(`https://www.youtube.com/channel/${channelId}/live`, requestOptions)

    // 提取 ytInitialPlayerResponse 对象
    const match = htmlContent.match(/var ytInitialPlayerResponse\s*=\{([\s\S]*?)\};/m)
    if (!match) {
      logger.debug(`频道 ${channelId} 未找到 ytInitialPlayerResponse，可能不在直播`)
      return { isLive: false, title: '', author: '', viewCount: '', lastLiveId: '' }
    }

    try {
      const data: YoutubeResponse = JSON.parse(`{${match[1]}}`)
      
      const isLive = data.videoDetails?.isLive === true || !!(data.streamingData?.hlsManifestUrl)
      
      // 获取视频ID
      const canonicalMatch = htmlContent.match(/link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([^ "]+)"/)
      const lastLiveId = canonicalMatch ? canonicalMatch[1] : data.videoDetails?.videoId || ''

      logger.info(`频道 ${channelId} 状态: isLive=${isLive}, title=${data.videoDetails?.title || ''}`)
      
      return {
        isLive,
        title: data.videoDetails?.title || '',
        author: data.videoDetails?.author || '',
        viewCount: data.videoDetails?.viewCount || '',
        lastLiveId
      }
    } catch (e) {
      logger.debug(`频道 ${channelId} JSON 解析失败，可能不在直播`)
      return { isLive: false, title: '', author: '', viewCount: '', lastLiveId: '' }
    }
  } catch (e) {
    logger.error(`频道 ${channelId} 状态获取失败:`, e)
    throw e
  }
}

export function apply(ctx: Context, config: Config) {
  ctx.model.extend('youtube_status', {
    id: 'string',
    lastLiveId: 'string',
    title: 'string',
    author: 'string',
    isLive: 'boolean',
  }, {
    primary: 'id',
  })

  ctx.on('ready', async () => {
    const logger = ctx.logger('youtube-notifier')

    // 代理可用性检测
    if (config.proxy) {
      try {
        await ctx.http.get('https://www.youtube.com', {
          proxyAgent: config.proxy,
          timeout: 10000,
        })
        logger.info(`代理检测成功: ${config.proxy}`)
      } catch (e) {
        logger.warn(`代理检测失败: ${config.proxy}, 请检查代理配置或网络环境`)
      }
    }

    if (!config.channels.length) {
      logger.warn('未配置任何订阅频道，监控任务未启动。')
      return
    }

    const sendMessage = async (targets: string[], title: string, content: string) => {
      const message = `[${title}]\n${content}`
      
      // 1. 尝试使用标准的广播 (Koishi 推荐方式)
      try {
        await ctx.broadcast(targets, message)
        logger.info(`已尝试通过广播推送至: ${targets.join(', ')}`)
      } catch (e) {
        logger.error(`广播推送过程中出现错误:`, e)
      }

      // 2. 如果有 notifier 服务，尝试通过它推送
      if (ctx.notifier) {
        for (const target of targets) {
          try {
            await ctx.notifier.create({ title, content, target })
            logger.info(`已尝试通过 notifier 推送至: ${target}`)
          } catch (e) {
            logger.debug(`Notifier 推送跳过或失败 [${target}]: ${(e as any).message}`)
          }
        }
      }

      // 3. 降级方案：模仿参考代码，直接找在线 bot 发送 (解决不带前缀的 ID 问题)
      const bot = ctx.bots.find(b => (b.status as any) === 'online' || (b.status as any) === 1) || ctx.bots[0]
      if (bot) {
        for (const target of targets) {
          try {
            // 如果 ID 不含冒号，通常 bot.sendMessage 能直接处理
            await bot.sendMessage(target, message)
            logger.info(`已尝试通过 Bot(${bot.platform}) 直接推送至: ${target}`)
          } catch (e) {
            logger.debug(`Bot 直接推送跳过或失败 [${target}]: ${(e as any).message}`)
          }
        }
      }
    }

    const check = async () => {
      const startTime = Date.now()
      logger.debug('开始执行轮询检查...')
      for (const channelConfig of config.channels) {
        try {
          const current = await getChannelStatus(ctx, channelConfig.id, config.proxy)
          const [saved] = await ctx.database.get('youtube_status', { id: channelConfig.id })

          if (!saved) {
            logger.info(`首次监控频道 ${channelConfig.id}，正在初始化数据`)
            await ctx.database.create('youtube_status', {
              id: channelConfig.id,
              ...current
            })
            continue
          }

          logger.debug(`频道 ${channelConfig.id} 对比: 当前(isLive=${current.isLive}, liveId=${current.lastLiveId}), 缓存(isLive=${saved.isLive}, liveId=${saved.lastLiveId})`)

          // 开播状态变更提醒
          if (current.isLive && (!saved.isLive || current.lastLiveId !== saved.lastLiveId)) {
            logger.info(`检测到频道 ${channelConfig.id} 正在直播: ${current.lastLiveId}`)
            const content = `主播: ${current.author}\n标题: ${current.title}\n观看人数: ${current.viewCount}\n传送门: https://www.youtube.com/watch?v=${current.lastLiveId}`
            await sendMessage(
              channelConfig.targets,
              `YouTube 开播提醒 - ${current.author}`,
              content
            )
          }

          // 标题更新提醒 (开播时)
          if (current.isLive && current.title && current.title !== saved.title) {
            logger.info(`检测到频道 ${channelConfig.id} 标题变更: ${current.title}`)
            const content = `新标题: ${current.title}\n观看人数: ${current.viewCount}\n传送门: https://www.youtube.com/watch?v=${current.lastLiveId}`
            await sendMessage(
              channelConfig.targets,
              `YouTube 直播更新 - ${current.author}`,
              content
            )
          }

          // 更新数据库记录
          await ctx.database.set('youtube_status', channelConfig.id, {
            id: channelConfig.id,
            lastLiveId: current.lastLiveId,
            title: current.title,
            author: current.author,
            isLive: current.isLive
          })
        } catch (e) {
          logger.error(`检查频道 ${channelConfig.id} 失败:`, e)
        }
      }
      logger.debug(`轮询检查完成，耗时 ${Date.now() - startTime}ms`)
    }

    // 立即执行一次
    logger.info(`已启动监控任务，订阅频道数量: ${config.channels.length}，轮询间隔: ${config.interval}ms`)
    check()

    const timer = setInterval(check, config.interval)

    ctx.on('dispose', () => {
      logger.info('正在停止监控任务...')
      clearInterval(timer)
    })
  })
}
