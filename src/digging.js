const vec3 = require('vec3')
const { sleep, ensureLookAt, isReachable, equipBestTool } = require('./utils')

/**
 * @typedef {Object} DiggingContext
 * @property {object} bot
 * @property {Array} blocksToMine
 * @property {object} monitorData
 * @property {function(string,string,string):void} addLog
 * @property {function(string,string,object=):void} updateBotStatus
 * @property {function():boolean} shouldStop
 * @property {function():boolean} isReturning
 * @property {function():boolean} isPaused
 * @property {function():void} scheduleReconnect
 * @property {object} timing
 * @property {object} counters
 */

/**
 * Start digging loop with backoff and safety checks.
 * @param {DiggingContext} context
 */
async function startDiggingLoop(context) {
  const {
    bot,
    blocksToMine,
    monitorData,
    addLog,
    updateBotStatus,
    shouldStop,
    isReturning,
    isPaused,
    scheduleReconnect,
    timing,
    counters
  } = context

  let currentBlockIndex = 0
  let emptyBlocksCounter = 0
  let emptyCycles = 0
  let missingChunkCycles = 0
  let lastBlockPos = null
  let digInFlight = false
  const emptyBlockGraceUntil = Date.now() + 15000

  counters.lastDigTime = Date.now()
  counters.miningStartAt = counters.lastDigTime
  counters.miningStartBlocks = monitorData.bots[counters.username]?.blocksTotal || 0

  addLog('success', counters.username, 'Начинаю копать')
  updateBotStatus(counters.username, 'копает')

  while (bot && bot.player && !shouldStop()) {
    if (isPaused() || isReturning()) {
      await sleep(50)
      continue
    }

    if (digInFlight) {
      await sleep(0)
      continue
    }

    const target = blocksToMine[currentBlockIndex]
    if (!target) {
      await sleep(0)
      continue
    }

    const pos = vec3(target.x, target.y, target.z)
    const column = bot.world ? bot.world.getColumnAt(pos) : null
    if (!column) {
      if (Date.now() > emptyBlockGraceUntil) {
        missingChunkCycles++
        if (missingChunkCycles % 10 === 0) {
          addLog('warning', counters.username, `Чанк не загружен (${missingChunkCycles} попыток)`)
        }
        if (missingChunkCycles >= 30) {
          addLog('warning', counters.username, 'Чанк не загрузился -> перезапуск')
          updateBotStatus(counters.username, 'ожидание')
          scheduleReconnect()
          return
        }
      }
      await sleep(200)
      continue
    }

    const block = bot.blockAt(pos)
    if (!block || block.type === 0) {
      currentBlockIndex = (currentBlockIndex + 1) % blocksToMine.length
      if (Date.now() > emptyBlockGraceUntil) {
        emptyBlocksCounter++
        if (emptyBlocksCounter >= blocksToMine.length) {
          emptyCycles++
          if (emptyCycles % 10 === 0) {
            addLog('warning', counters.username, `Нет блоков в списке (${emptyCycles} циклов подряд)`)
          }
          if (emptyCycles >= 30) {
            addLog('warning', counters.username, 'Блоки недоступны слишком долго -> перезапуск')
            updateBotStatus(counters.username, 'ожидание')
            scheduleReconnect()
            return
          }
          emptyBlocksCounter = 0
        }
      }
      await sleep(0)
      continue
    }

    emptyBlocksCounter = 0
    emptyCycles = 0
    missingChunkCycles = 0

    try {
      const blockCenter = pos.offset(0.5, 0.5, 0.5)
      if (!lastBlockPos || !lastBlockPos.equals(pos)) {
        await ensureLookAt(bot, blockCenter, 0.05)
        lastBlockPos = pos.clone()
      }

      if (!isReachable(bot, block, 4.8)) {
        addLog('debug', counters.username, 'Блок вне досягаемости')
        currentBlockIndex = (currentBlockIndex + 1) % blocksToMine.length
        await sleep(0)
        continue
      }

      await equipBestTool(bot, block)

      digInFlight = true
      await bot.dig(block, false)
      digInFlight = false

      counters.lastDigTime = Date.now()
      updateBotStatus(counters.username, 'копает', { blockMined: true })
      currentBlockIndex = (currentBlockIndex + 1) % blocksToMine.length
    } catch (err) {
      digInFlight = false
      const errMsg = err && err.message ? err.message : String(err)
      if (
        errMsg.includes('block is out of reach') ||
        errMsg.includes('digging aborted') ||
        errMsg.includes('No block has been dug') ||
        errMsg.includes('block no longer exists')
      ) {
        addLog('debug', counters.username, errMsg.substring(0, 60))
      } else {
        addLog('warning', counters.username, errMsg.substring(0, 60))
      }
      currentBlockIndex = (currentBlockIndex + 1) % blocksToMine.length
      await sleep(0)
    }

    if (timing.digDelay > 0) {
      await sleep(timing.digDelay)
    } else {
      await sleep(0)
    }
  }
}

module.exports = { startDiggingLoop }
