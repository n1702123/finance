import { dialog } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { accountsRepo, securitiesRepo, transactionsRepo } from './db/repo'
import { withTx } from './db'

const HEADER = ['date','account','market','symbol','name','type','quantity','price','fee','tax','fx_rate','note']

function escape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let i = 0, field = '', row: string[] = [], inQ = false
  while (i < text.length) {
    const c = text[i]
    if (inQ) {
      if (c === '"' && text[i+1] === '"') { field += '"'; i += 2; continue }
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

export async function exportCsv(): Promise<{ ok: boolean; path?: string; count?: number; message?: string }> {
  const result = await dialog.showSaveDialog({
    title: '匯出交易 CSV',
    defaultPath: `finance-${new Date().toISOString().slice(0,10)}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  })
  if (result.canceled || !result.filePath) return { ok: false }

  const accounts = new Map(accountsRepo.list().map(a => [a.id, a]))
  const securities = new Map(securitiesRepo.list().map(s => [s.id, s]))
  const txs = transactionsRepo.list()

  const lines = [HEADER.join(',')]
  for (const t of txs) {
    const a = accounts.get(t.account_id)
    const s = securities.get(t.security_id)
    if (!a || !s) continue
    lines.push([
      t.trade_date, a.name, a.market, s.symbol, s.name, t.type,
      t.quantity, t.price, t.fee, t.tax, t.fx_rate ?? '', t.reason ?? t.note ?? ''
    ].map(escape).join(','))
  }
  writeFileSync(result.filePath, '﻿' + lines.join('\n'), 'utf-8')
  return { ok: true, path: result.filePath, count: txs.length }
}

export async function importCsv(): Promise<{ ok: boolean; imported?: number; skipped?: number; message?: string }> {
  const result = await dialog.showOpenDialog({
    title: '匯入交易 CSV',
    filters: [{ name: 'CSV', extensions: ['csv'] }],
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths[0]) return { ok: false }

  const text = readFileSync(result.filePaths[0], 'utf-8').replace(/^﻿/, '')
  const rows = parseCsv(text)
  if (rows.length < 2) return { ok: false, message: 'CSV 內容為空或格式錯誤' }

  const header = rows[0].map(h => h.trim().toLowerCase())
  const idx = (k: string) => header.indexOf(k)
  for (const k of HEADER) if (idx(k) < 0) return { ok: false, message: `缺少欄位: ${k}` }

  const accounts = accountsRepo.list()
  let imported = 0, skipped = 0

  // 整個匯入包成單一 transaction:任何 row throw 不會壞掉前面 ✓,只是該 row skip
  // 所有寫入完成後一次 flush 到磁碟,而不是每筆都寫
  withTx(() => {
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]
      try {
        const accountName = row[idx('account')]
        const market = row[idx('market')] as 'TW'|'US'
        const account = accounts.find(a => a.name === accountName && a.market === market)
        if (!account) { skipped++; continue }

        // 每筆 row 自己包 SAVEPOINT,失敗時只 rollback 該筆
        withTx(() => {
          const sid = securitiesRepo.upsert({
            symbol: row[idx('symbol')].toUpperCase(),
            name: row[idx('name')] || row[idx('symbol')],
            market,
            currency: market === 'TW' ? 'TWD' : 'USD',
          })
          transactionsRepo.create({
            account_id: account.id,
            security_id: sid,
            type: row[idx('type')] as never,
            trade_date: row[idx('date')],
            quantity: Number(row[idx('quantity')]) || 0,
            price: Number(row[idx('price')]) || 0,
            fee: Number(row[idx('fee')]) || 0,
            tax: Number(row[idx('tax')]) || 0,
            fx_rate: row[idx('fx_rate')] ? Number(row[idx('fx_rate')]) : null,
            note: null,
            reason: (idx('reason') >= 0 && row[idx('reason')]) || row[idx('note')] || null,
          })
        })
        imported++
      } catch { skipped++ }
    }
  })

  return { ok: true, imported, skipped }
}
