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
  const browser = await puppeteer.launch({
    executablePath: ctx.puppeteer.executable,
    args: proxy ? [`--proxy-server=${proxy}`] : [],
  })
  const page = await browser.newPage()
  
  try {
    // 检查社区帖子
    await page.goto(`https://www.youtube.com/channel/${channelId}/community`, { waitUntil: 'networkidle2' })
    const lastPostId = await page.evaluate(() => {
      const element = document.querySelector('ytd-backstage-post-thread-renderer')
      return element?.getAttribute('id') || ''
    })

    // 检查直播状态
    await page.goto(`https://www.youtube.com/channel/${channelId}/live`, { waitUntil: 'networkidle2' })
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

    return { lastPostId, isLive, lastLiveId }
  } finally {
    await browser.close()
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
    // 代理可用性检测
    if (config.proxy) {
      try {
        await ctx.http.get('https://www.youtube.com', {
          proxyAgent: config.proxy,
          timeout: 10000,
        })
        ctx.logger('youtube-notifier').info(`代理检测成功: ${config.proxy}`)
      } catch (e) {
        ctx.logger('youtube-notifier').warn(`代理检测失败: ${config.proxy}, 请检查代理配置或网络环境`)
      }
    }

    const timer = setInterval(async () => {
      for (const channelConfig of config.channels) {
        try {
          const current = await getChannelStatus(ctx, channelConfig.id, config.proxy)
          const [saved] = await ctx.database.get('youtube_status', { id: channelConfig.id })

          if (!saved) {
            // 初次运行，仅保存当前状态不推送
            await ctx.database.create('youtube_status', {
              id: channelConfig.id,
              ...current
            })
            continue
          }

          // 新动态提醒
          if (current.lastPostId && current.lastPostId !== saved.lastPostId) {
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
          ctx.logger('youtube-notifier').error(`检查频道 ${channelConfig.id} 失败:`, e)
        }
      }
    }, config.interval)

    ctx.on('dispose', () => clearInterval(timer))
  })
}
