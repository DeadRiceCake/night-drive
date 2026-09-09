// Screenshot harness: renders the dev/preview build in headless Edge and saves PNGs.
// Usage: node scripts/shot.mjs <url> <outDir> [warp1,warp2,...]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const [url = 'http://localhost:5173/', out = 'shots', warps = ''] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
page.on('console', (m) => console.log('[console]', m.type(), m.text()))
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
page.on('response', (r) => { if (r.status() >= 400) console.log('[http]', r.status(), r.url()) })
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(9000)
await page.screenshot({ path: join(out, 'start.png') })
const list = warps ? warps.split(',') : []
for (const w of list) {
  let name = w
  if (w.startsWith('click:')) { await page.click(w.slice(6)); name = 'click' }
  else if (w.startsWith('eval:')) { await page.evaluate(w.slice(5)); name = 'eval' }
  else await page.evaluate((k) => window.nd?.warpTo?.(k), w)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: join(out, `${name}.png`) })
}
await browser.close()
