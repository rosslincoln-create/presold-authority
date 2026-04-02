import { SignJWT, jwtVerify } from 'jose'
import * as bcrypt from 'bcryptjs'
import { Context } from 'hono'
import { Env } from '../index'

// ─── Types ───────────────────────────────────────────────────────────────────

export type SessionData = {
  userId: string
  email: string
  role: string
  tier: string
  userStatus: string
  expiresAt: string
}

export type JWTPayload = {
  sessionId: string
  userId: string
  email: string
  role: string
  tier: string
}

// ─── Password Utilities ───────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// ─── JWT Utilities ────────────────────────────────────────────────────────────

export async function createJWT(
  payload: JWTPayload,
  secret: string
): Promise<string> {
  const key = new TextEncoder().encode(secret)
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key)
}

export async function verifyJWT(
  token: string,
  secret: string
): Promise<JWTPayload | null> {
  try {
    const key = new TextEncoder().encode(secret)
    const { payload } = await jwtVerify(token, key)
    return payload as unknown as JWTPayload
  } catch {
    return null
  }
}

// ─── Cookie Utilities ─────────────────────────────────────────────────────────

export function setSessionCookie(c: Context, token: string): void {
  c.header('Set-Cookie',
    `psa_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 60 * 60}`
  )
}

export function clearSessionCookie(c: Context): void {
  c.header('Set-Cookie',
    `psa_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
  )
}

export function getSessionCookie(c: Context): string | undefined {
  const cookieHeader = c.req.header('Cookie') || ''
  const match = cookieHeader.match(/psa_session=([^;]+)/)
  return match ? match[1] : undefined
}

// ─── UUID Generation ──────────────────────────────────────────────────────────

export function generateId(): string {
  return crypto.randomUUID()
}

// ─── KV Session Utilities ─────────────────────────────────────────────────────

export async function createSession(
  kv: KVNamespace,
  sessionId: string,
  sessionData: SessionData
): Promise<void> {
  const ttlSeconds = 7 * 24 * 60 * 60 // 7 days

  // Primary session key
  await kv.put(
    `sessions:${sessionId}`,
    JSON.stringify(sessionData),
    { expirationTtl: ttlSeconds }
  )

  // Index key for batch deletion on revocation
  await kv.put(
    `sessions-by-user:${sessionData.userId}:${sessionId}`,
    JSON.stringify({ sessionId }),
    { expirationTtl: ttlSeconds }
  )
}

export async function getSession(
  kv: KVNamespace,
  sessionId: string
): Promise<SessionData | null> {
  const data = await kv.get(`sessions:${sessionId}`)
  if (!data) return null
  return JSON.parse(data) as SessionData
}

export async function deleteSession(
  kv: KVNamespace,
  sessionId: string,
  userId: string
): Promise<void> {
  await kv.delete(`sessions:${sessionId}`)
  await kv.delete(`sessions-by-user:${userId}:${sessionId}`)
}

export async function deleteAllUserSessions(
  kv: KVNamespace,
  userId: string
): Promise<void> {
  // List all session index keys for this user
  const list = await kv.list({ prefix: `sessions-by-user:${userId}:` })

  // Delete each session and its index key
  await Promise.all(
    list.keys.map(async (key) => {
      const data = await kv.get(key.name)
      if (data) {
        const { sessionId } = JSON.parse(data)
        await kv.delete(`sessions:${sessionId}`)
      }
      await kv.delete(key.name)
    })
  )
}
