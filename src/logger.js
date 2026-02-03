const fs = require('fs')
const path = require('path')

const LOG_LEVELS = { error: 0, warning: 1, info: 2, debug: 3 }
const SUPPRESSED_MESSAGES = [
  'Ignoring block entities',
  'chunk failed to load',
  'entity.objectType is deprecated',
  'deprecated',
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNABORTED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ECONNREFUSED',
  'socket hang up',
  'errno',
  'syscall'
]

function createLogger(config, ui) {
  const currentLogLevel = LOG_LEVELS[config.logging.level] ?? LOG_LEVELS.info
  const logFilePath = path.join(__dirname, '..', config.logging.filePath || 'bot.log')
  const maxLogSize = config.log.maxSizeBytes
  const logBackups = Math.max(1, config.log.backups || 3)
  let logFileStream = null
  let currentLogSize = 0

  function shouldSuppressMessage(msg) {
    return SUPPRESSED_MESSAGES.some(entry => msg.includes(entry))
  }

  function shouldLog(level) {
    return (LOG_LEVELS[level] ?? LOG_LEVELS.info) <= currentLogLevel
  }

  function rotateLogFiles() {
    for (let i = logBackups - 1; i >= 0; i--) {
      const suffix = i === 0 ? '' : `.old.${i}`
      const nextSuffix = `.old.${i + 1}`
      const source = `${logFilePath}${suffix}`
      const destination = `${logFilePath}${nextSuffix}`
      if (fs.existsSync(source)) {
        if (i + 1 >= logBackups) {
          fs.unlinkSync(source)
        } else {
          fs.renameSync(source, destination)
        }
      }
    }
  }

  function initLogFile() {
    if (!config.logging.toFile) return
    try {
      if (fs.existsSync(logFilePath)) {
        const stats = fs.statSync(logFilePath)
        currentLogSize = stats.size
        if (currentLogSize > maxLogSize) {
          rotateLogFiles()
          currentLogSize = 0
        }
      }
      logFileStream = fs.createWriteStream(logFilePath, { flags: 'a' })
      const startMsg = `\n${'='.repeat(80)}\n[${new Date().toISOString()}] === НОВАЯ СЕССИЯ ===\n${'='.repeat(80)}\n`
      logFileStream.write(startMsg)
      currentLogSize += Buffer.byteLength(startMsg)
    } catch (err) {
      console.error('Ошибка инициализации лог-файла:', err.message)
    }
  }

  function writeToLogFile(message) {
    if (!logFileStream) return
    try {
      const timestamp = new Date().toISOString()
      const logLine = `[${timestamp}] ${message}\n`
      const byteLength = Buffer.byteLength(logLine)
      if (currentLogSize + byteLength > maxLogSize) {
        logFileStream.end()
        rotateLogFiles()
        logFileStream = fs.createWriteStream(logFilePath, { flags: 'a' })
        currentLogSize = 0
        const rotationMsg = `[${timestamp}] === РОТАЦИЯ ЛОГА (превышен размер ${maxLogSize} байт) ===\n`
        logFileStream.write(rotationMsg)
        currentLogSize += Buffer.byteLength(rotationMsg)
      }
      logFileStream.write(logLine)
      currentLogSize += byteLength
    } catch (_) {}
  }

  function addLog(level, botName, message) {
    if (!shouldLog(level)) return
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(
      now.getSeconds()
    ).padStart(2, '0')}`
    const colors = { info: '{cyan-fg}', success: '{green-fg}', warning: '{yellow-fg}', error: '{red-fg}' }
    const icons = { info: 'i', success: '+', warning: '!', error: 'x' }
    const color = colors[level] || '{white-fg}'
    const icon = icons[level] || 'i'
    const cleanMessage = message
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
      .replace(/[\u{2600}-\u{26FF}]/gu, '')
      .replace(/[\u{2700}-\u{27BF}]/gu, '')
      .replace(/[+✗⚠•⏸▶OKERR]/g, '')
      .trim()

    if (ui && ui.logBox) {
      ui.logBox.log(`${color}[${time}] ${icon} [${botName}]{/} ${cleanMessage}`)
    }

    const levelNames = { info: 'INFO', success: 'SUCC', warning: 'WARN', error: 'ERR ' }
    const levelName = levelNames[level] || 'INFO'
    writeToLogFile(`[${levelName}] [${botName.padEnd(20)}] ${message}`)
  }

  function close() {
    if (logFileStream) {
      const exitMsg = `[${new Date().toISOString()}] === ЗАВЕРШЕНИЕ СЕССИИ ===\n`
      logFileStream.write(exitMsg)
      logFileStream.end()
      logFileStream = null
    }
  }

  initLogFile()

  return {
    addLog,
    shouldLog,
    shouldSuppressMessage,
    writeToLogFile,
    close
  }
}

module.exports = {
  createLogger,
  LOG_LEVELS,
  SUPPRESSED_MESSAGES
}
