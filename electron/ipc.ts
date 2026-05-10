import { app, ipcMain } from 'electron'
import { accountsRepo, securitiesRepo, transactionsRepo, cashRepo, type Transaction } from './db/repo'
import { withTx } from './db'
import { exportCsv, importCsv } from './csv'
import { refreshAllQuotes, getLatestPrices, getPriceHistory } from './quotes'
import { refreshFx, getLatestFx, getFxHistory } from './fx'
import { backupDb, restoreDb } from './backup'

export function registerIpc() {
  ipcMain.handle('accounts:list', () => accountsRepo.list())
  ipcMain.handle('accounts:create', (_e, a) => accountsRepo.create(a))
  ipcMain.handle('accounts:remove', (_e, id: number) => accountsRepo.remove(id))

  ipcMain.handle('securities:list', () => securitiesRepo.list())
  ipcMain.handle('securities:upsert', (_e, s) => securitiesRepo.upsert(s))

  ipcMain.handle('transactions:list', () => transactionsRepo.list())
  ipcMain.handle('transactions:create', (_e, t) => transactionsRepo.create(t))
  ipcMain.handle('transactions:update', (_e, id: number, t) => transactionsRepo.update(id, t))
  ipcMain.handle('transactions:remove', (_e, id: number) => transactionsRepo.remove(id))

  ipcMain.handle('transactions:updateWithSecurity', (_e, id: number, payload: {
    security: { symbol: string; name: string; market: 'TW'|'US'; currency: 'TWD'|'USD' }
    transaction: Omit<Transaction, 'id' | 'security_id'>
  }) => withTx(() => {
    const sid = securitiesRepo.upsert(payload.security)
    transactionsRepo.update(id, { ...payload.transaction, security_id: sid })
  }))

  // 一次新增「股票主檔 + 交易」, 前端不需先 upsert
  ipcMain.handle('transactions:createWithSecurity', (_e, payload: {
    security: { symbol: string; name: string; market: 'TW'|'US'; currency: 'TWD'|'USD' }
    transaction: Omit<Transaction, 'id' | 'security_id'>
  }) => withTx(() => {
    const sid = securitiesRepo.upsert(payload.security)
    return transactionsRepo.create({ ...payload.transaction, security_id: sid })
  }))

  ipcMain.handle('csv:export', () => exportCsv())
  ipcMain.handle('csv:import', () => importCsv())

  ipcMain.handle('quotes:refreshAll', (_e, market?: 'TW'|'US', opts?: { force?: boolean }) =>
    refreshAllQuotes(market, opts))
  ipcMain.handle('quotes:latest', () => Array.from(getLatestPrices().entries()))
  ipcMain.handle('quotes:history', (_e, securityId: number) => getPriceHistory(securityId))

  ipcMain.handle('fx:refresh', () => refreshFx())
  ipcMain.handle('fx:latest', () => getLatestFx())
  ipcMain.handle('fx:history', () => Array.from(getFxHistory().entries()))

  ipcMain.handle('cash:balance', (_e, market: 'TW'|'US') => cashRepo.balance(market))
  ipcMain.handle('cash:deposit', (_e, args) => cashRepo.deposit(args))
  ipcMain.handle('cash:withdraw', (_e, args) => cashRepo.withdraw(args))

  ipcMain.handle('backup:export', () => backupDb())
  ipcMain.handle('backup:restore', () => restoreDb())
  ipcMain.handle('app:relaunch', () => { app.relaunch(); app.exit(0) })
}
