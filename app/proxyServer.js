const net = require("net")
const { SocksClient } = require("socks")

// Args arrive as `--key=value`. Split on the FIRST "=" only: proxy passwords
// routinely contain "=" (base64-ish secrets), and splitting on every "="
// silently truncated the password, so the upstream refused the connection.
function readArg(key) {
  const prefix = `--${key}=`
  const found = process.argv.find((a) => a.startsWith(prefix))
  return found ? found.slice(prefix.length) : null
}

const proxy = readArg("proxy")
// One relay per profile, each on its OWN port, so profiles with different
// upstreams can be open at the same time. Defaults to the historical 1080 when
// no --port is passed, which keeps any older caller working.
const localPort = Number(readArg("port")) || 1080

if (!proxy) process.exit(0)

// Upstream schemes this relay can forward to. The browser's side is always the
// same — it speaks plain no-auth SOCKS5 to 127.0.0.1 — so supporting an HTTP
// proxy is purely a question of how the relay reaches the far end.
const SOCKS_SCHEMES = ["socks", "socks4", "socks5"]
const HTTP_SCHEMES = ["http", "https"]

// HTTP is a CRLF protocol and a lone "\n" is not a legal line ending in a
// request line or header, so these are built from char codes rather than string
// escapes — the bytes on the wire have to be exactly 13, 10.
const CRLF = String.fromCharCode(13, 10)
const HEADER_END = CRLF + CRLF

/** Splits "host:port", or "[::1]:port" for IPv6. */
function splitHostPort(authority) {
  const v6 = /^\[([^\]]+)\]:(\d+)$/.exec(authority)
  if (v6) return { host: v6[1], port: Number(v6[2]) }
  const i = authority.lastIndexOf(":")
  if (i === -1) return { host: authority, port: 0 }
  return { host: authority.slice(0, i), port: Number(authority.slice(i + 1)) }
}

/**
 * Accepts BOTH shapes a proxy is handed out in:
 *
 *   scheme://user:pass@host:port      the URL standard
 *   scheme://host:port:user:pass      what most proxy providers actually print
 *
 * The second is why this is hand-rolled instead of `new URL()`. Fed
 * "socks5://66.93.165.106:50101:U3hu8m54:QycqBXVOl4", URL throws "Invalid URL"
 * outright — the port is not numeric — so the relay exited before binding and
 * every proxied profile came up with ERR_PROXY_CONNECTION_FAILED.
 *
 * A missing scheme is read as socks5, since that is what the field held before
 * schemes were required.
 *
 * Credentials are percent-DECODED only in the "@" form, which is the one the URL
 * spec says is encoded. The colon form is a raw provider string: decoding it
 * would corrupt any password containing a literal "%".
 */
function parseProxyUrl(raw) {
  const text = String(raw || "").trim()
  const scheme = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(text)
  const protocol = (scheme ? scheme[1] : "socks5").toLowerCase()
  const rest = (scheme ? scheme[2] : text).replace(/\/+$/, "")

  let host = ""
  let port = 0
  let username = ""
  let password = ""

  const at = rest.lastIndexOf("@")
  if (at !== -1) {
    const userinfo = rest.slice(0, at)
    const sep = userinfo.indexOf(":")
    username = decodeURIComponent(sep === -1 ? userinfo : userinfo.slice(0, sep))
    password = sep === -1 ? "" : decodeURIComponent(userinfo.slice(sep + 1))
    const hp = splitHostPort(rest.slice(at + 1))
    host = hp.host
    port = hp.port
  } else {
    // host:port[:user[:pass]] — everything past the third field is the password,
    // so a password containing ":" survives intact.
    const parts = rest.split(":")
    host = parts[0]
    port = Number(parts[1])
    if (parts.length >= 3) {
      username = parts[2]
      password = parts.slice(3).join(":")
    }
  }

  return {
    upstreamKind: HTTP_SCHEMES.includes(protocol) ? "http" : "socks",
    socksHost: host,
    socksPort: port,
    socksUsername: username,
    socksPassword: password,
    // socks4 upstreams exist; the wrapper previously forced type 5 for every URL.
    socksType: protocol === "socks4" ? 4 : 5,
    protocol,
  }
}

let proxyObj
try {
  proxyObj = parseProxyUrl(proxy)
  if (!proxyObj.socksHost || !proxyObj.socksPort) throw new Error("missing host or port")
  if (![...SOCKS_SCHEMES, ...HTTP_SCHEMES].includes(proxyObj.protocol)) {
    throw new Error(`unsupported scheme "${proxyObj.protocol}" — expected socks5, socks4 or http`)
  }
} catch (e) {
  // Exit WITHOUT binding the port. The caller still points the browser at that
  // port, so a bad proxy string fails CLOSED (no traffic) instead of quietly
  // falling back to a direct connection and leaking the real IP.
  console.error(`[proxyServer] invalid --proxy value: ${e?.message || e}`)
  process.exit(1)
}
/**
 * Opens a tunnel through an HTTP proxy with CONNECT, answering Basic auth up
 * front so the upstream never has to challenge us.
 *
 * Chrome cannot be pointed straight at an authenticated HTTP proxy here: with
 * credentials on --proxy-server it puts up its NATIVE proxy login dialog,
 * because nothing in a desktop-launched browser answers the 407. Doing the
 * CONNECT ourselves keeps the browser's side identical to the SOCKS case — it
 * still just talks no-auth SOCKS5 to this relay.
 *
 * Resolves { socket, leftover }: `leftover` is any tunnel payload the proxy
 * packed into the same TCP segment as its response headers. Dropping it would
 * silently lose the first bytes of the stream.
 */
function httpConnect({ host, port, username, password, targetHost, targetPort }) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, host)
    let settled = false
    const fail = (err) => {
      if (settled) return
      settled = true
      socket.destroy()
      reject(err)
    }

    socket.setTimeout(20000, () => fail(new Error("CONNECT timed out")))
    socket.once("error", fail)
    socket.once("connect", () => {
      const authority = `${targetHost}:${targetPort}`
      const lines = [`CONNECT ${authority} HTTP/1.1`, `Host: ${authority}`]
      if (username || password) {
        const credentials = Buffer.from(`${username}:${password}`).toString("base64")
        lines.push(`Proxy-Authorization: Basic ${credentials}`)
      }
      lines.push("Proxy-Connection: keep-alive", "", "")
      socket.write(lines.join(CRLF))
    })

    let head = Buffer.alloc(0)
    const onData = (chunk) => {
      head = Buffer.concat([head, chunk])
      const end = head.indexOf(HEADER_END)
      if (end === -1) {
        // A proxy that never terminates its headers must not grow this forever.
        if (head.length > 65536) fail(new Error("CONNECT response headers too large"))
        return
      }
      socket.removeListener("data", onData)
      const statusLine = head.slice(0, head.indexOf(CRLF)).toString("latin1").trim()
      const status = Number(statusLine.split(" ")[1])
      if (status !== 200) {
        // 407 here means the credentials were wrong or absent — worth naming,
        // since it is the difference between "proxy is down" and "bad password".
        return fail(new Error(status === 407 ? `upstream rejected the credentials (${statusLine})` : `upstream refused CONNECT (${statusLine})`))
      }
      settled = true
      socket.setTimeout(0)
      resolve({ socket, leftover: head.slice(end + HEADER_END.length) })
    }
    socket.on("data", onData)
  })
}

class Socks5Wrapper {
  constructor(config) {
    this.config = {
      localHost: config.localHost || "127.0.0.1",
      localPort: config.localPort || 1080,
      socksHost: config.socksHost || "127.0.0.1",
      socksPort: config.socksPort || 1080,
      socksUsername: config.socksUsername,
      socksPassword: config.socksPassword,
      socksType: config.socksType || 5,
      // "socks" (default) or "http" — how the far end is reached. The near end
      // is always no-auth SOCKS5, whichever this is.
      upstreamKind: config.upstreamKind === "http" ? "http" : "socks",
    }
    this.server = null
  }

  start() {
    this.server = net.createServer((clientSocket) => {
      let targetHost = ""
      let targetPort = 0
      let buffer = Buffer.alloc(0)

      clientSocket.once("data", async (data) => {
        buffer = Buffer.concat([buffer, data])

        // Parse SOCKS5 handshake
        if (buffer[0] === 0x05) {
          // Send auth method selection (no auth)
          clientSocket.write(Buffer.from([0x05, 0x00]))

          clientSocket.once("data", async (data) => {
            const cmd = data[1]
            const atyp = data[3]

            if (cmd !== 0x01) {
              clientSocket.write(Buffer.from([0x05, 0x07]))
              clientSocket.end()
              return
            }

            // Parse target address
            if (atyp === 0x01) {
              // IPv4
              targetHost = `${data[4]}.${data[5]}.${data[6]}.${data[7]}`
              targetPort = data.readUInt16BE(8)
            } else if (atyp === 0x03) {
              // Domain
              const len = data[4]
              targetHost = data.slice(5, 5 + len).toString()
              targetPort = data.readUInt16BE(5 + len)
            } else if (atyp === 0x04) {
              // IPv6
              const parts = []
              for (let i = 0; i < 16; i += 2) {
                parts.push(data.readUInt16BE(4 + i).toString(16))
              }
              targetHost = parts.join(":")
              targetPort = data.readUInt16BE(20)
            }

            try {
              // Reach the far end. Only this part differs between an
              // authenticated SOCKS5 upstream and an authenticated HTTP one;
              // everything either side of it is identical.
              let proxySocket
              let leftover = null
              if (this.config.upstreamKind === "http") {
                const tunnel = await httpConnect({
                  host: this.config.socksHost,
                  port: this.config.socksPort,
                  username: this.config.socksUsername,
                  password: this.config.socksPassword,
                  targetHost,
                  targetPort,
                })
                proxySocket = tunnel.socket
                leftover = tunnel.leftover
              } else {
                const socksOptions = {
                  proxy: {
                    host: this.config.socksHost,
                    port: this.config.socksPort,
                    type: this.config.socksType,
                  },
                  command: "connect",
                  destination: {
                    host: targetHost,
                    port: targetPort,
                  },
                }

                if (this.config.socksUsername && this.config.socksPassword) {
                  socksOptions.proxy.userId = this.config.socksUsername
                  socksOptions.proxy.password = this.config.socksPassword
                }

                const info = await SocksClient.createConnection(socksOptions)
                proxySocket = info.socket
              }

              // Send success response
              const response = Buffer.from([0x05, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
              clientSocket.write(response)

              // Bytes the HTTP proxy sent in the same segment as its CONNECT
              // response headers already belong to the tunnel — forward them
              // BEFORE piping, or the stream starts with a hole.
              if (leftover && leftover.length) clientSocket.write(leftover)

              // Pipe data between client and proxy
              clientSocket.pipe(proxySocket)
              proxySocket.pipe(clientSocket)

              proxySocket.on("error", (err) => {
                // console.error('Proxy socket error:', err.message);
                clientSocket.end()
              })

              clientSocket.on("error", (err) => {
                // console.error('Client socket error:', err.message);
                proxySocket.end()
              })
            } catch (err) {
              //   console.error('Error connecting through SOCKS5:', err.message);
              clientSocket.write(Buffer.from([0x05, 0x01]))
              clientSocket.end()
            }
          })
        }
      })

      clientSocket.on("error", (err) => {
        // console.error('Socket error:', err.message);
      })
    })

    this.server.listen(this.config.localPort, this.config.localHost, () => {
      console.log(`Running on: ${this.config.localHost}:${this.config.localPort}`)
    })

    // Now that each profile gets its own port, a bind failure (EADDRINUSE) is a
    // real possibility and must not be silent — the browser would be pointed at
    // a port nothing is listening on with no clue why.
    this.server.on("error", (err) => {
      console.error(`[proxyServer] listen failed on ${this.config.localHost}:${this.config.localPort}: ${err?.message || err}`)
      process.exit(1)
    })
  }

  stop() {
    if (this.server) {
      this.server.close(() => {
        // console.log('SOCKS5 wrapper stopped');
      })
    }
  }
}

// Usage example
const wrapper = new Socks5Wrapper({
  localHost: "127.0.0.1",
  localPort,
  ...proxyObj,
})

wrapper.start()

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...")
  wrapper.stop()
  process.exit(0)
})

module.exports = Socks5Wrapper
