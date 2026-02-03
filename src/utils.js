const vec3 = require('vec3')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitWhile(conditionFn, { intervalMs = 50, timeoutMs = 0 } = {}) {
  const started = Date.now()
  while (conditionFn()) {
    if (timeoutMs && Date.now() - started > timeoutMs) return false
    await sleep(intervalMs)
  }
  return true
}

function safeWritePacket(bot, name, payload) {
  try {
    if (bot && bot._client) {
      bot._client.write(name, payload)
      return true
    }
  } catch (_) {}
  return false
}

function isReachable(bot, block, reach = 4.5) {
  if (!bot || !bot.entity || !block || !block.position) return false
  const distance = bot.entity.position.distanceTo(block.position)
  return distance <= reach
}

async function ensureLookAt(bot, targetPos, threshold = 0.01) {
  if (!bot || !bot.entity || !targetPos) return
  const dx = targetPos.x - bot.entity.position.x
  const dz = targetPos.z - bot.entity.position.z
  const yaw = Math.atan2(-dx, -dz)
  if (Math.abs(bot.entity.yaw - yaw) < threshold) return
  await bot.lookAt(targetPos, true)
}

async function equipBestTool(bot, block) {
  if (!bot || !block) return false
  if (!bot.inventory || !bot.inventory.slots) return false
  const current = bot.heldItem
  const best = bot.inventory.slots.find(item => item && item.name && item.type === (current ? current.type : item.type))
  if (best && (!current || best.type !== current.type)) {
    await bot.equip(best, 'hand')
    return true
  }
  return false
}

function vecFromConfig(pos) {
  if (!pos) return null
  return vec3(pos.x, pos.y, pos.z)
}

module.exports = {
  sleep,
  waitWhile,
  safeWritePacket,
  isReachable,
  ensureLookAt,
  equipBestTool,
  vecFromConfig
}
