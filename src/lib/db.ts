import postgres from 'postgres'
import type { AppBindings } from './types.js'

export type Database = ReturnType<typeof postgres>

const clients = new Map<string, Database>()

export function getDatabase(env: AppBindings['Bindings']): Database {
  const connectionString = env.HYPERDRIVE?.connectionString || env.DATABASE_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL hoặc HYPERDRIVE chưa được cấu hình')
  }

  const existing = clients.get(connectionString)
  if (existing) return existing

  const client = postgres(connectionString, {
    max: 1,
    ssl: 'require',
    prepare: false,
    connect_timeout: 15,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    fetch_types: false,
  })

  clients.set(connectionString, client)
  return client
}

export async function closeDatabases(): Promise<void> {
  const activeClients = [...clients.values()]
  clients.clear()
  await Promise.allSettled(activeClients.map((client) => client.end({ timeout: 5 })))
}
