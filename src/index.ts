import { Context, Schema } from 'koishi'

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
  dateText: string
  liveStartTime: number
  lastReminderTime: number
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
  dateText?: {
    simpleText?: string
  }
}

interface ChannelStatus {
  isLive: boolean
  title: string
  author: string
  lastLiveId: string
  dateText: string
}

// 格式化时间为详细日期格式（北京时间）
function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// 格式化时间为24小时制（北京时间）
function formatTime24(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false })
}

// 格式化时长（秒 -> 人类可读格式）
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}小时${minutes}分钟`
  }
  return `${minutes}分钟`
}

async function getChannelStatus(ctx: Context, channelId: string, proxy?: string, cookie?: string): Promise<ChannelStatus> {
  const logger = ctx.logger('youtube-notifier')
  logger.info(`开始获取频道状态: ${channelId}`)

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  }
  if (cookie) headers['cookie'] = cookie

  try {
    const requestOptions: any = {
      headers,
      timeout: 15000,
    }

    // 重试机制：最多重试2次
    let htmlContent = ''
    let retries = 0
    const maxRetries = 2
    while (retries < maxRetries) {
      try {
        logger.info(`请求 YouTube (第 ${retries + 1} 次)...`)
        htmlContent = await ctx.http.get(`https://www.youtube.com/channel/${channelId}/live`, requestOptions)
        logger.info(`请求成功，HTML 长度: ${htmlContent.length}`)
        break
      } catch (e) {
        retries++
        if (retries >= maxRetries) {
          logger.warn(`频道 ${channelId} 请求失败: ${(e as any).message}`)
          return { isLive: false, title: '', author: '', lastLiveId: '', dateText: '' }
        }
        logger.info(`第 ${retries} 次重试失败，等待 1 秒`)
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    // 多重备选方案检测直播
    logger.info(`使用多重备选方案检测直播...`)
    
    // 方案1: 查找 canonical videoId
    const canonicalMatch = htmlContent.match(/link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([^ "]+)"/)
    const videoId = canonicalMatch ? canonicalMatch[1] : ''
    
    if (videoId) {
      logger.info(`频道 ${channelId} 找到 videoId: ${videoId}`)
    } else {
      logger.info(`频道 ${channelId} 未找到 videoId，可能不在直播`)
      return { isLive: false, title: '', author: '', lastLiveId: '', dateText: '' }
    }
    
    // 方案2: 查找 ytInitialPlayerResponse（如果存在）
    let isLive = false
    let title = ''
    let author = ''
    
    const playerMatch = htmlContent.match(/var ytInitialPlayerResponse\s*=\s*\{([\s\S]*?)\};/m)
    if (playerMatch) {
      logger.info(`找到 ytInitialPlayerResponse，匹配长度: ${playerMatch[1].length}`)
      try {
        const data: YoutubeResponse = JSON.parse(`{${playerMatch[1]}}`)
        isLive = data.videoDetails?.isLive === true || !!(data.streamingData?.hlsManifestUrl)
        title = data.videoDetails?.title || ''
        author = data.videoDetails?.author || ''
        logger.info(`从 ytInitialPlayerResponse 提取: isLive=${isLive}, title=${title.substring(0, 30)}`)
      } catch (e) {
        logger.info(`ytInitialPlayerResponse JSON 解析失败: ${(e as any).message}`)
      }
    }
    
    // 方案3: 如果 ytInitialPlayerResponse 不可用，查找直播标记
    if (!playerMatch || !title) {
      logger.info(`ytInitialPlayerResponse 不可用或无数据，查找直播标记...`)
      const liveMarkers = [
        htmlContent.includes('"isLive":true'),
        htmlContent.includes('"isLiveContent":true'),
        htmlContent.includes('"isLiveBroadcast":true'),
        htmlContent.includes('class="live-badge'),
        htmlContent.includes('streaming/live'),
      ]
      isLive = liveMarkers.some(m => m)
      logger.info(`直播标记检测: ${isLive ? '有直播' : '无直播标记'}`)
    }
    
    // 方案4: 从 ytInitialData 提取标题和作者
    if (!title) {
      const dataMatch = htmlContent.match(/var ytInitialData = (\{[\s\S]*?\});/)
      if (dataMatch) {
        try {
          const data = JSON.parse(dataMatch[1])
          logger.info(`从 ytInitialData 提取信息...`)
          // 这里可以添加更多提取逻辑
        } catch (e) {
          logger.debug(`ytInitialData 解析失败: ${(e as any).message}`)
        }
      }
    }
    
    logger.info(`频道 ${channelId} 最终状态: isLive=${isLive}, videoId=${videoId}, title=${title.substring(0, 30) || '无'}`)
    
    return {
      isLive,
      title,
      author,
      lastLiveId: videoId,
      dateText: ''
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
    dateText: 'string',
    liveStartTime: 'integer',
    lastReminderTime: 'integer',
  }, {
    primary: 'id',
  })

  ctx.on('ready', async () => {
    const logger = ctx.logger('youtube-notifier')

    // 代理可用性检测
    if (config.proxy) {
      try {
        await ctx.http.get('https://www.youtube.com', {
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
      logger.info('开始执行轮询检查...')
      for (const channelConfig of config.channels) {
        try {
          logger.info(`正在获取频道 ${channelConfig.id} 状态...`)
          const current = await getChannelStatus(ctx, channelConfig.id, config.proxy)
          logger.info(`频道 ${channelConfig.id} 获取完成: isLive=${current.isLive}`)
          
          const [saved] = await ctx.database.get('youtube_status', { id: channelConfig.id })

          if (!saved) {
            logger.info(`首次监控频道 ${channelConfig.id}，正在初始化数据`)
            await ctx.database.create('youtube_status', {
              id: channelConfig.id,
              ...current,
              liveStartTime: current.isLive ? Date.now() : 0
            })
            continue
          }

          logger.debug(`频道 ${channelConfig.id} 对比: 当前(isLive=${current.isLive}, liveId=${current.lastLiveId}), 缓存(isLive=${saved.isLive}, liveId=${saved.lastLiveId})`)

          // 开播状态变更提醒
          if (current.isLive && (!saved.isLive || current.lastLiveId !== saved.lastLiveId)) {
            logger.info(`检测到频道 ${channelConfig.id} 正在直播: ${current.lastLiveId}`)
            const startDateTime = formatDateTime(saved.liveStartTime || Date.now())
            const content = `主播: ${current.author}
标题: ${current.title}
开播时间: ${startDateTime}
传送门: https://www.youtube.com/watch?v=${current.lastLiveId}`
            await sendMessage(
              channelConfig.targets,
              `YouTube 开播提醒 - ${current.author}`,
              content
            )
          }

          // 每30分钟提醒一次正在直播
          if (current.isLive && saved.isLive && saved.liveStartTime) {
            const timeSinceLastReminder = Date.now() - (saved.lastReminderTime || saved.liveStartTime)
            if (timeSinceLastReminder >= 30 * 60 * 1000) {
              logger.info(`频道 ${channelConfig.id} 直播进行中，已开播 ${formatDuration(Math.floor((Date.now() - saved.liveStartTime) / 1000))}`)
              const content = `直播仍在进行中
开播时间: ${formatDateTime(saved.liveStartTime)}
已直播: ${formatDuration(Math.floor((Date.now() - saved.liveStartTime) / 1000))}
传送门: https://www.youtube.com/watch?v=${current.lastLiveId}`
              await sendMessage(
                channelConfig.targets,
                `YouTube 直播进行中 - ${current.author}`,
                content
              )
            }
          }

          // 直播结束提醒
          if (!current.isLive && saved.isLive && saved.liveStartTime) {
            logger.info(`检测到频道 ${channelConfig.id} 直播已结束`)
            const duration = Math.floor((Date.now() - saved.liveStartTime) / 1000)
            const content = `直播已结束
总时长: ${formatDuration(duration)}
最后标题: ${saved.title}`
            await sendMessage(
              channelConfig.targets,
              `YouTube 直播结束 - ${saved.author}`,
              content
            )
          }

          // 标题更新提醒 (开播时)
          if (current.isLive && current.title && saved.title && current.title !== saved.title) {
            logger.info(`检测到频道 ${channelConfig.id} 标题变更: ${current.title}`)
            const startDateTime = formatDateTime(saved.liveStartTime || Date.now())
            const content = `新标题: ${current.title}
开播时间: ${startDateTime}
传送门: https://www.youtube.com/watch?v=${current.lastLiveId}`
            await sendMessage(
              channelConfig.targets,
              `YouTube 直播更新 - ${current.author}`,
              content
            )
          }

          // 更新数据库记录
          await ctx.database.set('youtube_status', channelConfig.id, {
            lastLiveId: current.lastLiveId,
            title: current.title,
            author: current.author,
            isLive: current.isLive,
            dateText: current.dateText || saved.dateText || '',
            liveStartTime: (saved.isLive && saved.liveStartTime) ? saved.liveStartTime : (current.isLive ? Date.now() : 0),
            lastReminderTime: (current.isLive && saved.isLive && (Date.now() - (saved.lastReminderTime || saved.liveStartTime)) >= 30 * 60 * 1000)
              ? Date.now()
              : (saved.lastReminderTime || 0)
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
