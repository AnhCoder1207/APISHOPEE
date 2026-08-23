import { config } from 'dotenv'
import postgres from 'postgres'

config({ path: ['.dev.vars', '.env.production', '.env'], quiet: true })

const [mode, emailArgument] = process.argv.slice(2)
if (!['grant', 'revoke'].includes(mode)) {
  throw new Error('Cách dùng: npm run admin:grant -- email@example.com hoặc npm run admin:revoke -- email@example.com')
}
if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL')

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  ssl: 'require',
  prepare: false,
  connect_timeout: 15,
})

function maskEmail(email) {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 2)}***@${domain}`
}

try {
  let email = emailArgument?.trim().toLowerCase()
  if (!email && mode === 'grant') {
    const users = await sql`select email from camlink.users order by created_at`
    if (users.length !== 1) throw new Error('Có nhiều hơn một người dùng. Hãy truyền email cần cấp quyền admin')
    email = users[0].email
  }
  if (!email) throw new Error('Thiếu email người dùng')

  const users = await sql`
    select id::text, email, status, is_admin
    from camlink.users
    where lower(email) = ${email}
  `
  const user = users[0]
  if (!user) throw new Error('Không tìm thấy người dùng')

  if (mode === 'revoke' && user.is_admin) {
    const admins = await sql`
      select count(*)::int as count
      from camlink.users
      where is_admin = true and status = 'active' and id <> ${user.id}::uuid
    `
    if ((admins[0]?.count || 0) === 0) throw new Error('Không thể gỡ quyền admin cuối cùng đang hoạt động')
  }

  const isAdmin = mode === 'grant'
  await sql`
    update camlink.users
    set is_admin = ${isAdmin}, updated_at = now()
    where id = ${user.id}::uuid
  `
  console.log(`${isAdmin ? 'Đã cấp' : 'Đã gỡ'} quyền admin cho ${maskEmail(user.email)}`)
} finally {
  await sql.end()
}
