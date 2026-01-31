import axios from 'axios'

const CHANNEL_ID = 'UCq_6F1GwN58l_OZaQgFHNrg'

async function test() {
  console.log(`正在获取频道 ${CHANNEL_ID} 的直播状态...`)

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  }

  try {
    const response = await axios.get(
      `https://www.youtube.com/channel/${CHANNEL_ID}/live`,
      { headers, timeout: 30000 }
    )

    const htmlContent = response.data
    console.log(`获取到 HTML 内容，长度: ${htmlContent.length} 字符\n`)

    // 查找 ytInitialPlayerResponse
    const match = htmlContent.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\})(?:;|\n)/)
    
    if (match) {
      console.log('找到 ytInitialPlayerResponse，尝试解析...')
      const jsonStr = match[1]
      console.log('JSON 长度:', jsonStr.length)

      try {
        const data = JSON.parse(jsonStr)
        console.log('\n========== 解析成功 ==========')
        console.log('videoDetails:', JSON.stringify(data.videoDetails, null, 2).substring(0, 500))
        console.log('\nstreamingData keys:', Object.keys(data.streamingData || {}))
        console.log('\nliveStreamingDetails:', JSON.stringify(data.liveStreamingDetails, null, 2).substring(0, 500))

        const isLive = !!(data.streamingData?.hlsManifestUrl || data.liveStreamingDetails?.actualStartTime)
        console.log(`\n是否在直播: ${isLive}`)

      } catch (e) {
        console.log('\nJSON 解析失败:', e.message)
        console.log('JSON 预览:', jsonStr.substring(0, 300))
      }
    } else {
      console.log('未找到 ytInitialPlayerResponse')

      // 检查页面是否有直播信息
      const is404 = htmlContent.includes('This page isn\'t available') || htmlContent.includes('404')
      if (is404) {
        console.log('页面返回 404')
      }

      // 检查是否需要登录
      const needsAuth = htmlContent.includes('Sign in') || htmlContent.includes('login')
      if (needsAuth) {
        console.log('页面需要登录')
      }
    }

  } catch (e) {
    console.error('请求失败:', e.message)
  }
}

test()
