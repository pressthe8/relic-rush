import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'

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
    await a.getByRole('button', { name: 'Ready', exact: true }).click()
    await b.getByRole('button', { name: 'Ready', exact: true }).click()
    await expect(a.getByText('Match ends in', { exact: true })).toBeVisible()
    await expect(b.getByText('Match ends in', { exact: true })).toBeVisible()
    await expect(spectator.getByRole('heading', { name: 'Game Lobby' })).toBeVisible()
    await a.getByRole('button', { name: 'A1: dig', exact: true }).click()
    await expect(a.getByRole('button', { name: /^A1: (empty|treasure)$/ })).toBeVisible()
    await expect(a.getByRole('timer')).toBeInViewport()
    await a.reload()
    await expect(a.getByRole('button', { name: /^A1: (empty|treasure)$/ })).toBeVisible()
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

test('six unready players start automatically; spectator stays in lobby and everyone receives results', async ({ browser }, testInfo) => {
  const { contexts, pages } = await guests(browser, 7)
  try {
    for (const page of pages.slice(0, 6)) await page.getByRole('button', { name: 'Join game', exact: true }).click()
    for (const page of pages.slice(0, 6)) await expect(page.getByText('Match ends in', { exact: true })).toBeVisible()
    await expect(pages[6].getByRole('heading', { name: 'Game Lobby' })).toBeVisible()
    await Promise.all(pages.slice(0, 6).map(page => page.getByRole('button', { name: 'A1: dig', exact: true }).click()))
    for (const page of pages.slice(0, 6)) await expect(page.getByRole('button', { name: /^A1: (empty|treasure)$/ })).toBeVisible()
    await pages[1].screenshot({ path: testInfo.outputPath('six-player-match.png'), fullPage: true })
    for (const page of pages.slice(0, 6)) await expect(page.getByRole('heading', { name: 'Game Complete!' })).toBeVisible({ timeout: 30000 })
    await expect(pages[6].getByRole('heading', { name: 'Game Lobby' })).toBeVisible()
  } finally { await Promise.all(contexts.map(context => context.close())) }
})
