const os = require('os')
const v8 = require('v8')
const cluster = require('cluster')
const { EventEmitter } = require('events')

class PerformanceMonitor extends EventEmitter {
  constructor() {
    super()
    this.metrics = {
      requests: new Map(),
      games: new Map(),
      errors: [],
      slowQueries: [],
      memoryLeaks: []
    }
    this.startTime = Date.now()
  }
  
  // Request timing middleware
  requestTimer() {
    return (req, res, next) => {
      const start = process.hrtime.bigint()
      const id = `${req.method}:${req.path}`
      
      res.on('finish', () => {
        const duration = Number(process.hrtime.bigint() - start) / 1000000 // ms
        
        if (!this.metrics.requests.has(id)) {
          this.metrics.requests.set(id, {
            count: 0,
            totalTime: 0,
            avgTime: 0,
            maxTime: 0,
            minTime: Infinity
          })
        }
        
        const metric = this.metrics.requests.get(id)
        metric.count++
        metric.totalTime += duration
        metric.avgTime = metric.totalTime / metric.count
        metric.maxTime = Math.max(metric.maxTime, duration)
        metric.minTime = Math.min(metric.minTime, duration)
        
        // Alert on slow requests
        if (duration > 1000) { // > 1 second
          this.emit('slowRequest', {
            path: req.path,
            method: req.method,
            duration,
            timestamp: new Date()
          })
        }
      })
      
      next()
    }
  }
  
  // Database query monitoring
  monitorQueries() {
    const mongoose = require('mongoose')
    
    // Hook into MongoDB queries
    mongoose.plugin((schema) => {
      schema.pre('find', function() {
        this._startTime = Date.now()
      })
      
      schema.post('find', function() {
        const duration = Date.now() - this._startTime
        if (duration > 100) { // > 100ms
          this.metrics.slowQueries.push({
            collection: this.mongooseCollection.name,
            operation: 'find',
            duration,
            timestamp: new Date()
          })
        }
      })
    })
  }
  
  // Memory monitoring
  monitorMemory() {
    setInterval(() => {
      const used = process.memoryUsage()
      const heap = v8.getHeapStatistics()
      
      const metrics = {
        rss: used.rss / 1024 / 1024, // MB
        heapUsed: used.heapUsed / 1024 / 1024,
        heapTotal: used.heapTotal / 1024 / 1024,
        external: used.external / 1024 / 1024,
        heapLimit: heap.heap_size_limit / 1024 / 1024,
        heapUsagePercent: (used.heapUsed / heap.heap_size_limit) * 100
      }
      
      // Alert on high memory usage
      if (metrics.heapUsagePercent > 85) {
        this.emit('highMemory', metrics)
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc()
        }
      }
      
      // Detect memory leaks
      if (this.lastHeapUsed) {
        const increase = metrics.heapUsed - this.lastHeapUsed
        if (increase > 50) { // 50MB increase
          this.metrics.memoryLeaks.push({
            increase,
            current: metrics.heapUsed,
            timestamp: new Date()
          })
        }
      }
      this.lastHeapUsed = metrics.heapUsed
      
    }, 30000) // Every 30 seconds
  }
  
  // CPU monitoring
  monitorCPU() {
    let lastCPU = process.cpuUsage()
    
    setInterval(() => {
      const currentCPU = process.cpuUsage(lastCPU)
      const totalCPU = (currentCPU.user + currentCPU.system) / 1000000 // seconds
      
      if (totalCPU > 0.8) { // 80% CPU
        this.emit('highCPU', {
          user: currentCPU.user / 1000000,
          system: currentCPU.system / 1000000,
          total: totalCPU
        })
      }
      
      lastCPU = process.cpuUsage()
    }, 10000) // Every 10 seconds
  }
  
  // Event loop monitoring
  monitorEventLoop() {
    let lastCheck = Date.now()
    
    setInterval(() => {
      const now = Date.now()
      const delay = now - lastCheck - 1000 // Should be ~0 if loop isn't blocked
      
      if (delay > 50) { // Loop blocked for > 50ms
        this.emit('eventLoopBlocked', {
          delay,
          timestamp: new Date()
        })
      }
      
      lastCheck = now
    }, 1000)
  }
  
  // Game performance tracking
  trackGamePerformance(gameType, duration, result) {
    if (!this.metrics.games.has(gameType)) {
      this.metrics.games.set(gameType, {
        totalGames: 0,
        totalDuration: 0,
        avgDuration: 0,
        wins: 0,
        losses: 0
      })
    }
    
    const metric = this.metrics.games.get(gameType)
    metric.totalGames++
    metric.totalDuration += duration
    metric.avgDuration = metric.totalDuration / metric.totalGames
    
    if (result === 'win') {
      metric.wins++
    } else {
      metric.losses++
    }
  }
  
  // Get current metrics
  getMetrics() {
    const uptime = (Date.now() - this.startTime) / 1000 / 60 // minutes
    const memory = process.memoryUsage()
    const cpu = process.cpuUsage()
    
    return {
      uptime,
      memory: {
        rss: (memory.rss / 1024 / 1024).toFixed(2) + ' MB',
        heapUsed: (memory.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
        heapTotal: (memory.heapTotal / 1024 / 1024).toFixed(2) + ' MB'
      },
      cpu: {
        user: (cpu.user / 1000000).toFixed(2) + ' s',
        system: (cpu.system / 1000000).toFixed(2) + ' s'
      },
      requests: Object.fromEntries(this.metrics.requests),
      games: Object.fromEntries(this.metrics.games),
      slowQueries: this.metrics.slowQueries.slice(-10),
      recentErrors: this.metrics.errors.slice(-10)
    }
  }
  
  // Error tracking
  trackError(error, context) {
    this.metrics.errors.push({
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date()
    })
    
    // Keep only last 100 errors
    if (this.metrics.errors.length > 100) {
      this.metrics.errors.shift()
    }
  }
}

// Cluster optimization for multi-core systems
class ClusterManager {
  static initialize() {
    if (cluster.isMaster) {
      const numCPUs = os.cpus().length
      console.log(`Master ${process.pid} setting up ${numCPUs} workers`)
      
      // Fork workers
      for (let i = 0; i < numCPUs; i++) {
        cluster.fork()
      }
      
      // Handle worker death
      cluster.on('exit', (worker, code, signal) => {
        console.error(`Worker ${worker.process.pid} died (${signal || code})`)
        console.log('Starting new worker...')
        cluster.fork()
      })
      
      // Graceful shutdown
      process.on('SIGTERM', () => {
        console.log('Master shutting down...')
        for (const id in cluster.workers) {
          cluster.workers[id].kill()
        }
        process.exit(0)
      })
      
      return false // Don't continue with app setup
    }
    
    return true // Continue with app setup in worker
  }
}

// Response caching system
class ResponseCache {
  constructor(redisClient) {
    this.redis = redisClient
    this.defaultTTL = 60 // 1 minute
  }
  
  // Cache middleware generator
  middleware(options = {}) {
    const { ttl = this.defaultTTL, keyGenerator } = options
    
    return async (req, res, next) => {
      // Only cache GET requests
      if (req.method !== 'GET') {
        return next()
      }
      
      const key = keyGenerator ? keyGenerator(req) : req.originalUrl
      const cacheKey = `cache:${key}`
      
      try {
        // Check cache
        const cached = await this.redis.get(cacheKey)
        if (cached) {
          res.setHeader('X-Cache', 'HIT')
          return res.json(JSON.parse(cached))
        }
        
        // Store original send
        const originalJson = res.json.bind(res)
        
        // Override json method
        res.json = (body) => {
          res.setHeader('X-Cache', 'MISS')
          
          // Cache successful responses
          if (res.statusCode === 200) {
            this.redis.setex(cacheKey, ttl, JSON.stringify(body))
          }
          
          return originalJson(body)
        }
        
        next()
      } catch (err) {
        console.error('Cache error:', err)
        next() // Continue without cache
      }
    }
  }
  
  // Invalidate cache
  async invalidate(pattern) {
    const keys = await this.redis.keys(`cache:${pattern}`)
    if (keys.length > 0) {
      await this.redis.del(keys)
    }
  }
}

// WebSocket performance optimization
class SocketOptimizer {
  static optimize(io) {
    // Custom connection IDs (optional)
    io.engine.generateId = () => {
      return crypto.randomBytes(12).toString('hex')
    }

    // Connection limits per IP
    const connections = new Map()

    io.use((socket, next) => {
      const ip =
        socket.handshake.headers['x-forwarded-for'] ||
        socket.handshake.address

      const count = connections.get(ip) || 0

      if (count >= 10) {
        return next(new Error('Too many connections from this IP'))
      }

      connections.set(ip, count + 1)

      socket.on('disconnect', () => {
        const current = connections.get(ip) || 0
        connections.set(ip, Math.max(0, current - 1))
      })

      next()
    })

    return io
  }
}

// Export everything
module.exports = {
  PerformanceMonitor,
  ClusterManager,
  ResponseCache,
  SocketOptimizer
}
