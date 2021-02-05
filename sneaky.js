const fetch = require('node-fetch')
const { appendFileSync } = require('fs');
const HttpsProxyAgent = require('https-proxy-agent');

const { promisify } = require('util');
const pause = promisify((a, f) => setTimeout(f, a))

const colors = require("colors/safe")

const FOR_LOOP_DURATION = 1

const MESSAGE = {
    NORMAL_HEAD: "[*]",
    NO_ENOUGH_PROXY: colors.bold("目前無空閒伺服器"),
    NOW_TASK: colors.cyan("目前任務"),
}

class Proxy {
    constructor(url) {
        this.url = url

        this.agent = new HttpsProxyAgent(this.url)

        this.success = 0
        this.errors = 0

        this.retry = 0
    }

    getHealth() {
        if (this.errors <= 10)
            return 1.0
        return (this.success / (this.success + this.errors))
    }

    toString() {
        return "[proxy](" + this.url + ")(" + this.getHealth() * 100 + "%)"
    }

    async get(url, options = {}) {
        let option = JSON.parse(JSON.stringify(options))
        option.agent = this.agent
        try {
            let res = await fetch(url, option)
            this.success++
            return res
        } catch (e) {
            this.errors++
            return e
        }
    }
}

class RetryError extends Error {
    constructor(url) {
        super("should retry", url)
        this.url = url
    }
}

class PauseError extends Error {
    constructor(duration) {
        super("should sleep " + duration / 1000 + " seconds")
        this.duration = duration
    }
}

class PRError extends Error {
    constructor(url, duration) {
        super("should sleep " + duration / 1000 + " seconds then open ", url)
        this.url = url
        this.duration = duration
    }
}

class Sneaky {
    constructor(proxies) {
        this.proxies = proxies.map(url => new Proxy(url))
        this.rest_proxies = []
    }

    async test() {
        console.log("==================================================")
        for (let [id, proxy] of this.proxies.entries()) {
            let res = await proxy.get("http://ident.me")
            let ip = await res.text()
            console.log(`${id + 1}. ${ip} ${proxy}`)
        }
        console.log("==================================================")
    }

    async run(urls, options = {}, cb) {
        let ok = 0
        let st = Date.now()
        let id = 0
        let results = []
        for (let url of urls) {
            let per = (Date.now() - st) / ok / 1000
            let est = per * (urls.length - ok)
            console.log(
                MESSAGE.NORMAL_HEAD,
                MESSAGE.NOW_TASK,
                colors.bold(`(${++id}/${urls.length})`),
                "PER:", per,
                "EST:", est,
                `${url.substr(url.length - 10)}`
            )

            while (this.proxies.length <= 0) {
                console.log('[*]', MESSAGE.NO_ENOUGH_PROXY)
                await pause(5 * 1000)
            }

            let proxy = this.proxies.shift()

            proxy.get(url, options)
                .then(cb)
                .then(result => {
                    results.push(result)
                    console.log(MESSAGE.NORMAL_HEAD, colors.gray(`伺服器${proxy}完成任務 ${result} 三秒後回到崗位`))
                    proxy.retry = 0
                    ok++
                    pause(3 * 1000)
                        .then(() => {
                            this.proxies.push(proxy)
                        })
                })
                .catch(err => {
                    if (err instanceof PauseError) {
                        console.log(MESSAGE.NORMAL_HEAD, colors.grey(`伺服器${proxy}出現問題`), colors.blue(`進入恢復時間 ${proxy.retry * 5}sec`))
                        pause((proxy.retry++) * 5 * 1000)
                            .then(() => {
                                this.proxies.push(proxy)
                            })
                    } else if (err instanceof PRError) {
                        console.log(MESSAGE.NORMAL_HEAD, colors.grey(`伺服器${proxy}出現問題`), colors.blue(`進入恢復時間 ${proxy.retry * 5}sec`))
                        pause((proxy.retry++) * 5 * 1000)
                            .then(() => {
                                this.proxies.push(proxy)
                            })
                        urls.push(err.url)
                    } else {
                        console.log("不處理", err)
                    }
                })

            await pause(FOR_LOOP_DURATION * 1000)
        }
        return results
    }
}

module.exports = Sneaky
module.exports.RetryError = RetryError
module.exports.PauseError = PauseError
module.exports.PRError = PRError