import React from 'react';

export interface BarDatum {
  label: string;
  value: number;
  secondary?: number;
}

export const SimpleBarChart: React.FC<{
  data: BarDatum[];
  height?: number;
  formatValue?: (v: number) => string;
  accentColor?: string;
}> = ({ data, height = 180, formatValue = (v) => String(v), accentColor = '#B45309' }) => {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="w-full">
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((d, i) => {
          const pct = Math.max(4, Math.round((d.value / max) * 100));
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group min-w-0">
              <span className="text-[11px] font-mono tabular-nums text-stone-500 dark:text-stone-400 mb-1 opacity-80 group-hover:opacity-100 truncate max-w-full">
                {formatValue(d.value)}
              </span>
              <div
                className="w-full max-w-[44px] rounded-t-md transition-all duration-200 group-hover:opacity-90"
                style={{ height: `${pct}%`, backgroundColor: accentColor }}
                title={`${d.label}: ${formatValue(d.value)}`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 mt-2 border-t border-stone-200 dark:border-stone-800 pt-2">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center text-[11px] text-stone-500 dark:text-stone-400 truncate">
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
};

export const HorizontalProportionList: React.FC<{
  items: { label: string; value: number; formatted: string; color?: string }[];
}> = ({ items }) => {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-3">
      {items.map((item, idx) => {
        const pct = Math.min(100, Math.max(2, Math.round((item.value / max) * 100)));
        return (
          <div key={idx} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-700 dark:text-stone-300 font-medium truncate pr-2">{item.label}</span>
              <span className="font-mono tabular-nums text-stone-900 dark:text-stone-100 font-semibold">{item.formatted}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${pct}%`, backgroundColor: item.color || '#B45309' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const PeakHourHeatmap: React.FC<{
  hours: { hour: string; orders: number; revenue: number }[];
  currencySymbol: string;
}> = ({ hours, currencySymbol }) => {
  const max = Math.max(1, ...hours.map((h) => h.orders));
  return (
    <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
      {hours.map((h) => {
        const ratio = h.orders / max;
        const bg =
          ratio === 0
            ? 'bg-stone-100 dark:bg-stone-900 text-stone-400'
            : ratio < 0.35
            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200'
            : ratio < 0.7
            ? 'bg-amber-300 dark:bg-amber-800/80 text-stone-900 dark:text-amber-50'
            : 'bg-amber-600 dark:bg-amber-600 text-white';
        return (
          <div
            key={h.hour}
            className={`p-2 rounded-md border border-stone-200/70 dark:border-stone-800 text-center ${bg}`}
            title={`${h.hour}: ${h.orders} orders (${currencySymbol}${h.revenue.toFixed(0)})`}
          >
            <div className="text-[10px] font-mono opacity-80">{h.hour}</div>
            <div className="text-xs font-mono font-semibold tabular-nums mt-0.5">{h.orders}</div>
          </div>
        );
      })}
    </div>
  );
};
