const crypto = require('crypto')

/* --------------------------------------------------
   In-memory stores
-------------------------------------------------- */

const rateLimitStore = new Map()
const replayStore = new Map()
const suspiciousActivity = new Map()
const betPatternStore = new Map()
const ipUserMap = new Map()
const userIpMap = new Map()
const transactionLocks = new Map()
const bannedIps = new Map()

/* --------------------------------------------------
   Helpers
-------------------------------------------------- */

const now = () => Date.now()

const cleanupExpired = (store) => {
  const time = now()
  for (const [key, value] of store.entries()) {
    if (value.expires && value.expires <= time) {
      store.delete(key)
    }
  }
}

/* --------------------------------------------------
   1. Rate Limiter
-------------------------------------------------- */

const rateLimiter = ({
  windowMs = 60000,
  maxRequests = 60,
  keyPrefix = 'rl'
} = {}) => {
  return (req, res, next) => {
    cleanupExpired(rateLimitStore)

    const key = `${keyPrefix}:${req.ip}:${req.path}`
    const entry = rateLimitStore.get(key) || {
      count: 0,
      expires: now() + windowMs
    }

    entry.count++
    rateLimitStore.set(key, entry)

    if (entry.count > maxRequests) {
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((entry.expires - now()) / 1000)
      })
    }

    next()
  }
}

/* --------------------------------------------------
   2. Request Signing (Replay Protection)
-------------------------------------------------- */

const requestSigner = () => {
  return (req, res, next) => {
    cleanupExpired(replayStore)

    const timestamp = req.headers['x-timestamp']
    const signature = req.headers['x-signature']

    if (!timestamp || !signature) return next()

    if (Math.abs(now() - Number(timestamp)) > 30000) {
      return res.status(401).json({ error: 'Request expired' })
    }

    const payload = JSON.stringify(req.body) + timestamp
    const expectedSignature = crypto
      .createHmac('sha256', req.session?.userId || '')
      .update(payload)
      .digest('hex')

    if (signature !== expectedSignature) {
      return res.status(401).json({ error: 'Invalid signature' })
    }

    if (replayStore.has(signature)) {
      return res.status(401).json({ error: 'Duplicate request' })
    }

    replayStore.set(signature, { expires: now() + 30000 })
    next()
  }
}

/* --------------------------------------------------
   3. Bet Validator + Circuit Breaker
-------------------------------------------------- */

const betValidator = () => {
  return (req, res, next) => {
    const { betAmount } = req.body
    const userId = req.session?.userId

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const strikes = suspiciousActivity.get(userId) || 0

    if (strikes > 5) {
      return res.status(403).json({ error: 'Account temporarily locked' })
    }

    if (typeof betAmount !== 'number' || betAmount <= 0 || betAmount > 100000) {
      suspiciousActivity.set(userId, strikes + 1)
      return res.status(400).json({ error: 'Invalid bet amount' })
    }

    const key = `${userId}:${betAmount}`
    const record = betPatternStore.get(key) || {
      count: 0,
      expires: now() + 60000
    }

    if (record.expires <= now()) {
      record.count = 0
      record.expires = now() + 60000
    }

    record.count++
    betPatternStore.set(key, record)

    if (record.count > 10) {
      suspiciousActivity.set(userId, strikes + 1)
      return res.status(429).json({ error: 'Unusual betting pattern detected' })
    }

    next()
  }
}

/* --------------------------------------------------
   4. Simple Query Cache
-------------------------------------------------- */

class QueryCache {
  constructor(ttl = 5000) {
    this.ttl = ttl
    this.cache = new Map()
  }

  get(key) {
    const entry = this.cache.get(key)
    if (!entry || entry.expires <= now()) {
      this.cache.delete(key)
      return null
    }
    return entry.value
  }

  set(key, value) {
    this.cache.set(key, {
      value,
      expires: now() + this.ttl
    })
  }

  cacheMiddleware(keyGenerator) {
    return (req, res, next) => {
      const key = keyGenerator(req)
      const cached = this.get(key)

      if (cached) return res.json(cached)

      const originalJson = res.json.bind(res)
      res.json = (data) => {
        if (res.statusCode === 200) {
          this.set(key, data)
        }
        return originalJson(data)
      }

      next()
    }
  }
}

/* --------------------------------------------------
   5. IP Fraud Detection
-------------------------------------------------- */

const fraudDetector = () => {
  return (req, res, next) => {
    const userId = req.session?.userId
    if (!userId) return next()

    const ip = req.ip

    const ips = userIpMap.get(userId) || new Set()
    ips.add(ip)
    userIpMap.set(userId, ips)

    if (ips.size > 5) {
      req.fraudRisk = 'high'
    }

    const users = ipUserMap.get(ip) || new Set()
    users.add(userId)
    ipUserMap.set(ip, users)

    if (users.size > 3) {
      req.fraudRisk = 'high'
    }

    next()
  }
}

/* --------------------------------------------------
   6. Transaction Lock
-------------------------------------------------- */

const transactionLock = () => {
  return (req, res, next) => {
    const userId = req.session?.userId
    if (!userId) return next()

    if (transactionLocks.has(userId)) {
      return res.status(409).json({ error: 'Transaction in progress' })
    }

    transactionLocks.set(userId, true)

    const originalEnd = res.end
    res.end = function (...args) {
      transactionLocks.delete(userId)
      originalEnd.apply(res, args)
    }

    next()
  }
}

/* --------------------------------------------------
   7. Audit Logger
-------------------------------------------------- */

const auditLogger = () => {
  return (req, res, next) => {
    const start = now()
    const originalEnd = res.end

    res.end = function (...args) {
      const audit = {
        timestamp: new Date(),
        userId: req.session?.userId,
        ip: req.ip,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: now() - start,
        fraudRisk: req.fraudRisk
      }

      if (res.statusCode >= 400 || req.fraudRisk === 'high') {
        console.log('AUDIT:', JSON.stringify(audit))
      }

      originalEnd.apply(res, args)
    }

    next()
  }
}

/* --------------------------------------------------
   8. HMAC Validator
-------------------------------------------------- */

const hmacValidator = (secret) => {
  return (req, res, next) => {
    const provided = req.headers['x-hmac']
    if (!provided) return next()

    const expected = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(req.body))
      .digest('hex')

    if (provided !== expected) {
      return res.status(401).json({ error: 'Invalid HMAC' })
    }

    next()
  }
}

/* --------------------------------------------------
   9. Honeypot
-------------------------------------------------- */

const honeypot = () => {
  return (req, res, next) => {
    if (req.body?.email_confirm || req.body?.phone_number) {
      bannedIps.set(req.ip, now() + 86400000)
      return res.status(403).json({ error: 'Forbidden' })
    }
    next()
  }
}

/* --------------------------------------------------
   10. Ban Checker
-------------------------------------------------- */

const banChecker = () => {
  return (req, res, next) => {
    const expires = bannedIps.get(req.ip)
    if (expires && expires > now()) {
      return res.status(403).json({ error: 'IP banned' })
    }
    next()
  }
}

/* --------------------------------------------------
   Exports
-------------------------------------------------- */

module.exports = {
  rateLimiter,
  requestSigner,
  betValidator,
  QueryCache,
  fraudDetector,
  transactionLock,
  auditLogger,
  hmacValidator,
  honeypot,
  banChecker
}
