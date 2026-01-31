import axios from 'axios'
import { SocksProxyAgent } from 'socks-proxy-agent'

const CHANNEL_ID = 'UCq_6F1GwN58l_OZaQgFHNrg'
const PROXY = 'socks5://127.0.0.1:10808'

async function test() {
  console.log(`正在获取频道 ${CHANNEL_ID} 的直播状态...`)
  console.log(`使用代理: ${PROXY}\n`)

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  }

  try {
    const agent = new SocksProxyAgent(PROXY)

    const response = await axios.get(
      `https://www.youtube.com/channel/${CHANNEL_ID}/live`,
      {
        headers,
        httpAgent: agent,
        httpsAgent: agent,
        timeout: 30000,
      }
    )

    const htmlContent = response.data
    console.log(`获取到 HTML 内容，长度: ${htmlContent.length} 字符`)

    // 尝试查找 ytInitialPlayerResponse
    const patterns = [
      /var ytInitialPlayerResponse\s*=\s*\{([\s\S]*?)\};/m,
      /ytInitialPlayerResponse\s*=\s*\{([\s\S]*?)\}(?:;|\n)/,
    ]

    let match = null
    for (const pattern of patterns) {
      const found = htmlContent.match(pattern)
      if (found) {
        console.log(`\n使用正则表达式: ${pattern}`)
        console.log(`匹配内容长度: ${found[1]?.length || 0}`)
        match = found
        break
      }
    }

    if (!match) {
      console.log('\n未找到 ytInitialPlayerResponse')
      // 检查页面是否返回有效内容
      console.log('HTML 预览:', htmlContent.substring(0, 500))
      return
    }

    try {
      const jsonStr = `{${match[1]}}`
      console.log('\n尝试解析 JSON...')
      console.log('JSON 预览:', jsonStr.substring(0, 200))

      const data = JSON.parse(jsonStr)

      console.log('\n========== 解析成功 ==========')
      console.log('videoDetails:', JSON.stringify(data.videoDetails, null, 2))
      console.log('\nstreamingData keys:', Object.keys(data.streamingData || {}))
      console.log('\nliveStreamingDetails:', JSON.stringify(data.liveStreamingDetails, null, 2))

      const isLive = !!(data.streamingData?.hlsManifestUrl || data.liveStreamingDetails?.actualStartTime)
      console.log(`\n是否在直播: ${isLive}`)

    } catch (e) {
      console.log('\nJSON 解析失败:', e.message)
      console.log('JSON 内容 (前500字符):', match[1]?.substring(0, 500))
    }

  } catch (e) {
    console.error('请求失败:', e.message)
    if (e.response) {
      console.error('响应状态:', e.response.status)
    }
  }
}

test()
