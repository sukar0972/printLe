#!/usr/bin/env node
/**
 * Drive the printLe sample preview in one headless Chromium session.
 *
 *   node drive.mjs open [--width N] [--height N]
 *   node drive.mjs click "My profile"
 *   node drive.mjs click-selector '[data-sidebar="trigger"]'
 *   node drive.mjs text
 *   node drive.mjs shot /tmp/printle-verify/<run>/page.png
 *   node drive.mjs close
 *
 * `open` stays running and serves the later commands on a unix socket recorded
 * in /tmp/printle-verify/session.json. `shot` writes the PNG it is given.
 * `close` removes the session file and the socket, not the PNGs.
 */

import { createConnection, createServer } from 'node:net'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const PREVIEW = 'http://127.0.0.1:5173/#preview'
const DIR = '/tmp/printle-verify'
const STATE = join(DIR, 'session.json')
const SOCK = join(DIR, 'drive.sock')
const CHROMIUM = join(
  homedir(),
  '.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell',
)

function die(message) {
  console.error(message)
  process.exit(1)
}

function readState() {
  try {
    return JSON.parse(readFileSync(STATE, 'utf8'))
  } catch {
    die('no browser session; run: node drive.mjs open')
  }
}

const [cmd, ...rest] = process.argv.slice(2)
if (!cmd) die('usage: drive.mjs open [--width N] [--height N] | click NAME | click-selector CSS | text | shot PATH | close')

if (cmd === 'open') await holdOpen(rest)
else if (cmd === 'close') close()
else if (cmd === 'click') {
  if (!rest.length) die('usage: drive.mjs click NAME')
  forward({ cmd: 'click', name: rest.join(' ') })
} else if (cmd === 'click-selector') {
  if (rest.length !== 1) die('usage: drive.mjs click-selector CSS')
  forward({ cmd: 'click-selector', selector: rest[0] })
} else if (cmd === 'text') forward({ cmd: 'text' })
else if (cmd === 'shot') {
  if (rest.length !== 1) die('usage: drive.mjs shot PATH')
  forward({ cmd: 'shot', path: rest[0] })
} else die(`unknown command ${cmd}`)

async function holdOpen(args) {
  let width = 1440
  let height = 900
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--width') width = Number(args[++i])
    else if (args[i] === '--height') height = Number(args[++i])
    else die(`unknown open flag: ${args[i]}`)
  }
  try {
    readFileSync(STATE)
    die('session already open; run drive.mjs close first')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  mkdirSync(DIR, { recursive: true })
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true })
  const page = await browser.newPage({ viewport: { width, height } })
  await page.goto(PREVIEW, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Print dashboard' }).waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: 'Preview', exact: true }).waitFor({ timeout: 15000 })
  await serve(page, browser, width, height)
}

async function serve(page, browser, width, height) {
  rmSync(SOCK, { force: true })
  const server = createServer((conn) => {
    let raw = ''
    conn.on('data', (chunk) => {
      raw += chunk
      if (!raw.includes('\n')) return
      const request = JSON.parse(raw.slice(0, raw.indexOf('\n')))
      if (request.cmd === 'close') {
        conn.write('{"ok":true}\n')
        conn.end()
        server.close()
        void browser.close().finally(() => process.exit(0))
        return
      }
      dispatch(page, request)
        .then((result) => conn.end(`${JSON.stringify({ ok: true, result })}\n`))
        .catch((error) => conn.end(`${JSON.stringify({ ok: false, error: String(error) })}\n`))
    })
  })
  await new Promise((resolve) => server.listen(SOCK, resolve))
  writeFileSync(STATE, JSON.stringify({ socket: SOCK, pid: process.pid, width, height }))
  console.log(`open ${PREVIEW} ${width}x${height}`)
}

async function dispatch(page, request) {
  if (request.cmd === 'click') {
    await page.getByRole('button', { name: request.name, exact: true }).click()
    await page.waitForTimeout(300)
    return `clicked button ${request.name}`
  }
  if (request.cmd === 'click-selector') {
    await page.locator(request.selector).first().click()
    await page.waitForTimeout(300)
    return `clicked ${request.selector}`
  }
  if (request.cmd === 'text') return page.locator('body').innerText()
  if (request.cmd === 'shot') {
    mkdirSync(dirname(request.path), { recursive: true })
    await page.screenshot({ path: request.path })
    return request.path
  }
  throw new Error(`unknown command ${request.cmd}`)
}

function forward(payload) {
  const state = readState()
  const client = createConnection(state.socket)
  let data = ''
  client.on('connect', () => client.write(`${JSON.stringify(payload)}\n`))
  client.on('data', (chunk) => { data += chunk })
  client.on('error', (error) => die(`session socket unavailable (${error.message}); run drive.mjs close, then open`))
  client.on('end', () => {
    if (!data.trim()) die('session closed without a reply')
    const reply = JSON.parse(data)
    if (!reply.ok) die(reply.error || 'command failed')
    console.log(reply.result ?? '')
  })
}

function close() {
  let state
  try {
    state = JSON.parse(readFileSync(STATE, 'utf8'))
  } catch {
    console.log('no session')
    return
  }
  const client = createConnection(state.socket)
  const giveUp = setTimeout(() => {
    if (state.pid) {
      try { process.kill(state.pid, 'SIGTERM') } catch { /* already gone */ }
    }
    rmSync(STATE, { force: true })
    rmSync(SOCK, { force: true })
    console.log('closed')
    process.exit(0)
  }, 3000)
  client.on('connect', () => client.end('{"cmd":"close"}\n'))
  client.on('error', () => { /* giveUp kills the pid */ })
  client.on('close', () => {
    clearTimeout(giveUp)
    rmSync(STATE, { force: true })
    rmSync(SOCK, { force: true })
    console.log('closed')
  })
}

void spawnSync
void fileURLToPath
