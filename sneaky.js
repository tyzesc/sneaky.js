const fetch = require('node-fetch')
const { appendFileSync } = require('fs');
const HttpsProxyAgent = require('https-proxy-agent');

const { promisify } = require('util');
const pause = promisify((a, f) => setTimeout(f, a))

class Proxy {
    constructor(url) {
        this.url = url

        this.agent = new HttpsProxyAgent(this.url)

        this.success = 0
        this.errors = 0
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
        super("should sleep " + duration + " seconds")
        this.duration = duration
    }
}

class Sneaky {
    constructor(proxies) {
        this.proxies = proxies.map(url => new Proxy(url))
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
        let maxLength = 1
        let runningProxies = []
        let promises = []
        let results = []

        let id = 0
        for (let url of urls) {
            console.log(`[*] (${++id}/${urls.length}) ${url}`)
            let proxy = this.proxies.shift()
            let res = proxy.get(url, options)
            runningProxies.push(proxy)
            promises.push(res)

            if (promises.length >= maxLength || id == urls.length) {
                let arr = await Promise.all(promises)
                console.log("this time has", promises.length, "entity.")

                // 把 proxy 放回去
                this.proxies = [...this.proxies, ...runningProxies]
                runningProxies = []

                for (let a of arr) {
                    try {
                        let b = await cb(a)
                        results = [...results, b]
                    } catch (e) {
                        if (e instanceof RetryError) {
                            console.log(e.message)
                            urls.push(e.url)
                        } else if (e instanceof PauseError) {
                            console.log(e.message)
                            await pause(e.duration)
                        } else {
                            await appendFileSync("sneaky.error", e + '\n')
                            console.error(e)
                        }
                    }
                }

                promises = []

                // 都成功的話拉高上限
                if (arr.every(e => !(e instanceof Error))) {
                    maxLength++
                    if (maxLength > this.proxies.length)
                        maxLength = this.proxies.length
                } else {
                    console.log("there is error, back to 1")
                    maxLength = 1
                }

                console.log("===============================")
            }
        }

        return results
    }
}

module.exports = Sneaky
module.exports.RetryError = RetryError
module.exports.PauseError = PauseError