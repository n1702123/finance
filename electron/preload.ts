import { contextBridge, ipcRenderer } from 'electron'

const api = {
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    create: (a: unknown) => ipcRenderer.invoke('accounts:create', a),
    remove: (id: number) => ipcRenderer.invoke('accounts:remove', id),
  },
  securities: {
    list: () => ipcRenderer.invoke('securities:list'),
    upsert: (s: unknown) => ipcRenderer.invoke('securities:upsert', s),
  },
  transactions: {
    list: () => ipcRenderer.invoke('transactions:list'),
    create: (t: unknown) => ipcRenderer.invoke('transactions:create', t),
    createWithSecurity: (p: unknown) => ipcRenderer.invoke('transactions:createWithSecurity', p),
    update: (id: number, t: unknown) => ipcRenderer.invoke('transactions:update', id, t),
    updateWithSecurity: (id: number, p: unknown) => ipcRenderer.invoke('transactions:updateWithSecurity', id, p),
    remove: (id: number) => ipcRenderer.invoke('transactions:remove', id),
  },
  csv: {
    exportFile: () => ipcRenderer.invoke('csv:export'),
    importFile: () => ipcRenderer.invoke('csv:import'),
  },
  quotes: {
    refreshAll: (market?: 'TW'|'US', opts?: { force?: boolean }) =>
      ipcRenderer.invoke('quotes:refreshAll', market, opts),
    latest: () => ipcRenderer.invoke('quotes:latest'),
    history: (securityId: number) => ipcRenderer.invoke('quotes:history', securityId),
  },
  fx: {
    refresh: () => ipcRenderer.invoke('fx:refresh'),
    latest: () => ipcRenderer.invoke('fx:latest'),
    history: () => ipcRenderer.invoke('fx:history'),
  },
  cash: {
    balance: (market: 'TW'|'US') => ipcRenderer.invoke('cash:balance', market),
    deposit: (args: unknown) => ipcRenderer.invoke('cash:deposit', args),
    withdraw: (args: unknown) => ipcRenderer.invoke('cash:withdraw', args),
  },
  backup: {
    exportDb: () => ipcRenderer.invoke('backup:export'),
    restoreDb: () => ipcRenderer.invoke('backup:restore'),
  },
  app: {
    relaunch: () => ipcRenderer.invoke('app:relaunch'),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
