import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import admin from 'firebase-admin'
import { generateGuestName } from '../../src/utils/guestNames'

async function guests(browser: Browser, count: number) {
  const contexts: BrowserContext[] = []
  const pages: Page[] = []
  for (let i = 0; i < count; i++) {
    const context = await browser.newContext({ viewport: i === 0 ? { width: 390, height: 844 } : { width: 1280, height: 900 } })
    contexts.push(context)
    const page = await context.newPage()
    pages.push(page)
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Join game', exact: true })).toBeEnabled()
  }
  return { contexts, pages }
}

test('two players ready up, dig, refresh, reconnect, time out, and replay on mobile', async ({ browser }, testInfo) => {
  const { contexts, pages } = await guests(browser, 3)
  const [a, b, spectator] = pages
  const errors: string[] = []
  pages.forEach(page => page.on('pageerror', error => errors.push(error.message)))
  try {
    await a.getByRole('button', { name: 'Join game', exact: true }).click()
    await b.getByRole('button', { name: 'Join game', exact: true }).click()
    await expect(a.getByRole('region', { name: 'Lobby players' }).locator('.own-player')).toContainText('You')
    await expect(a.getByTestId('current-player')).toHaveText(/^[A-Za-z]+-[A-Za-z0-9]{6}$/)
    await a.getByRole('button', { name: 'Ready', exact: true }).click()
    await b.getByRole('button', { name: 'Ready', exact: true }).click()
    await expect(a.getByText('Time left', { exact: true })).toBeVisible()
    await expect(b.getByText('Time left', { exact: true })).toBeVisible()
    await expect(a.getByRole('table', { name: 'Leaderboard' }).locator('tbody tr')).toHaveCount(2)
    await expect(a.getByTestId('mobile-rank')).toHaveText(/\d+(st|nd|rd|th)/)
    await expect(b.getByTestId('mobile-rank')).toBeHidden()
    await expect(spectator.getByRole('heading', { name: 'Game Lobby' })).toBeVisible()
    await a.getByRole('button', { name: 'A1: dig', exact: true }).click()
    await expect(a.getByRole('button', { name: /^A1: (empty|treasure)$/ })).toBeVisible()
    await expect(a.getByRole('timer')).toBeInViewport()
    const guestName = await a.getByTestId('current-player').innerText()
    await a.reload()
    await expect(a.getByRole('button', { name: /^A1: (empty|treasure)$/ })).toBeVisible()
    await expect(a.getByTestId('current-player')).toHaveText(guestName)
    await contexts[1].setOffline(true)
    await expect(b.getByRole('alert')).toContainText('Connection lost')
    await contexts[1].setOffline(false)
    await expect(b.getByRole('button', { name: 'B1: dig', exact: true })).toBeEnabled()
    // Slow individual Firestore requests without changing game rules or server timing.
    await contexts[1].route('**/google.firestore.v1.Firestore/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 150))
      await route.continue()
    })
    await b.getByRole('button', { name: 'B1: dig', exact: true }).click()
    await expect(b.getByRole('button', { name: /^B1: (empty|treasure)$/ })).toBeVisible()
    await a.screenshot({ path: testInfo.outputPath('mobile-match.png'), fullPage: true })
    expect(await a.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await expect(a.getByRole('heading', { name: 'Game Complete!' })).toBeVisible({ timeout: 30000 })
    await expect(b.getByRole('heading', { name: 'Game Complete!' })).toBeVisible()
    await expect(a.getByText('Time is up! Here are your final scores.')).toBeVisible()
    await expect(a.getByRole('region', { name: 'Your result' })).toContainText('You finished')
    await expect(a.getByRole('table', { name: 'Final standings' }).locator('[aria-current="true"]')).toContainText('You')
    await a.reload()
    await expect(a.getByRole('heading', { name: 'Game Complete!' })).toBeVisible()
    await a.getByRole('button', { name: 'Play Again', exact: true }).click()
    await expect(a.getByRole('button', { name: 'Join game', exact: true })).toBeEnabled()
    await a.getByRole('button', { name: 'Join game', exact: true }).click()
    await expect(a.getByRole('button', { name: 'Ready', exact: true })).toBeEnabled()
    await a.getByRole('button', { name: 'Leave game', exact: true }).click()
    expect(errors).toEqual([])
  } finally { await Promise.all(contexts.map(context => context.close())) }
})

test('bright UX: live rankings, fill hints, mobile sizes, zero digs, and personal results', async ({ browser }, testInfo) => {
  test.setTimeout(180000)
  const { contexts, pages } = await guests(browser, 6)
  const [mobile, desktop] = pages
  const db = (admin.apps.length ? admin.app() : admin.initializeApp({ projectId: 'demo-relic-rush' })).firestore()
  const errors: string[] = []
  pages.forEach(page => page.on('pageerror', error => errors.push(error.message)))
  try {
    for (const width of [320, 375, 390]) {
      await mobile.setViewportSize({ width, height: 844 })
      expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }
    await mobile.screenshot({ path: testInfo.outputPath('bright-mobile-lobby.png'), fullPage: true })
    await expect(mobile.getByRole('button', { name: 'Copy', exact: true })).toHaveCount(0)
    await expect(mobile.getByTestId('current-player')).not.toContainText('You')
    for (const width of [320, 375, 390]) {
      await mobile.setViewportSize({ width, height: 540 })
      await expect(mobile.getByRole('button', { name: 'Join game', exact: true })).toBeInViewport({ ratio: 1 })
    }
    for (const page of pages) await page.getByRole('button', { name: 'Join game', exact: true }).click()
    await expect(mobile.getByText('Time left', { exact: true })).toBeVisible()
    const own = mobile.getByRole('table', { name: 'Leaderboard' }).locator('[aria-current="true"]')
    const uid = await own.getAttribute('data-player-id')
    expect(uid).toBeTruthy()
    const games = await db.collection('gameSessions').where('status', '==', 'active').get()
    const game = games.docs.find(doc => doc.data().participantIds.includes(uid))!
    expect(game).toBeTruthy()
    // Extend only this local UI fixture, so viewport checks aren't racing the short playtest clock.
    await game.ref.update({ deadline: new Date(Date.now() + 120000).toISOString() })
    const boards = await db.collection('playerBoards').where('sessionId', '==', game.id).get()
    const self = boards.docs.find(doc => doc.data().playerId === uid)!
    const opponents = boards.docs.filter(doc => doc.id !== self.id && game.data().participantIds.includes(doc.data().playerId))
    await expect(mobile.getByRole('table', { name: 'Leaderboard' }).locator('tbody tr')).toHaveCount(6)
    const log = [{ playerId: opponents[0].data().playerId, row: 0, col: 0, points: 100, timestamp: new Date().toISOString(), discoveryOrder: 1 }]
    await game.ref.update({ allDiscoveries: log })
    const batch = db.batch()
    batch.update(self.ref, { score: 180, remainingDigs: 6 })
    const scores = [280, 160, 160, 100, 80]
    opponents.forEach((doc, i) => batch.update(doc.ref, { score: scores[i], remainingDigs: i + 1, ...(i === 0 ? { mockPlayerId: 'Player TreasureHunterWithAnExtraLongName' } : {}) }))
    await batch.commit()
    await expect(mobile.getByTestId('mobile-rank')).toHaveText('2nd')
    await expect(own.locator('[data-stat="score"]')).toHaveText('180')
    await expect(desktop.getByRole('table', { name: 'Leaderboard' }).locator(`[data-player-id="${uid}"] [data-stat="score"]`)).toHaveText('180')
    await expect(mobile.getByText('Reading the map')).toHaveCount(0)
    await expect(mobile.getByText('Equal scores share a rank.')).toHaveCount(0)

    const hint = mobile.getByRole('button', { name: 'A1: dig', exact: true })
    const adjacent = mobile.getByRole('button', { name: 'B2: dig', exact: true })
    const unhinted = mobile.getByRole('button', { name: 'C1: dig', exact: true })
    await expect(hint).toHaveClass(/subgrid-hint-1/)
    await expect(adjacent).toHaveClass(/subgrid-hint-1/)
    await expect(unhinted).not.toHaveClass(/subgrid-hint/)
    await expect.poll(() => hint.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(await mobile.locator('[aria-label="Nearby relics legend"] .subgrid-hint-1').evaluate(el => getComputedStyle(el).backgroundColor))
    const colours = await mobile.evaluate(() => {
      const read = (label: string) => { const s = getComputedStyle(document.querySelector(`button[aria-label="${label}"]`)!); return { fill: s.backgroundColor, border: s.borderColor, width: s.borderWidth } }
      return { hinted: read('A1: dig'), plain: read('C1: dig'), legend: getComputedStyle(document.querySelector('[aria-label="Nearby relics legend"] .subgrid-hint-1')!).backgroundColor }
    })
    expect(colours.hinted.fill).toBe(colours.legend)
    expect(colours.hinted.fill).not.toBe(colours.plain.fill)
    expect(colours.hinted.border).toBe(colours.plain.border)
    expect(colours.hinted.width).toBe(colours.plain.width)
    for (const level of [2, 3, 4]) {
      await game.ref.update({ allDiscoveries: Array.from({ length: level }, (_, i) => ({ ...log[0], row: Math.floor(i / 2), col: i % 2 })) })
      await expect(hint).toHaveClass(new RegExp(`subgrid-hint-${level}`))
      await expect.poll(() => hint.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(await mobile.locator(`[aria-label="Nearby relics legend"] .subgrid-hint-${level}`).evaluate(el => getComputedStyle(el).backgroundColor))
    }
    await game.ref.update({ allDiscoveries: log })

    // Reveal a miss and a treasure inside a hinted region; their own fills must win.
    const squares = JSON.parse(self.data().boardState)
    squares[0][0] = { isRevealed: true, isTreasure: true, discoveryCount: 1 }
    squares[1][1] = { isRevealed: true, isTreasure: false, discoveryCount: 0 }
    await self.ref.update({ boardState: JSON.stringify(squares) })
    await expect(mobile.getByRole('button', { name: 'A1: treasure', exact: true })).not.toHaveClass(/subgrid-hint/)
    await expect(mobile.getByRole('button', { name: 'B2: empty', exact: true })).not.toHaveClass(/subgrid-hint/)
    for (const width of [320, 375, 390]) {
      await mobile.setViewportSize({ width, height: 540 })
      await mobile.evaluate(() => window.scrollTo(0, 0))
      await expect(mobile.getByLabel('Dig board', { exact: true })).toBeInViewport({ ratio: 1 })
      await expect(mobile.getByTestId('mobile-rank')).toBeVisible()
      expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await mobile.getByRole('table', { name: 'Leaderboard' }).locator('tbody tr').last().scrollIntoViewIfNeeded()
      await expect(mobile.getByRole('timer')).toBeInViewport()
    }
    await mobile.evaluate(() => window.scrollTo(0, 0))
    await mobile.screenshot({ path: testInfo.outputPath('bright-mobile-match.png'), fullPage: true })
    await desktop.screenshot({ path: testInfo.outputPath('bright-desktop-match.png'), fullPage: true })
    // Confirm ranks are refreshed from snapshots, including on the other player's screen.
    await self.ref.update({ score: 300, remainingDigs: 0 })
    await expect(mobile.getByTestId('mobile-rank')).toHaveText('1st')
    await expect(own.locator('[data-stat="digs"]')).toHaveText('0')
    await expect(mobile.getByRole('heading', { name: 'All digs used!' })).toBeVisible()
    await expect(mobile.getByRole('button', { name: 'C1: dig', exact: true })).toBeDisabled()
    await expect(desktop.getByRole('table', { name: 'Leaderboard' }).locator(`[data-player-id="${uid}"] [data-stat="score"]`)).toHaveText('300')

    const [instructions] = await Promise.all([contexts[0].waitForEvent('page'), mobile.getByRole('link', { name: /How to play/ }).click()])
    await instructions.waitForLoadState()
    await expect(instructions.getByText('Your game remains open in the original tab.')).toBeVisible()
    expect(instructions.url()).toContain('how-to-play=1')
    await expect(mobile.getByRole('heading', { name: 'Make every dig count.' })).toBeVisible()
    await instructions.close()

    // Server results are authoritative; show a losing player clearly and tied opponents as winners.
    const finalResults = [self, ...opponents].map((doc, i) => ({ id: doc.id, playerId: doc.data().playerId, mockPlayerId: i === 1 ? 'Player TreasureHunterWithAnExtraLongName' : doc.data().mockPlayerId,
      score: i === 0 ? 260 : i < 3 ? 380 : 80, remainingDigs: 0,
      discoveries: Array.from({ length: i === 0 ? 3 : i < 3 ? 4 : 1 }, (_, n) => ({ ...log[0], playerId: doc.data().playerId, row: n, col: n })),
      acceptedMoves: 10, digsUsed: 10, rank: i === 0 ? 3 : i < 3 ? 1 : 4 }))
    await game.ref.update({ status: 'completed', completionReason: 'deadline', finalResults })
    await expect(mobile.getByRole('heading', { name: 'You finished 3rd' })).toBeVisible()
    await expect(mobile.getByRole('region', { name: 'Your result' })).not.toContainText('Player')
    await expect(mobile.getByText('Hunt complete', { exact: true })).toHaveCount(0)
    await expect(mobile.getByRole('button', { name: 'Back to Home' })).toBeVisible()
    await expect(mobile.getByRole('table', { name: 'Final standings' }).locator('[aria-current="true"] [data-stat="score"]')).toHaveText('260')
    await expect(mobile.getByText('Joint winner', { exact: true })).toHaveCount(2)
    for (const width of [320, 375, 390]) {
      await mobile.setViewportSize({ width, height: 844 })
      expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }
    await mobile.screenshot({ path: testInfo.outputPath('bright-mobile-results.png'), fullPage: true })
    await game.ref.update({ finalResults: finalResults.filter(result => result.playerId !== uid) })
    await expect(mobile.getByRole('heading', { name: 'Your result is unavailable' })).toBeVisible()
    await game.ref.update({ status: 'cancelled', completionReason: 'not-enough-players', finalResults: [] })
    await expect(mobile.getByRole('heading', { name: 'Game Cancelled' })).toBeVisible()
    await expect(mobile.getByRole('region', { name: 'Your result' })).toHaveCount(0)
    await expect(mobile.getByRole('button', { name: 'Play Again' })).toBeEnabled()
    expect(errors).toEqual([])
  } finally { await Promise.all(contexts.map(context => context.close())) }
})

test('six unready players start automatically; spectator stays in lobby and everyone receives results', async ({ browser }, testInfo) => {
  const { contexts, pages } = await guests(browser, 7)
  try {
    for (const page of pages.slice(0, 6)) await page.getByRole('button', { name: 'Join game', exact: true }).click()
    for (const page of pages.slice(0, 6)) await expect(page.getByText('Time left', { exact: true })).toBeVisible()
    await expect(pages[6].getByRole('heading', { name: 'Game Lobby' })).toBeVisible()
    await Promise.all(pages.slice(0, 6).map(page => page.getByRole('button', { name: 'A1: dig', exact: true }).click()))
    for (const page of pages.slice(0, 6)) await expect(page.getByRole('button', { name: /^A1: (empty|treasure)$/ })).toBeVisible()
    await pages[1].screenshot({ path: testInfo.outputPath('six-player-match.png'), fullPage: true })
    for (const page of pages.slice(0, 6)) await expect(page.getByRole('heading', { name: 'Game Complete!' })).toBeVisible({ timeout: 30000 })
    await expect(pages[6].getByRole('heading', { name: 'Game Lobby' })).toBeVisible()
  } finally { await Promise.all(contexts.map(context => context.close())) }
})


test('unavailable lobby welcomes visitors and can reconnect', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } })
  const page = await context.newPage()
  try {
    await page.route('**/socket.io/**', route => route.abort())
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'The next hunt awaits.' })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByText('Loading the next lobby…')).toHaveCount(0)
    await expect(page.getByRole('link', { name: /How to play/ })).toHaveAttribute('target', '_blank')
    await expect(page.getByRole('button', { name: 'Sign up / Login' })).toBeDisabled()
    await expect(page.getByText('Coming soon', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.unroute('**/socket.io/**')
    await expect(page.getByRole('button', { name: 'Join game', exact: true })).toBeEnabled()
    await expect(page.getByRole('heading', { name: 'The next hunt awaits.' })).toHaveCount(0)
  } finally {
    await context.close()
  }
})

test('a transient read permission failure recovers without dropping waiting membership', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    // Fail the first subscription, as a temporarily unavailable auth token would.
    await page.route('**/src/lib/firebase.ts', async route => {
      const response = await route.fetch()
      let source = await response.text()
      source = source.replaceAll('subscribeToGameSession', 'originalSubscribeToGameSession')
      source += `\nlet failedOnce = false;\nexport const subscribeToGameSession = (...args) => { if (!failedOnce) { failedOnce = true; queueMicrotask(() => args[2](Object.assign(new Error('Missing or insufficient permissions.'), {code:'permission-denied'}))); return () => {}; } return originalSubscribeToGameSession(...args); };\n`
      await route.fulfill({ response, body: source })
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Join game', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Ready', exact: true })).toBeEnabled()
    await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 10000 })
    await expect(page.getByText('Connection lost. Reconnecting…')).toHaveCount(0)
    await page.getByRole('button', { name: 'Leave game', exact: true }).click()
  } finally { await context.close() }
})

test('touch digs keep committed progress when an older board update arrives', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const opponentContext = await browser.newContext()
  const mobile = await context.newPage()
  const opponent = await opponentContext.newPage()
  const db = (admin.apps.length ? admin.app() : admin.initializeApp({ projectId: 'demo-relic-rush' })).firestore()
  try {
    for (const page of [mobile, opponent]) {
      await page.goto('/')
      await page.getByRole('button', { name: 'Join game', exact: true }).click()
      await page.getByRole('button', { name: 'Ready', exact: true }).click()
    }
    await expect(mobile.getByRole('button', { name: 'A1: dig', exact: true })).toBeEnabled()
    const uid = await mobile.getByRole('table', { name: 'Leaderboard' }).locator('[aria-current="true"]').getAttribute('data-player-id')
    const games = await db.collection('gameSessions').where('status', '==', 'active').get()
    const game = games.docs.find(doc => doc.data().participantIds.includes(uid))!
    await game.ref.update({ deadline: new Date(Date.now() + 60000).toISOString() })
    const ref = db.collection('playerBoards').doc(`${game.id}_${uid}`)
    const original = (await ref.get()).data()!
    await mobile.getByRole('button', { name: 'A1: dig', exact: true }).tap()
    const revealed = mobile.getByRole('button', { name: /^A1: (empty|treasure)$/ })
    await expect(revealed).toBeDisabled()
    const committed = (await ref.get()).data()!
    // Reproduce a stale snapshot arriving after the socket acknowledgement.
    await ref.update({ boardState: original.boardState, acceptedMoves: 0, remainingDigs: 10 })
    await expect(revealed).toBeVisible()
    await mobile.waitForTimeout(500)
    await expect(revealed).toBeDisabled()
    await ref.update(committed)
    await expect(mobile.getByRole('alert')).toHaveCount(0)
    const untouched = mobile.getByRole('button', { name: 'B1: dig', exact: true })
    const fill = await untouched.evaluate(el => getComputedStyle(el).backgroundColor)
    await untouched.dispatchEvent('mouseover')
    expect(await untouched.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(fill)
  } finally { await context.close(); await opponentContext.close() }
})


test('new guests receive persistent explorer names while existing guests keep legacy names', async ({ browser }) => {
  const freshContext = await browser.newContext()
  const existingContext = await browser.newContext()
  const fresh = await freshContext.newPage()
  const existing = await existingContext.newPage()
  const db = (admin.apps.length ? admin.app() : admin.initializeApp({ projectId: 'demo-relic-rush' })).firestore()
  try {
    // Simulate an account created before explorer naming was introduced.
    await existing.route('**/src/lib/firebase.ts', async route => {
      const response = await route.fetch()
      const source = (await response.text()).replace('if (!existing) localStorage.setItem(pendingNameKey, generateGuestName(user.uid));', '')
      await route.fulfill({ response, body: source })
    })
    await existing.goto('/')
    await expect(existing.getByTestId('current-player')).toHaveText(/^Player [A-Za-z0-9]{6}$/)
    await existing.unroute('**/src/lib/firebase.ts')
    await existing.reload()
    await expect(existing.getByTestId('current-player')).toHaveText(/^Player [A-Za-z0-9]{6}$/)
    await fresh.goto('/')
    await expect(fresh.getByTestId('current-player')).toHaveText(/^[A-Za-z]+-[A-Za-z0-9]{6}$/)
    const name = await fresh.getByTestId('current-player').innerText()
    for (const page of [fresh, existing]) await page.getByRole('button', { name: 'Join game', exact: true }).click()
    const ownRow = fresh.getByRole('region', { name: 'Lobby players' }).locator('.own-player')
    const uid = (await ownRow.getAttribute('data-player-id'))!
    expect(name).toBe(generateGuestName(uid))
    expect((await admin.app().auth().getUser(uid)).displayName).toBe(name)
    await expect(ownRow).toContainText(name)
    await expect(existing.getByRole('region', { name: 'Lobby players' })).toContainText(name)
    await fresh.reload()
    await expect(fresh.getByTestId('current-player')).toHaveText(name)
    // Closing the last socket leaves a waiting lobby; rejoin with the same identity.
    await fresh.getByRole('button', { name: 'Join game', exact: true }).click()
    await expect(fresh.getByRole('button', { name: 'Ready', exact: true })).toBeEnabled()
    for (const page of [fresh, existing]) await page.getByRole('button', { name: 'Ready', exact: true }).click()
    const live = fresh.getByRole('table', { name: 'Leaderboard' }).locator(`[data-player-id="${uid}"]`)
    await expect(live).toContainText(name)
    await expect(existing.getByRole('table', { name: 'Leaderboard' })).toContainText(name)
    const games = await db.collection('gameSessions').where('status', '==', 'active').get()
    const game = games.docs.find(doc => doc.data().participantIds.includes(uid))!
    await game.ref.update({ deadline: new Date(Date.now() - 1000).toISOString() })
    await expect(fresh.getByRole('table', { name: 'Final standings' }).locator(`[data-player-id="${uid}"]`)).toContainText(name)
    await fresh.getByRole('button', { name: 'Play Again' }).click()
    await fresh.getByRole('button', { name: 'Join game', exact: true }).click()
    await expect(fresh.getByRole('region', { name: 'Lobby players' }).locator('.own-player')).toContainText(name)
  } finally { await Promise.all([freshContext.close(), existingContext.close()]) }
})
