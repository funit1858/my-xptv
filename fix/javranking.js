// XPTV 扩展脚本: javranking.top 排行榜站
// 列表/详情: https://javranking.top
// 播放: 预览 mp4 (static.javranking.top/video/preview/{id}.mp4), 完整版跳 missav/jable(番号)

const cheerio = createCheerio()

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const appConfig = {
    ver: 20260906,
    title: 'JavRanking',
    site: 'https://javranking.top',
    tabs: [
        { name: '全时段TOP100', ext: { url: '/en/most-awarded-videos/' } },
        { name: '年度榜单', ext: { url: '/en/videos/' } },
        { name: '新片', ext: { url: '/en/new-videos/' } },
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { page = 1, url = '/en/most-awarded-videos/' } = ext
    let target = appConfig.site + url
    if (page > 1) target += (url.indexOf('?') >= 0 ? '&' : '?') + 'page=' + page

    const { data } = await $fetch.get(target, { headers: { 'User-Agent': UA } })
    const $ = cheerio.load(data)

    // 榜单卡片: li > a[href*="/en/videos/"], 内含 img alt
    $('a[href*="/en/videos/"]').each((_, el) => {
        const href = $(el).attr('href') || ''
        const m = href.match(/\/en\/videos\/(\d+)/)
        if (!m) return
        const id = m[1]
        const title = ($(el).attr('title') || '') || ($(el).find('img').attr('alt') || '')
        const pic = $(el).find('img').attr('src') || ''
        if (!title || cards.some(c => c.vod_id === id)) return
        cards.push({
            vod_id: id,
            vod_name: String(title).slice(0, 60),
            vod_pic: pic,
            vod_remarks: 'JavRanking',
            ext: { id, url: '/en/videos/' + id + '/' },
        })
    })

    // 兜底: 首页 fallback (无链接时)
    if (!cards.length) {
        $('article a[href]').each((_, el) => {
            const href = $(el).attr('href') || ''
            const m = href.match(/(\d+)/)
            if (!m) return
            const id = m[1]
            const title = $(el).find('img').attr('alt') || 'JavRanking ' + id
            if (!cards.some(c => c.vod_id === id)) {
                cards.push({
                    vod_id: id,
                    vod_name: String(title).slice(0, 60),
                    vod_pic: $(el).find('img').attr('src') || '',
                    vod_remarks: 'JavRanking',
                    ext: { id, url: '/en/videos/' + id + '/' },
                })
            }
        })
    }

    return jsonify({ list: cards.slice(0, 40) })
}

async function getTracks(ext) {
    ext = argsify(ext)
    let tracks = []
    let { id, url } = ext
    let target = appConfig.site + (url || ('/en/videos/' + id + '/'))

    const { data } = await $fetch.get(target, { headers: { 'User-Agent': UA } })
    // 预览视频: <source src="https://static.javranking.top/video/preview/{id}.mp4">
    const m = data.match(/<source src="(https:\/\/[^"]+preview[\d\/.]*\.mp4)"/)
    if (m) {
        tracks.push({
            name: '预览',
            pan: '',
            ext: { url: m[1] },
        })
    }
    // 完整版跳转 missav / jable (按番号)
    const code = (data.match(/[A-Z]{2,6}-\d{2,5}/) || [''])[0]
    if (code) {
        tracks.push(
            { name: '完整版 missav', pan: '', ext: { url: 'missav://' + code } },
            { name: '完整版 jable', pan: '', ext: { url: 'jable://' + code } }
        )
    }

    return jsonify({
        list: [
            {
                title: '播放',
                tracks,
            },
        ],
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    // 预览 mp4 直出; missav/jable 是外部跳转(由站内番号源处理)
    let url = ''
    if (ext.url && ext.url.startsWith('http')) url = ext.url
    return jsonify({ urls: [url], headers: [{ 'User-Agent': UA }] })
}

async function search(ext) {
    ext = argsify(ext)
    const text = ext.text || ext.wd || ''
    if (!text) return jsonify({ list: [] })
    let cards = []
    const { data } = await $fetch.get(
        'https://javranking.top/en/search?q=' + encodeURIComponent(text),
        { headers: { 'User-Agent': UA } }
    )
    const $ = cheerio.load(data)
    $('a[href*="/en/videos/"]').each((_, el) => {
        const href = $(el).attr('href') || ''
        const m = href.match(/\/en\/videos\/(\d+)/)
        if (!m) return
        const id = m[1]
        const title = $(el).attr('title') || ''
        if (!title || cards.some(c => c.vod_id === id)) return
        cards.push({
            vod_id: id,
            vod_name: String(title).slice(0, 60),
            vod_pic: $(el).find('img').attr('src') || '',
            vod_remarks: 'JavRanking',
            ext: { id, url: '/en/videos/' + id + '/' },
        })
    })
    return jsonify({ list: cards.slice(0, 30) })
}