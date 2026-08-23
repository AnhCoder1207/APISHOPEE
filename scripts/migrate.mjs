import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import postgres from 'postgres'

async function loadEnvironmentFile(filePath) {
  try {
    const content = await readFile(filePath, 'utf8')
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const separator = line.indexOf('=')
      if (separator <= 0) continue
      const key = line.slice(0, separator).trim()
      let value = line.slice(separator + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = value
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

await loadEnvironmentFile(path.resolve('.dev.vars'))
await loadEnvironmentFile(path.resolve('.env.production'))
await loadEnvironmentFile(path.resolve('.env'))

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('Thiếu DATABASE_URL trong .dev.vars, .env.production hoặc biến môi trường')
}

const sql = postgres(connectionString, {
  max: 1,
  ssl: 'require',
  prepare: false,
  connect_timeout: 15,
})

try {
  await sql.unsafe(`
    create schema if not exists camlink;
    create table if not exists camlink.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `)

  const migrationDirectory = path.resolve('migrations')
  const migrationNames = (await readdir(migrationDirectory)).filter((name) => name.endsWith('.sql')).sort()

  for (const name of migrationNames) {
    const existing = await sql`select name from camlink.schema_migrations where name = ${name}`
    if (existing.length > 0) {
      console.log(`skip ${name}`)
      continue
    }

    const migration = await readFile(path.join(migrationDirectory, name), 'utf8')
    await sql.begin(async (transaction) => {
      await transaction.unsafe(migration)
      await transaction`insert into camlink.schema_migrations (name) values (${name})`
    })
    console.log(`applied ${name}`)
  }
} finally {
  await sql.end()
}

