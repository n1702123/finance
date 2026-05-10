import initSqlJs, { type Database } from 'sql.js'
import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { SCHEMA_SQL } from './schema'

const require = createRequire(import.meta.url)

let db: Database | null = null
let dbPath = ''
let saveTimer: NodeJS.Timeout | null = null
let batchDepth = 0  // > 0 時暫停 saveDb 自動 flush

export async function initDb(): Promise<Database> {
  if (db) return db

  const SQL = await initSqlJs({
    locateFile: (file) => require.resolve(`sql.js/dist/${file}`),
  })

  const userData = app.getPath('userData')
  if (!existsSync(userData)) mkdirSync(userData, { recursive: true })
  dbPath = path.join(userData, 'finance.db')

  if (existsSync(dbPath)) {
    const buf = readFileSync(dbPath)
    db = new SQL.Database(buf)
  } else {
    db = new SQL.Database()
  }

  db.exec(SCHEMA_SQL)
  applyMigrations(db)
  flushDb()
  return db
}

function applyMigrations(d: Database) {
  const cols = d.exec("PRAGMA table_info(transactions)")
  const names = cols[0]?.values.map(r => String(r[1])) ?? []
  if (!names.includes('reason')) {
    d.exec('ALTER TABLE transactions ADD COLUMN reason TEXT')
  }
  d.exec(`
    UPDATE transactions
       SET reason = note
     WHERE (reason IS NULL OR reason = '')
       AND note IS NOT NULL AND note <> ''
  `)
}

export function getDb(): Database {
  if (!db) throw new Error('DB not initialized. Call initDb() first.')
  return db
}

/**
 * 同步把 DB export 並原子寫回磁碟:
 *   1. 寫到 finance.db.tmp
 *   2. rename 覆蓋 finance.db(rename 在大多 FS 上是原子)
 *   3. tmp 不存在(已 rename)→ 中途斷電最壞只是還原成上一份 DB
 */
function persist() {
  if (!db) return
  const data = db.export()
  const tmp = dbPath + '.tmp'
  writeFileSync(tmp, Buffer.from(data))
  try { renameSync(tmp, dbPath) }
  catch (e) {
    // rename 失敗時清掉 tmp 避免殘留
    try { unlinkSync(tmp) } catch { /* ignore */ }
    throw e
  }
}

/** Persist the in-memory DB to disk. Debounced 200ms;批次模式下不 flush。 */
export function saveDb() {
  if (!db || batchDepth > 0) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { try { persist() } catch (e) { console.error('saveDb failed', e) } }, 200)
}

/** 立即同步寫回。 */
export function flushDb() {
  if (!db) return
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  persist()
}

export function closeDb() {
  if (db) {
    try { persist() } catch (e) { console.error('closeDb persist failed', e) }
    db.close()
    db = null
  }
}

/**
 * 在 fn 期間暫停 saveDb,並把所有寫入包在 SQLite transaction 裡。
 * - 任何 throw 會 ROLLBACK 並把例外往外丟
 * - 成功時 COMMIT 並 flush 一次到磁碟
 * - 巢狀呼叫會合併成最外層那次的 transaction(用 SAVEPOINT)
 */
export function withTx<T>(fn: () => T): T {
  const d = getDb()
  if (batchDepth > 0) {
    // 巢狀:用 SAVEPOINT
    const sp = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    d.exec(`SAVEPOINT ${sp}`)
    try {
      const r = fn()
      d.exec(`RELEASE ${sp}`)
      return r
    } catch (e) {
      d.exec(`ROLLBACK TO ${sp}`); d.exec(`RELEASE ${sp}`)
      throw e
    }
  }

  batchDepth++
  d.exec('BEGIN')
  try {
    const r = fn()
    d.exec('COMMIT')
    batchDepth--
    flushDb()
    return r
  } catch (e) {
    d.exec('ROLLBACK')
    batchDepth--
    throw e
  }
}
