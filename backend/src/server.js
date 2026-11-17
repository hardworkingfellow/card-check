import 'dotenv/config'
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { createServer as createHttpServer } from 'node:http'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import multer from 'multer'
import { MongoClient, ObjectId } from 'mongodb'
import { pathToFileURL } from 'node:url'
import { createCloudinaryStorage } from './cloudinaryStorage.js'

const scrypt = promisify(scryptCallback)
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000
const maxImageBytes = 5 * 1024 * 1024
const maxImagePixels = 20_000_000
const brands = [
  { id: 'apple', name: 'Apple Gift Card', description: 'For Apple products, services, and subscriptions.', accent: '#18191b' },
  { id: 'xbox', name: 'Xbox Gift Card', description: 'For games, add-ons, and entertainment on Xbox.', accent: '#107c10', shortName: 'XBOX' },
  { id: 'razer', name: 'Razer Gold', description: 'A payment option for games and digital content.', accent: '#44d62c' },
  { id: 'visa', name: 'Visa Gift Card', description: 'A prepaid card on the Visa payment network.', accent: '#1a1f71' },
  { id: 'other', name: 'Other Gift Cards', description: 'Choose this for another supported card type.', accent: '#426b5b' },
]
const brandIds = new Set(brands.map(({ id }) => id))
const reviewStatuses = new Set(['pending_review', 'valid', 'invalid', 'unable_to_verify'])

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, salt, 64)
  return { salt, hash: derived.toString('hex') }
}

async function passwordMatches(password, salt, expectedHash) {
  const derived = await scrypt(password, salt, 64)
  const expected = Buffer.from(expectedHash, 'hex')
  return expected.length === derived.length && timingSafeEqual(expected, derived)
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((part) => {
      const separator = part.indexOf('=')
      if (separator < 0) return ['', '']
      const name = part.slice(0, separator).trim()
      try {
        return [name, decodeURIComponent(part.slice(separator + 1).trim())]
      } catch {
        return [name, '']
      }
    }).filter(([name]) => name),
  )
}

function setSessionCookie(response, token, secure) {
  const attributes = [
    `gc_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(sessionLifetimeMs / 1000)}`,
  ]
  if (secure) attributes.push('Secure')
  response.setHeader('Set-Cookie', attributes.join('; '))
}

function clearSessionCookie(response, secure) {
  response.setHeader(
    'Set-Cookie',
    `gc_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`,
  )
}

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
  }
}

function imageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  return null
}

function jpegDimensions(buffer) {
  let offset = 2
  const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) return null
    while (buffer[offset] === 0xff) offset += 1
    const marker = buffer[offset]
    offset += 1
    if (marker === 0xd9 || marker === 0xda) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue

    if (offset + 2 > buffer.length) return null
    const segmentLength = buffer.readUInt16BE(offset)
    if (segmentLength < 2 || offset + segmentLength > buffer.length) return null
    if (frameMarkers.has(marker)) {
      if (segmentLength < 7) return null
      return {
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3),
      }
    }
    offset += segmentLength
  }
  return null
}

function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next)
}

function mapSubmission(submission, includeOwner = false) {
  return {
    id: submission._id.toString(),
    brandId: submission.brandId,
    status: submission.status,
    submittedAt: submission.createdAt.toISOString(),
    imageUrl: `/api/admin/submissions/${submission._id.toString()}/image`,
    ...(includeOwner ? { submittedBy: 'Public visitor' } : {}),
  }
}

export function createApp({
  db,
  imageStorage,
  uploadDir = path.resolve('private-uploads'),
  adminEmail = '',
  secureCookies = process.env.NODE_ENV === 'production',
  retentionDays = 30,
  authRequestLimit = 10,
} = {}) {
  if (!db) throw new Error('A MongoDB database handle is required.')
  if (!imageStorage) throw new Error('An image storage adapter is required.')

  const users = db.collection('users')
  const sessions = db.collection('sessions')
  const submissions = db.collection('submissions')
  const configuredAdminEmail = adminEmail.trim().toLowerCase()
  const app = express()
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxImageBytes, files: 1, fields: 1, parts: 2, fieldNameSize: 50, fieldSize: 100 },
    fileFilter: (_request, file, callback) => {
      if (file.mimetype !== 'image/jpeg') {
        callback(new Error('Upload a JPEG image prepared in the browser.'))
        return
      }
      callback(null, true)
    },
  })

  app.disable('x-powered-by')
  app.use('/api', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    next()
  })
  app.use(express.json({ limit: '4kb', strict: true }))

  const authenticationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: authRequestLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' },
  })
  const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many image uploads. Try again later.' },
  })
  const methodsByPath = new Map([
    ['/api/health', ['GET']],
    ['/api/cards/brands', ['GET']],
    ['/api/cards/verify', ['POST']],
    ['/api/admin/auth/login', ['POST']],
    ['/api/admin/auth/me', ['GET']],
    ['/api/admin/auth/logout', ['POST']],
    ['/api/submissions', ['POST']],
    ['/api/admin/submissions', ['GET']],
  ])
  const methodsForPath = (pathName) => {
    const directMatch = methodsByPath.get(pathName)
    if (directMatch) return directMatch
    if (/^\/api\/admin\/submissions\/[^/]+\/image$/.test(pathName)) return ['GET']
    if (/^\/api\/admin\/submissions\/[^/]+\/status$/.test(pathName)) return ['PATCH']
    if (/^\/api\/admin\/submissions\/[^/]+$/.test(pathName)) return ['DELETE']
    return undefined
  }

  app.use('/api', (request, response, next) => {
    const pathName = request.originalUrl.split('?', 1)[0]
    const allowedMethods = methodsForPath(pathName)
    const changesState = !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
    if (allowedMethods?.includes(request.method) && changesState && request.get('x-app-request') !== '1') {
      response.status(403).json({ error: 'Request verification header is required.' })
      return
    }
    next()
  })

  const loadUser = asyncRoute(async (request, response, next) => {
    const token = parseCookies(request.headers.cookie).gc_session
    if (!token) {
      response.status(401).json({ error: 'Sign in is required.' })
      return
    }

    const session = await sessions.findOne({
      tokenHash: hashToken(token),
      expiresAt: { $gt: new Date() },
    })
    if (!session) {
      clearSessionCookie(response, secureCookies)
      response.status(401).json({ error: 'Your session has expired. Sign in again.' })
      return
    }

    const user = await users.findOne({ _id: session.userId })
    if (!user) {
      await sessions.deleteOne({ _id: session._id })
      clearSessionCookie(response, secureCookies)
      response.status(401).json({ error: 'Your account is no longer available.' })
      return
    }

    request.user = user
    request.session = session
    next()
  })

  const requireAdmin = (request, response, next) => {
    if (request.user.role !== 'admin') {
      response.status(403).json({ error: 'Administrator access is required.' })
      return
    }
    next()
  }

  async function createSession(user, response) {
    const token = randomBytes(32).toString('base64url')
    await sessions.insertOne({
      userId: user._id,
      tokenHash: hashToken(token),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + sessionLifetimeMs),
    })
    setSessionCookie(response, token, secureCookies)
  }

  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }))
  app.get('/api/cards/brands', (_request, response) => response.json({ brands }))

  app.post('/api/admin/auth/login', authenticationLimiter, asyncRoute(async (request, response) => {
    const { email, password } = request.body ?? {}
    if (typeof email !== 'string' || typeof password !== 'string' || email.length > 254 || password.length > 128) {
      response.status(400).json({ error: 'Enter your email and password.' })
      return
    }

    const normalizedEmail = email.trim().toLowerCase()
    const user = normalizedEmail === configuredAdminEmail
      ? await users.findOne({ email: normalizedEmail, role: 'admin' })
      : null
    const matches = user
      ? await passwordMatches(password, user.passwordSalt, user.passwordHash)
      : await passwordMatches(password, '00000000000000000000000000000000', '00'.repeat(64))
    if (!user || !matches) {
      response.status(401).json({ error: 'Email or password is incorrect.' })
      return
    }

    await createSession(user, response)
    response.json({ user: publicUser(user) })
  }))

  app.get('/api/admin/auth/me', loadUser, requireAdmin, (request, response) => {
    response.json({ user: publicUser(request.user) })
  })

  app.post('/api/admin/auth/logout', loadUser, requireAdmin, asyncRoute(async (request, response) => {
    await sessions.deleteOne({ _id: request.session._id })
    clearSessionCookie(response, secureCookies)
    response.json({ status: 'ok' })
  }))

  app.post('/api/cards/verify', asyncRoute(async (request, response) => {
    const { brandId, ...otherFields } = request.body ?? {}
    if (Object.keys(otherFields).length || typeof brandId !== 'string' || !brandIds.has(brandId)) {
      response.status(400).json({ error: 'A supported brandId is required. Card codes and images are not accepted.' })
      return
    }
    response.json({
      status: 'unable_to_verify',
      balance: null,
      currency: null,
      valid: null,
      timestamp: null,
      referenceId: null,
      provider: 'No issuer connected',
    })
  }))

  app.post('/api/submissions', uploadLimiter, (request, response, next) => {
    upload.single('image')(request, response, (error) => {
      if (error) {
        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
          response.status(413).json({ error: 'Image must be 5 MB or smaller.' })
          return
        }
        response.status(400).json({ error: error.message })
        return
      }
      next()
    })
  }, asyncRoute(async (request, response) => {
    if (Object.keys(request.body ?? {}).some((key) => key !== 'brandId')) {
      response.status(400).json({ error: 'Only brandId and an image are accepted.' })
      return
    }
    if (!request.file) {
      response.status(400).json({ error: 'Select a card image to upload.' })
      return
    }
    if (!brandIds.has(request.body.brandId)) {
      response.status(400).json({ error: 'Select a supported card category.' })
      return
    }
    if (!imageType(request.file.buffer)) {
      response.status(400).json({ error: 'The uploaded file is not a valid JPEG image.' })
      return
    }
    const dimensions = jpegDimensions(request.file.buffer)
    if (!dimensions || !dimensions.width || !dimensions.height) {
      response.status(400).json({ error: 'The uploaded JPEG image is malformed.' })
      return
    }
    if (dimensions.width * dimensions.height > maxImagePixels) {
      response.status(413).json({ error: 'Image must be 20 megapixels or smaller.' })
      return
    }

    const { publicId } = await imageStorage.upload(request.file.buffer)
    const createdAt = new Date()
    const submission = {
      brandId: request.body.brandId,
      status: 'pending_review',
      cloudinaryPublicId: publicId,
      mimeType: imageType(request.file.buffer),
      createdAt,
      expiresAt: new Date(createdAt.getTime() + retentionDays * 24 * 60 * 60 * 1000),
    }

    try {
      const result = await submissions.insertOne(submission)
      submission._id = result.insertedId
    } catch (error) {
      try {
        await imageStorage.delete(publicId)
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Could not save submission or clean up its Cloudinary image.')
      }
      throw error
    }

    response.status(201).json({ submission: mapSubmission(submission) })
  }))

  app.get('/api/admin/submissions', loadUser, requireAdmin, asyncRoute(async (request, response) => {
    const records = await submissions.find(
      { expiresAt: { $gt: new Date() } },
      { projection: { imageName: 0, mimeType: 0 } },
    ).sort({ createdAt: -1 }).limit(200).toArray()
    response.json({ submissions: records.map((record) => mapSubmission(record, true)) })
  }))

  app.get('/api/admin/submissions/:id/image', loadUser, requireAdmin, asyncRoute(async (request, response) => {
    if (!ObjectId.isValid(request.params.id)) {
      response.status(404).json({ error: 'Submission image not found.' })
      return
    }
    const submission = await submissions.findOne({
      _id: new ObjectId(request.params.id),
      expiresAt: { $gt: new Date() },
    })
    if (!submission) {
      response.status(404).json({ error: 'Submission image not found.' })
      return
    }

    response.setHeader('Cache-Control', 'private, no-store')
    response.setHeader('Content-Disposition', 'inline; filename="card-image"')
    if (submission.cloudinaryPublicId) {
      const image = await imageStorage.get(submission.cloudinaryPublicId)
      response.setHeader('Content-Type', image.mimeType)
      response.send(image.buffer)
      return
    }
    if (!/^[\da-f-]{36}\.bin$/i.test(submission.imageName ?? '')) {
      response.status(404).json({ error: 'Submission image not found.' })
      return
    }
    response.setHeader('Content-Type', submission.mimeType)
    response.sendFile(path.join(uploadDir, submission.imageName), (error) => {
      if (error && !response.headersSent) response.status(404).json({ error: 'Submission image not found.' })
    })
  }))

  app.patch('/api/admin/submissions/:id/status', loadUser, requireAdmin, asyncRoute(async (request, response) => {
    const { status } = request.body ?? {}
    if (!ObjectId.isValid(request.params.id) || !reviewStatuses.has(status)) {
      response.status(400).json({ error: 'A valid submission ID and review status are required.' })
      return
    }
    const result = await submissions.updateOne(
      { _id: new ObjectId(request.params.id), expiresAt: { $gt: new Date() } },
      { $set: { status, reviewedAt: new Date(), reviewedBy: request.user._id } },
    )
    if (!result.matchedCount) {
      response.status(404).json({ error: 'Submission not found.' })
      return
    }
    response.json({ status })
  }))

  app.delete('/api/admin/submissions/:id', loadUser, requireAdmin, asyncRoute(async (request, response) => {
    if (!ObjectId.isValid(request.params.id)) {
      response.status(404).json({ error: 'Submission not found.' })
      return
    }
    const submission = await submissions.findOne({ _id: new ObjectId(request.params.id) })
    if (!submission) {
      response.status(404).json({ error: 'Submission not found.' })
      return
    }
    if (submission.cloudinaryPublicId) {
      await imageStorage.delete(submission.cloudinaryPublicId)
    } else if (/^[\da-f-]{36}\.bin$/i.test(submission.imageName ?? '')) {
      await unlink(path.join(uploadDir, submission.imageName)).catch((error) => {
        if (error.code !== 'ENOENT') throw error
      })
    } else {
      response.status(500).json({ error: 'Stored image reference is invalid.' })
      return
    }
    await submissions.deleteOne({ _id: submission._id })
    response.json({ status: 'deleted' })
  }))

  app.use('/api', (request, response, next) => {
    const pathName = request.originalUrl.split('?', 1)[0]
    const allowedMethods = methodsForPath(pathName)
    if (allowedMethods && !allowedMethods.includes(request.method)) {
      response.setHeader('Allow', allowedMethods.join(', '))
      response.status(405).json({ error: 'Method not allowed.' })
      return
    }
    next()
  })
  app.use('/api', (_request, response) => response.status(404).json({ error: 'API route not found.' }))
  app.use((error, _request, response, _next) => {
    if (error?.type === 'entity.parse.failed') {
      response.status(400).json({ error: 'Request body must be valid JSON.' })
      return
    }
    if (error?.type === 'entity.too.large') {
      response.status(413).json({ error: 'Request body is too large.' })
      return
    }
    console.error('Unhandled API request error:', error)
    if (response.headersSent) return
    response.status(500).json({ error: 'An unexpected server error occurred.' })
  })

  return app
}

export function createServer(options) {
  return createHttpServer(createApp(options))
}

export async function initializeDatabase(db, { adminEmail, adminPassword, retentionDays }) {
  if (!adminEmail || typeof adminPassword !== 'string' || adminPassword.length < 12 || adminPassword.length > 128) {
    throw new Error('Set ADMIN_EMAIL and an ADMIN_PASSWORD between 12 and 128 characters.')
  }
  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('submissions').createIndex({ createdAt: -1 }),
    db.collection('submissions').createIndex({ expiresAt: 1 }),
  ])
  const email = adminEmail.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('ADMIN_EMAIL must be a valid email address.')
  }
  const adminUser = await db.collection('users').findOne({ email })
  const passwordUnchanged = adminUser
    ? await passwordMatches(adminPassword, adminUser.passwordSalt, adminUser.passwordHash)
    : false
  const update = {
    name: 'Administrator',
    email,
    role: 'admin',
  }
  if (!passwordUnchanged) {
    const credentials = await hashPassword(adminPassword)
    Object.assign(update, {
      passwordHash: credentials.hash,
      passwordSalt: credentials.salt,
    })
  }

  if (adminUser) {
    await db.collection('users').updateOne({ _id: adminUser._id }, { $set: update })
    if (!passwordUnchanged) {
      await db.collection('sessions').deleteMany({ userId: adminUser._id })
    }
  } else {
    await db.collection('users').insertOne({ ...update, createdAt: new Date() })
  }

  const parsedRetention = Number(retentionDays)
  if (!Number.isInteger(parsedRetention) || parsedRetention < 1 || parsedRetention > 365) {
    throw new Error('SUBMISSION_RETENTION_DAYS must be a whole number between 1 and 365.')
  }
  return parsedRetention
}

export async function cleanupExpiredSubmissions(db, uploadDir, imageStorage) {
  const expired = await db.collection('submissions')
    .find({ expiresAt: { $lte: new Date() } })
    .limit(500)
    .toArray()

  for (const submission of expired) {
    if (submission.cloudinaryPublicId) {
      await imageStorage.delete(submission.cloudinaryPublicId)
    } else if (/^[\da-f-]{36}\.bin$/i.test(submission.imageName ?? '')) {
      await unlink(path.join(uploadDir, submission.imageName)).catch((error) => {
        if (error.code !== 'ENOENT') throw error
      })
    }
    await db.collection('submissions').deleteOne({ _id: submission._id })
  }
  return expired.length
}

export async function startServer() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('Set MONGODB_URI in backend/.env before starting the server.')

  const imageStorage = createCloudinaryStorage({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    folder: process.env.CLOUDINARY_FOLDER ?? 'giftcard-submissions',
  })
  const mongo = new MongoClient(uri)
  await mongo.connect()
  const db = mongo.db(process.env.MONGODB_DB ?? 'giftcard_checker')
  const retentionDays = await initializeDatabase(db, {
    adminEmail: process.env.ADMIN_EMAIL,
    adminPassword: process.env.ADMIN_PASSWORD,
    retentionDays: 30,
  })
  const app = createApp({
    db,
    imageStorage,
    adminEmail: process.env.ADMIN_EMAIL.trim().toLowerCase(),
    retentionDays,
  })
  const uploadDir = path.resolve('private-uploads')
  await cleanupExpiredSubmissions(db, uploadDir, imageStorage)
  const cleanupTimer = setInterval(() => {
    cleanupExpiredSubmissions(db, uploadDir, imageStorage).catch((error) => {
      console.error('Could not clean up expired card submissions:', error)
    })
  }, 60 * 60 * 1000)
  cleanupTimer.unref()
  const server = createHttpServer(app)
  const host = process.env.HOST ?? '0.0.0.0'
  const port = Number(process.env.PORT ?? 3001)

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, resolve)
  })
  server.once('close', () => {
    clearInterval(cleanupTimer)
    void mongo.close()
  })
  console.log(`GiftCard Checker API listening on http://${host}:${port}`)
  return { server, mongo }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => {
    if (error.message.startsWith('Set ') || error.message.startsWith('ADMIN_')) {
      console.error('Could not start GiftCard Checker API:', error.message)
    } else {
      console.error('Could not start GiftCard Checker API. Check MongoDB connectivity and server configuration.')
    }
    process.exitCode = 1
  })
}
