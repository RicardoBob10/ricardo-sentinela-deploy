
import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, ISeriesApi, CandlestickData } from 'lightweight-charts';
import { Candle } from '../types';

interface ChartProps {
  data: Candle[];
  asset: string;
}

const Chart: React.FC<ChartProps> = ({ data, asset }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'>>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Use any to bypass type issues with IChartApi series methods in certain environments
    const chart: any = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0f172a' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 300,
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
      },
    });

    // Fix: cast chart to any to access addCandlestickSeries, as the provided IChartApi type might be incomplete in this environment
    const series = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      chart.applyOptions({ width: chartContainerRef.current?.clientWidth });
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (seriesRef.current) {
      const formattedData = data.map(c => ({
        time: c.time as any,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      seriesRef.current.setData(formattedData);
    }
  }, [data]);

  return (
    <div className="relative">
      <div ref={chartContainerRef} className="w-full h-[300px] bg-slate-900 rounded-b-xl border-x border-b border-slate-800 shadow-inner" />
      <div className="absolute top-2 left-4 pointer-events-none">
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">{asset} CANDLESTICK VIEW</span>
      </div>
    </div>
  );
};

export default Chart;
