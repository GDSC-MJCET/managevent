import { app } from './app.js'
import { env } from './config/env.js'
import { connectDatabase, disconnectDatabase } from './db/index.js'

async function main(): Promise<void> {
  await connectDatabase()
  console.log('Database connected')

  const server = app.listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT}`)
  })

  const shutdown = (signal: NodeJS.Signals) => {
    console.log(`${signal} received, shutting down`)

    server.close(async () => {
      await disconnectDatabase()
      process.exit(0)
    })

    setTimeout(() => process.exit(1), 10_000).unref()
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch(async (error: unknown) => {
  console.error('Failed to start the server')
  console.error(error)
  await disconnectDatabase()
  process.exit(1)
})
