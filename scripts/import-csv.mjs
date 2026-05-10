// 一次性 CSV 匯入腳本 — 直接寫入 sql.js 資料庫檔案
// 用法:  node scripts/import-csv.mjs <csv-file> [<csv-file> ...]

import initSqlJs from 'sql.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// %APPDATA%\finance\finance.db
const userData = path.join(process.env.APPDATA, 'finance')
if (!existsSync(userData)) mkdirSync(userData, { recursive: true })
const dbPath = path.join(userData, 'finance.db')
console.log('DB:', dbPath)

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
  market TEXT NOT NULL CHECK(market IN ('TW','US')),
  currency TEXT NOT NULL CHECK(currency IN ('TWD','USD')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS securities (
  id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT NOT NULL, name TEXT NOT NULL,
  market TEXT NOT NULL CHECK(market IN ('TW','US')),
  currency TEXT NOT NULL CHECK(currency IN ('TWD','USD')),
  UNIQUE(symbol, market)
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  security_id INTEGER NOT NULL REFERENCES securities(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK(type IN ('BUY','SELL','DIVIDEND','FEE','SPLIT')),
  trade_date TEXT NOT NULL, quantity REAL NOT NULL DEFAULT 0, price REAL NOT NULL DEFAULT 0,
  fee REAL NOT NULL DEFAULT 0, tax REAL NOT NULL DEFAULT 0,
  fx_rate REAL, note TEXT, reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS fx_rates (
  date TEXT NOT NULL, from_ccy TEXT NOT NULL, to_ccy TEXT NOT NULL, rate REAL NOT NULL,
  PRIMARY KEY (date, from_ccy, to_ccy)
);
CREATE TABLE IF NOT EXISTS price_history (
  security_id INTEGER NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  date TEXT NOT NULL, close REAL NOT NULL,
  PRIMARY KEY (security_id, date)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`

function parseCsv(text) {
  const rows = []
  let i = 0, field = '', row = [], inQ = false
  while (i < text.length) {
    const c = text[i]
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue }
      if (c === '"') { inQ = false; i++; continue }
      field += c; i++
    } else {
      if (c === '"') { inQ = true; i++; continue }
      if (c === ',') { row.push(field); field = ''; i++; continue }
      if (c === '\r') { i++; continue }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue }
      field += c; i++
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.some(x => x !== ''))
}

const SQL = await initSqlJs({ locateFile: f => require.resolve(`sql.js/dist/${f}`) })
const db = existsSync(dbPath) ? new SQL.Database(readFileSync(dbPath)) : new SQL.Database()
db.exec(SCHEMA)

// 確保欄位 reason 存在(舊 DB migrate)
const cols = db.exec("PRAGMA table_info(transactions)")
const colNames = cols[0]?.values.map(r => String(r[1])) ?? []
if (!colNames.includes('reason')) db.exec('ALTER TABLE transactions ADD COLUMN reason TEXT')

function ensureAccount(name, market) {
  const ccy = market === 'TW' ? 'TWD' : 'USD'
  const r = db.exec('SELECT id FROM accounts WHERE name=? AND market=?', [name, market])
  if (r[0]?.values.length) return Number(r[0].values[0][0])
  db.run('INSERT INTO accounts(name,market,currency) VALUES(?,?,?)', [name, market, ccy])
  return Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
}

function ensureSecurity(symbol, name, market) {
  const ccy = market === 'TW' ? 'TWD' : 'USD'
  const r = db.exec('SELECT id FROM securities WHERE symbol=? AND market=?', [symbol, market])
  if (r[0]?.values.length) {
    const id = Number(r[0].values[0][0])
    db.run('UPDATE securities SET name=?, currency=? WHERE id=?', [name, ccy, id])
    return id
  }
  db.run('INSERT INTO securities(symbol,name,market,currency) VALUES(?,?,?,?)', [symbol, name, market, ccy])
  return Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
}

const files = process.argv.slice(2)
if (files.length === 0) { console.error('用法: node scripts/import-csv.mjs <csv> ...'); process.exit(1) }

let totalImported = 0, totalSkipped = 0
for (const file of files) {
  const text = readFileSync(file, 'utf-8').replace(/^﻿/, '')
  const rows = parseCsv(text)
  if (rows.length < 2) { console.error('空檔案:', file); continue }
  const header = rows[0].map(h => h.trim().toLowerCase())
  const idx = k => header.indexOf(k)
  let imported = 0, skipped = 0

  db.exec('BEGIN')
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    try {
      const market = row[idx('market')]
      const accId = ensureAccount(row[idx('account')], market)
      const secId = ensureSecurity(row[idx('symbol')].toUpperCase(), row[idx('name')] || row[idx('symbol')], market)
      db.run(
        `INSERT INTO transactions(account_id,security_id,type,trade_date,quantity,price,fee,tax,fx_rate,note,reason)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        [
          accId, secId, row[idx('type')], row[idx('date')],
          Number(row[idx('quantity')]) || 0,
          Number(row[idx('price')]) || 0,
          Number(row[idx('fee')]) || 0,
          Number(row[idx('tax')]) || 0,
          row[idx('fx_rate')] ? Number(row[idx('fx_rate')]) : null,
          row[idx('note')] || null,
          idx('reason') >= 0 ? (row[idx('reason')] || null) : null,
        ]
      )
      imported++
    } catch (e) { console.error('  略過第', r + 1, '列:', e.message); skipped++ }
  }
  db.exec('COMMIT')
  console.log(`✓ ${file}: 匯入 ${imported} 筆,略過 ${skipped}`)
  totalImported += imported; totalSkipped += skipped
}

writeFileSync(dbPath, Buffer.from(db.export()))
db.close()

const finalCount = `總計匯入 ${totalImported} 筆,略過 ${totalSkipped}`
console.log('\n' + finalCount)
console.log('資料庫已寫入:', dbPath)
