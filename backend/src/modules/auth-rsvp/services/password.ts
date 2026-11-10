import bcrypt from 'bcryptjs'

const BCRYPT_COST = 10

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST)
}

export async function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  if (!passwordHash) return false
  return bcrypt.compare(plain, passwordHash)
}
