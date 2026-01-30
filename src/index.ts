import { Context, Schema, Service, h } from 'koishi'
import Puppeteer from 'koishi-plugin-puppeteer'
import puppeteer from 'puppeteer-core'
import {} from '@koishijs/plugin-proxy-agent'

export const name = 'youtube-notifier'
export const inject = {
  required: ['puppeteer', 'database'],
  optional: ['notifier'],
}

export interface Config {
  channels: { id: string; targets: string[] }[]
  interval: number
  proxy?: string
}

export const Config: Schema<Config> = Schema.object({
  channels: Schema.array(Schema.object({
    id: Schema.string().required().description('YouTube 频道 ID (例如 UC-hM6YJuNYV19LAJg37K9Bw)'),
    targets: Schema.array(Schema.string()).description('推送目标群组 ID'),
  })).description('订阅频道列表'),
  interval: Schema.number().default(300000).description('轮询间隔 (毫秒)'),
  proxy: Schema.string().description('代理服务器地址 (例如 http://127.0.0.1:7890)'),
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
  lastPostId: string
  lastLiveId: string
  isLive: boolean
}

async function getChannelStatus(ctx: Context, channelId: string, proxy?: string) {
  const logger = ctx.logger('youtube-notifier')
  logger.debug(`正在获取频道状态: ${channelId}`)
  
  let page: any
  let browserToClose: any

  try {
    if (proxy) {
      logger.info(`正在启动专用浏览器实例，应用代理: ${proxy}`)
      const executablePath = ctx.puppeteer.executable || (ctx.puppeteer as any).browser?.process()?.spawnfile
      if (!executablePath) {
        throw new Error('无法获取浏览器可执行路径。')
      }
      
      const args = [
        `--proxy-server=${proxy}`,
        '--proxy-bypass-list=<-loopback>', // 强制所有流量走代理
        '--disable-extensions',
        '--disable-component-update',
        '--no-first-run',
        '--no-default-browser-check',
      ]
      if (process.getuid?.() === 0) {
        args.push('--no-sandbox', '--disable-setuid-sandbox')
      }
      // 优化容器/资源受限环境下的启动
      args.push('--disable-dev-shm-usage', '--disable-gpu')

      logger.debug(`浏览器启动参数: ${args.join(' ')}`)

      const browser = await puppeteer.launch({ 
        executablePath, 
        args,
        protocolTimeout: 20000, 
      })
      browserToClose = browser
      page = await browser.newPage()
    } else {
      page = await ctx.puppeteer.page()
    }

    // 设置全局超时
    page.setDefaultNavigationTimeout(20000)
    page.setDefaultTimeout(20000)

    // 检查社区帖子
    logger.debug(`正在检查社区帖子: ${channelId}`)
    await page.goto(`https://www.youtube.com/channel/${channelId}/community`, { waitUntil: 'domcontentloaded' })
    try {
      await page.waitForSelector('ytd-backstage-post-thread-renderer', { timeout: 3000 })
    } catch (e) {
      logger.debug(`频道 ${channelId} 社区页面未发现帖子或加载超时`)
    }
    const lastPostId = await page.evaluate(() => {
      const element = document.querySelector('ytd-backstage-post-thread-renderer')
      return element?.getAttribute('id') || ''
    })

    // 检查直播状态
    logger.debug(`正在检查直播状态: ${channelId}`)
    await page.goto(`https://www.youtube.com/channel/${channelId}/live`, { waitUntil: 'domcontentloaded' })
    const isLive = await page.evaluate(() => {
      return !!document.querySelector('meta[itemprop="isLiveBroadcast"][content="True"]')
    })
    
    let lastLiveId = ''
    if (isLive) {
      lastLiveId = await page.evaluate(() => {
        const link = document.querySelector('link[rel="canonical"]')
        return link?.getAttribute('href')?.split('v=')[1] || ''
      })
    }

    logger.info(`频道 ${channelId} 状态获取成功: PostId=${lastPostId || '无'}, IsLive=${isLive}`)
    return { lastPostId, isLive, lastLiveId }
  } catch (e) {
    logger.error(`频道 ${channelId} 状态获取失败:`, e)
    throw e
  } finally {
    if (page) {
      try { await page.close() } catch (e) {}
    }
    if (browserToClose) {
      try { await browserToClose.close() } catch (e) {}
    }
  }
}

export function apply(ctx: Context, config: Config) {
  ctx.model.extend('youtube_status', {
    id: 'string',
    lastPostId: 'string',
    lastLiveId: 'string',
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

          // 新动态提醒
          if (current.lastPostId && current.lastPostId !== saved.lastPostId) {
            logger.info(`检测到频道 ${channelConfig.id} 新动态: ${current.lastPostId}`)
            const title = `YouTube 新动态`
            const content = `频道 ${channelConfig.id} 发布了新动态：https://www.youtube.com/post/${current.lastPostId}`
            
            if (ctx.notifier) {
              for (const target of channelConfig.targets) {
                await ctx.notifier.create({
                  title,
                  content,
                  target,
                })
              }
            } else {
              for (const target of channelConfig.targets) {
                ctx.broadcast([target], `[${title}] ${content}`)
              }
            }
          }

          // 开播状态变更提醒
          if (current.isLive && (!saved.isLive || current.lastLiveId !== saved.lastLiveId)) {
            logger.info(`检测到频道 ${channelConfig.id} 正在直播: ${current.lastLiveId}`)
            const title = `YouTube 开播提醒`
            const content = `频道 ${channelConfig.id} 正在直播！\n传送门：https://www.youtube.com/watch?v=${current.lastLiveId}`

            if (ctx.notifier) {
              for (const target of channelConfig.targets) {
                await ctx.notifier.create({
                  title,
                  content,
                  target,
                })
              }
            } else {
              for (const target of channelConfig.targets) {
                ctx.broadcast([target], `[${title}] ${content}`)
              }
            }
          }

          // 更新数据库记录
          await ctx.database.set('youtube_status', channelConfig.id, current)
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
