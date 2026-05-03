import { startServer } from 'next/dist/server/lib/start-server.js'

const args = process.argv.slice(2)

function readOption(name, shortName, fallback) {
  const longIndex = args.indexOf(name)
  if (longIndex !== -1 && args[longIndex + 1]) {
    return args[longIndex + 1]
  }

  if (shortName) {
    const shortIndex = args.indexOf(shortName)
    if (shortIndex !== -1 && args[shortIndex + 1]) {
      return args[shortIndex + 1]
    }
  }

  const inline = args.find((arg) => arg.startsWith(`${name}=`))
  if (inline) {
    return inline.slice(name.length + 1)
  }

  return fallback
}

const port = Number(readOption('--port', '-p', process.env.PORT || '3001'))
const hostname = readOption('--hostname', '-H', undefined)
const useWebpack = args.includes('--webpack')

process.env.__NEXT_DEV_SERVER = '1'
process.env.NEXT_PRIVATE_START_TIME = Date.now().toString()

if (!useWebpack) {
  process.env.TURBOPACK = process.env.TURBOPACK || '1'
}

try {
  await startServer({
    dir: process.cwd(),
    isDev: true,
    port,
    hostname,
    allowRetry: true,
  })

  setInterval(() => {}, 2147483647)
} catch (error) {
  console.error(error)
  process.exit(1)
}
