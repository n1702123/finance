import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { Security, Transaction } from '../../types'
import { buildDailySeriesNative } from '../../lib/performance'

export function PerformanceChart({
  tx, sec, history,
}: {
  tx: Transaction[]
  sec: Security[]
  history: Map<number, { date: string; close: number }[]>
}) {
  const series = useMemo(() => buildDailySeriesNative(tx, sec, history), [tx, sec, history])
  if (series.length === 0) {
    return <p className="text-sm text-slate-500">需要交易紀錄與歷史股價,請先「刷新股價」。</p>
  }
  const step = Math.max(1, Math.floor(series.length / 200))
  const data = series.filter((_, i) => i % step === 0 || i === series.length - 1)
  const option = {
    color: ['#0f172a', '#94a3b8'],
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: number) => v.toLocaleString('zh-TW', { maximumFractionDigits: 0 }),
    },
    legend: { data: ['市值', '成本'], top: 0 },
    grid: { left: 60, right: 20, top: 40, bottom: 60 },
    xAxis: { type: 'category', data: data.map(d => d.date), axisLabel: { fontSize: 11 } },
    yAxis: {
      type: 'value',
      axisLabel: {
        fontSize: 11,
        formatter: (v: number) => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : (v / 1000).toFixed(0) + 'k',
      },
      splitLine: { lineStyle: { color: '#e2e8f0' } },
    },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 20, bottom: 10 }],
    series: [
      { name: '市值', type: 'line', data: data.map(d => Number(d.marketValue.toFixed(2))), smooth: true, showSymbol: false, lineStyle: { width: 2 }, areaStyle: { opacity: 0.08 } },
      { name: '成本', type: 'line', data: data.map(d => Number(d.costBasis.toFixed(2))),   smooth: true, showSymbol: false, lineStyle: { width: 1.5, type: 'dashed' } },
    ],
  }
  return <ReactECharts option={option} style={{ height: 360 }} notMerge lazyUpdate />
}
