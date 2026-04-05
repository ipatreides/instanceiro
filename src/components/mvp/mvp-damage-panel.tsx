"use client";

import { useEffect, useState } from "react";
import { Sword } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import type { MvpDamageResponse, MvpDamageAttacker } from "@/lib/types";

interface MvpDamagePanelProps {
  killId: string;
}

function formatDamage(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

const CHART_COLORS = [
  "var(--primary)",
  "var(--status-available)",
  "var(--status-soon)",
  "var(--primary-secondary)",
  "var(--text-secondary)",
  "var(--status-error)",
];

function getChartColor(rank: number): string {
  return CHART_COLORS[Math.min(rank, CHART_COLORS.length - 1)];
}

export function MvpDamagePanel({ killId }: MvpDamagePanelProps) {
  const [data, setData] = useState<MvpDamageResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`/api/telemetry/mvp-damage?kill_id=${encodeURIComponent(killId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        setData(json ?? null);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [killId]);

  if (loading) {
    return (
      <div className="mt-3 rounded-lg bg-surface border border-border p-3 animate-pulse">
        <div className="h-3 w-32 rounded-sm bg-bg mb-3" />
        <div className="flex flex-col gap-2">
          {[80, 55, 30].map((w) => (
            <div key={w} className="flex items-center gap-2">
              <div className="h-2 w-20 rounded-sm bg-bg" />
              <div style={{ width: `${w}%` }} className="h-3 rounded-sm bg-bg" />
              <div className="h-2 w-8 rounded-sm bg-bg ml-auto" />
            </div>
          ))}
        </div>
        <div className="mt-3 h-[160px] rounded-md bg-bg" />
      </div>
    );
  }

  if (!data || data.attackers.length === 0) return null;

  const totalDamage = data.attackers.reduce((s, a) => s + a.total_damage, 0);
  const mainAttackers = data.attackers.filter((a) => a.pct >= 1);
  const othersAttackers = data.attackers.filter((a) => a.pct < 1);
  const othersDamage = othersAttackers.reduce((s, a) => s + a.total_damage, 0);
  const othersPct = totalDamage > 0 ? (othersDamage / totalDamage) * 100 : 0;

  const durationSec = Math.round(data.duration_ms / 1000);

  // Build timeline data for recharts — x-axis is elapsed seconds
  const chartData = data.timeline.map((point) => {
    const row: Record<string, number> = { elapsed: Math.round(point.elapsed_ms / 1000) };
    for (const attacker of mainAttackers) {
      row[attacker.name] = point[attacker.name] ?? 0;
    }
    return row;
  });

  return (
    <div className="mt-3 rounded-lg bg-surface border border-border p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold text-primary uppercase tracking-wide">
          Damage Breakdown
        </span>
        <div className="flex gap-3 text-[10px] text-text-secondary">
          <span>{durationSec}s duração</span>
          <span>{data.attackers.length} atacantes</span>
          <span>{data.sniffer_count} sniffer{data.sniffer_count !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Damage bars */}
      <div className="flex flex-col gap-1.5 mb-3">
        {data.attackers.map((attacker, idx) => {
          const isFirst = attacker.is_first_hitter;
          const color = getChartColor(idx);
          return (
            <div key={attacker.name} className="flex items-center gap-2">
              <div className="w-[90px] flex items-center gap-1 flex-shrink-0">
                {isFirst && (
                  <Sword
                    size={12}
                    stroke="var(--primary)"
                    fill="var(--primary)"
                    fillOpacity="var(--icon-fill-opacity)"
                  />
                )}
                <span
                  className="text-[10px] text-text-secondary truncate"
                  title={attacker.name}
                >
                  {attacker.name}
                </span>
              </div>
              <div className="flex-1 h-3 rounded-sm bg-bg overflow-hidden">
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${Math.max(attacker.pct, 1)}%`,
                    background: `linear-gradient(to right, ${color}, ${color})`,
                    opacity: 0.85,
                  }}
                />
              </div>
              <div className="w-[60px] flex-shrink-0 flex justify-end gap-1">
                <span className="text-[10px] text-text-primary tabular-nums">
                  {formatDamage(attacker.total_damage)}
                </span>
                <span className="text-[10px] text-text-secondary tabular-nums">
                  {attacker.pct.toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}

        {othersAttackers.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-[90px] flex-shrink-0">
              <span className="text-[10px] text-text-secondary italic">
                Others ({othersAttackers.length})
              </span>
            </div>
            <div className="flex-1 h-3 rounded-sm bg-bg overflow-hidden">
              <div
                className="h-full rounded-sm"
                style={{
                  width: `${Math.max(othersPct, 0.5)}%`,
                  background: `var(--text-secondary)`,
                  opacity: 0.4,
                }}
              />
            </div>
            <div className="w-[60px] flex-shrink-0 flex justify-end gap-1">
              <span className="text-[10px] text-text-primary tabular-nums">
                {formatDamage(othersDamage)}
              </span>
              <span className="text-[10px] text-text-secondary tabular-nums">
                {othersPct.toFixed(1)}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Cumulative line chart */}
      {chartData.length > 1 && mainAttackers.length > 0 && (
        <div className="rounded-md bg-bg p-2">
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="elapsed"
                tick={{ fontSize: 9, fill: "var(--text-secondary)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                tickFormatter={(v) => `${v}s`}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "var(--text-secondary)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatDamage}
                width={36}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--text-secondary)", fontSize: 10 }}
                itemStyle={{ color: "var(--text-primary)", fontSize: 10 }}
                formatter={(value) => formatDamage(Number(value))}
                labelFormatter={(label) => `${label}s`}
              />
              <Legend
                wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                formatter={(value: string) => {
                  const isFirst = mainAttackers.find((a) => a.name === value)?.is_first_hitter;
                  return (
                    <span style={{ color: "var(--text-secondary)" }}>
                      {isFirst && (
                        <Sword
                          size={9}
                          stroke="var(--primary)"
                          fill="var(--primary)"
                          fillOpacity="var(--icon-fill-opacity)"
                          style={{ display: "inline", marginRight: 3, verticalAlign: "middle" }}
                        />
                      )}
                      {value}
                    </span>
                  );
                }}
              />
              {mainAttackers.map((attacker, idx) => (
                <Line
                  key={attacker.name}
                  type="monotone"
                  dataKey={attacker.name}
                  stroke={getChartColor(idx)}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
