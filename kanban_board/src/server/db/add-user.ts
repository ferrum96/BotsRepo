import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from './index.js'
import { users } from './schema.js'

function printUsage() {
  console.log(`Usage:
  npm run db:add-user -- <username> <password> "<Display Name>" [--force]

Options:
  --force   update password and displayName if user already exists

Examples:
  npm run db:add-user -- petrov 'Secret123!' "Петров Иван"
  npm run db:add-user -- petrov 'NewPass!' "Петров Иван" --force
`)
}

async function addUser(username: string, password: string, displayName: string, force: boolean) {
  const existing = db.select().from(users).where(eq(users.username, username)).get()
  const passwordHash = await bcrypt.hash(password, 10)

  if (existing) {
    if (!force) {
      console.error(`User "${username}" already exists. Use --force to update.`)
      process.exit(1)
    }

    db.update(users)
      .set({ passwordHash, displayName })
      .where(eq(users.id, existing.id))
      .run()

    console.log(`Updated: ${username} (${displayName})`)
    return
  }

  db.insert(users).values({
    id: randomUUID(),
    username,
    passwordHash,
    displayName,
    avatar: null,
    createdAt: new Date(),
  }).run()

  console.log(`Created: ${username} (${displayName})`)
}

const args = process.argv.slice(2).filter((arg) => arg !== '--')
const force = args.includes('--force')
const positional = args.filter((arg) => arg !== '--force')

const [username, password, displayName] = positional

if (!username || !password || !displayName) {
  printUsage()
  process.exit(1)
}

addUser(username.trim(), password, displayName.trim(), force)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
