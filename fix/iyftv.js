const cheerio = createCheerio()
const CryptoJS = createCryptoJS()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.3'

let appConfig = {
    ver: 1,
    title: '愛壹帆',
    site: 'https://m10.iyf.tv',
    tabs: [
        {
            name: '电影',
            ext: {
                id: '3',
            },
        },
        {
            name: '电视',
            ext: {
                id: '4',
            },
        },
        {
            name: '综艺',
            ext: {
                id: '5',
            },
        },
        {
            name: '动漫',
            ext: {
                id: '6',
            },
        },
        {
            name: '短剧',
            ext: {
                id: '4,155',
            },
        },
        {
            name: '体育',
            ext: {
                id: '95',
            },
        },
        {
            name: '纪录片',
            ext: {
                id: '7',
            },
        },
    ],
}

async function getConfig() {
    // 修复: getConfig 决不因 keys 获取失败而抛错 (否则 XPTV 无法显示该站)
    try {
        await updateKeys()
    } catch (e) {
        // keys 拿不到也不影响站点显示, 延迟到 getCards 再取
    }
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    const keys = await ensureKeys()
    const publicKey = keys.publicKey
    let cards = []
    let { id, page = 1 } = ext

    // 修复: host 自动降级 (m10.iyf.tv 被 CDN 拦截时用 rankv21.iyf.tv)
    const hosts = ['https://m10.iyf.tv', 'https://rankv21.iyf.tv']
    let list = null
    let lastErr = null
    for (const host of hosts) {
        try {
            let url = `${host}/api/list/Search?cinema=1&page=${page}&size=36&orderby=0&desc=1&cid=0,1,${id}&isserial=-1&isIndex=-1&isfree=-1`
            let params = url.split('?')[1]
            url += `&vv=${getSignature(params)}&pub=${publicKey}`

            const { data } = await $fetch.get(url, {
                headers: { 'User-Agent': UA },
            })
            const parsed = argsify(data)
            if (parsed && parsed.data && parsed.data.info && parsed.data.info[0] && parsed.data.info[0].result) {
                list = parsed.data.info[0].result
                break
            }
            lastErr = 'empty data'
        } catch (e) { lastErr = e }
    }
    if (list === null) {
        return jsonify({ list: [] })
    }

    list.forEach((e) => {
        cards.push({
            vod_id: e.key,
            vod_name: e.title,
            vod_pic: e.image,
            vod_remarks: e.cid,
            ext: {
                key: e.key,
            },
        })
    })

    return jsonify({
        list: cards,
    })
}

async function getTracks(ext) {
    ext = argsify(ext)
    const keys = await ensureKeys()
    const publicKey = keys.publicKey
    let tracks = []
    let key = ext.key

    // 修复: host 自动降级
    const hosts = ['https://m10.iyf.tv', 'https://rankv21.iyf.tv']
    let data = null
    let lastErr = null
    for (const host of hosts) {
        try {
            let url = `${host}/v3/video/languagesplaylist?cinema=1&vid=${key}&lsk=1&taxis=0&cid=0,1,4,133`
            let params = url.split('?')[1]
            url += `&vv=${getSignature(params)}&pub=${publicKey}`
            const r = await $fetch.get(url, { headers: { 'User-Agent': UA } })
            if (r.statusCode !== 403 && r.data && !r.data.includes('<html')) { data = r.data; break }
            lastErr = 'blocked ' + host
        } catch (e) { lastErr = e }
    }
    if (data === null) throw lastErr

    let playlist = argsify(data).data.info[0].playList
    playlist.forEach((e) => {
        const name = e.name
        const key = e.key
        tracks.push({
            name: name,
            pan: '',
            ext: {
                key: key,
            },
        })
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
    const keys = await ensureKeys()
    const publicKey = keys.publicKey
    let key = ext.key

    // 修复: host 自动降级
    const hosts = ['https://m10.iyf.tv', 'https://rankv21.iyf.tv']
    let data = null
    let lastErr = null
    for (const host of hosts) {
        try {
            let url = `${host}/v3/video/play?cinema=1&id=${key}&a=0&lang=none&usersign=1&region=GL.&device=1&isMasterSupport=1`
            let params = url.split('?')[1]
            url += `&vv=${getSignature(params)}&pub=${publicKey}`
            const r = await $fetch.get(url, { headers: { 'User-Agent': UA } })
            if (r.statusCode !== 403 && r.data && !r.data.includes('<html')) {
                const parsed = argsify(r.data)
                // 修复: 校验 flvPathList 非空才采用 (rankv21 可能返回空 info)
                if (parsed && parsed.data && parsed.data.info && parsed.data.info[0] && parsed.data.info[0].flvPathList && parsed.data.info[0].flvPathList.length > 0) {
                    data = r.data
                    break
                }
                lastErr = 'empty flv ' + host
            } else {
                lastErr = 'blocked ' + host
            }
        } catch (e) { lastErr = e }
    }
    if (data === null) throw lastErr

    let paths = argsify(data).data.info[0].flvPathList
    let playUrl = ''
    paths.forEach(async (e) => {
        if (e.isHls) {
            let link = e.result
            link += `?vv=${getSignature('')}&pub=${publicKey}`
            playUrl = link
        }
    })

    return jsonify({ urls: [playUrl] })
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []

    const text = encodeURIComponent(ext.text)
    const page = ext.page || 1
    const url = `https://rankv21.iyf.tv/v3/list/briefsearch?tags=${text}&orderby=4&page=${page}&size=10&desc=0&isserial=-1&istitle=true`

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    let list = argsify(data).data.info[0].result
    list.forEach((e) => {
        cards.push({
            vod_id: e.contxt,
            vod_name: e.title,
            vod_pic: e.imgPath,
            vod_remarks: e.cid,
            ext: {
                key: e.contxt,
            },
        })
    })

    return jsonify({
        list: cards,
    })
}

async function ensureKeys() {
    // 修复: XPTV $cache 可能不跨调用共享, 每次取 keys 校验, 缺失/无效则重拉
    try {
        const cached = $cache.get('iyf-keys')
        if (cached) {
            const parsed = JSON.parse(cached)
            if (parsed && parsed.publicKey) return parsed
        }
    } catch (e) {}
    await updateKeys()
    const fresh = $cache.get('iyf-keys')
    if (!fresh) throw new Error('iyf-keys unavailable')
    return JSON.parse(fresh)
}

async function updateKeys() {
    let baseUrl = 'https://www.iyf.tv'
    let { data } = await $fetch.get(baseUrl, {
        headers: {
            'User-Agent': UA,
        },
    })
    // 兼容修复：括号配对提取 injectJson 完整对象（原逻辑对行尾 }; 与多语句行失效）
    const mStart = data.indexOf('var injectJson =')
    if (mStart < 0) throw new Error('injectJson not found')
    const objStart = data.indexOf('{', mStart)
    let depth = 0, i = objStart
    for (; i < data.length; i++) {
        if (data[i] === '{') depth++
        else if (data[i] === '}') { depth--; if (depth === 0) break }
    }
    const jsonStr = data.slice(objStart, i + 1)
    const json = JSON.parse(jsonStr)
    const publicKey = json['config'][0]['pConfig']['publicKey']
    const privateKey = json['config'][0]['pConfig']['privateKey']
    const keys = { publicKey, privateKey }
    $cache.set('iyf-keys', JSON.stringify(keys, null, 2))
}

function getSignature(query) {
    const publicKey = JSON.parse($cache.get('iyf-keys')).publicKey
    const privateKey = getPrivateKey()
    const input = publicKey + '&' + query.toLowerCase() + '&' + privateKey

    return CryptoJS.MD5(CryptoJS.enc.Utf8.parse(input)).toString()
}

function getPrivateKey() {
    const privateKey = JSON.parse($cache.get('iyf-keys')).privateKey
    const timePublicKeyIndex = Date.now()

    return privateKey[timePublicKeyIndex % privateKey.length]
}
