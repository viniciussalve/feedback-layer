// Prova da task 6: Feedback Layer instalado no design-system-vue, com bridge real e Edge.
//   (cd ../design-system-vue && set VITE_FEEDBACK=1 && npm run build)   # build com o layer ligado
//   npm run build && node e2e/design-system.mjs
// Saídas: e2e/screenshots/ds-*.png e o conteúdo do .json/.md recebidos no inbox.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { startBridge } from '../packages/bridge/dist/server.js'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const DS = resolve(ROOT, '..', 'design-system-vue')
const SHOTS = join(ROOT, 'e2e', 'screenshots')
const INBOX = join(ROOT, 'e2e', '.tmp', 'ds-inbox')
const WEB = 4180
const BASE = `http://localhost:${WEB}`

await rm(INBOX, { recursive: true, force: true })
await mkdir(SHOTS, { recursive: true })
const bridge = await startBridge({ inboxDir: INBOX, origins: [BASE], port: 7777 })
const preview = spawn(process.execPath, [join(DS, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(WEB), '--strictPort', '--host', '127.0.0.1'], {
  cwd: DS,
  stdio: 'ignore',
})
const stop = async () => {
  preview.kill()
  await bridge.close?.()
}

async function waitUp() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(BASE)).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('preview não subiu')
}

const log = (s) => console.log(s)
let failed = false
try {
  await waitUp()
  const browser = await chromium.launch({ channel: 'msedge', headless: true })

  for (const vp of [{ n: '1280', w: 1280, h: 800, touch: false }, { n: '360', w: 360, h: 740, touch: true }]) {
    for (const theme of ['dark', 'light']) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.touch, isMobile: vp.touch, permissions: ['clipboard-read', 'clipboard-write'] })
      const page = await ctx.newPage()
      const errors = []
      page.on('pageerror', (e) => errors.push(String(e)))
      for (const route of ['/', '/design-system']) {
        await page.goto(BASE + route)
        await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
        await page.locator('.fab').waitFor({ state: 'visible' })
        await page.waitForTimeout(1500) // o DS anima cores ao trocar o tema (~1 s): espera terminar antes do screenshot
        const attr = await page.evaluate(() => document.documentElement.getAttribute('data-feedback-layer'))
        assert.equal(attr, 'visible', `${route} ${vp.n} ${theme}: atributo no <html>`)
        const tail = await page.evaluate(() => {
          const el = document.querySelector('[aria-hidden="true"][class*="h-floating"]')
          const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
          return el ? { h: el.getBoundingClientRect().height / rem } : null
        })
        if (route === '/') {
          assert.ok(tail, '/: FloatingSafeArea ausente')
          assert.equal(tail.h, 9, `/: FloatingSafeArea deve ter 9rem com o layer visível (veio ${tail.h})`)
        }
        const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
        log(`  ok   ${route} ${vp.n}px ${theme}: atributo=visible${tail ? `, safe-area=${tail.h}rem` : ''}, scroll horizontal=${noHScroll ? 'não' : 'SIM'}`)
        await page.screenshot({ path: join(SHOTS, `ds-${route === '/' ? 'home' : 'ds'}-${vp.n}-${theme}.png`) })
      }
      assert.deepEqual(errors, [], `erros de página: ${errors.join('\n')}`)
      await ctx.close()
    }
  }

  // Nota real, enviada da tela `/` pelo bridge.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await ctx.newPage()
  await page.goto(BASE + '/')
  await page.locator('.fab').waitFor({ state: 'visible' })
  await page.locator('.fab').click()
  await page.locator('[data-act="pick"]').click()
  const h1 = await page.locator('h1').first().boundingBox()
  await page.mouse.move(h1.x + 10, h1.y + h1.height / 2)
  await page.locator('.hl').waitFor({ state: 'visible' })
  await page.screenshot({ path: join(SHOTS, 'ds-home-1280-realce.png') })
  await page.mouse.click(h1.x + 10, h1.y + h1.height / 2)
  await page.locator('.popover').waitFor({ state: 'visible' })
  await page.keyboard.type('O título do artista está bom, só testando o Feedback Layer na tela inicial.')
  await page.screenshot({ path: join(SHOTS, 'ds-home-1280-popover.png') })
  await page.locator('[data-ref="send"]').click()
  await page.locator('.sent').waitFor({ state: 'visible' })
  await page.screenshot({ path: join(SHOTS, 'ds-home-1280-enviado.png') })
  const names = (await readdir(INBOX)).sort()
  const base = names.find((n) => n.endsWith('.json')).replace(/\.json$/, '')
  const jsonText = await readFile(join(INBOX, `${base}.json`), 'utf8')
  const md = await readFile(join(INBOX, `${base}.md`), 'utf8')
  const note = JSON.parse(jsonText)
  assert.equal(note.project.name, 'design-system-vue')
  assert.equal(note.page.route, '/')
  assert.match(note.target.selector, /h1/)
  assert.equal(note.from, 'vini')
  assert.equal(note.to, 'design-system-vue')
  log(`\n  ok   nota recebida no inbox: ${base}`)
  log('\n----- .json -----\n' + jsonText)
  log('----- .md -----\n' + md)
  await ctx.close()
  await browser.close()
} catch (e) {
  failed = true
  console.log('FAIL', e)
} finally {
  await stop()
}
process.exit(failed ? 1 : 0)
