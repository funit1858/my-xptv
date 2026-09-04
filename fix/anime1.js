const cheerio = createCheerio()

let UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

let appConfig = {
    ver: 20260904,
    title: 'anime1',
    site: 'https://anime1.one',   // 修复: 原 anime1.me 数据源失效, 改用新站 anime1.one
    tabs: [
        {
            id: '1',
            name: 'list',
            ext: {},
        },
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { page = 1 } = ext

    if (page > 1) return
    try {
        // 修复: 新站首页解析 (数字 ID 条目)
        const url = appConfig.site + '/'
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
            },
        })
        const $ = cheerio.load(data)
        // 条目链接形如 /199601998/ (数字ID)
        $('a').each((_, el) => {
            const href = $(el).attr('href') || ''
            const m = href.match(/^\/(\d{6,})\/?$/)
            if (!m) return
            const id = m[1]
            const name = $(el).find('h2, h3, .entry-title').text().trim() || $(el).attr('title') || $(el).text().trim().slice(0, 40)
            if (!name || name.length < 2) return
            // 只取文章卡片, 去重
            if (cards.some(c => c.vod_id === id)) return
            cards.push({
                vod_id: id,
                vod_name: name.slice(0, 60),
                vod_pic: '',
                vod_remarks: 'anime1.one',
                ext: { id },
            })
        })
        // 首页抓不到就抓分类页
        if (!cards.length) {
            const { data: d2 } = await $fetch.get(appConfig.site + '/2026%E5%B9%B4%E7%A7%8B%E5%AD%A3%E6%96%B0%E7%95%AA/', {
                headers: { 'User-Agent': UA },
            })
            const $2 = cheerio.load(d2)
            $2('a[href*="anime1.one/"]').each((_, el) => {
                const href = $2(el).attr('href') || ''
                const m = href.match(/anime1\.one\/(\d{6,})\/?$/)
                if (!m) return
                const id = m[1]
                const name = $2(el).find('h2, h3, .entry-title, .anime-title').text().trim() || $2(el).attr('title') || ''
                if (name && !cards.some(c => c.vod_id === id)) {
                    cards.push({ vod_id: id, vod_name: name.slice(0, 60), vod_pic: '', vod_remarks: 'anime1.one', ext: { id } })
                }
            })
        }
        return jsonify({
            list: cards.slice(0, 60),
        })
    } catch (error) {
        $print(error)
        return jsonify({ list: [] })
    }
}

async function getTracks(ext) {
    ext = argsify(ext)
    let tracks = []
    let { id, href } = ext
    let url = href ? href : appConfig.site + '/' + id + '/'

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    const $ = cheerio.load(data)
    // 修复: 新站播放器 iframe /_player_y_/xxx
    $('.player-lists, .entry-content').find('a[href*="_player_y_"], a[href*="player_y"]').each((_, e) => {
        let name = $(e).text().trim().slice(0, 30) || '播放'
        let href = $(e).attr('href')
        tracks.push({ name, pan: '', ext: { href } })
    })
    // 兜底: 直接从详情页找播放器ID
    if (!tracks.length) {
        const ids = [...new Set((data.match(/_player_y_\/(\d+)/g) || []).map(x => x.split('/').pop()))]
        ids.forEach((pid, i) => {
            tracks.push({
                name: '播放' + (i + 1),
                pan: '',
                ext: { href: appConfig.site + '/_player_y_/' + pid },
            })
        })
    }
    return jsonify({
        list: [{ title: '默认分组', tracks }],
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    let { href } = ext
    let playUrl = ''
    try {
        const { data } = await $fetch.get(href, {
            headers: { 'User-Agent': UA, Referer: appConfig.site + '/' },
        })
        // 新站播放器页内直接有 m3u8
        const m = data.match(/https?:\/\/[^"' ]+\.m3u8[^"' ]*/)
        if (m) playUrl = m[0]
        // 兜底: video src
        if (!playUrl) {
            const v = data.match(/<video[^>]+src="([^"]+)"[^>]*>/)
            if (v) playUrl = v[1]
        }
    } catch (e) {}
    return jsonify({ urls: [playUrl], headers: [{ 'User-Agent': UA, Referer: appConfig.site + '/' }] })
}
