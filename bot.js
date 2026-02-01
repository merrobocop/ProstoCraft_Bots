const mineflayer = require('mineflayer')
const vec3 = require('vec3')
const fs = require('fs')
const path = require('path')
const blessed = require('blessed')
const contrib = require('blessed-contrib')
const os = require('os')

// Плагин физики для правильного падения (как у реального клиента)
let physicsPlugin
try {
  physicsPlugin = require('mineflayer-physics')
} catch(e) {
  console.warn('! mineflayer-physics не установлен - физика может работать некорректно')
  console.warn('Установите: npm install mineflayer-physics')
}


// ============================================================================
// ПОДАВЛЕНИЕ НЕНУЖНЫХ ЛОГОВ
// ============================================================================
const _warn = console.warn
const _error = console.error
const _log = console.log

// Полностью отключаем console.warn для сетевых ошибок
console.warn = (...args) => {
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
  if (msg.includes('Ignoring block entities')) return
  if (msg.includes('chunk failed to load')) return
  if (msg.includes('entity.objectType is deprecated')) return
  if (msg.includes('deprecated')) return
  if (msg.includes('ECONNRESET')) return
  if (msg.includes('ETIMEDOUT')) return
  if (msg.includes('ECONNABORTED')) return
  if (msg.includes('ENOTFOUND')) return
  if (msg.includes('EAI_AGAIN')) return
  if (msg.includes('EHOSTUNREACH')) return
  if (msg.includes('ECONNREFUSED')) return
  if (msg.includes('socket hang up')) return
}

console.error = (...args) => {
  const msg = args.map(a => {
    if (typeof a === 'string') return a
    if (a && a.message) return a.message
    if (a && a.stack) return a.stack
    return JSON.stringify(a)
  }).join(' ')
  
  if (msg.includes('Ignoring block entities')) return
  if (msg.includes('chunk failed to load')) return
  if (msg.includes('ECONNRESET')) return
  if (msg.includes('ETIMEDOUT')) return
  if (msg.includes('ECONNABORTED')) return
  if (msg.includes('ENOTFOUND')) return
  if (msg.includes('EAI_AGAIN')) return
  if (msg.includes('EHOSTUNREACH')) return
  if (msg.includes('ECONNREFUSED')) return
  if (msg.includes('socket hang up')) return
  if (msg.includes('errno')) return
  if (msg.includes('syscall')) return
}

console.log = () => {}

process.on('uncaughtException', (err) => {
  const msg = String(err && err.message ? err.message : err)
  if (msg.includes('ECONNRESET') || 
      msg.includes('ETIMEDOUT') || 
      msg.includes('ECONNABORTED') ||
      msg.includes('EHOSTUNREACH') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('ENOTFOUND') ||
      msg.includes('EAI_AGAIN') ||
      msg.includes('socket hang up') ||
      msg.includes('errno') ||
      msg.includes('syscall')) {
    return
  }
})

process.on('unhandledRejection', (reason, promise) => {
  const msg = String(reason && reason.message ? reason.message : reason)
  if (msg.includes('ECONNRESET') || 
      msg.includes('ETIMEDOUT') || 
      msg.includes('ECONNABORTED') ||
      msg.includes('EHOSTUNREACH') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('ENOTFOUND') ||
      msg.includes('EAI_AGAIN') ||
      msg.includes('socket hang up') ||
      msg.includes('errno') ||
      msg.includes('syscall')) {
    return
  }
})

// ============================================================================
// ЗАГРУЗКА КОНФИГУРАЦИИ
// ============================================================================

const originalStderrWrite = process.stderr.write.bind(process.stderr)
process.stderr.write = (chunk, encoding, callback) => {
  const str = chunk.toString()
  if (str.includes('ECONNRESET') ||
      str.includes('ETIMEDOUT') ||
      str.includes('ECONNABORTED') ||
      str.includes('ENOTFOUND') ||
      str.includes('EAI_AGAIN') ||
      str.includes('EHOSTUNREACH') ||
      str.includes('ECONNREFUSED') ||
      str.includes('errno') ||
      str.includes('syscall') ||
      str.includes('socket hang up')) {
    if (callback) callback()
    return true
  }
  if (callback) callback()
  return true
}

// ============================================================================
// ЛОГИРОВАНИЕ В ФАЙЛ
// ============================================================================
const LOG_FILE_PATH = path.join(__dirname, 'bot.log')
const MAX_LOG_SIZE = 10 * 1024 * 1024 // 10 МБ
let logFileStream = null
let currentLogSize = 0

function initLogFile() {
  try {
    if (fs.existsSync(LOG_FILE_PATH)) {
      const stats = fs.statSync(LOG_FILE_PATH)
      currentLogSize = stats.size
      
      if (currentLogSize > MAX_LOG_SIZE) {
        const backupPath = LOG_FILE_PATH + '.old'
        if (fs.existsSync(backupPath)) {
          fs.unlinkSync(backupPath)
        }
        fs.renameSync(LOG_FILE_PATH, backupPath)
        currentLogSize = 0
      }
    }
    
    logFileStream = fs.createWriteStream(LOG_FILE_PATH, { flags: 'a' })
    
    const startMsg = `\n${'='.repeat(80)}\n[${new Date().toISOString()}] === НОВАЯ СЕССИЯ ===\n${'='.repeat(80)}\n`
    logFileStream.write(startMsg)
    currentLogSize += Buffer.byteLength(startMsg)
    
  } catch (e) {
    console.error('Ошибка инициализации лог-файла:', e.message)
  }
}

function writeToLogFile(message) {
  if (!logFileStream) return
  
  try {
    const timestamp = new Date().toISOString()
    const logLine = `[${timestamp}] ${message}\n`
    const byteLength = Buffer.byteLength(logLine)
    
    if (currentLogSize + byteLength > MAX_LOG_SIZE) {
      logFileStream.end()
      
      const backupPath = LOG_FILE_PATH + '.old'
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath)
      }
      if (fs.existsSync(LOG_FILE_PATH)) {
        fs.renameSync(LOG_FILE_PATH, backupPath)
      }
      
      logFileStream = fs.createWriteStream(LOG_FILE_PATH, { flags: 'a' })
      currentLogSize = 0
      
      const rotationMsg = `[${timestamp}] === РОТАЦИЯ ЛОГА (превышен размер ${MAX_LOG_SIZE} байт) ===\n`
      logFileStream.write(rotationMsg)
      currentLogSize += Buffer.byteLength(rotationMsg)
    }
    
    logFileStream.write(logLine)
    currentLogSize += byteLength
    
  } catch (e) {}
}

initLogFile()

process.on('exit', () => {
  if (logFileStream) {
    const exitMsg = `[${new Date().toISOString()}] === ЗАВЕРШЕНИЕ СЕССИИ ===\n`
    logFileStream.write(exitMsg)
    logFileStream.end()
  }
})

let config
try {
  const configPath = path.join(__dirname, 'config.json')
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
} catch (error) {
  console.error('ERR Ошибка загрузки config.json:', error.message)
  process.exit(1)
}

const SERVER_HOST = config.server.host
const MC_VERSION = config.server.version
const PASSWORD = config.server.password
const MENU_SLOT_1 = config.menu.slot1
const MENU_SLOT_2 = config.menu.slot2
const HOTBAR_SLOT = config.menu.hotbarSlot
const DIG_DELAY = config.timing.digDelay
const STUCK_THRESHOLD = config.timing.stuckThreshold
const RESTART_IF_IDLE_MS = config.timing.restartIfIdleMs
const RECONNECT_REGULAR = config.timing.reconnectRegular
const RECONNECT_ON_INTERNET_LOSS = config.timing.reconnectOnInternetLoss
const INTERNET_RETRY_INTERVAL = config.timing.internetRetryInterval
const INTERNET_CHECK_INTERVAL = config.timing.internetCheckInterval
const MAX_INTERNET_RETRIES = config.timing.maxInternetRetries
const GRACE_AFTER_SPAWN = config.timing.graceAfterSpawn
const START_STAGGER = config.timing.startStagger
const START_STAGGER_JITTER = config.timing.startStaggerJitter
const PERIODIC_REJOIN_MS = config.timing.periodicRejoinMs || 3600000
const ANTIBOT_MIN_INTERVAL = config.antibot.minInterval
const ANTIBOT_MAX_INTERVAL = config.antibot.maxInterval
const ANTIBOT_SHORT_MOVE_MS = config.antibot.shortMoveMs
const ANTIBOT_FALL_CHECK_ENABLED = config.antibot.fallCheckEnabled
const ANTIBOT_FALL_CHECK_TIMEOUT = config.antibot.fallCheckTimeout
const GLOBAL_ERROR_THRESHOLD = config.globalRestart.errorThreshold
const GLOBAL_ERROR_TIME_WINDOW = config.globalRestart.timeWindowMs
const STOP_ON_NO_INTERNET = config.globalRestart.stopOnNoInternet
const NO_INTERNET_THRESHOLD = config.globalRestart.noInternetThreshold
const UNSTABLE_INTERNET_MODE = config.globalRestart.unstableInternetMode
const botsConfigs = config.bots

const ROTATION_DELAY_BETWEEN_BOTS = config.timing.rotationDelayBetweenBots || 120000

const POSITION_CHECK_INTERVAL = config.position?.checkInterval || 10000
const POSITION_RETURN_TIMEOUT = config.position?.returnTimeout || 8000

// ============================================================================
// ГРАФИЧЕСКИЙ ИНТЕРФЕЙС (BLESSED)
// ============================================================================
const screen = blessed.screen({ smartCSR: true, title: 'Minecraft Bot Monitor' })
const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen })

const resourcesBox = grid.set(6, 8, 3, 4, blessed.box, {
  label: '  Ресурсы скрипта ',
  tags: true,
  border: { type: 'line' },
  style: { border: { fg: 'magenta' }, label: { fg: 'magenta', bold: true } }
});

const logBox = grid.set(6, 0, 6, 8, contrib.log, {
  label: '  Логи ',
  tags: true,
  border: { type: 'line' },
  style: { border: { fg: 'yellow' }, label: { fg: 'yellow', bold: true } },
  bufferLength: 100
})


const infoBox = grid.set(0, 0, 2, 12, blessed.box, {
  label: ' Общая статистика ',
  tags: true,
  border: { type: 'line' },
  style: { border: { fg: 'cyan' }, label: { fg: 'cyan', bold: true } }
})

const activityLine = grid.set(2, 0, 4, 8, contrib.line, {
  label: ' Активность копания (блоки/мин) ',
  showLegend: true,
  legend: { width: 20 },
  style: { line: 'yellow', text: 'green', baseline: 'white', border: { fg: 'green' } },
  xLabelPadding: 3,
  xPadding: 5,
  wholeNumbersOnly: false
})

const botsTable = grid.set(2, 8, 4, 4, contrib.table, {
  label: ' Статус ботов ',
  keys: true,
  vi: true,
  fg: 'white',
  selectedFg: 'white',
  selectedBg: 'blue',
  interactive: false,
  columnSpacing: 2,
  columnWidth: [16, 10, 12]
})


// ============================================================================
// ДАННЫЕ МОНИТОРИНГА
// ============================================================================
const monitorData = {
  startTime: Date.now(),
  bots: {},
  totalBlocks: 0,
  activityHistory: { x: [], y: {} }
}
monitorData.scriptResources = {
  cpu: [],
  ram: [],
  x: []
}


// ============================================================================
// ФУНКЦИИ UI
// ============================================================================
function updateInfoBox() {
  const uptime = Date.now() - monitorData.startTime
  const hours = Math.floor(uptime / 3600000)
  const minutes = Math.floor((uptime % 3600000) / 60000)
  const seconds = Math.floor((uptime % 60000) / 1000)
  const activeBots = Object.values(monitorData.bots).filter(b => b.status === 'копает').length
  const totalBots = Object.keys(monitorData.bots).length
  const avgRate = monitorData.totalBlocks > 0 && uptime > 0 
    ? (monitorData.totalBlocks / (uptime / 3600000)).toFixed(1) : '0.0'
  
  infoBox.setContent(`
  {cyan-fg}  Время работы:{/cyan-fg}  {bold}${hours}ч ${minutes}м ${seconds}с{/bold}
  {green-fg} Боты активны:{/green-fg}  {bold}${activeBots}/${totalBots}{/bold}
  {yellow-fg}  Добыто блоков:{/yellow-fg}  {bold}${monitorData.totalBlocks}{/bold}
  {magenta-fg} Средняя скорость:{/magenta-fg}  {bold}${avgRate} блоков/час{/bold}
  {blue-fg} Ротация:{/blue-fg}  {bold}каждые ${Math.round(PERIODIC_REJOIN_MS/60000)} мин{/bold}
  {${diggingPaused ? 'red' : 'green'}-fg}  Копание:{/}  {bold}${diggingPaused ? 'ПАУЗА' : 'АКТИВНО'}{/bold}
  `)
}
let lastCpuUsage = process.cpuUsage()
let lastCpuTime = Date.now()

function updateScriptResources() {
  const memUsage = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
  const currentCpuUsage = process.cpuUsage();
  const currentTime = Date.now();
  const elapsedTime = currentTime - lastCpuTime;
  const elapsedCpu = (currentCpuUsage.user - lastCpuUsage.user + currentCpuUsage.system - lastCpuUsage.system) / 1000;
  const cpuPercent = elapsedTime > 0 ? Math.min(100, (elapsedCpu / elapsedTime) * 100).toFixed(1) : '0.0';

  lastCpuUsage = currentCpuUsage;
  lastCpuTime = currentTime;

  resourcesBox.setContent(`
  {yellow-fg} CPU:{/yellow-fg}  {bold}${cpuPercent}%{/bold}
  {cyan-fg} RAM:{/cyan-fg}  {bold}${memUsage} MB{/bold}
  `);
  
  screen.render();
}

function updateActivityGraph() {
  const now = new Date()
  const timeLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  monitorData.activityHistory.x.push(timeLabel)
  if (monitorData.activityHistory.x.length > 60) monitorData.activityHistory.x.shift()
  
  const series = []
  const colors = ['yellow', 'cyan', 'magenta', 'green', 'red', 'blue']
  let colorIndex = 0
  
  for (const [botName, botData] of Object.entries(monitorData.bots)) {
    if (!monitorData.activityHistory.y[botName]) {
      monitorData.activityHistory.y[botName] = []
    }
    const blocksPerMin = botData.blocksLastMinute || 0
    monitorData.activityHistory.y[botName].push(blocksPerMin)
    if (monitorData.activityHistory.y[botName].length > 60) {
      monitorData.activityHistory.y[botName].shift()
    }
    const xLength = monitorData.activityHistory.x.length
    while (monitorData.activityHistory.y[botName].length < xLength) {
      monitorData.activityHistory.y[botName].unshift(0)
    }
    while (monitorData.activityHistory.y[botName].length > xLength) {
      monitorData.activityHistory.y[botName].shift()
    }
    series.push({
      title: botName,
      x: monitorData.activityHistory.x,
      y: monitorData.activityHistory.y[botName],
      style: { line: colors[colorIndex % colors.length] }
    })
    colorIndex++
  }
  if (series.length > 0 && monitorData.activityHistory.x.length > 0) {
    try { activityLine.setData(series) } catch (e) {}
  }
}



function updateBotsTable() {
  const headers = ['Имя бота', 'Статус', 'Добыто']
  const data = []
  const statusColors = {
    'копает': '{green-fg}',
    'ожидание': '{yellow-fg}',
    'оффлайн': '{red-fg}',
    'подключается': '{cyan-fg}',
    'ротация': '{magenta-fg}',
    'пауза': '{red-fg}',
    'возврат': '{blue-fg}'
  }
  for (const [botName, botData] of Object.entries(monitorData.bots)) {
    const color = statusColors[botData.status] || '{white-fg}'
    const displayStatus = diggingPaused && botData.status === 'копает' ? 'пауза' : botData.status
    data.push([botName, `${statusColors[displayStatus] || color}${displayStatus}{/}`, String(botData.blocksTotal || 0)])
  }
  botsTable.setData({ headers, data })
}

function addLog(level, botName, message) {
  const now = new Date()
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
  const colors = { 'info': '{cyan-fg}', 'success': '{green-fg}', 'warning': '{yellow-fg}', 'error': '{red-fg}' }
  const icons = { 'info': 'i', 'success': '+', 'warning': '!', 'error': 'x' }
  const color = colors[level] || '{white-fg}'
  const icon = icons[level] || 'i'
  
  const cleanMessage = message
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    .replace(/[\u{2700}-\u{27BF}]/gu, '')
    .replace(/[+✗⚠•⏸▶OKERR]/g, '')
    .trim()
  
  logBox.log(`${color}[${time}] ${icon} [${botName}]{/} ${cleanMessage}`)
  
  const levelNames = { 'info': 'INFO', 'success': 'SUCC', 'warning': 'WARN', 'error': 'ERR ' }
  const levelName = levelNames[level] || 'INFO'
  const fileMessage = `[${levelName}] [${botName.padEnd(20)}] ${message}`
  writeToLogFile(fileMessage)
}

function updateBotStatus(botName, status, data = {}) {
  if (!monitorData.bots[botName]) {
    monitorData.bots[botName] = {
      status, blocksTotal: 0, blocksLastMinute: 0,
      lastBlockTime: Date.now(), blockTimes: []
    }
  }
  const bot = monitorData.bots[botName]
  bot.status = status
  if (data.blockMined) {
    bot.blocksTotal++
    monitorData.totalBlocks++
    const now = Date.now()
    bot.blockTimes.push(now)
    bot.blockTimes = bot.blockTimes.filter(t => now - t < 60000)
    bot.blocksLastMinute = bot.blockTimes.length
    bot.lastBlockTime = now
  }
  updateUI()
}

function updateUI() {
  updateInfoBox()
  updateActivityGraph()
  updateBotsTable()
  screen.render()
}

// ============================================================================
// АВТОМАТИЧЕСКИЙ ПЕРЕЗАПУСК ЗАСТРЯВШИХ БОТОВ
// ============================================================================
function checkAndRestartStuckBots() {
  const now = Date.now()
  const STUCK_OFFLINE_THRESHOLD = 300000 // 5 минут
  
  for (const botObj of activeBots) {
    if (!botObj.bot || !botObj.bot.entity || !botObj.isOnline) {
      const botData = monitorData.bots[botObj.username]
      if (botData) {
        const timeSinceLastBlock = now - botData.lastBlockTime
        
        if (timeSinceLastBlock > STUCK_OFFLINE_THRESHOLD && botData.status === 'оффлайн') {
          addLog('warning', 'SYSTEM', `Бот ${botObj.username} застрял офлайн (${Math.round(timeSinceLastBlock/60000)}мин) - перезапуск`)
          
          const cfg = botsConfigs.find(c => c.username === botObj.username)
          if (cfg) {
            try {
              if (botObj.cleanup) botObj.cleanup()
            } catch(e) {}
            
            const newBotObj = createBot(cfg)
            const index = activeBots.findIndex(b => b.username === botObj.username)
            if (index !== -1) {
              activeBots[index] = newBotObj
              addLog('success', 'SYSTEM', `Бот ${botObj.username} принудительно перезапущен`)
            }
          }
        }
      }
    }
  }
}

setInterval(checkAndRestartStuckBots, 120000)

// ============================================================================
// ЛОГИКА БОТОВ
// ============================================================================
const sleep = ms => new Promise(r => setTimeout(r, ms))
let activeBots = []
let globalErrorTimestamps = []
let noInternetErrors = []
let restarting = false
let rotationInProgress = false
let diggingPaused = false

function noteGlobalError() {
  const now = Date.now()
  globalErrorTimestamps.push(now)
  globalErrorTimestamps = globalErrorTimestamps.filter(t => now - t <= GLOBAL_ERROR_TIME_WINDOW)
  addLog('warning', 'SYSTEM', `Счётчик ошибок: ${globalErrorTimestamps.length}/${GLOBAL_ERROR_THRESHOLD}`)
  if (globalErrorTimestamps.length >= GLOBAL_ERROR_THRESHOLD) {
    addLog('error', 'SYSTEM', 'Достигнут порог ошибок -> полный перезапуск')
    fullRestart('global-error-threshold')
  }
}

function noteNoInternetError() {
  if (!STOP_ON_NO_INTERNET) {
    if (UNSTABLE_INTERNET_MODE) return
    noteGlobalError()
    return
  }
  const now = Date.now()
  noInternetErrors.push(now)
  noInternetErrors = noInternetErrors.filter(t => now - t <= 120000)
  addLog('warning', 'SYSTEM', `Ошибки интернета: ${noInternetErrors.length}/${NO_INTERNET_THRESHOLD}`)
  if (noInternetErrors.length >= NO_INTERNET_THRESHOLD) {
    addLog('error', 'SYSTEM', 'Потеряно подключение к интернету - остановка')
    stopAllBots()
    process.exit(1)
  }
}

function fullRestart(reason = 'manual') {
  if (restarting) return
  restarting = true
  addLog('info', 'SYSTEM', `Полный перезапуск: ${reason}`)
  for (const a of activeBots) {
    try { if (a.cleanup) a.cleanup() } catch (e) {}
    try { if (a.bot) a.bot.quit() } catch (e) {}
  }
  activeBots = []
  const delay = 2000 + Math.floor(Math.random() * 4000)
  setTimeout(() => {
    restarting = false
    startAllBots()
  }, delay)
}

// ============================================================================
// УЛУЧШЕННАЯ СИСТЕМА РОТАЦИИ БОТОВ
// ============================================================================
async function rotateBots() {
  if (rotationInProgress || activeBots.length === 0) return
  rotationInProgress = true
  
  addLog('info', 'ROTATION', ` Начинаю плановую ротацию ботов (интервал: ${Math.round(PERIODIC_REJOIN_MS/60000)} мин)`)
  
  const onlineBots = activeBots.filter(b => b.bot && b.bot.entity && b.isOnline)
  
  if (onlineBots.length === 0) {
    addLog('warning', 'ROTATION', 'Нет онлайн ботов - отменяю ротацию')
    rotationInProgress = false
    return
  }
  
  addLog('info', 'ROTATION', `Онлайн ботов: ${onlineBots.length}/${activeBots.length}`)
  
  for (let i = 0; i < activeBots.length; i++) {
    const botObj = activeBots[i]
    const username = botObj.username
    
    if (!botObj.bot || !botObj.bot.entity || !botObj.isOnline) {
      addLog('warning', 'ROTATION', `Бот ${username} офлайн, пропускаю`)
      continue
    }
    
    addLog('info', 'ROTATION', `Перезапуск бота ${username} (${i+1}/${activeBots.length})`)
    updateBotStatus(username, 'ротация')
    
    try {
      botObj.isRotating = true
      if (botObj.cleanup) botObj.cleanup()
      if (botObj.bot) botObj.bot.quit()
    } catch (e) {
      addLog('warning', 'ROTATION', `Ошибка при остановке ${username}: ${e.message}`)
    }
    
    await sleep(5000)
    
    const cfg = botsConfigs.find(c => c.username === username)
    if (cfg) {
      const newBotObj = createBot(cfg)
      activeBots[i] = newBotObj
      addLog('success', 'ROTATION', `Бот ${username} перезапущен`)
    } else {
      addLog('error', 'ROTATION', `Конфиг для ${username} не найден!`)
    }
    
    if (i < activeBots.length - 1) {
      addLog('info', 'ROTATION', `Следующий бот через ${ROTATION_DELAY_BETWEEN_BOTS/1000}с`)
      await sleep(ROTATION_DELAY_BETWEEN_BOTS)
    }
  }
  
  addLog('success', 'ROTATION', '+ Ротация завершена')
  rotationInProgress = false
}

function startRotationScheduler() {
  setInterval(() => {
    rotateBots().catch(err => {
      addLog('error', 'ROTATION', `Ошибка ротации: ${err.message}`)
      rotationInProgress = false
    })
  }, PERIODIC_REJOIN_MS)
  
  addLog('info', 'SYSTEM', ` Планировщик ротации: каждые ${Math.round(PERIODIC_REJOIN_MS/60000)} минут`)
}

// ============================================================================
// СОЗДАНИЕ БОТА
// ============================================================================
function createBot(cfg) {
  const username = cfg.username
  const blocksToMine = cfg.blocksToMine
  const standPosition = cfg.standPosition ? vec3(cfg.standPosition.x, cfg.standPosition.y, cfg.standPosition.z) : null
  const maxDistance = cfg.maxDistanceFromStand || 0.6
  
  let bot = null
  let menuTimer = null, reconnectTimer = null
  let positionCheckTimer = null, preventiveRestartTimer = null
  let fallCheckTimer = null, keepAliveTimer = null
  let joinedSubserver = false, lastDigTime = 0
  let allowReconnects = false, backoff = RECONNECT_REGULAR
  let menuAttempts = 0, lastMenuAttempt = 0
  let isReturningToPosition = false
  let reconnectScheduled = false
  let waitingForFall = false
  let initialY = null
  let fallCheckPassed = false
  let isOnline = false
  let isRotating = false
  let lastKeepAlive = Date.now()

  // FIX 1: Счётчик повторных киков "подождите" для адаптивного backoff
  let waitKickCount = 0
  // FIX 2: Флаг подтверждения позиции — позиция надёжна только после первого блока
  let positionConfirmed = false


  function cleanupTimers() {
    try { if (menuTimer) clearTimeout(menuTimer) } catch(e){}
    try { if (reconnectTimer) clearTimeout(reconnectTimer) } catch(e){}
    try { if (positionCheckTimer) clearInterval(positionCheckTimer) } catch(e){}
    try { if (preventiveRestartTimer) clearTimeout(preventiveRestartTimer) } catch(e){}
    try { if (fallCheckTimer) clearTimeout(fallCheckTimer) } catch(e){}
    try { if (keepAliveTimer) clearInterval(keepAliveTimer) } catch(e){}
  }

  // ============================================================================
  // KEEP-ALIVE МОНИТОРИНГ
  // ============================================================================
  function startKeepAliveMonitor() {
    if (keepAliveTimer) clearInterval(keepAliveTimer)
    
    keepAliveTimer = setInterval(() => {
      if (!bot || !bot._client || !joinedSubserver) return
      
      const timeSinceLastKeepAlive = Date.now() - lastKeepAlive
      
      if (timeSinceLastKeepAlive > 25000) {
        addLog('warning', username, `! Нет keep-alive ${Math.round(timeSinceLastKeepAlive/1000)}с`)
        
        if (timeSinceLastKeepAlive > 28000 && allowReconnects) {
          addLog('error', username, 'Keep-alive таймаут -> перезапуск')
          cleanupTimers()
          updateBotStatus(username, 'ожидание')
          scheduleReconnectLocal(5000)
        }
      }
    }, 5000)
  }

  // ============================================================================
  // ПРОВЕРКА И ВОЗВРАТ НА ПОЗИЦИЮ
  // ============================================================================
  async function checkAndReturnToPosition() {
    // FIX 3: Проверка позиции требует positionConfirmed — блокируем ложные срабатывания после auto-entry
    if (!standPosition || !bot || !bot.entity || !joinedSubserver || 
        isReturningToPosition || !positionConfirmed) return
    
    const currentPos = bot.entity.position
    const distance = currentPos.distanceTo(standPosition)
    
    if (distance > 500) {
      addLog('warning', username, `Телепорт на спавн (${distance.toFixed(0)}м) - перезаход`)
      updateBotStatus(username, 'ожидание')
      cleanupTimers()
      positionConfirmed = false
      scheduleReconnectLocal(3000, true)
      return
    }
    
    if (distance > maxDistance) {
      addLog('warning', username, `Отошёл на ${distance.toFixed(2)}м (лимит ${maxDistance}м), возвращаюсь...`)
      updateBotStatus(username, 'возврат')
      isReturningToPosition = true
      
      try {
        bot.clearControlStates()
        
        const timeout = Date.now() + POSITION_RETURN_TIMEOUT
        let stuck = 0
        
        while (bot && bot.entity && bot.entity.position.distanceTo(standPosition) > 0.8) {
          if (Date.now() > timeout) {
            addLog('warning', username, 'Таймаут возврата')
            break
          }
          
          const dx = standPosition.x - bot.entity.position.x
          const dz = standPosition.z - bot.entity.position.z
          const dist2d = Math.sqrt(dx * dx + dz * dz)
          
          if (dist2d > 0.3) {
            const yaw = Math.atan2(-dx, -dz)
            bot.look(yaw, 0, true)
            bot.setControlState('forward', true)
            
            const oldPos = bot.entity.position.clone()
            await sleep(200)
            if (bot.entity.position.distanceTo(oldPos) < 0.1) {
              stuck++
              if (stuck > 5) {
                bot.setControlState('jump', true)
                await sleep(100)
                bot.setControlState('jump', false)
                stuck = 0
              }
            } else {
              stuck = 0
            }
          } else {
            bot.clearControlStates()
            break
          }
        }
        
        bot.clearControlStates()
        addLog('success', username, 'Вернулся на позицию')
      } catch (e) {
        addLog('error', username, `Ошибка возврата: ${e.message}`)
      } finally {
        isReturningToPosition = false
        if (bot && bot.entity) {
          updateBotStatus(username, 'копает')
        }
      }
    }
  }

  function startPositionCheck() {
    if (!standPosition || !joinedSubserver || positionCheckTimer) return

    // Задержка 30с перед started позиционной проверки
    setTimeout(() => {
      if (!joinedSubserver || positionCheckTimer) return
      
      positionCheckTimer = setInterval(() => {
        checkAndReturnToPosition().catch(() => {})
      }, POSITION_CHECK_INTERVAL)
      
      addLog('info', username, 'Проверка позиции активирована')
    }, 30000)
  }

  // ============================================================================
  // ОБХОД LIMBOFILTER
  // ============================================================================
  function startActiveFallCheck() {
    if (!bot || !bot.entity) return
    
    addLog('info', username, ' LimboFilter - симуляция падения')
    initialY = bot.entity.position.y
    const startX = bot.entity.position.x
    const startZ = bot.entity.position.z
    
    let tick = 0
    let velocity = 0
    let currentY = initialY
    let hasFallen = false
    
    const GRAVITY = 0.08
    const DRAG = 0.02
    
    bot.clearControlStates()
    
    const fallInterval = setInterval(() => {
      if (!bot || !bot._client || joinedSubserver || hasFallen) {
        clearInterval(fallInterval)
        return
      }
      
      tick++
      
      velocity -= GRAVITY
      velocity *= 0.98
      currentY += velocity
      
      if (velocity < -3.92) {
        velocity = -3.92
      }
      
      try {
        bot._client.write('position', {
          x: startX,
          y: currentY,
          z: startZ,
          onGround: false
        })
        
        if (tick % 20 === 0 || tick === 1 || tick === 5 || tick === 10) {
          const fallen = initialY - currentY
          addLog('info', username, `[${tick}т] Упал ${fallen.toFixed(1)}м`)
        }
      } catch(e) {
        addLog('warning', username, `Ошибка пакета: ${e.message}`)
      }
      
      if (tick === 20 || tick === 60 || tick === 100) {
        try {
          const randomYaw = (Math.random() - 0.5) * 0.4
          const randomPitch = 0.5 + (Math.random() - 0.5) * 0.3
          bot.look(randomYaw, randomPitch).catch(() => {})
        } catch(e) {}
      }
      
      if (tick >= 128) {
        const totalFallen = initialY - currentY
        addLog('success', username, `OK 128 тиков! Упал ${totalFallen.toFixed(1)}м`)
        
        try {
          bot._client.write('position', {
            x: startX,
            y: currentY,
            z: startZ,
            onGround: true
          })
        } catch(e) {}
        
        hasFallen = true
        fallCheckPassed = true
        waitingForFall = false
        clearInterval(fallInterval)
        
        // После успешного падения — ожидаем сообщение "отслеживается" 5 секунд
        // FIX 4: positionConfirmed = false, пока не подтвердим позицию через первый блок
        setTimeout(() => {
          if (!joinedSubserver && bot && bot.entity) {
            addLog('info', username, ' Автовход после LimboFilter')
            joinedSubserver = true
            positionConfirmed = false // Позиция НЕ подтверждена — ждём первый блок
            updateBotStatus(username, 'копает')
            
            if (standPosition) {
              startPositionCheck()
            }
            
            preventiveRestartTimer = setTimeout(() => {
              addLog('info', username, 'Превентивный перезапуск (1 час)')
              updateBotStatus(username, 'ожидание')
              cleanupTimers()
              backoff = 5000 + Math.floor(Math.random() * 5000)
              scheduleReconnectLocal(backoff, true)
            }, 3600000)
            
            setTimeout(() => startDiggingLoop().catch(()=>{}), 700 + Math.floor(Math.random()*600))
          }
        }, 5000)
        return
      }
      
      if (tick >= 300) {
        addLog('warning', username, ` Таймаут ${tick}т`)
        hasFallen = true
        fallCheckPassed = true
        waitingForFall = false
        clearInterval(fallInterval)
      }
    }, 50)
    
    setTimeout(() => {
      if (!hasFallen && !joinedSubserver) {
        addLog('error', username, 'ERR Критический таймаут!')
        hasFallen = true
        fallCheckPassed = true
        waitingForFall = false
        clearInterval(fallInterval)
      }
    }, 16000)
  }

  function startLimboFilterBypass() {
    addLog('info', username, ' Ожидание LimboFilter...')
    waitingForFall = true
    
    const humanDelay = 800 + Math.floor(Math.random() * 1200)
    
    setTimeout(() => {
      if (fallCheckPassed || joinedSubserver) {
        waitingForFall = false
        return
      }
      
      if (!bot || !bot.entity) {
        waitingForFall = false
        fallCheckPassed = true
        return
      }
      
      initialY = bot.entity.position.y
      
      setTimeout(() => {
        if (bot && bot.entity && !joinedSubserver) {
          const randomYaw = (Math.random() - 0.5) * 0.6
          const randomPitch = (Math.random() - 0.5) * 0.3
          bot.look(randomYaw, randomPitch).catch(() => {})
        }
      }, 300 + Math.floor(Math.random() * 400))
      
      setTimeout(() => {
        if (bot && bot.entity && !joinedSubserver) {
          const randomYaw = (Math.random() - 0.5) * 0.8
          const randomPitch = (Math.random() - 0.5) * 0.4
          bot.look(randomYaw, randomPitch).catch(() => {})
        }
      }, 1200 + Math.floor(Math.random() * 800))
      
      const fallCheckDelay = 4000 + Math.floor(Math.random() * 1000)
      fallCheckTimer = setTimeout(() => {
        if (!bot || !bot.entity || joinedSubserver || fallCheckPassed) {
          waitingForFall = false
          return
        }
        
        const currentY = bot.entity.position.y
        const fallDistance = initialY - currentY
        
        if (fallDistance > 0.3 || bot.entity.onGround) {
          fallCheckPassed = true
          waitingForFall = false
          addLog('success', username, `+ Проверка пройдена (${fallDistance.toFixed(2)}м)`)
        } else {
          fallCheckPassed = true
          waitingForFall = false
        }
      }, fallCheckDelay)
    }, humanDelay)
    
    const totalTimeout = 12000 + Math.floor(Math.random() * 1000)
    setTimeout(() => {
      if (waitingForFall && !joinedSubserver && !fallCheckPassed) {
        addLog('error', username, 'ERR ТАЙМАУТ LimboFilter')
        fallCheckPassed = true
        waitingForFall = false
      }
    }, totalTimeout)
  }

  function scheduleReconnectLocal(delay = backoff, forcedReconnect = false) {
    // FIX 5: Тихо пропускаем дублей — убираем спам "уже в очереди"
    if (reconnectScheduled) {
      return
    }
    
    if (isRotating) {
      isRotating = false
      return
    }
    
    reconnectScheduled = true

    if (!allowReconnects && !forcedReconnect) {
      reconnectScheduled = false
      
      const graceDelay = Math.min(GRACE_AFTER_SPAWN, 30000)
      setTimeout(() => {
        scheduleReconnectLocal(delay, true)
      }, graceDelay)
      return
    }

    const jitter = Math.floor(Math.random() * 3000)
    addLog('info', username, `Переподключение через ${Math.round((delay + jitter)/1000)}с`)
    updateBotStatus(username, 'ожидание')

    reconnectTimer = setTimeout(() => {
      reconnectScheduled = false
      reconnectTimer = null
      
      try { 
        if (bot) {
          bot.removeAllListeners()
          bot.quit()
        }
      } catch(e) {}
      
      cleanupTimers()
      backoff = RECONNECT_REGULAR
      
      try {
        const newObj = createBot(cfg)
        
        const index = activeBots.findIndex(b => b.username === username)
        if (index !== -1) {
          activeBots[index] = newObj
          addLog('success', username, 'Экземпляр заменён')
        } else {
          activeBots.push(newObj)
          addLog('success', username, 'Экземпляр добавлен')
        }
      } catch(e) {
        addLog('error', username, `Ошибка создания: ${e.message}`)
        reconnectScheduled = false
        setTimeout(() => scheduleReconnectLocal(5000, true), 5000)
      }
    }, delay + jitter)
  }


  function startClient() {
    const botOptions = {
      host: SERVER_HOST,
      username,
      auth: 'offline',
      version: MC_VERSION,
      connectTimeout: 120000,
      keepAlive: true,
      keepAliveInterval: 15000,
      checkTimeoutInterval: 90000
    }
    
    bot = mineflayer.createBot(botOptions)
    
    if (physicsPlugin) {
      try {
        bot.loadPlugin(physicsPlugin.plugin)
        addLog('success', username, 'OK Плагин физики загружен')
      } catch(e) {
        addLog('warning', username, `! Физика не загрузилась: ${e.message}`)
      }
    }
    
    if (bot._client) {
      bot._client.on('keep_alive', () => {
        lastKeepAlive = Date.now()
      })
      
      bot._client.on('error', (err) => {
        const msg = String(err && err.message ? err.message : err)
        if (msg.includes('connect ETIMEDOUT') || msg.includes('connect ECONNREFUSED')) {
          return
        }
      })
    }
    
    if (bot._client.socket) {
      bot._client.socket.on('error', () => {})
    }
    
    bot.once('spawn', async () => {
      addLog('success', username, 'Подключен к серверу')
      updateBotStatus(username, 'подключается')
      isOnline = true
      lastKeepAlive = Date.now()
      
      allowReconnects = false
      setTimeout(() => { allowReconnects = true }, GRACE_AFTER_SPAWN)
      
      menuAttempts = 0
      
      if (bot._client && bot._client.socket) {
        bot._client.socket.on('error', () => {})
      }
      
      if (bot.physics) {
        bot.physics.gravity = 0.08
        addLog('success', username, 'OK Гравитация активна: 0.08')
      }
      
      startKeepAliveMonitor()
      
      startLimboFilterBypass()
      
      const initialDelay = 800 + Math.floor(Math.random() * 1200)
      await sleep(initialDelay)
      
      try {
        bot.setQuickBarSlot(HOTBAR_SLOT)
        const thinkingDelay = 700 + Math.floor(Math.random() * 600)
        await sleep(thinkingDelay)
        bot.activateItem()
      } catch (e) {}
      backoff = RECONNECT_REGULAR
    })

    function safeClickWindow(slot) {
      if (!bot || !bot.currentWindow) return false
      const now = Date.now()
      if (now - lastMenuAttempt < 900) return false
      lastMenuAttempt = now
      menuAttempts++
      const windowId = bot.currentWindow.id
      const item = bot.currentWindow.slots[slot] || { itemId: -1 }
      try {
        bot._client.write('window_click', { windowId, slot, mouseButton: 0, action: 0, mode: 0, item })
        return true
      } catch (e) {
        noteGlobalError()
        return false
      }
    }

    async function tryOpenMenuOnce() {
      if (!bot || !bot.currentWindow || joinedSubserver) return
      if (menuAttempts >= 6) {
        backoff = 60000 + Math.floor(Math.random() * 120000)
        scheduleReconnectLocal(backoff, true)
        return
      }
      
      safeClickWindow(MENU_SLOT_1)
      
      const humanClickDelay = 800 + Math.floor(Math.random() * 700)
      await sleep(humanClickDelay)
      
      safeClickWindow(MENU_SLOT_2)
    }

    (function menuLoop(){
      if (!joinedSubserver) tryOpenMenuOnce().catch(()=>{})
      const nextAttempt = 3000 + Math.floor(Math.random()*2000)
      menuTimer = setTimeout(menuLoop, nextAttempt)
    })()

    bot.on('message', msg => {
      try {
        const text = msg.toString().toLowerCase()
        
        if (text.includes('/login') || text.includes('авторизация')) {
          try { bot.chat(`/login ${PASSWORD}`) } catch(e){}
        }
        
        if (text.includes('вы недавно входили') || 
            text.includes('ввод пароля не требуется') ||
            text.includes('you recently logged in')) {
          addLog('success', username, '+ Быстрый вход - LimboFilter пропущен')
          waitingForFall = false
          fallCheckPassed = true
          if (fallCheckTimer) clearTimeout(fallCheckTimer)
        }
        
        if ((text.includes('сканер') || text.includes('scanner')) && 
            (text.includes('дождитесь') || text.includes('не двигайтесь') || 
             text.includes('please wait') || text.includes('don\'t move'))) {
          addLog('warning', username, '! Обнаружен LimboFilter Сканер!')
          
          if (!waitingForFall || !initialY) {
            startActiveFallCheck()
          }
        }
        
        // FIX 6: При нормальном входе через меню — позиция сразу валидна
        if (!joinedSubserver && text.includes('отслеживается')) {
          joinedSubserver = true
          positionConfirmed = true   // Нормальный вход = позиция сразу валидна
          waitKickCount = 0          // Сброс счётчика киков при успешном входе
          addLog('success', username, 'Зашёл на подсервер')
          updateBotStatus(username, 'копает')
          try { if (menuTimer) clearTimeout(menuTimer) } catch(e){}
          try { if (fallCheckTimer) clearTimeout(fallCheckTimer) } catch(e){}
          
          waitingForFall = false
          fallCheckPassed = true
          
          if (standPosition) {
            startPositionCheck()
          }
          
          preventiveRestartTimer = setTimeout(() => {
            addLog('info', username, 'Превентивный перезапуск (1 час)')
            updateBotStatus(username, 'ожидание')
            cleanupTimers()
            backoff = 5000 + Math.floor(Math.random() * 5000)
            scheduleReconnectLocal(backoff, true)
          }, 3600000)
          
          setTimeout(() => startDiggingLoop().catch(()=>{}), 700 + Math.floor(Math.random()*600))
        }
      } catch (e) {}
    })

    bot.on('kicked', reason => {
      isOnline = false
      // FIX 7: Сброс positionConfirmed при любом кике
      positionConfirmed = false
      
      let r = (typeof reason === 'string') ? reason : JSON.stringify(reason)
      
      try {
        if (typeof reason === 'object' && reason.extra) {
          const textParts = reason.extra
            .filter(e => e.text)
            .map(e => e.text)
            .join(' ')
          if (textParts) r = textParts
        }
      } catch(e) {}
      
      addLog('warning', username, `Кикнут: ${r.substring(0, 100)}`)
      
      updateBotStatus(username, 'оффлайн')
      cleanupTimers()
      
      const low = r.toLowerCase()
      
      // FIX 8: Адаптивный backoff для "подождите" киков
      // Каждый повтор увеличивает задержку на 5 минут, макс 30 минут
      if (low.includes('подождите') || low.includes('wait') || low.includes('перед повторным')) {
        waitKickCount++
        const baseDelay = Math.min(600000 + (waitKickCount - 1) * 300000, 1800000) // 10мин + 5мин * N, макс 30мин
        const jitter = Math.floor(Math.random() * 60000)
        backoff = baseDelay + jitter
        addLog('warning', username, `! Подождите (попытка ${waitKickCount}) - ждём ${Math.round(backoff/60000)} мин`)
        scheduleReconnectLocal(backoff, true)
        return
      }
      
      if (low.includes('antibot') || low.includes('антибот')) {
        if (low.includes('превысили') || low.includes('превышение')) {
          addLog('error', username, 'ERR LimboFilter НЕ ПРОЙДЕН')
          backoff = 15000 + Math.floor(Math.random() * 15000)
        } else {
          backoff = 8000 + Math.floor(Math.random() * 12000)
        }
        scheduleReconnectLocal(backoff, true)
        return
      }
      
      if (low.includes('you are logging in too fast') || low.includes('logging too')) {
        addLog('warning', username, '! Слишком быстрый вход - ждём 1-2 минуты')
        backoff = 60000 + Math.floor(Math.random() * 60000)
        scheduleReconnectLocal(backoff, true)
        return
      }
      
      // FIX 9: "already connected" — увеличиваем до 45-90 секунд
      if (low.includes('already connected')) {
        backoff = 45000 + Math.floor(Math.random() * 45000)
        addLog('warning', username, `Already connected - ждём ${Math.round(backoff/1000)}с`)
        scheduleReconnectLocal(backoff, true)
        return
      }
      
      backoff = 10000 + Math.floor(Math.random() * 10000)
      scheduleReconnectLocal(backoff, true)
    })

    bot.on('end', () => {
      isOnline = false
      positionConfirmed = false // FIX 7b: сброс при отключении
      if (!reconnectScheduled && !isRotating) {
        addLog('warning', username, 'Отключен от сервера')
        updateBotStatus(username, 'оффлайн')
        cleanupTimers()
        backoff = 8000 + Math.floor(Math.random() * 12000)
        scheduleReconnectLocal(backoff, false)
      }
    })

    bot.on('error', err => {
      isOnline = false
      positionConfirmed = false // FIX 7c: сброс при ошибке
      const msg = String(err && err.message ? err.message : err)
      
      if (msg.includes('Ignoring block entities')) return
      if (msg.includes('chunk failed to load')) return
      if (msg.includes('entity.objectType')) return
      if (msg.includes('deprecated')) return
      
      addLog('error', username, msg.substring(0, 60))
      cleanupTimers()
      updateBotStatus(username, 'оффлайн')
      
      if (msg.includes('connect ETIMEDOUT') || err.syscall === 'connect') {
        backoff = 15000 + Math.floor(Math.random() * 15000)
        scheduleReconnectLocal(backoff, true)
        return
      }
      
      if (msg.includes('client timed out after')) {
        addLog('warning', username, '! Клиент таймаут')
        backoff = 20000 + Math.floor(Math.random() * 20000)
        scheduleReconnectLocal(backoff, true)
        return
      }
      
      if (msg.toLowerCase().includes('you are logging in too fast') || msg.toLowerCase().includes('logging too')) {
        backoff = 60000 + Math.floor(Math.random() * 60000)
        scheduleReconnectLocal(backoff, true)
        return
      }
      
      const isNetworkError = ['ECONNRESET','ECONNABORTED','ENOTFOUND','ETIMEDOUT','EAI_AGAIN','EHOSTUNREACH']
        .some(c => (err.code||'').includes(c)) || msg.includes('socket hang up')
      
      if (isNetworkError) {
        const isConnectionIssue = (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN' || err.code === 'EHOSTUNREACH')
        
        if (isConnectionIssue) {
          backoff = 20000 + Math.floor(Math.random() * 20000)
          if (!UNSTABLE_INTERNET_MODE) {
            noteNoInternetError()
          }
        } else {
          backoff = 8000 + Math.floor(Math.random() * 12000)
        }
        
        scheduleReconnectLocal(backoff, true)
        return
      }
      
      backoff = 15000 + Math.floor(Math.random() * 15000)
      scheduleReconnectLocal(backoff, true)
    })
  }

  async function startDiggingLoop() {
    try {
      // Ожидаем полной инициализации
      for (let i=0;i<100;i++){
        if (bot && bot.entity && bot.world && bot.player) break
        await sleep(200)
      }
      
      if (waitingForFall) {
        addLog('info', username, 'Ожидание проверки LimboFilter...')
        
        for (let i=0; i<50; i++) {
          if (!waitingForFall || joinedSubserver || fallCheckPassed) break
          await sleep(200)
        }
      }
      
      if (waitingForFall) {
        addLog('warning', username, ' Таймаут LimboFilter - начинаю копать')
        waitingForFall = false
        fallCheckPassed = true
      }
      
      addLog('success', username, 'Начинаю копать')
      
      // FIX 10: lastDigTime инициализируется ЗДЕСЬ, не при создании бота
      lastDigTime = Date.now()
      
      // FIX 11: Грейс-период 15 секунд на первый блок после старта
      const firstBlockGrace = Date.now() + 15000
      
      let currentBlockIndex = 0
      let emptyBlocksCounter = 0
      let lastBlockPos = null
      let checksCounter = 0
      let lastCheckTime = Date.now()

      while (bot && bot.player && joinedSubserver) {
        checksCounter++
        
        if (checksCounter % 50 === 0) {
          const now = Date.now()
          
          if (now - lastCheckTime > 5000) {
            // Застрял — проверяем только ПОСЛЕ грейс-периода
            if (now > firstBlockGrace && now - lastDigTime > STUCK_THRESHOLD) {
              addLog('warning', username, 'Застрял -> перезапуск')
              updateBotStatus(username, 'ожидание')
              scheduleReconnectLocal()
              break
            }
            if (now - lastDigTime > RESTART_IF_IDLE_MS) {
              addLog('warning', username, 'Долгий простой -> перезапуск')
              scheduleReconnectLocal()
              return
            }
            lastCheckTime = now
          }
          
          if (diggingPaused) {
            await sleep(500)
            continue
          }
          if (isReturningToPosition) {
            await sleep(500)
            continue
          }
        }
        
        const c = blocksToMine[currentBlockIndex]
        const pos = vec3(c.x, c.y, c.z)
        const block = bot.blockAt(pos)
        
        if (!block || block.type === 0) {
          currentBlockIndex = (currentBlockIndex + 1) % blocksToMine.length
          emptyBlocksCounter++
          if (emptyBlocksCounter >= blocksToMine.length) {
            await sleep(5)
            emptyBlocksCounter = 0
          }
          continue
        }
        
        emptyBlocksCounter = 0
        
        try {
          if (!lastBlockPos || !lastBlockPos.equals(pos)) {
            const blockCenter = pos.offset(0.5, 0.5, 0.5)
            bot.lookAt(blockCenter).catch(() => {})
            lastBlockPos = pos.clone()
          }
          
          await bot.dig(block, false)
          lastDigTime = Date.now()
          
          // FIX 12: Позиция подтверждена после первого успешного блока
          if (!positionConfirmed) {
            positionConfirmed = true
            addLog('info', username, 'Позиция подтверждена (первый блок)')
          }
          
          updateBotStatus(username, 'копает', { blockMined: true })
          currentBlockIndex = (currentBlockIndex + 1) % blocksToMine.length
          
        } catch(e) {
          const errMsg = e && e.message ? e.message : String(e)
          if (!errMsg.includes('block is out of reach') && 
              !errMsg.includes('digging aborted') &&
              !errMsg.includes('No block has been dug') &&
              !errMsg.includes('block no longer exists')) {
            addLog('warning', username, errMsg.substring(0, 40))
          }
          currentBlockIndex = (currentBlockIndex + 1) % blocksToMine.length
        }
      }
    } catch(e) {
      addLog('error', username, `Ошибка в digging loop: ${e.message}`)
      scheduleReconnectLocal()
    }
  }


  startClient()
  return {
    username,
    get bot() { return bot },
    get isOnline() { return isOnline },
    set isRotating(val) { isRotating = val },
    cleanup: () => {
      cleanupTimers()
      try { if (bot) bot.removeAllListeners() } catch(e){}
      try { if (bot) bot.quit() } catch(e){}
    }
  }
}

function stopAllBots() {
  addLog('info', 'SYSTEM', 'Остановка всех ботов')
  for (const a of activeBots) {
    try { if (a.cleanup) a.cleanup() } catch(e){}
  }
  activeBots = []
}

function startAllBots() {
  addLog('info', 'SYSTEM', `Запуск ${botsConfigs.length} бот(ов)`)
  for (let i = 0; i < botsConfigs.length; i++) {
    const cfg = botsConfigs[i]
    const delay = i * START_STAGGER + Math.floor(Math.random() * START_STAGGER_JITTER)
    addLog('info', 'SYSTEM', `${cfg.username} запустится через ${Math.round(delay/1000)}с`)
    setTimeout(() => {
      const botObj = createBot(cfg)
      activeBots.push(botObj)
    }, delay)
  }
}

// ============================================================================
// ГОРЯЧИЕ КЛАВИШИ
// ============================================================================
screen.key(['escape', 'q', 'C-c'], () => {
  stopAllBots()
  process.exit(0)
})

screen.key(['r'], () => {
  monitorData.totalBlocks = 0
  for (const bot of Object.values(monitorData.bots)) {
    bot.blocksTotal = 0
  }
  addLog('info', 'SYSTEM', 'Статистика сброшена')
  updateUI()
})

screen.key(['p', 'space'], () => {
  diggingPaused = !diggingPaused
  const status = diggingPaused ? 'ПРИОСТАНОВЛЕНО' : 'ВОЗОБНОВЛЕНО'
  addLog('info', 'SYSTEM', `Копание ${status}`)
  
  for (const [botName, botData] of Object.entries(monitorData.bots)) {
    if (botData.status === 'копает' || botData.status === 'пауза') {
      botData.status = diggingPaused ? 'пауза' : 'копает'
    }
  }
  
  updateUI()
})

// ============================================================================
// ЗАПУСК
// ============================================================================
addLog('info', 'SYSTEM', ' Менеджер ботов запущен')
addLog('info', 'SYSTEM', `Сервер: ${SERVER_HOST} (${MC_VERSION})`)
addLog('info', 'SYSTEM', 'Q/ESC - выход | R - сброс статистики | P/SPACE - пауза')
addLog('info', 'SYSTEM', ' VPN режим: увеличенные таймауты (120с)')
if (UNSTABLE_INTERNET_MODE) {
  addLog('info', 'SYSTEM', 'Режим нестабильного интернета: ВКЛ')
}

setInterval(updateUI, 1000)
setInterval(updateActivityGraph, 10000)
setInterval(updateScriptResources, 1000)

setInterval(() => {
  const uptime = Date.now() - monitorData.startTime
  const hours = Math.floor(uptime / 3600000)
  const minutes = Math.floor((uptime % 3600000) / 60000)
  const activeBots = Object.values(monitorData.bots).filter(b => b.status === 'копает').length
  const totalBots = Object.keys(monitorData.bots).length
  const avgRate = monitorData.totalBlocks > 0 && uptime > 0 
    ? (monitorData.totalBlocks / (uptime / 3600000)).toFixed(1) : '0.0'
  
  writeToLogFile(`=== СТАТИСТИКА === Время: ${hours}ч ${minutes}м | Боты: ${activeBots}/${totalBots} | Добыто: ${monitorData.totalBlocks} блоков | Скорость: ${avgRate} бл/ч`)
  
  for (const [botName, botData] of Object.entries(monitorData.bots)) {
    writeToLogFile(`  ${botName.padEnd(20)} | Статус: ${botData.status.padEnd(12)} | Добыто: ${botData.blocksTotal} | Скорость: ${botData.blocksLastMinute}/мин`)
  }
}, 300000)

startAllBots()

setTimeout(() => {
  startRotationScheduler()
}, PERIODIC_REJOIN_MS)

updateUI()