import { app, dialog } from 'electron'
import { copyFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { closeDb, flushDb } from './db'

function dbPath() {
  return path.join(app.getPath('userData'), 'finance.db')
}

export async function backupDb(): Promise<{ ok: boolean; path?: string; size?: number; message?: string }> {
  const src = dbPath()
  if (!existsSync(src)) return { ok: false, message: '找不到資料庫檔案' }

  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
  const result = await dialog.showSaveDialog({
    title: '備份資料庫',
    defaultPath: `finance-backup-${stamp}.db`,
    filters: [{ name: 'SQLite DB', extensions: ['db'] }],
  })
  if (result.canceled || !result.filePath) return { ok: false }

  // 把記憶體 DB flush 到檔案後再複製(不 close,App 還在用)
  flushDb()
  copyFileSync(src, result.filePath)
  const size = statSync(result.filePath).size
  return { ok: true, path: result.filePath, size }
}

export async function restoreDb(): Promise<{ ok: boolean; needsRestart?: boolean; backupPath?: string; message?: string }> {
  const result = await dialog.showOpenDialog({
    title: '選擇要還原的備份檔',
    filters: [{ name: 'SQLite DB', extensions: ['db'] }],
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths[0]) return { ok: false }

  const target = dbPath()
  const source = result.filePaths[0]
  if (path.resolve(source) === path.resolve(target)) {
    return { ok: false, message: '不能用目前正在使用的 DB 還原' }
  }
  if (!existsSync(source)) return { ok: false, message: '備份檔不存在' }

  // 先把當前 DB 存成 .bak
  closeDb()
  let backupPath: string | undefined
  if (existsSync(target)) {
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
    backupPath = target + `.${stamp}.bak`
    copyFileSync(target, backupPath)
  }
  copyFileSync(source, target)

  return { ok: true, needsRestart: true, backupPath }
}
