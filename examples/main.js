const Sneaky = require(__dirname + '/../sneaky')
const { RetryError, PauseError } = require(__dirname + '/../sneaky')

async function main() {
    const proxies = [
        "http://10.140.0.18:8899",
        "http://10.140.0.18:8900",
        "http://10.140.0.18:8901",
        "http://10.140.0.18:8902",
        "http://10.140.0.18:8903",
        "http://10.170.0.5:8899",
        "http://10.146.0.2:8899",
        "http://10.170.0.6:8899",
        "http://10.170.0.7:8899"]

    let sn = new Sneaky(proxies)

    await sn.test()

    let urls = Array(30).fill("http://ident.me")
    urls[9] = "bad"
    urls[13] = "http://109.11.1.1"

    let results = await sn.run(urls, {}, async function (res) {
        if (res instanceof Error) {
            throw new PauseError(3000)
        } else {
            if (res.status !== 200)
                throw new RetryError("http://www.google.com")
            let text = await res.text()
            return text.slice(0, 15)
        }
    })

    let c = results.reduce((p, c) => p + c + " ", "")
    console.log(c)
}

main()
