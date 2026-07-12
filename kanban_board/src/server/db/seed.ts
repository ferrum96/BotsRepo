import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from './index.js'
import { users } from './schema.js'

export const DEFAULT_USERS = [
  { username: 'ivan', password: 'ivan123', displayName: 'Иван Петров' },
  { username: 'maria', password: 'maria123', displayName: 'Мария Сидорова' },
] as const

export async function seedUsers() {
  for (const user of DEFAULT_USERS) {
    const existing = db.select().from(users).where(eq(users.username, user.username)).get()
    if (existing) continue

    const passwordHash = await bcrypt.hash(user.password, 10)
    db.insert(users).values({
      id: randomUUID(),
      username: user.username,
      passwordHash,
      displayName: user.displayName,
      avatar: null,
      createdAt: new Date(),
    }).run()
  }
}

const isDirectRun = process.argv[1]?.includes('seed')

if (isDirectRun) {
  const force = process.argv.includes('--force')
  if (process.env.NODE_ENV === 'production' && !force) {
    console.error(
      'Refusing to seed demo users in production.\n' +
        'Use: npm run db:add-user -- <username> <password> "<Display Name>"\n' +
        'Or pass --force to seed demo accounts anyway.'
    )
    process.exit(1)
  }

  seedUsers()
    .then(() => {
      console.log('Seeded demo users:')
      for (const user of DEFAULT_USERS) {
        console.log(`  ${user.username} / ${user.password} (${user.displayName})`)
      }
      process.exit(0)
    })
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
