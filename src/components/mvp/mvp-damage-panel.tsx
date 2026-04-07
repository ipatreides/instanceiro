"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Sword } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceDot,
  Label,
} from "recharts";
import type { MvpDamageResponse, MvpDamageRawHit } from "@/lib/types";
import skillNamesJson from "@/lib/skill-names.json";

const SKILL_NAMES: Record<string, string> = skillNamesJson;

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

interface AttackerStats {
  hitCount: number;
  hitsPerSec: number;
  maxHit: number;
  maxHitSkill: number | null;
  avgHit: number;
  dps: number;
  skillBreakdown: { skillId: number | null; damage: number; hits: number; pct: number }[];
}

function computeAttackerStats(
  hits: MvpDamageRawHit[],
  durationMs: number,
): AttackerStats {
  const hitCount = hits.length;
  const totalDmg = hits.reduce((s, h) => s + h.damage, 0);
  let maxHit = 0;
  let maxHitSkill: number | null = null;
  const bySkill = new Map<number | null, { damage: number; hits: number }>();

  for (const h of hits) {
    if (h.damage > maxHit) {
      maxHit = h.damage;
      maxHitSkill = h.skill_id;
    }
    const key = h.skill_id;
    const prev = bySkill.get(key) ?? { damage: 0, hits: 0 };
    bySkill.set(key, { damage: prev.damage + h.damage, hits: prev.hits + 1 });
  }

  const skillBreakdown = Array.from(bySkill.entries())
    .map(([skillId, { damage, hits: count }]) => ({
      skillId,
      damage,
      hits: count,
      pct: totalDmg > 0 ? (damage / totalDmg) * 100 : 0,
    }))
    .sort((a, b) => b.damage - a.damage);

  const durationSec = durationMs / 1000;
  return {
    hitCount,
    hitsPerSec: durationSec > 0 ? Math.round(hitCount / durationSec * 10) / 10 : 0,
    maxHit,
    maxHitSkill,
    avgHit: hitCount > 0 ? Math.round(totalDmg / hitCount) : 0,
    dps: durationSec > 0 ? Math.round(totalDmg / durationSec) : 0,
    skillBreakdown,
  };
}

function skillName(id: number | null): string {
  if (id == null || id === 0) return "Auto Attack";
  return SKILL_NAMES[String(id)] ?? `Skill #${id}`;
}

/** Find the biggest hit per attacker and its cumulative Y position on the chart */
function findBiggestHits(
  rawHits: MvpDamageRawHit[],
  attackerNames: Set<string>,
): Map<string, { elapsed: number; cumulative: number; damage: number }> {
  const result = new Map<string, { elapsed: number; cumulative: number; damage: number }>();
  const cumBySource = new Map<string, number>();

  for (const hit of rawHits) {
    if (!attackerNames.has(hit.source_name)) continue;
    const cum = (cumBySource.get(hit.source_name) ?? 0) + hit.damage;
    cumBySource.set(hit.source_name, cum);

    const prev = result.get(hit.source_name);
    if (!prev || hit.damage > prev.damage) {
      result.set(hit.source_name, {
        elapsed: Math.round(hit.elapsed_ms / 1000 * 10) / 10,
        cumulative: cum,
        damage: hit.damage,
      });
    }
  }
  return result;
}

export function MvpDamagePanel({ killId }: MvpDamagePanelProps) {
  const [data, setData] = useState<MvpDamageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedAttacker, setExpandedAttacker] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setData(null);
    setExpandedAttacker(null);
    fetch(`/api/telemetry/mvp-damage?kill_id=${encodeURIComponent(killId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        setData(json ?? null);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [killId]);

  // Group raw hits by attacker
  const hitsByAttacker = useMemo(() => {
    const map = new Map<string, MvpDamageRawHit[]>();
    for (const hit of data?.raw_hits ?? []) {
      if (!map.has(hit.source_name)) map.set(hit.source_name, []);
      map.get(hit.source_name)!.push(hit);
    }
    return map;
  }, [data?.raw_hits]);

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
  const hasRawHits = (data.raw_hits?.length ?? 0) > 0;

  // Build timeline data for recharts — x-axis is elapsed seconds
  const chartData = data.timeline.map((point) => {
    const row: Record<string, number> = { elapsed: Math.round(point.elapsed_ms / 1000) };
    for (const attacker of mainAttackers) {
      row[attacker.name] = point[attacker.name] ?? 0;
    }
    return row;
  });

  // Find biggest hit per main attacker for chart highlights
  const mainNames = new Set(mainAttackers.map((a) => a.name));
  const biggestHits = hasRawHits ? findBiggestHits(data.raw_hits, mainNames) : new Map();

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
          const isExpanded = expandedAttacker === attacker.name;
          const attackerHits = hitsByAttacker.get(attacker.name);
          const canExpand = hasRawHits && attackerHits && attackerHits.length > 0;

          return (
            <div key={attacker.name}>
              <div
                className={`flex items-center gap-2 ${canExpand ? "cursor-pointer" : ""}`}
                onClick={() => {
                  if (!canExpand) return;
                  setExpandedAttacker(isExpanded ? null : attacker.name);
                }}
              >
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
                  {canExpand && (
                    <ChevronDown
                      size={10}
                      className={`text-text-secondary flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    />
                  )}
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

              {/* Expanded stats */}
              {isExpanded && attackerHits && (
                <AttackerStatsPanel
                  hits={attackerHits}
                  durationMs={data.duration_ms}
                  color={color}
                />
              )}
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

      {/* Cumulative line chart with biggest-hit highlights */}
      {chartData.length > 1 && mainAttackers.length > 0 && (
        <div className="rounded-md bg-bg p-2">
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
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
              {/* Biggest hit highlight per attacker */}
              {mainAttackers.map((attacker, idx) => {
                const best = biggestHits.get(attacker.name);
                if (!best) return null;
                return (
                  <ReferenceDot
                    key={`best-${attacker.name}`}
                    x={Math.round(best.elapsed)}
                    y={best.cumulative}
                    r={4}
                    fill={getChartColor(idx)}
                    stroke="var(--surface)"
                    strokeWidth={1.5}
                  >
                    <Label
                      value={formatDamage(best.damage)}
                      position="top"
                      offset={6}
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        fill: getChartColor(idx),
                      }}
                    />
                  </ReferenceDot>
                );
              })}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function AttackerStatsPanel({
  hits,
  durationMs,
  color,
}: {
  hits: MvpDamageRawHit[];
  durationMs: number;
  color: string;
}) {
  const stats = useMemo(() => computeAttackerStats(hits, durationMs), [hits, durationMs]);

  return (
    <div className="ml-[98px] mt-1 mb-1.5 rounded-md bg-bg border border-border p-2">
      {/* Quick stats row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] mb-2">
        <div>
          <span className="text-text-secondary">Hits </span>
          <span className="text-text-primary font-semibold">{stats.hitCount}</span>
          <span className="text-text-secondary ml-0.5">({stats.hitsPerSec}/s)</span>
        </div>
        <div>
          <span className="text-text-secondary">DPS </span>
          <span className="text-text-primary font-semibold">{formatDamage(stats.dps)}</span>
        </div>
        <div>
          <span className="text-text-secondary">Maior </span>
          <span className="text-text-primary font-semibold">{formatDamage(stats.maxHit)}</span>
          <span className="text-text-secondary ml-0.5">({skillName(stats.maxHitSkill)})</span>
        </div>
        <div>
          <span className="text-text-secondary">Média </span>
          <span className="text-text-primary font-semibold">{formatDamage(stats.avgHit)}</span>
        </div>
      </div>

      {/* Skill breakdown */}
      {stats.skillBreakdown.length > 1 && (
        <div className="flex flex-col gap-1">
          <span className="text-[9px] text-text-secondary uppercase tracking-wide">
            Por skill
          </span>
          {stats.skillBreakdown.map((sk) => (
            <div key={sk.skillId ?? "auto"} className="flex items-center gap-2">
              <span className="text-[10px] text-text-secondary w-[80px] truncate">
                {skillName(sk.skillId)}
              </span>
              <div className="flex-1 h-2 rounded-sm bg-surface overflow-hidden">
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${Math.max(sk.pct, 1)}%`,
                    background: color,
                    opacity: 0.6,
                  }}
                />
              </div>
              <span className="text-[9px] text-text-secondary tabular-nums w-[50px] text-right">
                {formatDamage(sk.damage)} ({sk.pct.toFixed(0)}%)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
