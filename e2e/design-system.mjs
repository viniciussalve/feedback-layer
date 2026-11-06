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

// --- Ícones (Hugeicons via <Icon>) -------------------------------------------------------------------------
// Tamanhos esperados em rem, dos tokens --spacing-icon-sm/md/lg (φ^0, φ^1/2, φ^1).
const ICON_REM = { sm: 1, md: 1.272, lg: 1.618 }
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps

// "/": os botões só-ícone do PlayerBar mantêm o nome acessível e o ícone é decorativo.
async function checkHomeIcons(page, tag) {
  for (const name of ['Anterior', 'Tocar', 'Próxima']) {
    const btn = page.getByRole('button', { name, exact: true })
    assert.equal(await btn.count(), 1, `${tag}: botão "${name}" deve existir uma vez`)
    assert.equal(await btn.locator('svg').count(), 1, `${tag}: "${name}" deve ter 1 ícone`)
    assert.equal(await btn.locator('svg').getAttribute('aria-hidden'), 'true', `${tag}: ícone de "${name}" deve ser aria-hidden`)
    assert.equal(((await btn.innerText()) || '').trim(), '', `${tag}: "${name}" não deve ter texto visível`)
  }
  await page.getByRole('button', { name: 'Tocar', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'Pausar', exact: true }).count(), 1, `${tag}: após tocar o nome vira "Pausar"`)
  await page.getByRole('button', { name: 'Pausar', exact: true }).click()
}

// "/design-system": seção "Ícones".
async function checkIconsSection(page, tag, shot) {
  const sec = page.locator('section[data-ds="icons"]')
  await sec.waitFor({ state: 'visible' })

  // 1) tamanhos: cada svg de [data-ds=icons-sizes] mede o token (em rem)
  const sizes = await page.locator('[data-ds="icons-sizes"] svg').evaluateAll((els) => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
    return els.map((e) => e.getBoundingClientRect().width / rem)
  })
  assert.equal(sizes.length, 3, `${tag}: 3 tamanhos`)
  ;['sm', 'md', 'lg'].forEach((k, i) => assert.ok(near(sizes[i], ICON_REM[k]), `${tag}: tamanho ${k} = ${sizes[i]}rem, esperado ${ICON_REM[k]}rem`))

  // 2) ícones em uso: todos desenhados (têm path) e o conjunto não está vazio
  const setInfo = await page.locator('[data-ds="icons-set"] svg').evaluateAll((els) => els.map((e) => e.querySelectorAll('path,circle,rect,line,ellipse,polyline,polygon').length))
  assert.ok(setInfo.length >= 9 && setInfo.every((n) => n > 0), `${tag}: ícones em uso devem ter traços (${setInfo.join(',')})`)

  // 3) todo svg da seção é decorativo (aria-hidden) ou tem role=img + nome
  const a11y = await sec.locator('svg').evaluateAll((els) => els.filter((e) => e.getAttribute('aria-hidden') !== 'true' && !(e.getAttribute('role') === 'img' && e.getAttribute('aria-label'))).length)
  assert.equal(a11y, 0, `${tag}: svg sem aria-hidden nem role=img+aria-label`)

  // 4) cor herdada (currentColor) e diferente entre os temas
  const colorOf = (block, cls) =>
    page.locator(`[data-ds="icons-colors"] [data-ds-theme="${block}"] span.${cls} svg`).evaluate((svg) => ({ svg: getComputedStyle(svg).color, parent: getComputedStyle(svg.parentElement).color }))
  for (const block of ['dark', 'light']) {
    for (const cls of ['text-fg', 'text-fg-muted', 'text-mark', 'text-success', 'text-danger']) {
      const c = await colorOf(block, cls)
      assert.equal(c.svg, c.parent, `${tag}: ${block}/${cls}: o ícone deve herdar currentColor`)
    }
  }
  const [fgDark, fgLight] = [await colorOf('dark', 'text-fg'), await colorOf('light', 'text-fg')]
  assert.notEqual(fgDark.svg, fgLight.svg, `${tag}: text-fg deve mudar entre tema escuro e claro`)

  // 5) estados: selecionado = mesmo ícone, traço mais grosso (só strokeWidth), sem filtro
  for (const block of ['dark', 'light']) {
    const st = await page.locator(`[data-ds="icons-states"] [data-ds-theme="${block}"]`).evaluate((root) => {
      const pick = (s) => {
        const svg = root.querySelector(`[data-state="${s}"] svg`)
        const p = svg.querySelector('path')
        return { d: [...svg.querySelectorAll('path')].map((x) => x.getAttribute('d')).join('|'), sw: parseFloat(p.getAttribute('stroke-width')), filter: getComputedStyle(svg).filter, color: getComputedStyle(svg).color }
      }
      return { normal: pick('normal'), active: pick('active'), selected: pick('selected') }
    })
    assert.equal(st.selected.d, st.normal.d, `${tag}/${block}: selecionado deve ser o mesmo ícone`)
    assert.ok(st.selected.sw > st.normal.sw, `${tag}/${block}: traço selecionado (${st.selected.sw}) > normal (${st.normal.sw})`)
    assert.equal(st.normal.sw, st.active.sw, `${tag}/${block}: ativo e normal têm o mesmo traço (só a cor muda)`)
    assert.equal(st.selected.filter, 'none', `${tag}/${block}: sem filtro no selecionado`)
    assert.notEqual(st.normal.color, st.active.color, `${tag}/${block}: ativo muda a cor em relação ao normal`)
  }

  // 6) seleção interativa: clicar troca aria-pressed e o traço, sem trocar o ícone
  const buttons = page.locator('[data-ds="icons-nav"] button')
  const snap = (i) => buttons.nth(i).evaluate((b) => ({ pressed: b.getAttribute('aria-pressed'), d: b.querySelector('path').getAttribute('d'), sw: parseFloat(b.querySelector('path').getAttribute('stroke-width')), touch: b.getBoundingClientRect().height }))
  const before = await snap(1)
  assert.equal(before.pressed, 'false')
  await buttons.nth(1).click()
  const after = await snap(1)
  assert.equal(after.pressed, 'true', `${tag}: clicar seleciona`)
  assert.equal(after.d, before.d, `${tag}: o ícone não troca ao selecionar`)
  assert.ok(after.sw > before.sw, `${tag}: traço engrossa ao selecionar`)
  assert.ok(after.touch >= 44 - 0.5, `${tag}: alvo de toque >= 44px (${after.touch})`)
  await buttons.nth(0).click() // volta ao estado inicial

  // 7) a seção cabe na largura (sem estourar o viewport)
  const fits = await sec.evaluate((s) => s.scrollWidth <= s.clientWidth + 1)
  assert.ok(fits, `${tag}: a seção Ícones estoura a largura`)
  await sec.screenshot({ path: join(SHOTS, `ds-icones-${shot}.png`) })
  log(`  ok   ${tag}: seção Ícones (tamanhos ${sizes.map((n) => n.toFixed(3)).join('/')}rem, ${setInfo.length} ícones, estados e cores)`)
}
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
        if (route === '/') await checkHomeIcons(page, `${route} ${vp.n} ${theme}`)
        if (route === '/design-system') await checkIconsSection(page, `${route} ${vp.n} ${theme}`, `${vp.n}-${theme}`)
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
