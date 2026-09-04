const cheerio = createCheerio()

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

let appConfig = {
    ver: 20260224,
    title: 'avtoday',
    site: 'https://avtoday.io',
}

async function getConfig() {
    let config = appConfig
    config.tabs = await getTabs()
    return jsonify(config)
}

async function getTabs() {
    let list = []
    let ignore = []
    function isIgnoreClassName(className) {
        return ignore.some((element) => className.includes(element))
    }

    // 修复适配: 新版页面分类从 /cht/hot.html 提取
    const pages = [
        { name: '热门', url: '/cht/hot.html' },
        { name: '新片', url: '/cht/new.html' },
        { name: '中文字幕', url: '/cht/chinese-subtitle.html' },
        { name: '无码', url: '/cht/uncensored.html' },
    ]
    for (const p of pages) {
        const { data } = await $fetch.get(appConfig.site + p.url, {
            headers: { 'User-Agent': UA },
        })
        if (data && !data.includes('does not provide services')) {
            list.push({ name: p.name, ext: { url: p.url }, ui: 1 })
        }
    }
    // 兜底分类
    if (!list.length) {
        list.push(
            { name: '新片', ext: { url: '/cht/new.html' }, ui: 1 },
            { name: '热门', ext: { url: '/cht/hot.html' }, ui: 1 }
        )
    }
    return list
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { page = 1, url } = ext

    if (url && !url.startsWith('http')) {
        url = appConfig.site + url
    }
    if (page > 1) {
        url = url + `?page=${page}`
    }

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })
    const $ = cheerio.load(data)

    $('.thumbnail, .preview-video').each((_, element) => {
        const title = $(element).find('.video-title a').text() || $(element).find('.title a').text() || $(element).attr('alt') || ''
        if (title.includes('[廣告]')) return
        let href = $(element).find('.video-title a').attr('href') || $(element).find('.title a').attr('href') || $(element).find('a').attr('href') || ''
        // 新版页面卡片: <video class="preview-video" ...> 外层 a 指向 /cht/video/xxx.html
        if (!href || !href.includes('video')) {
            href = $(element).closest('a').attr('href') || $(element).parent('a').attr('href') || ''
        }
        const subTitle = $(element).find('.video-tag').text().trim() || ''
        const duration = $(element).find('.video-duration').text().trim() || ''
        const pubdate = $(element).find('.video-date').text().trim() || ''

        const style = $(element).find('.preview-video').attr('style') || $(element).attr('style') || ''
        let cover = ''
        const cm = style.match(/url\(\('?(.*?)'?\)\)/)
        cover = cm ? (appConfig.site + cm[1]) : ($(element).find('img').attr('data-src') || $(element).find('img').attr('src') || '')

        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: subTitle,
            vod_duration: duration,
            vod_pubdate: pubdate,
            ext: {
                url: appConfig.site + '/' + href,
            },
        })
    })

    return jsonify({
        list: cards,
    })
}

async function getTracks(ext) {
    ext = argsify(ext)
    let tracks = []
    let url = ext.url

    let code = (url.split('/video/')[1] || '').replace('.html', '')
    let playerUrl = `${appConfig.site}/player?s=${code}`

    const { data } = await $fetch.get(playerUrl, {
        headers: {
            'User-Agent': UA,
            Referer: url,
        },
    })
    let playUrl = data.match(/m3u8_url\s+=\s+'(.+)'/)[1]
    tracks.push({
        name: '播放',
        pan: '',
        ext: {
            url: playUrl,
            playerUrl,
        },
    })

    return jsonify({
        list: [
            {
                title: '默认分组',
                tracks,
            },
        ],
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url
    const headers = {
        'User-Agent': UA,
        Referer: ext.playerUrl + '/',
    }

    return jsonify({ urls: [url], headers: [headers] })
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []

    let text = encodeURIComponent(ext.text)
    let page = ext.page || 1
    let url = `${appConfig.site}/search?s=${text}&page=${page}`

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    const $ = cheerio.load(data)

    $('.thumbnail').each((_, element) => {
        const title = $(element).find('.video-title a').text()
        if (title.includes('[廣告]')) return
        const href = $(element).find('.video-title a').attr('href')
        const subTitle = $(element).find('.video-tag').text().trim() || ''
        const duration = $(element).find('.video-duration').text().trim() || ''
        const pubdate = $(element).find('.video-date').text().trim() || ''

        const style = $(element).find('.preview-video').attr('style')
        const cover = appConfig.site + style.match(/url\('(.*?)'\)/)[1]

        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: subTitle,
            vod_duration: duration,
            vod_pubdate: pubdate,
            ext: {
                url: appConfig.site + '/' + href,
            },
        })
    })

    return jsonify({
        list: cards,
    })
}
