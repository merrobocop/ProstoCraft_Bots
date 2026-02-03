const { loadConfig } = require('./src/config')
const { createLogger } = require('./src/logger')
const { createUI } = require('./src/ui')
const { createBotManager } = require('./src/botManager')

const monitorData = {
  startTime: Date.now(),
  bots: {},
  totalBlocks: 0,
  activityHistory: { x: [], y: {} }
}

function main() {
  let config
  try {
    config = loadConfig()
  } catch (err) {
    console.error('ERR Ошибка конфигурации:', err.message)
    process.exit(1)
  }

  const ui = createUI({ config, monitorData })
  const logger = createLogger(config, ui)
  const manager = createBotManager({ config, monitorData, logger, ui })

  process.on('SIGINT', () => {
    manager.stopAllBots()
    logger.close()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    manager.stopAllBots()
    logger.close()
    process.exit(0)
  })

  logger.addLog('info', 'SYSTEM', ' Менеджер ботов запущен')
  logger.addLog('info', 'SYSTEM', `Сервер: ${config.server.host} (${config.server.version})`)
  logger.addLog('info', 'SYSTEM', 'Q/ESC - выход | R - сброс статистики | P/SPACE - пауза')

  ui.screen.key(['escape', 'q', 'C-c'], () => {
    manager.stopAllBots()
    logger.close()
    process.exit(0)
  })

  ui.screen.key(['r'], () => {
    monitorData.totalBlocks = 0
    for (const bot of Object.values(monitorData.bots)) {
      bot.blocksTotal = 0
    }
    logger.addLog('info', 'SYSTEM', 'Статистика сброшена')
    ui.scheduleUIUpdate(() => ui.render(manager.diggingPaused, config.timing.periodicRejoinMs))
  })

  ui.screen.key(['p', 'space'], () => {
    manager.togglePause()
  })

  setInterval(() => {
    ui.updateActivityGraph()
    ui.scheduleUIUpdate(() => ui.render(manager.diggingPaused, config.timing.periodicRejoinMs))
  }, config.ui.graphUpdateMs)
  setInterval(() => ui.updateScriptResources(), config.ui.renderIntervalMs)

  setInterval(() => {
    const uptime = Date.now() - monitorData.startTime
    const hours = Math.floor(uptime / 3600000)
    const minutes = Math.floor((uptime % 3600000) / 60000)
    const activeBots = Object.values(monitorData.bots).filter(b => b.status === 'копает').length
    const totalBots = Object.keys(monitorData.bots).length
    const avgRate =
      monitorData.totalBlocks > 0 && uptime > 0
        ? (monitorData.totalBlocks / (uptime / 3600000)).toFixed(1)
        : '0.0'
    logger.writeToLogFile(
      `=== СТАТИСТИКА === Время: ${hours}ч ${minutes}м | Боты: ${activeBots}/${totalBots} | Добыто: ${monitorData.totalBlocks} блоков | Скорость: ${avgRate} бл/ч`
    )
    for (const [botName, botData] of Object.entries(monitorData.bots)) {
      logger.writeToLogFile(
        `  ${botName.padEnd(20)} | Статус: ${botData.status.padEnd(12)} | Добыто: ${botData.blocksTotal} | Скорость: ${botData.blocksLastMinute}/мин`
      )
    }
  }, 300000)

  if (config.globalRestart.memoryLimitMB > 0) {
    setInterval(() => {
      const memUsageMb = process.memoryUsage().rss / 1024 / 1024
      if (memUsageMb > config.globalRestart.memoryLimitMB) {
        logger.addLog(
          'error',
          'SYSTEM',
          `Превышен лимит памяти ${config.globalRestart.memoryLimitMB}MB (факт: ${memUsageMb.toFixed(
            1
          )}MB) -> перезапуск`
        )
        manager.fullRestart('memory-limit')
      }
    }, 60000)
  }

  manager.startAllBots()
  setTimeout(() => {
    manager.rotateBots().catch(err => logger.addLog('error', 'ROTATION', err.message))
  }, config.timing.periodicRejoinMs)

  ui.scheduleUIUpdate(() => ui.render(manager.diggingPaused, config.timing.periodicRejoinMs))
}

main()
