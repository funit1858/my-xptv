/**
 * XPTV 扩展脚本: LIBVIO 影视
 * 适配站点: https://www.libvio.lat
 */

const cheerio = createCheerio()
const CryptoJS = createCryptoJS()

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const appConfig = {
    ver: 20260902,
    title: 'LIBVIO',
    site: 'https://www.libvio.lat',
    tabs: [
        { name: '电影', ext: { id: 1 } },
        { name: '电视剧', ext: { id: 2 } },
        { name: '欧美剧', ext: { id: 16 } },
        { name: '日韩剧', ext: { id: 15 } },
        { name: '国产剧', ext: { id: 13 } },
        { name: '港台剧', ext: { id: 14 } },
        { name: '动漫', ext: { id: 4 } },
        { name: '综艺', ext: { id: 5 } },
        { name: '纪录片', ext: { id: 3 } }
    ]
}

// 年份列表生成
const YEAR_VALUES = (() => {
    const arr = [{ n: '全部', v: '' }]
    for (let y = 2026; y >= 2005; y--) arr.push({ n: String(y), v: String(y) })
    return arr
})()

const AREA_LIST = '全部,中国大陆,中国香港,中国台湾,美国,英国,日本,韩国,法国,德国,泰国,印度,意大利,西班牙,加拿大,其他'.split(',')
const LANG_LIST = '全部,国语,英语,粤语,闽南语,韩语,日语,法语,德语,其它'.split(',')

function getFilters() {
    return [
        {
            key: 'area',
            name: '地区',
            value: AREA_LIST.map(v => ({ n: v, v: v === '全部' ? '' : v }))
        },
        {
            key: 'year',
            name: '年份',
            value: YEAR_VALUES
        },
        {
            key: 'lang',
            name: '语言',
            value: LANG_LIST.map(v => ({ n: v, v: v === '全部' ? '' : v }))
        },
        {
            key: 'by',
            name: '排序',
            value: [
                { n: '时间', v: 'time' },
                { n: '人气', v: 'hits' },
                { n: '评分', v: 'score' }
            ]
        }
    ]
}

// 1. 配置加载
async function getConfig() {
    return jsonify(appConfig)
}

// 2. 分类列表 / 瀑布流卡片
async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let id = ext.id || 1
    let page = ext.page || 1
    let filters = ext.filters || {}

    let area = filters.area || ''
    let year = filters.year || ''
    let lang = filters.lang || ''
    let by = filters.by || 'time'

    let url = `${appConfig.site}/show/${id}-${encodeURIComponent(area)}-${by}--${encodeURIComponent(lang)}----${page}---${year}.html`

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': `${appConfig.site}/`
            }
        })

        const $ = cheerio.load(data)
        $('.stui-vodlist__box').each((_, element) => {
            const thumb = $(element).find('.stui-vodlist__thumb')
            const href = thumb.attr('href')
            const title = thumb.attr('title') || $(element).find('.title a').text().trim()
            const cover = thumb.attr('data-original') || thumb.attr('src')
            const subTitle = thumb.find('.pic-text').text().trim() || thumb.find('.pic-tag').text().trim()

            if (href && title) {
                cards.push({
                    vod_id: href.replace(/.*?\/detail\/(.*)\.html/g, '$1'),
                    vod_name: title.trim(),
                    vod_pic: cover || '',
                    vod_remarks: subTitle || '',
                    ext: {
                        url: href.startsWith('http') ? href : `${appConfig.site}${href}`
                    }
                })
            }
        })
    } catch (e) {
        $print('getCards error: ' + e)
    }

    return jsonify({
        list: cards,
        filter: getFilters()
    })
}

// 3. 详情与剧集列表 / 选集分组
async function getTracks(ext) {
    ext = argsify(ext)
    let url = ext.url
    let groups = []

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': `${appConfig.site}/`
            }
        })

        const $ = cheerio.load(data)
        const heads = $('.stui-vodlist__head')

        heads.each((index, el) => {
            const title = $(el).find('h3').text().trim()
            if (/猜你喜欢|相关推荐|剧情简介|热播推荐/.test(title)) return

            const nextUl = $(el).next('.stui-content__playlist')
            if (nextUl.length > 0) {
                let tracks = []
                nextUl.find('li a').each((_, a) => {
                    const href = $(a).attr('href')
                    const name = $(a).text().trim()
                    if (href) {
                        tracks.push({
                            name: name || `第${tracks.length + 1}集`,
                            pan: '',
                            ext: {
                                url: href.startsWith('http') ? href : `${appConfig.site}${href}`
                            }
                        })
                    }
                })

                if (tracks.length > 0) {
                    groups.push({
                        title: title || `线路 ${index + 1}`,
                        tracks: tracks
                    })
                }
            }
        })
    } catch (e) {
        $print('getTracks error: ' + e)
    }

    return jsonify({ list: groups })
}

// 4. 解析播放真实流地址
async function getPlayinfo(ext) {
    ext = argsify(ext)
    let url = ext.url

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': `${appConfig.site}/`
            }
        })

        const match = data.match(/var\s+player_aaaa\s*=\s*(\{.*?\})<\/script>/)
        if (!match) {
            $print('player_aaaa not found')
            return jsonify({ urls: [] })
        }

        const playerData = JSON.parse(match[1])
        let playUrl = playerData.url || ''

        if (/pan\.quark\.cn|aliyundrive\.com|alipan\.com|pan\.baidu\.com|drive\.uc\.cn/.test(playUrl)) {
            return jsonify({ urls: [playUrl] })
        }

        if (playerData.encrypt === 1) {
            playUrl = decodeURIComponent(playUrl)
        } else if (playerData.encrypt === 2) {
            playUrl = decodeURIComponent(
                Array.prototype.map
                    .call(atob(playUrl), c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                    .join('')
            )
        }

        if (/\.(m3u8|mp4)(\?.*)?$/i.test(playUrl)) {
            return jsonify({
                urls: [playUrl],
                headers: [{ 'User-Agent': UA, 'Referer': `${appConfig.site}/` }]
            })
        }

        const artUrl = `${appConfig.site}/static/player/artplayer/?url=${playUrl}`
        const artRes = await $fetch.get(artUrl, {
            headers: {
                'User-Agent': UA,
                'Referer': url
            }
        })

        const artHtml = artRes.data || ''
        const qMatch = artHtml.match(/const\s+qualities\s*=\s*(\[.*?\]);/)
        if (qMatch) {
            try {
                const qualities = JSON.parse(qMatch[1])
                let urls = []
                for (let q of qualities) {
                    if (q.url) urls.push(q.url)
                }
                if (urls.length > 0) {
                    return jsonify({
                        urls: urls,
                        headers: [{ 'User-Agent': UA, 'Referer': `${appConfig.site}/` }]
                    })
                }
            } catch (err) {}
        }

        const m3u8Match = artHtml.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/)
        if (m3u8Match) {
            return jsonify({
                urls: [m3u8Match[0]],
                headers: [{ 'User-Agent': UA, 'Referer': `${appConfig.site}/` }]
            })
        }

        return jsonify({ urls: [playUrl] })
    } catch (e) {
        $print('getPlayinfo error: ' + e)
        return jsonify({ urls: [] })
    }
}

// 5. 关键词搜索
async function search(ext) {
    ext = argsify(ext)
    let cards = []
    let wd = ext.text || ''

    try {
        const suggestUrl = `${appConfig.site}/index.php/ajax/suggest?mid=1&wd=${encodeURIComponent(wd)}&limit=30`
        const { data } = await $fetch.get(suggestUrl, {
            headers: {
                'User-Agent': UA,
                'Referer': `${appConfig.site}/`
            }
        })

        let json = typeof data === 'string' ? JSON.parse(data) : data
        if (json && json.list && json.list.length > 0) {
            json.list.forEach(item => {
                cards.push({
                    vod_id: String(item.id),
                    vod_name: item.name,
                    vod_pic: item.pic || '',
                    vod_remarks: '',
                    ext: {
                        url: `${appConfig.site}/detail/${item.id}.html`
                    }
                })
            })
            return jsonify({ list: cards })
        }
    } catch (e) {}

    try {
        const searchUrl = `${appConfig.site}/search/-------------.html?wd=${encodeURIComponent(wd)}`
        const { data } = await $fetch.get(searchUrl, {
            headers: {
                'User-Agent': UA,
                'Referer': `${appConfig.site}/`
            }
        })

        const $ = cheerio.load(data)
        $('.stui-vodlist__box').each((_, element) => {
            const thumb = $(element).find('.stui-vodlist__thumb')
            const href = thumb.attr('href')
            const title = thumb.attr('title') || $(element).find('.title a').text().trim()
            const cover = thumb.attr('data-original') || thumb.attr('src')
            const subTitle = thumb.find('.pic-text').text().trim()

            if (href && title) {
                cards.push({
                    vod_id: href.replace(/.*?\/detail\/(.*)\.html/g, '$1'),
                    vod_name: title.trim(),
                    vod_pic: cover || '',
                    vod_remarks: subTitle || '',
                    ext: {
                        url: href.startsWith('http') ? href : `${appConfig.site}${href}`
                    }
                })
            }
        })
    } catch (e) {
        $print('search error: ' + e)
    }

    return jsonify({ list: cards })
}
