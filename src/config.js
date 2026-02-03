const fs = require('fs')
const path = require('path')

const DEFAULT_CONFIG = {
  server: { host: '', version: '', password: '' },
  timing: {
    digDelay: 0,
    stuckThreshold: 30000,
    restartIfIdleMs: 120000,
    minReconnectInterval: 60000,
    reconnectRegular: 15000,
    reconnectOnInternetLoss: 45000,
    internetRetryInterval: 60000,
    internetCheckInterval: 30000,
    maxInternetRetries: 999,
    graceAfterSpawn: 20000,
    startStagger: 20000,
    startStaggerJitter: 10000,
    periodicRejoinMs: 3600000,
    rotationDelayBetweenBots: 120000
  },
  antibot: {
    minInterval: 3000,
    maxInterval: 12000,
    shortMoveMs: 150,
    fallCheckEnabled: false,
    fallCheckTimeout: 3000
  },
  menu: { slot1: 10, slot2: 13, hotbarSlot: 0 },
  globalRestart: {
    errorThreshold: 15,
    timeWindowMs: 600000,
    stopOnNoInternet: false,
    noInternetThreshold: 8,
    unstableInternetMode: true,
    memoryLimitMB: 0
  },
  position: { checkInterval: 10000, returnTimeout: 8000 },
  ui: { renderIntervalMs: 1000, graphUpdateMs: 15000 },
  monitor: { historyLength: 180, cpuRamHistoryLength: 60 },
  log: { maxSizeBytes: 10 * 1024 * 1024, backups: 3 },
  logging: { level: 'info', toFile: true, filePath: 'bot.log' },
  features: {
    enableActiveFallCheck: true
  },
  bots: []
}

function mergeConfig(base, overrides) {
  if (!overrides || typeof overrides !== 'object') return base
  const merged = { ...base }
  for (const [key, value] of Object.entries(overrides)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      merged[key] = mergeConfig(base[key] || {}, value)
    } else {
      merged[key] = value
    }
  }
  return merged
}

function validateConfig(cfg) {
  const errors = []
  if (!cfg.server.host) errors.push('server.host обязателен')
  if (!cfg.server.version) errors.push('server.version обязателен')
  if (!cfg.server.password) errors.push('server.password обязателен')
  if (!cfg.menu || typeof cfg.menu.slot1 !== 'number' || typeof cfg.menu.slot2 !== 'number') {
    errors.push('menu.slot1 и menu.slot2 должны быть числами')
  }
  if (!Array.isArray(cfg.bots) || cfg.bots.length === 0) {
    errors.push('bots должен быть непустым массивом')
  } else {
    cfg.bots.forEach((bot, index) => {
      if (!bot.username) errors.push(`bots[${index}].username обязателен`)
      if (!Array.isArray(bot.blocksToMine) || bot.blocksToMine.length === 0) {
        errors.push(`bots[${index}].blocksToMine должен быть непустым массивом`)
      }
    })
  }
  return errors
}

function loadConfig(configPath = path.join(__dirname, '..', 'config.json')) {
  const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const config = mergeConfig(DEFAULT_CONFIG, rawConfig)
  const errors = validateConfig(config)
  if (errors.length > 0) {
    const error = new Error(errors.join('; '))
    error.name = 'ConfigValidationError'
    throw error
  }
  return config
}

module.exports = {
  DEFAULT_CONFIG,
  loadConfig,
  mergeConfig,
  validateConfig
}
