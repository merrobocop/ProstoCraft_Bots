const blessed = require('blessed')
const contrib = require('blessed-contrib')

function createUI({ config, monitorData }) {
  const screen = blessed.screen({ smartCSR: true, title: 'Minecraft Bot Monitor' })
  const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen })

  const resourcesBox = grid.set(6, 8, 3, 4, blessed.box, {
    label: '  Ресурсы скрипта ',
    tags: true,
    border: { type: 'line' },
    style: { border: { fg: 'magenta' }, label: { fg: 'magenta', bold: true } }
  })

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

  const historyLength = config.monitor?.historyLength || 180
  let uiUpdateScheduled = false
  let lastCpuUsage = process.cpuUsage()
  let lastCpuTime = Date.now()

  function updateInfoBox(diggingPaused, periodicRejoinMs) {
    const uptime = Date.now() - monitorData.startTime
    const hours = Math.floor(uptime / 3600000)
    const minutes = Math.floor((uptime % 3600000) / 60000)
    const seconds = Math.floor((uptime % 60000) / 1000)
    const activeBots = Object.values(monitorData.bots).filter(b => b.status === 'копает').length
    const totalBots = Object.keys(monitorData.bots).length
    const avgRate =
      monitorData.totalBlocks > 0 && uptime > 0
        ? (monitorData.totalBlocks / (uptime / 3600000)).toFixed(1)
        : '0.0'
    infoBox.setContent(
      `
  {cyan-fg}  Время работы:{/cyan-fg}  {bold}${hours}ч ${minutes}м ${seconds}с{/bold}
  {green-fg} Боты активны:{/green-fg}  {bold}${activeBots}/${totalBots}{/bold}
  {yellow-fg}  Добыто блоков:{/yellow-fg}  {bold}${monitorData.totalBlocks}{/bold}
  {magenta-fg} Средняя скорость:{/magenta-fg}  {bold}${avgRate} блоков/час{/bold}
  {blue-fg} Ротация:{/blue-fg}  {bold}каждые ${Math.round(periodicRejoinMs / 60000)} мин{/bold}
  {${diggingPaused ? 'red' : 'green'}-fg}  Копание:{/}  {bold}${
        diggingPaused ? 'ПАУЗА' : 'АКТИВНО'
      }{/bold}
  `
    )
  }

  function updateActivityGraph() {
    const now = new Date()
    const timeLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    monitorData.activityHistory.x.push(timeLabel)
    if (monitorData.activityHistory.x.length > historyLength) monitorData.activityHistory.x.shift()

    const series = []
    const colors = ['yellow', 'cyan', 'magenta', 'green', 'red', 'blue']
    let colorIndex = 0
    for (const [botName, botData] of Object.entries(monitorData.bots)) {
      if (!monitorData.activityHistory.y[botName]) {
        monitorData.activityHistory.y[botName] = []
      }
      const blocksPerMin = botData.blocksLastMinute || 0
      monitorData.activityHistory.y[botName].push(blocksPerMin)
      if (monitorData.activityHistory.y[botName].length > historyLength) {
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
      try {
        activityLine.setData(series)
      } catch (_) {}
    }
  }

  function updateBotsTable(diggingPaused) {
    const headers = ['Имя бота', 'Статус', 'Добыто']
    const data = []
    const statusColors = {
      копает: '{green-fg}',
      ожидание: '{yellow-fg}',
      оффлайн: '{red-fg}',
      подключается: '{cyan-fg}',
      ротация: '{magenta-fg}',
      пауза: '{red-fg}',
      возврат: '{blue-fg}'
    }
    for (const [botName, botData] of Object.entries(monitorData.bots)) {
      const color = statusColors[botData.status] || '{white-fg}'
      const displayStatus = diggingPaused && botData.status === 'копает' ? 'пауза' : botData.status
      data.push([
        botName,
        `${statusColors[displayStatus] || color}${displayStatus}{/}`,
        String(botData.blocksTotal || 0)
      ])
    }
    botsTable.setData({ headers, data })
  }

  function updateScriptResources() {
    const memUsage = (process.memoryUsage().rss / 1024 / 1024).toFixed(1)
    const currentCpuUsage = process.cpuUsage()
    const currentTime = Date.now()
    const elapsedTime = currentTime - lastCpuTime
    const elapsedCpu =
      (currentCpuUsage.user - lastCpuUsage.user + currentCpuUsage.system - lastCpuUsage.system) / 1000
    const cpuPercent =
      elapsedTime > 0 ? Math.min(100, (elapsedCpu / elapsedTime) * 100).toFixed(1) : '0.0'

    lastCpuUsage = currentCpuUsage
    lastCpuTime = currentTime
    resourcesBox.setContent(`
  {yellow-fg} CPU:{/yellow-fg}  {bold}${cpuPercent}%{/bold}
  {cyan-fg} RAM:{/cyan-fg}  {bold}${memUsage} MB{/bold}
  `)
    scheduleUIUpdate(() => screen.render())
  }

  function scheduleUIUpdate(action) {
    if (uiUpdateScheduled) return
    uiUpdateScheduled = true
    setTimeout(() => {
      if (action) action()
      uiUpdateScheduled = false
    }, config.ui?.renderIntervalMs || 1000)
  }

  function render(diggingPaused, periodicRejoinMs) {
    updateInfoBox(diggingPaused, periodicRejoinMs)
    updateBotsTable(diggingPaused)
    screen.render()
  }

  return {
    screen,
    logBox,
    resourcesBox,
    updateActivityGraph,
    updateScriptResources,
    scheduleUIUpdate,
    render
  }
}

module.exports = { createUI }
