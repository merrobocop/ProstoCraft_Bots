const mineflayer = require('mineflayer')
const { startDiggingLoop } = require('./digging')
const { sleep, safeWritePacket, vecFromConfig } = require('./utils')

/**
 * Create a bot instance with lifecycle helpers.
 * @param {object} params
 * @returns {object}
 */
function createBotInstance(params) {
  const {
    cfg,
    config,
    monitorData,
    logger,
    onReplace,
    onUpdateStatus,
    scheduleReconnect
  } = params
  const username = cfg.username
  const blocksToMine = cfg.blocksToMine
  const standPosition = vecFromConfig(cfg.standPosition)
  const maxDistance = cfg.maxDistanceFromStand || 0.6
  const timing = config.timing
  const antibot = config.antibot

  let bot = null
  let menuTimer = null
  let reconnectTimer = null
  let positionCheckTimer = null
  let preventiveRestartTimer = null
  let fallCheckTimer = null
  let keepAliveTimer = null
  let joinedSubserver = false
  let allowReconnects = false
  let backoff = timing.reconnectRegular
  let menuAttempts = 0
  let lastMenuAttempt = 0
  let isReturningToPosition = false
  let reconnectScheduled = false
  let waitingForFall = false
  let initialY = null
  let fallCheckPassed = false
  let isOnline = false
  let isRotating = false
  let lastKeepAlive = Date.now()
  let waitKickCount = 0
  let positionConfirmed = false
  let miningTask = null
  const instanceId = Symbol(username)
  const counters = {
    username,
    lastDigTime: Date.now(),
    miningStartAt: null,
    miningStartBlocks: 0
  }

  function isCurrentInstance() {
    return !params.isCurrentInstance || params.isCurrentInstance(instanceId, username)
  }

  function cleanupTimers() {
    try { if (menuTimer) clearTimeout(menuTimer) } catch (_) {}
    try { if (reconnectTimer) clearTimeout(reconnectTimer) } catch (_) {}
    try { if (positionCheckTimer) clearInterval(positionCheckTimer) } catch (_) {}
    try { if (preventiveRestartTimer) clearTimeout(preventiveRestartTimer) } catch (_) {}
    try { if (fallCheckTimer) clearTimeout(fallCheckTimer) } catch (_) {}
    try { if (keepAliveTimer) clearInterval(keepAliveTimer) } catch (_) {}
  }

  function startKeepAliveMonitor() {
    if (keepAliveTimer) clearInterval(keepAliveTimer)
    keepAliveTimer = setInterval(() => {
      if (!bot || !bot._client || !joinedSubserver) return
      const timeSinceLastKeepAlive = Date.now() - lastKeepAlive
      if (timeSinceLastKeepAlive > 25000) {
        logger.addLog('warning', username, `! Нет keep-alive ${Math.round(timeSinceLastKeepAlive / 1000)}с`)
        if (timeSinceLastKeepAlive > 28000 && allowReconnects) {
          logger.addLog('error', username, 'Keep-alive таймаут -> перезапуск')
          cleanupTimers()
          onUpdateStatus(username, 'ожидание')
          scheduleReconnect(username, cfg, 5000)
        }
      }
    }, 5000)
  }

  async function checkAndReturnToPosition() {
    if (!standPosition || !bot || !bot.entity || !joinedSubserver || isReturningToPosition || !positionConfirmed) return
    const currentPos = bot.entity.position
    const distance = currentPos.distanceTo(standPosition)
    if (distance > 500) {
      logger.addLog('warning', username, `Телепорт на спавн (${distance.toFixed(0)}м) - перезаход`)
      onUpdateStatus(username, 'ожидание')
      cleanupTimers()
      positionConfirmed = false
      scheduleReconnect(username, cfg, 3000, true)
      return
    }

    if (distance > maxDistance) {
      logger.addLog('warning', username, `Отошёл на ${distance.toFixed(2)}м (лимит ${maxDistance}м), возвращаюсь...`)
      onUpdateStatus(username, 'возврат')
      isReturningToPosition = true
      try {
        bot.clearControlStates()
        const timeout = Date.now() + (config.position?.returnTimeout || 8000)
        let stuck = 0
        while (bot && bot.entity && bot.entity.position.distanceTo(standPosition) > 0.8) {
          if (Date.now() > timeout) {
            logger.addLog('warning', username, 'Таймаут возврата')
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
        logger.addLog('success', username, 'Вернулся на позицию')
      } catch (err) {
        logger.addLog('error', username, `Ошибка возврата: ${err.message}`)
      } finally {
        isReturningToPosition = false
        if (bot && bot.entity) {
          onUpdateStatus(username, 'копает')
        }
      }
    }
  }

  function startPositionCheck() {
    if (!standPosition || !joinedSubserver || positionCheckTimer) return
    setTimeout(() => {
      if (!joinedSubserver || positionCheckTimer) return
      positionCheckTimer = setInterval(() => {
        checkAndReturnToPosition().catch(() => {})
      }, config.position?.checkInterval || 10000)
      logger.addLog('info', username, 'Проверка позиции активирована')
    }, 30000)
  }

  function startLimboFilterBypass() {
    logger.addLog('info', username, ' Ожидание LimboFilter...')
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
        fallCheckPassed = true
        waitingForFall = false
        if (fallDistance > 0.3 || bot.entity.onGround) {
          logger.addLog('success', username, `+ Проверка пройдена (${fallDistance.toFixed(2)}м)`)
        }
      }, fallCheckDelay)
    }, humanDelay)
  }

  function scheduleReconnectLocal(delay = backoff, forcedReconnect = false) {
    if (reconnectScheduled || !isCurrentInstance()) return
    reconnectScheduled = true
    if (!allowReconnects && !forcedReconnect) {
      reconnectScheduled = false
      const graceDelay = Math.min(timing.graceAfterSpawn, 30000)
      setTimeout(() => scheduleReconnectLocal(delay, true), graceDelay)
      return
    }
    logger.addLog('info', username, `Переподключение через ${Math.round(delay / 1000)}с`)
    onUpdateStatus(username, 'ожидание')
    reconnectTimer = setTimeout(() => {
      reconnectScheduled = false
      reconnectTimer = null
      try {
        if (bot) {
          bot.removeAllListeners()
          bot.quit()
        }
      } catch (_) {}
      cleanupTimers()
      backoff = timing.reconnectRegular
      try {
        const newObj = createBotInstance(params)
        onReplace(username, newObj)
        logger.addLog('success', username, 'Экземпляр заменён')
      } catch (err) {
        logger.addLog('error', username, `Ошибка создания: ${err.message}`)
        reconnectScheduled = false
        setTimeout(() => scheduleReconnectLocal(5000, true), 5000)
      }
    }, delay)
  }

  function startClient() {
    const botOptions = {
      host: config.server.host,
      username,
      auth: 'offline',
      version: config.server.version,
      connectTimeout: 120000,
      keepAlive: true,
      keepAliveInterval: 15000,
      checkTimeoutInterval: 90000
    }
    bot = mineflayer.createBot(botOptions)

    bot.once('spawn', async () => {
      if (!isCurrentInstance()) return
      logger.addLog('success', username, 'Подключен к серверу')
      onUpdateStatus(username, 'подключается')
      isOnline = true
      lastKeepAlive = Date.now()
      allowReconnects = false
      setTimeout(() => {
        allowReconnects = true
      }, timing.graceAfterSpawn)
      menuAttempts = 0
      startKeepAliveMonitor()
      if (config.features?.enableActiveFallCheck) {
        startLimboFilterBypass()
      }
      const initialDelay = 800 + Math.floor(Math.random() * 1200)
      await sleep(initialDelay)
      try {
        bot.setQuickBarSlot(config.menu.hotbarSlot)
        await sleep(700 + Math.floor(Math.random() * 600))
        bot.activateItem()
      } catch (_) {}
      backoff = timing.reconnectRegular
    })

    function safeClickWindow(slot) {
      if (!bot || !bot.currentWindow) return false
      const now = Date.now()
      if (now - lastMenuAttempt < 900) return false
      lastMenuAttempt = now
      menuAttempts++
      const windowId = bot.currentWindow.id
      const item = bot.currentWindow.slots[slot] || { itemId: -1 }
      return safeWritePacket(bot, 'window_click', {
        windowId,
        slot,
        mouseButton: 0,
        action: 0,
        mode: 0,
        item
      })
    }

    async function tryOpenMenuOnce() {
      if (!bot || !bot.currentWindow || joinedSubserver) return
      if (menuAttempts >= 6) {
        backoff = 60000 + Math.floor(Math.random() * 120000)
        scheduleReconnectLocal(backoff, true)
        return
      }
      safeClickWindow(config.menu.slot1)
      await sleep(800 + Math.floor(Math.random() * 700))
      safeClickWindow(config.menu.slot2)
    }

    ;(function menuLoop() {
      if (!joinedSubserver) tryOpenMenuOnce().catch(() => {})
      const nextAttempt = 3000 + Math.floor(Math.random() * 2000)
      menuTimer = setTimeout(menuLoop, nextAttempt)
    })()

    bot.on('message', msg => {
      if (!isCurrentInstance()) return
      try {
        const text = msg.toString().toLowerCase()
        if (text.includes('/login') || text.includes('авторизация')) {
          try {
            bot.chat(`/login ${config.server.password}`)
          } catch (_) {}
        }
        if (text.includes('вы недавно входили') || text.includes('you recently logged in')) {
          logger.addLog('success', username, '+ Быстрый вход - LimboFilter пропущен')
          waitingForFall = false
          fallCheckPassed = true
        }
        if (!joinedSubserver && text.includes('отслеживается')) {
          joinedSubserver = true
          positionConfirmed = true
          logger.addLog('success', username, 'Зашёл на подсервер')
          onUpdateStatus(username, 'копает')
          if (standPosition) startPositionCheck()
          preventiveRestartTimer = setTimeout(() => {
            logger.addLog('info', username, 'Превентивный перезапуск (1 час)')
            onUpdateStatus(username, 'ожидание')
            cleanupTimers()
            backoff = 5000 + Math.floor(Math.random() * 5000)
            scheduleReconnectLocal(backoff, true)
          }, 3600000)
          setTimeout(() => {
            miningTask = startDiggingLoop({
              bot,
              blocksToMine,
              monitorData,
              addLog: logger.addLog,
              updateBotStatus: onUpdateStatus,
              shouldStop: () => reconnectScheduled || !joinedSubserver || !isCurrentInstance(),
              isReturning: () => isReturningToPosition,
              isPaused: () => params.isPaused(),
              scheduleReconnect: () => scheduleReconnectLocal(),
              timing,
              counters
            }).catch(() => {})
          }, 700 + Math.floor(Math.random() * 600))
        }
      } catch (_) {}
    })

    bot.on('kicked', reason => {
      if (!isCurrentInstance()) return
      isOnline = false
      positionConfirmed = false
      let r = typeof reason === 'string' ? reason : JSON.stringify(reason)
      try {
        if (typeof reason === 'object' && reason.extra) {
          const textParts = reason.extra
            .filter(e => e.text)
            .map(e => e.text)
            .join(' ')
          if (textParts) r = textParts
        }
      } catch (_) {}
      logger.addLog('warning', username, `Кикнут: ${r.substring(0, 100)}`)
      onUpdateStatus(username, 'оффлайн')
      cleanupTimers()
      const low = r.toLowerCase()
      if (low.includes('подождите') || low.includes('wait') || low.includes('перед повторным')) {
        waitKickCount++
        const baseDelay = Math.min(600000 + (waitKickCount - 1) * 300000, 1800000)
        backoff = baseDelay + Math.floor(Math.random() * 60000)
        logger.addLog('warning', username, `! Подождите (попытка ${waitKickCount}) - ждём ${Math.round(backoff / 60000)} мин`)
        scheduleReconnectLocal(backoff, true)
        return
      }
      if (low.includes('you are logging in too fast') || low.includes('logging too')) {
        backoff = 300000 + Math.floor(Math.random() * 300000)
        logger.addLog('warning', username, '! Слишком быстрый вход - ждём 5-10 минут')
        scheduleReconnectLocal(backoff, true)
        return
      }
      backoff = 10000 + Math.floor(Math.random() * 10000)
      scheduleReconnectLocal(backoff, true)
    })

    bot.on('end', () => {
      if (!isCurrentInstance()) return
      isOnline = false
      positionConfirmed = false
      if (!reconnectScheduled && !isRotating) {
        logger.addLog('warning', username, 'Отключен от сервера')
        onUpdateStatus(username, 'оффлайн')
        cleanupTimers()
        backoff = 8000 + Math.floor(Math.random() * 12000)
        scheduleReconnectLocal(backoff, false)
      }
    })

    bot.on('error', err => {
      if (!isCurrentInstance()) return
      isOnline = false
      positionConfirmed = false
      const msg = String(err && err.message ? err.message : err)
      if (logger.shouldSuppressMessage && logger.shouldSuppressMessage(msg)) return
      logger.addLog('error', username, msg.substring(0, 60))
      cleanupTimers()
      onUpdateStatus(username, 'оффлайн')
      backoff = 15000 + Math.floor(Math.random() * 15000)
      scheduleReconnectLocal(backoff, true)
    })
  }

  startClient()

  return {
    username,
    instanceId,
    get bot() {
      return bot
    },
    get isOnline() {
      return isOnline
    },
    set isRotating(val) {
      isRotating = val
    },
    cleanup: () => {
      cleanupTimers()
      try {
        if (bot) bot.removeAllListeners()
      } catch (_) {}
      try {
        if (bot) bot.quit()
      } catch (_) {}
    }
  }
}

module.exports = { createBotInstance }
