const { createBotInstance } = require('./botInstance')

function createBotManager({ config, monitorData, logger, ui }) {
  let activeBots = []
  let restarting = false
  let rotationInProgress = false
  let diggingPaused = false
  let globalErrorTimestamps = []
  let noInternetErrors = []

  const timing = config.timing
  const botsConfigs = config.bots

  function updateBotStatus(botName, status, data = {}) {
    if (!monitorData.bots[botName]) {
      monitorData.bots[botName] = {
        status,
        blocksTotal: 0,
        blocksLastMinute: 0,
        lastBlockTime: Date.now(),
        blockTimes: []
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
    ui.scheduleUIUpdate(() => ui.render(diggingPaused, timing.periodicRejoinMs))
  }

  function noteGlobalError() {
    const now = Date.now()
    globalErrorTimestamps.push(now)
    globalErrorTimestamps = globalErrorTimestamps.filter(t => now - t <= config.globalRestart.timeWindowMs)
    logger.addLog('warning', 'SYSTEM', `Счётчик ошибок: ${globalErrorTimestamps.length}/${config.globalRestart.errorThreshold}`)
    if (globalErrorTimestamps.length >= config.globalRestart.errorThreshold) {
      logger.addLog('error', 'SYSTEM', 'Достигнут порог ошибок -> полный перезапуск')
      fullRestart('global-error-threshold')
    }
  }

  function noteNoInternetError() {
    if (!config.globalRestart.stopOnNoInternet) {
      if (config.globalRestart.unstableInternetMode) return
      noteGlobalError()
      return
    }
    const now = Date.now()
    noInternetErrors.push(now)
    noInternetErrors = noInternetErrors.filter(t => now - t <= 120000)
    logger.addLog('warning', 'SYSTEM', `Ошибки интернета: ${noInternetErrors.length}/${config.globalRestart.noInternetThreshold}`)
    if (noInternetErrors.length >= config.globalRestart.noInternetThreshold) {
      logger.addLog('error', 'SYSTEM', 'Потеряно подключение к интернету - остановка')
      stopAllBots()
      process.exit(1)
    }
  }

  function fullRestart(reason = 'manual') {
    if (restarting) return
    restarting = true
    logger.addLog('info', 'SYSTEM', `Полный перезапуск: ${reason}`)
    for (const a of activeBots) {
      try { if (a.cleanup) a.cleanup() } catch (_) {}
      try { if (a.bot) a.bot.quit() } catch (_) {}
    }
    activeBots = []
    setTimeout(() => {
      restarting = false
      startAllBots()
    }, 2000 + Math.floor(Math.random() * 4000))
  }

  function scheduleReconnect(username, cfg, delay = timing.reconnectRegular) {
    const botObj = activeBots.find(b => b.username === username)
    if (botObj && botObj.cleanup) botObj.cleanup()
    setTimeout(() => {
      const newObj = createBotInstance({
        cfg,
        config,
        monitorData,
        logger,
        isPaused: () => diggingPaused,
        isCurrentInstance: (instanceId, user) => {
          const current = activeBots.find(b => b.username === user)
          return current && current.instanceId === instanceId
        },
        onReplace: (user, instance) => {
          const index = activeBots.findIndex(b => b.username === user)
          if (index !== -1) activeBots[index] = instance
        },
        onUpdateStatus: updateBotStatus,
        scheduleReconnect: (user, cfg2, delay2) => scheduleReconnect(user, cfg2, delay2)
      })
      const index = activeBots.findIndex(b => b.username === username)
      if (index !== -1) activeBots[index] = newObj
      else activeBots.push(newObj)
    }, delay)
  }

  function startAllBots() {
    logger.addLog('info', 'SYSTEM', `Запуск ${botsConfigs.length} бот(ов)`)
    for (let i = 0; i < botsConfigs.length; i++) {
      const cfg = botsConfigs[i]
      const delay = i * timing.startStagger + Math.floor(Math.random() * timing.startStaggerJitter)
      logger.addLog('info', 'SYSTEM', `${cfg.username} запустится через ${Math.round(delay / 1000)}с`)
      setTimeout(() => {
        const botObj = createBotInstance({
          cfg,
          config,
          monitorData,
          logger,
          isPaused: () => diggingPaused,
          isCurrentInstance: (instanceId, user) => {
            const current = activeBots.find(b => b.username === user)
            return current && current.instanceId === instanceId
          },
          onReplace: (user, instance) => {
            const index = activeBots.findIndex(b => b.username === user)
            if (index !== -1) activeBots[index] = instance
          },
          onUpdateStatus: updateBotStatus,
          scheduleReconnect: (user, cfg2, delay2) => scheduleReconnect(user, cfg2, delay2)
        })
        activeBots.push(botObj)
      }, delay)
    }
  }

  function stopAllBots() {
    logger.addLog('info', 'SYSTEM', 'Остановка всех ботов')
    for (const a of activeBots) {
      try { if (a.cleanup) a.cleanup() } catch (_) {}
    }
    activeBots = []
  }

  async function rotateBots() {
    if (rotationInProgress || activeBots.length === 0) return
    rotationInProgress = true
    logger.addLog('info', 'ROTATION', `Начинаю плановую ротацию ботов (интервал: ${Math.round(timing.periodicRejoinMs / 60000)} мин)`)
    for (let i = 0; i < activeBots.length; i++) {
      const botObj = activeBots[i]
      if (!botObj.bot || !botObj.isOnline) continue
      botObj.isRotating = true
      if (botObj.cleanup) botObj.cleanup()
      await new Promise(resolve => setTimeout(resolve, 5000))
      const newObj = createBotInstance({
        cfg: botsConfigs.find(c => c.username === botObj.username),
        config,
        monitorData,
        logger,
        isPaused: () => diggingPaused,
        isCurrentInstance: (instanceId, user) => {
          const current = activeBots.find(b => b.username === user)
          return current && current.instanceId === instanceId
        },
        onReplace: (user, instance) => {
          const index = activeBots.findIndex(b => b.username === user)
          if (index !== -1) activeBots[index] = instance
        },
        onUpdateStatus: updateBotStatus,
        scheduleReconnect: (user, cfg2, delay2) => scheduleReconnect(user, cfg2, delay2)
      })
      activeBots[i] = newObj
      if (i < activeBots.length - 1) {
        await new Promise(resolve => setTimeout(resolve, timing.rotationDelayBetweenBots))
      }
    }
    logger.addLog('success', 'ROTATION', '+ Ротация завершена')
    rotationInProgress = false
  }

  function togglePause() {
    diggingPaused = !diggingPaused
    const status = diggingPaused ? 'ПРИОСТАНОВЛЕНО' : 'ВОЗОБНОВЛЕНО'
    logger.addLog('info', 'SYSTEM', `Копание ${status}`)
    for (const botData of Object.values(monitorData.bots)) {
      if (botData.status === 'копает' || botData.status === 'пауза') {
        botData.status = diggingPaused ? 'пауза' : 'копает'
      }
    }
    ui.scheduleUIUpdate(() => ui.render(diggingPaused, timing.periodicRejoinMs))
  }

  return {
    startAllBots,
    stopAllBots,
    rotateBots,
    togglePause,
    updateBotStatus,
    noteGlobalError,
    noteNoInternetError,
    fullRestart,
    get diggingPaused() {
      return diggingPaused
    }
  }
}

module.exports = { createBotManager }
