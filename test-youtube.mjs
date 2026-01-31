import axios from 'axios'

const CHANNEL_ID = 'UCq_6F1GwN58l_OZaQgFHNrg'
const PROXY = 'socks5://127.0.0.1:10808'

async function test() {
  console.log(`正在获取频道 ${CHANNEL_ID} 的直播状态...`)
  console.log(`使用代理: ${PROXY}\n`)

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  }

  try {
    // 解析代理 URL
    const proxyUrl = new URL(PROXY)
    const proxyConfig = {
      protocol: proxyUrl.protocol,
      host: proxyUrl.hostname,
      port: proxyUrl.port,
    }

    console.log('代理配置:', proxyConfig)

    const response = await axios.get(
      `https://www.youtube.com/channel/${CHANNEL_ID}/live`,
      {
        headers,
        proxy: proxyConfig,
        timeout: 20000,
      }
    )

    const htmlContent = response.data
    console.log(`获取到 HTML 内容，长度: ${htmlContent.length} 字符`)

    // 尝试多种正则表达式提取 ytInitialPlayerResponse
    const patterns = [
      /var ytInitialPlayerResponse = \{([\s\S]*?)\};$/m,
      /ytInitialPlayerResponse\s*=\s*\{([\s\S]*?)\}(?:;|\n)/,
      /\"ytInitialPlayerResponse\":\s*(\{[\s\S]*?\})(?:,|;)/,
    ]

    let match = null
    for (const pattern of patterns) {
      const found = htmlContent.match(pattern)
      if (found) {
        console.log(`\n使用正则表达式: ${pattern}`)
        console.log(`匹配结果长度: ${found[1]?.length || 0}`)
        match = found
        break
      }
    }

    if (!match) {
      console.log('\n未找到 ytInitialPlayerResponse，尝试查找其他模式...')

      // 打印可能包含 player response 的部分
      const scriptMatches = htmlContent.match(/<script[^>]*>[\s\S]*?var[\s\S]*?<\/script>/gi)
      if (scriptMatches) {
        console.log(`找到 ${scriptMatches.length} 个 script 标签`)

        for (let i = 0; i < scriptMatches.length && i < 5; i++) {
          if (scriptMatches[i].includes('ytInitialPlayerResponse')) {
            console.log(`\n--- Script ${i} (包含 ytInitialPlayerResponse) ---`)
            console.log(scriptMatches[i].substring(0, 500))
            console.log('...\n')
          }
        }
      }
      return
    }

    try {
      const jsonStr = match[0].includes('"ytInitialPlayerResponse"')
        ? match[1]
        : `{${match[1]}`

      console.log('\n尝试解析 JSON...')
      console.log('JSON 预览:', jsonStr.substring(0, 200))

      const data = JSON.parse(jsonStr)

      console.log('\n========== 解析成功 ==========')
      console.log('videoDetails:', JSON.stringify(data.videoDetails, null, 2))
      console.log('\nstreamingData:', JSON.stringify(data.streamingData, null, 2))
      console.log('\nliveStreamingDetails:', JSON.stringify(data.liveStreamingDetails, null, 2))

      const isLive = !!(data.streamingData?.hlsManifestUrl || data.liveStreamingDetails?.actualStartTime)
      console.log(`\n是否在直播: ${isLive}`)

    } catch (e) {
      console.log('\nJSON 解析失败:', e.message)
      console.log('JSON 内容 (前500字符):', jsonStr?.substring(0, 500))
    }

  } catch (e) {
    console.error('请求失败:', e.message)
    if (e.response) {
      console.error('响应状态:', e.response.status)
    }
  }
}

test()
