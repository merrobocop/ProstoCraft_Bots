const fs = require('fs')
const path = require('path')
const { startDiggingLoop } = require('../src/digging')

async function runBench() {
  const blocksToMine = Array.from({ length: 5 }).map((_, idx) => ({
    x: 0,
    y: 64 + idx,
    z: 0
  }))

  const fakeBot = {
    vec3: (x, y, z) => ({ x, y, z, offset: (dx, dy, dz) => ({ x: x + dx, y: y + dy, z: z + dz }) }),
    world: { getColumnAt: () => ({}) },
    player: true,
    entity: { position: { x: 0, y: 64, z: 0 }, yaw: 0 },
    blockAt: () => ({ type: 1, position: { x: 0, y: 64, z: 0 } }),
    dig: async () => {},
    lookAt: async () => {},
    inventory: { slots: [] }
  }

  const monitorData = { bots: { BenchBot: { blocksTotal: 0, blocksLastMinute: 0 } }, totalBlocks: 0 }
  const counters = { username: 'BenchBot', lastDigTime: Date.now(), miningStartAt: null, miningStartBlocks: 0 }
  const start = Date.now()

  let iterations = 0
  const stopAfter = 2000

  await startDiggingLoop({
    bot: fakeBot,
    blocksToMine,
    monitorData,
    addLog: () => {},
    updateBotStatus: () => {},
    shouldStop: () => iterations++ > stopAfter,
    isReturning: () => false,
    isPaused: () => false,
    scheduleReconnect: () => {},
    timing: { digDelay: 0 },
    counters
  })

  const durationMs = Date.now() - start
  const avgMs = durationMs / Math.max(iterations, 1)
  const result = `Iterations: ${iterations}\nDuration: ${durationMs}ms\nAvg loop: ${avgMs.toFixed(4)}ms\n`
  const resultsPath = path.join(__dirname, 'results.md')
  fs.writeFileSync(resultsPath, `# Bench Results\n\n${result}`)
  console.log(result)
}

runBench().catch(err => {
  console.error(err)
  process.exit(1)
})
