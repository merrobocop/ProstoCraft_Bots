const { startDiggingLoop } = require('../src/digging')

describe('digging loop', () => {
  test('increments block counters on successful dig', async () => {
    const blocksToMine = [{ x: 0, y: 64, z: 0 }]
    const bot = {
      vec3: (x, y, z) => ({ x, y, z, offset: () => ({ x, y, z }) }),
      world: { getColumnAt: () => ({}) },
      player: true,
      entity: { position: { x: 0, y: 64, z: 0, distanceTo: () => 1 }, yaw: 0 },
      blockAt: () => ({ type: 1, position: { x: 0, y: 64, z: 0 } }),
      dig: async () => {},
      lookAt: async () => {},
      inventory: { slots: [] }
    }
    const monitorData = { bots: { Bot: { blocksTotal: 0, blocksLastMinute: 0 } }, totalBlocks: 0 }
    const counters = { username: 'Bot', lastDigTime: Date.now(), miningStartAt: null, miningStartBlocks: 0 }
    let calls = 0
    await startDiggingLoop({
      bot,
      blocksToMine,
      monitorData,
      addLog: () => {},
      updateBotStatus: (_, __, data) => {
        if (data && data.blockMined) monitorData.totalBlocks += 1
      },
      shouldStop: () => calls++ > 1,
      isReturning: () => false,
      isPaused: () => false,
      scheduleReconnect: () => {},
      timing: { digDelay: 0 },
      counters
    })
    expect(monitorData.totalBlocks).toBeGreaterThan(0)
  })
})
