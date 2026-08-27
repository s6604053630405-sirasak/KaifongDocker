"use client";

// app/director/dashboard/executive/page.tsx
// พอร์ตมาจาก complaint_frontend/src/App.js → ExecutivePage (บรรทัด 620-882)
// + Sidebar date-range logic (บรรทัด 2805-2971) ย่อมาเป็น date picker ในตัวหน้านี้เอง
// เปลี่ยนจาก axios+FastAPI แยกพอร์ต → fetch() เรียก API ในโปรเจกต์เดียวกัน

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  LineChart, Line, PieChart, Pie, Cell,
  ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

// ── สี (ตรงกับ COLOR object เดิมใน App.js) ─────────────────────
const COLOR = {
  primary: "#FFD100", primaryLt: "#FFFBCC",
  dark: "#3F4444", green: "#00875A", amber: "#E67E00", red: "#D32F2F",
  purple: "#6B4EAD", blue: "#3b82f6", gray: "#64748B", mid: "#A7A8AA",
  border: "#E8EAEC", text: "#1A1C1E", muted: "#6B6E72",
};
const PIE_COLORS = [COLOR.primary, COLOR.dark, COLOR.green, COLOR.amber, COLOR.purple, COLOR.mid];

function slaColor(pct: number) {
  if (pct >= 90) return COLOR.green;
  if (pct >= 75) return COLOR.amber;
  return COLOR.red;
}
function daysAgo(base: string, n: number) {
  const d = new Date(base);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function buildDatePresets(today: string) {
  return [
    { l: "7 วันล่าสุด", s: daysAgo(today, 6), e: today },
    { l: "เดือนนี้", s: today.slice(0, 7) + "-01", e: today },
    { l: "ปีนี้", s: today.slice(0, 4) + "-01-01", e: today },
    { l: "ทั้งหมด", s: "2024-01-01", e: today },
  ];
}
// รวมข้อมูล /api/trend (รายวันเสมอ) ให้เหมาะกับความยาวของช่วงเวลาที่เลือก
function aggregateTrend(rows: any[]) {
  if (!Array.isArray(rows) || rows.length === 0) return { data: [] as any[], granularity: "day" as const };
  const spanDays = Math.round(
    (new Date(rows[rows.length - 1].date).getTime() - new Date(rows[0].date).getTime()) / 86400000
  ) + 1;
  if (spanDays <= 31) return { data: rows, granularity: "day" as const };
  const granularity: "month" = "month";
  const bucketKey = (dateStr: string) => dateStr.slice(0, 7);
  const map = new Map<string, any>();
  rows.forEach((r) => {
    const key = bucketKey(r.date);
    if (!map.has(key)) map.set(key, { date: key, new_cases: 0, done_cases: 0, at_risk: 0 });
    const b = map.get(key);
    b.new_cases += r.new_cases || 0;
    b.done_cases += r.done_cases || 0;
    b.at_risk += r.at_risk || 0;
  });
  return { data: Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date)), granularity };
}

// ── Hook ดึงข้อมูลจาก API ในโปรเจกต์เดียวกัน ───────────────────
function useApi<T = any>(endpoint: string | null, params: Record<string, any> = {}) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!!endpoint);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!endpoint) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") qs.set(k, String(v)); });
      const url = qs.toString() ? `${endpoint}?${qs}` : endpoint;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok || json?.success === false) throw new Error(json?.error || "โหลดข้อมูลไม่สำเร็จ");
      setData(json);
    } catch (e: any) {
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, JSON.stringify(params)]);

  useEffect(() => { fetchData(); }, [fetchData]);
  return { data, loading, error, refetch: fetchData };
}

// ── UI พื้นฐาน (เหมือนหน้า AI Insight เพื่อความสม่ำเสมอของธีม) ──
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}
function CardTitle({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 font-bold text-[15px] text-[#1A1C1E]">
        <span className="inline-block h-4 w-1 rounded bg-[#FFD100]" />
        {children}
      </div>
      {sub && <div className="mt-1 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}
function Skeleton({ height = 190 }: { height?: number }) {
  return <div className="animate-pulse rounded-xl bg-gray-100" style={{ height }} />;
}
function ErrorBanner({ message = "โหลดข้อมูลไม่สำเร็จ", onRetry, height }: { message?: string; onRetry?: () => void; height?: number }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 text-sm text-red-700" style={{ minHeight: height }}>
      <span>⚠️</span>
      <span className="flex-1">{message}</span>
      {onRetry && <button onClick={onRetry} className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold hover:bg-red-100">ลองใหม่</button>}
    </div>
  );
}
function InfoTip({ text, align = "center" }: { text: string; align?: "left" | "center" | "right" }) {
  const posClass =
    align === "right" ? "right-0" :
    align === "left" ? "left-0" :
    "left-1/2 -translate-x-1/2";
  return (
    <span className="group relative ml-1 inline-block cursor-help text-gray-400" tabIndex={0}>
      ⓘ
      <span className={`pointer-events-none absolute top-5 z-20 hidden w-64 rounded-lg bg-gray-900 p-2.5 text-xs leading-relaxed text-white group-hover:block group-focus:block ${posClass}`}>
        {text}
      </span>
    </span>
  );
}
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/55 p-5" onClick={onClose}>
      <div className="relative max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="ปิด" className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">✕</button>
        {children}
      </div>
    </div>
  );
}
const ChartTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold">{label || "—"}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color }}>{p.name}: <b>{p.value?.toLocaleString?.() ?? p.value}</b></div>
      ))}
    </div>
  );
};
function ChartLegend({ items }: { items: [string, string, boolean?][] }) {
  return (
    <div className="mb-2 flex gap-4 text-xs text-gray-500">
      {items.map(([label, color, dashed]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={dashed ? { border: `1.5px dashed ${color}` } : { background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

// ── KPI Card ────────────────────────────────────────────────
function DeltaPill({ delta, goodWhenUp = true }: { delta: number | null | undefined; goodWhenUp?: boolean }) {
  if (delta === null || delta === undefined) return null;
  const isFlat = delta === 0;
  const isUp = delta > 0;
  const good = isFlat ? null : isUp === goodWhenUp;
  const color = isFlat ? COLOR.gray : good ? COLOR.green : COLOR.red;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: color + "18", color }}>
      {isFlat ? "‒" : isUp ? "↗" : "↘"} {Math.abs(delta).toFixed(1)}%
    </span>
  );
}
function KPICard({ label, value, accentColor, delta, sub, deltaLabel, goodWhenUp = true }: {
  label: React.ReactNode; value: React.ReactNode; accentColor: string;
  delta?: number | null; sub?: React.ReactNode; deltaLabel?: string; goodWhenUp?: boolean;
}) {
  return (
    <div className="relative rounded-2xl border border-gray-200 bg-white p-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <span className="absolute left-0 top-0 h-full w-1" style={{ background: accentColor }} />
      </div>
      <div className="pl-2 text-xs text-gray-500">{label}</div>
      <div className="pl-2 text-2xl font-extrabold" style={{ color: accentColor }}>{value ?? "—"}</div>
      {sub && <div className="pl-2 text-[11px] text-gray-400">{sub}</div>}
      {(delta !== undefined && delta !== null) && (
        <div className="mt-1.5 flex items-center gap-1.5 pl-2">
          <DeltaPill delta={delta} goodWhenUp={goodWhenUp} />
          {deltaLabel && <span className="text-[10px] text-gray-400">{deltaLabel}</span>}
        </div>
      )}
    </div>
  );
}

// ── SLA Half-circle gauge (SVG) ─────────────────────────────
function SLAGauge({ pct = 0, size = 200 }: { pct?: number; size?: number }) {
  const r = size / 2 - 18;
  const circ = Math.PI * r;
  const fill = (pct / 100) * circ;
  const cx = size / 2;
  const cy = size / 2 + 10;
  const col = slaColor(pct);
  const lbl = pct >= 90 ? "ดีเยี่ยม" : pct >= 75 ? "พอใช้" : "ปรับปรุง";
  return (
    <svg width={size} height={size * 0.62} role="img" aria-label={`SLA ${pct}%`}>
      <path d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`} fill="none" stroke={COLOR.border} strokeWidth={13} strokeLinecap="round" />
      <path d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`} fill="none" stroke={col} strokeWidth={13} strokeLinecap="round"
        strokeDasharray={`${fill} ${circ}`} style={{ transition: "stroke-dasharray .8s ease" }} />
      <text x={cx} y={cy - 22} textAnchor="middle" style={{ fontSize: 24, fontWeight: 700, fill: col }}>{pct}%</text>
      <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontSize: 11, fontWeight: 600, fill: col }}>{lbl}</text>
      <text x={cx - r} y={cy + 14} textAnchor="middle" style={{ fontSize: 9, fill: COLOR.muted }}>0</text>
      <text x={cx + r} y={cy + 14} textAnchor="middle" style={{ fontSize: 9, fill: COLOR.muted }}>100</text>
    </svg>
  );
}

// ── Alerts ──────────────────────────────────────────────────
const ALERT_LEVEL_META: Record<string, { color: string; label: string; icon: string }> = {
  high: { color: COLOR.red, label: "สูง", icon: "🔺" },
  medium: { color: COLOR.amber, label: "ปานกลาง", icon: "⚠️" },
  info: { color: COLOR.blue, label: "ข้อมูลทั่วไป", icon: "ℹ️" },
};
function AlertItem({ alert, compact = false }: { alert: any; compact?: boolean }) {
  const meta = ALERT_LEVEL_META[alert?.level] || { color: COLOR.gray, label: "—", icon: "🔔" };
  if (compact) {
    return (
      <div className="flex items-start gap-2 py-1.5 text-xs">
        <span style={{ color: meta.color }}>{meta.icon}</span>
        <span className="text-gray-600">{alert?.message || "ไม่มีข้อความ"}</span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5 border-b border-gray-100 py-2.5 text-sm last:border-0">
      <span style={{ color: meta.color }}>{meta.icon}</span>
      <div className="flex-1">{alert?.message || "ไม่มีข้อความ"}</div>
      <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: meta.color + "18", color: meta.color }}>{meta.label}</span>
    </div>
  );
}
function AIAlertsModal({ alerts, onClose }: { alerts: any[]; onClose: () => void }) {
  const list = Array.isArray(alerts) ? alerts : [];
  return (
    <Modal onClose={onClose}>
      <div className="p-6">
        <div className="mb-1 text-base font-bold">การแจ้งเตือนอัจฉริยะ (AI Alerts)</div>
        <div className="mb-3 text-xs text-gray-500">ระบบตรวจจับสิ่งที่ต้องให้ความสนใจโดยอัตโนมัติจากข้อมูลเรื่องร้องเรียน</div>
        {list.length === 0 ? (
          <div className="rounded-xl bg-gray-50 py-8 text-center text-sm text-gray-400">ไม่มีการแจ้งเตือนในขณะนี้</div>
        ) : (
          list.map((a, i) => <AlertItem key={i} alert={a} />)
        )}
      </div>
    </Modal>
  );
}

// ── Date range bar (เพิ่ม input type="date" ให้เลือกวันที่เองได้ นอกจากปุ่มลัด) ──
function DateRangeBar({ dates, setDates, today }: { dates: { start_date: string; end_date: string }; setDates: (d: any) => void; today: string }) {
  const presets = useMemo(() => buildDatePresets(today), [today]);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm">
      <span className="text-xs font-semibold text-gray-500">📅 ช่วงเวลา:</span>
      {presets.map((d) => {
        const active = dates.start_date === d.s && dates.end_date === d.e;
        return (
          <button
            key={d.l}
            onClick={() => setDates({ start_date: d.s, end_date: d.e })}
            className="rounded-full border px-3 py-1 text-xs font-semibold"
            style={active ? { background: "#FFD10030", borderColor: "#FFD100", color: "#8a6d00" } : { borderColor: "#E8EAEC", color: "#6B6E72" }}
          >
            {d.l}
          </button>
        );
      })}

      {/* เลือกวันที่เอง (วัน/เดือน/ปี) — ถ้าใส่แล้วไม่ตรงปุ่มลัดไหนเลย ปุ่มลัดด้านบนจะไม่ active ให้อัตโนมัติ */}
      <span className="ml-2 flex items-center gap-1.5 text-xs text-gray-500">
        ตั้งแต่
        <input
          type="date"
          value={dates.start_date}
          max={dates.end_date}
          onChange={(e) => setDates((d: any) => ({ ...d, start_date: e.target.value }))}
          className="rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-[#FFD100] focus:outline-none"
        />
        ถึง
        <input
          type="date"
          value={dates.end_date}
          min={dates.start_date}
          max={today}
          onChange={(e) => setDates((d: any) => ({ ...d, end_date: e.target.value }))}
          className="rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-[#FFD100] focus:outline-none"
        />
      </span>
    </div>
  );
}

// ── หน้าหลัก ─────────────────────────────────────────────────
export default function ExecutivePage() {
  // ใช้วันที่จริงของเครื่อง (ไม่ล็อกตามข้อมูลล่าสุดใน DB อีกต่อไป — เหมาะกับการใช้งานจริง)
  const today = new Date().toISOString().slice(0, 10);

  const [dates, setDates] = useState<{ start_date: string; end_date: string }>({ start_date: "2024-01-01", end_date: today });

  const { data: kpi, loading: kl, error: ke, refetch: refetchKpi } = useApi<any>(dates ? "/api/kpi" : null, dates || {});
  const { data: trend, loading: tl } = useApi<any[]>(dates ? "/api/trend" : null, dates || {});
  const { data: cats, loading: cl } = useApi<any[]>(dates ? "/api/by-category" : null, dates || {});
  const { data: areas, loading: al } = useApi<any[]>(dates ? "/api/by-area" : null, dates || {});
  const { data: sla, loading: sl } = useApi<any>(dates ? "/api/sla" : null, dates || {});
  const { data: fb, loading: fl } = useApi<any>(dates ? "/api/feedback" : null, dates || {});
  const { data: alerts } = useApi<any[]>("/api/alerts");
  const safeAlerts = Array.isArray(alerts) ? alerts : [];
  const [showAlertsModal, setShowAlertsModal] = useState(false);

  const rawTrend = Array.isArray(trend) ? trend : [];
  const { data: safeTrend, granularity: trendGranularity } = aggregateTrend(rawTrend);
  const safeCats = Array.isArray(cats) ? cats.map((c) => ({ ...c, name: c.name || "ไม่ระบุ" })) : [];
  const safeAreas = Array.isArray(areas) ? areas : [];

  const slaPct = sla?.summary?.sla_pct ?? null;
  const slaGap = slaPct != null ? (90 - slaPct).toFixed(1) : null;

  const kpiDefs = kpi ? [
    {
      label: "เรื่องร้องเรียนทั้งหมด", value: kpi.total?.toLocaleString(), accentColor: COLOR.primary,
      delta: kpi.total_delta ?? null, goodWhenUp: false,
      deltaLabel: kpi.prev_period ? `เทียบ ${kpi.prev_period.start} – ${kpi.prev_period.end}` : "จากช่วงก่อน",
    },
    {
      label: "รอดำเนินการ", value: kpi.open_total?.toLocaleString(), accentColor: COLOR.amber,
      sub: [kpi.pending ? `รอรับ ${kpi.pending.toLocaleString()}` : null, kpi.in_progress ? `ดำเนินการ ${kpi.in_progress.toLocaleString()}` : null, kpi.paused ? `พัก ${kpi.paused.toLocaleString()}` : null].filter(Boolean).join(" · "),
    },
    {
      label: "แก้ไขสำเร็จ", value: kpi.resolved?.toLocaleString(), accentColor: COLOR.green,
      delta: kpi.resolved_delta ?? null, goodWhenUp: true,
      deltaLabel: kpi.prev_period ? `เทียบ ${kpi.prev_period.start} – ${kpi.prev_period.end}` : "จากช่วงก่อน",
    },
    {
      label: "อัตราการปิดเรื่อง", value: kpi.total > 0 ? Math.round((kpi.closed / kpi.total) * 100) + "%" : "—",
      accentColor: COLOR.purple, sub: `ปิดแล้ว ${kpi.closed?.toLocaleString() ?? "—"} เรื่อง`,
    },
    {
      label: "ระดับความพึงพอใจ", value: fb?.avg_score ? `${fb.avg_score}/5` : "—", accentColor: COLOR.blue,
      sub: fb?.total_responses ? `ผู้ตอบแบบสอบถาม ${fb.total_responses.toLocaleString()} ราย` : "—",
    },
    {
      label: <span>อัตราความสำเร็จตาม SLA<InfoTip align="right" text="SLA (Service Level Agreement) คือระยะเวลามาตรฐานที่กำหนดไว้สำหรับแก้ไขเรื่องร้องเรียนแต่ละประเภทให้เสร็จ ถ้าทำไม่ทันเวลาที่กำหนดจะถือว่า 'เกิน SLA'" /></span>,
      value: slaPct != null ? `${slaPct}%` : "—",
      accentColor: slaPct != null ? (slaPct >= 90 ? COLOR.green : slaPct >= 75 ? COLOR.amber : COLOR.red) : COLOR.gray,
      sub: slaPct != null ? (slaPct >= 90 ? "บรรลุเป้าหมาย ≥ 90%" : `เป้า 90% · ต่ำกว่าเป้า ${slaGap}%`) : "เป้าหมาย ≥ 90%",
    },
  ] : [];

  return (
    <div className="flex flex-col gap-5 p-6">
      <DateRangeBar dates={dates} setDates={setDates} today={today} />

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {kl
          ? Array(6).fill(0).map((_, i) => <Card key={i}><Skeleton height={78} /></Card>)
          : ke
            ? <div className="col-span-full"><ErrorBanner message="โหลดข้อมูลไม่สำเร็จ" onRetry={refetchKpi} height={78} /></div>
            : kpiDefs.map((k, i) => <KPICard key={i} {...k} />)
        }
      </div>

      {/* Trend + SLA Gauge */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle sub={
            <span>
              จำนวนเรื่องร้องเรียนที่รับใหม่และดำเนินการแล้ว {trendGranularity === "day" ? "รายวัน" : "รายเดือน"} ตามช่วงเวลาที่เลือก
              <InfoTip text="ระบบจะปรับการแสดงผลเป็นรายเดือนโดยอัตโนมัติเมื่อเลือกช่วงเวลาที่ยาว เพื่อให้การแสดงแนวโน้มมีความชัดเจนมากขึ้น โดยไม่มีการตัดข้อมูล" />
            </span>
          }>
            แนวโน้มของเรื่องร้องเรียน
          </CardTitle>
          <ChartLegend items={[["รับเรื่องใหม่", COLOR.primary], ["ดำเนินการแล้ว", COLOR.green]]} />
          {tl ? <Skeleton height={190} /> : (
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={safeTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLOR.border} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }}
                  tickFormatter={(v) => v && (trendGranularity === "month" ? `${v.slice(5)}/${v.slice(2, 4)}` : v.slice(5))} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip content={<ChartTip />} />
                <Line type="linear" dataKey="new_cases" name="รับใหม่" stroke={COLOR.primary} strokeWidth={2.5} dot={false} />
                <Line type="linear" dataKey="done_cases" name="แก้ไขแล้ว" stroke={COLOR.green} strokeWidth={2} dot={false} strokeDasharray="5 3" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="flex flex-col items-center">
          <CardTitle sub="ดัชนีวัดคุณภาพการบริการ (สัดส่วนเรื่องร้องเรียนที่ดำเนินการแล้วเสร็จภายในระยะเวลาที่กำหนด)">สัดส่วนเรื่องร้องเรียนที่ดำเนินการแล้วเสร็จภายในระยะเวลาที่กำหนด</CardTitle>
          {sl ? <Skeleton height={130} /> : (
            <>
              <SLAGauge pct={sla?.summary?.sla_pct || 0} size={200} />
              <div className="mt-2 grid w-full grid-cols-2 gap-2">
                {[
                  { l: "ดำเนินการภายใน SLA", v: sla?.summary?.on_time?.toLocaleString(), col: COLOR.green },
                  { l: "เกิน SLA", v: sla?.summary?.breached?.toLocaleString(), col: COLOR.red },
                ].map((s, i) => (
                  <div key={i} className="rounded-xl px-3 py-2 text-center" style={{ background: s.col + "12" }}>
                    <div className="text-[11px] text-gray-500">{s.l}</div>
                    <div className="text-lg font-bold" style={{ color: s.col }}>{s.v ?? "—"}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Category Pie + Satisfaction + Top area + Alerts */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card>
          <CardTitle sub="แสดงสัดส่วนเรื่องร้องเรียนใน 6 หมวดหมู่ปัญหาหลัก">สัดส่วนเรื่องร้องเรียนตามหมวดหมู่ปัญหา</CardTitle>
          {cl ? <Skeleton height={180} /> : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={safeCats} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={36}>
                    {safeCats.map((c, i) => <Cell key={i} fill={c.color || PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any, n: any) => {
                    const catTotal = safeCats.reduce((s, c) => s + (Number(c.total) || 0), 0);
                    const pct = catTotal > 0 ? Math.round((Number(v) / catTotal) * 1000) / 10 : 0;
                    return [`${pct}%`, n];
                  }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1">
                {safeCats.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ background: c.color || PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="flex-1 text-gray-600">{c.name}</span>
                    <span className="font-semibold">{c.total?.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card>
          <CardTitle sub="คะแนนความพึงพอใจเฉลี่ยจากผู้ร้องเรียน">ระดับความพึงพอใจของประชาชน</CardTitle>
          {fl ? <Skeleton height={220} /> : (
            <div>
              <div className="flex items-end justify-center gap-1">
                <span className="text-4xl font-extrabold">{fb?.avg_score ?? "—"}</span>
                <span className="mb-1 text-gray-400">/5</span>
              </div>
              <div className="mb-3 flex justify-center gap-0.5 text-xl">
                {[1, 2, 3, 4, 5].map((s) => (
                  <span key={s} style={{ color: s <= Math.round(fb?.avg_score || 0) ? "#FFD500" : COLOR.border }}>★</span>
                ))}
              </div>
              <div className="space-y-1.5">
                {[5, 4, 3, 2, 1].map((s) => {
                  const cnt = fb?.by_score?.[s] || 0;
                  const pct = fb?.total_responses > 0 ? Math.round((cnt / fb.total_responses) * 100) : 0;
                  return (
                    <div key={s} className="flex items-center gap-2 text-xs">
                      <span className="w-6 text-gray-500">{s}★</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: s >= 4 ? COLOR.green : s === 3 ? COLOR.amber : COLOR.red }} />
                      </div>
                      <span className="w-9 text-right text-gray-500">{pct}%</span>
                    </div>
                  );
                })}
              </div>
              {fb?.total_responses > 0 && (
                <div className="mt-2 text-center text-[11px] text-gray-400">ผู้ตอบแบบสอบถาม {fb.total_responses.toLocaleString()} ราย</div>
              )}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle sub="แสดง 5 เขตที่มีจำนวนเรื่องร้องเรียนสูงสุด">พื้นที่ที่มีเรื่องร้องเรียนสูงสุด</CardTitle>
          {al ? <Skeleton height={180} /> : (
            <div>
              {safeAreas.slice(0, 5).map((a, i) => {
                const max = safeAreas[0]?.total || 1;
                const pct = Math.round((a.total / max) * 100);
                return (
                  <div key={i} className="mb-2 flex items-center gap-2">
                    <span className="w-6 text-sm font-bold" style={{ color: i === 0 ? COLOR.red : i === 1 ? COLOR.amber : COLOR.muted }}>#{i + 1}</span>
                    <div className="flex-1">
                      <div className="mb-0.5 flex justify-between text-xs">
                        <span className="font-medium">{a.district}</span>
                        <span className="text-gray-500">{a.total?.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: i === 0 ? COLOR.primary : COLOR.dark + "60" }} />
                      </div>
                    </div>
                  </div>
                );
              })}
              {safeAlerts.length > 0 && (
                <div className="mt-3 border-t border-dashed border-gray-200 pt-2.5">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">แจ้งเตือนสำคัญ</span>
                    <button onClick={() => setShowAlertsModal(true)} className="text-xs font-semibold text-amber-600">
                      ดูทั้งหมด ({safeAlerts.length}) ›
                    </button>
                  </div>
                  {safeAlerts.slice(0, 2).map((a, i) => <AlertItem key={i} alert={a} compact />)}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {showAlertsModal && <AIAlertsModal alerts={alerts || []} onClose={() => setShowAlertsModal(false)} />}
    </div>
  );
}