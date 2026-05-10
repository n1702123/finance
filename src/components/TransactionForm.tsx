import { useState } from 'react'
import type { Account, Security, Transaction } from '../types'
import { Button, Input, Select, Field } from './ui'

type TxType = 'BUY'|'SELL'|'DIVIDEND'|'FEE'

interface Props {
  accounts: Account[]
  securities: Security[]
  initial?: Transaction        // 有值 → 編輯模式
  onSaved: () => void
  onCancel?: () => void
}

const today = () => new Date().toISOString().slice(0, 10)

export function TransactionForm({ accounts, securities, initial, onSaved, onCancel }: Props) {
  const isEdit = !!initial
  const initSec = initial ? securities.find(s => s.id === initial.security_id) : undefined

  const [accountId, setAccountId] = useState<number>(initial?.account_id ?? accounts[0]?.id ?? 0)
  const [type, setType]           = useState<TxType>((initial?.type as TxType) ?? 'BUY')
  const [symbol, setSymbol]       = useState(initSec?.symbol ?? '')
  const [name, setName]           = useState(initSec?.name ?? '')
  const [tradeDate, setTradeDate] = useState(initial?.trade_date ?? today())
  const [quantity, setQuantity]   = useState(initial ? String(initial.quantity) : '')
  const [price, setPrice]         = useState(initial ? String(initial.price) : '')
  const [fee, setFee]             = useState(initial ? String(initial.fee) : '0')
  const [tax, setTax]             = useState(initial ? String(initial.tax) : '0')
  const [fxRate, setFxRate]       = useState(initial?.fx_rate != null ? String(initial.fx_rate) : '')
  const [reason, setReason]       = useState(initial?.reason ?? initial?.note ?? '')

  const account = accounts.find(a => a.id === accountId)
  const market = account?.market ?? 'TW'
  const currency = account?.currency ?? 'TWD'
  const needsFx = market === 'US'

  function autofillName() {
    if (name) return
    const found = securities.find(s => s.symbol === symbol.trim() && s.market === market)
    if (found) setName(found.name)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!accountId) return alert('請先到「設定」新增帳戶')
    if (!symbol.trim()) return alert('請輸入股票代號')

    const payload = {
      security: {
        symbol: symbol.trim().toUpperCase(),
        name: name.trim() || symbol.trim().toUpperCase(),
        market, currency,
      },
      transaction: {
        account_id: accountId,
        type,
        trade_date: tradeDate,
        quantity: Number(quantity) || 0,
        price: Number(price) || 0,
        fee: Number(fee) || 0,
        tax: Number(tax) || 0,
        fx_rate: needsFx && fxRate ? Number(fxRate) : null,
        note: null,
        reason: reason.trim() || null,
      },
    }

    if (isEdit && initial) {
      await window.api.transactions.updateWithSecurity(initial.id, payload)
    } else {
      await window.api.transactions.createWithSecurity(payload)
      setSymbol(''); setName(''); setQuantity(''); setPrice(''); setFee('0'); setTax('0'); setFxRate(''); setReason('')
    }
    onSaved()
  }

  if (accounts.length === 0) {
    return <p className="text-sm text-slate-500">請先到「設定」新增至少一個帳戶。</p>
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Field label="帳戶">
        <Select value={accountId} onChange={e => setAccountId(Number(e.target.value))}>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.market})</option>)}
        </Select>
      </Field>
      <Field label="類型">
        <Select value={type} onChange={e => setType(e.target.value as TxType)}>
          <option value="BUY">買進</option>
          <option value="SELL">賣出</option>
          <option value="DIVIDEND">股息</option>
          <option value="FEE">費用</option>
        </Select>
      </Field>
      <Field label="日期">
        <Input type="date" value={tradeDate} onChange={e => setTradeDate(e.target.value)} />
      </Field>
      <Field label={`股票代號 (${market})`}>
        <Input value={symbol} onChange={e => setSymbol(e.target.value)} onBlur={autofillName} placeholder={market === 'TW' ? '2330' : 'AAPL'} />
      </Field>
      <Field label="股票名稱(可選)">
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="台積電 / Apple" />
      </Field>
      <Field label="數量">
        <Input type="number" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} />
      </Field>
      <Field label={`價格 (${currency})`}>
        <Input type="number" step="any" value={price} onChange={e => setPrice(e.target.value)} />
      </Field>
      <Field label="手續費">
        <Input type="number" step="any" value={fee} onChange={e => setFee(e.target.value)} />
      </Field>
      <Field label="證交稅 / 預扣稅">
        <Input type="number" step="any" value={tax} onChange={e => setTax(e.target.value)} />
      </Field>
      {needsFx && (
        <Field label="當日匯率 (USD→TWD)">
          <Input type="number" step="any" value={fxRate} onChange={e => setFxRate(e.target.value)} placeholder="32.5" />
        </Field>
      )}
      <div className="col-span-full">
        <Field label="備註 / 原因">
          <Input
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={type === 'BUY' ? '例: 法說會看好 / 殖利率超過 5% / 技術面突破' : type === 'SELL' ? '例: 達成停利目標 / 公司基本面轉差' : ''}
          />
        </Field>
      </div>
      <div className="col-span-full flex gap-2">
        <Button type="submit">{isEdit ? '儲存變更' : '新增交易'}</Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>取消</Button>}
      </div>
    </form>
  )
}
