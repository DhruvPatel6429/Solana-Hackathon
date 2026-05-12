"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const tooltip = { backgroundColor: "#111118", border: "1px solid #1E1E2E", color: "#fff" };

export type ChartDatum = {
  label: string;
  value: number;
};

export type DonutDatum = {
  name: string;
  value: number;
};

export function Sparkline({ values }: { values?: number[] }) {
  if (!values?.length) {
    return null;
  }

  const data = values.map((value, index) => ({ index, value }));
  return (
    <ResponsiveContainer width="100%" height={48}>
      <AreaChart data={data}>
        <Area dataKey="value" stroke="#10B981" fill="#10B98133" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ContractorSpendChart({ data }: { data: ChartDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={310}>
      <BarChart data={data}>
        <CartesianGrid stroke="#1E1E2E" vertical={false} />
        <XAxis dataKey="label" stroke="#71717a" />
        <YAxis stroke="#71717a" />
        <Tooltip contentStyle={tooltip} />
        <Bar dataKey="value" fill="#7C3AED" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CurrencyDonutChart({ data }: { data: DonutDatum[] }) {
  if (!data.length) {
    return null;
  }

  const colors = ["#7C3AED", "#10B981", "#60A5FA", "#F59E0B"];
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={95} paddingAngle={4}>
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={colors[index]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltip} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ApprovalLineChart({ data }: { data: ChartDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid stroke="#1E1E2E" vertical={false} />
        <XAxis dataKey="label" stroke="#71717a" />
        <YAxis stroke="#71717a" />
        <Tooltip contentStyle={tooltip} />
        <Line dataKey="value" stroke="#10B981" strokeWidth={3} dot={{ fill: "#10B981" }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function TreasuryAreaChart({ data }: { data: ChartDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="violetFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.55} />
            <stop offset="95%" stopColor="#7C3AED" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#1E1E2E" vertical={false} />
        <XAxis dataKey="label" stroke="#71717a" />
        <YAxis stroke="#71717a" />
        <Tooltip contentStyle={tooltip} />
        <Area dataKey="value" stroke="#7C3AED" fill="url(#violetFill)" strokeWidth={3} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PaymentHistoryChart({ data }: { data: ChartDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid stroke="#1E1E2E" vertical={false} />
        <XAxis dataKey="label" stroke="#71717a" />
        <YAxis stroke="#71717a" />
        <Tooltip contentStyle={tooltip} />
        <Bar dataKey="value" fill="#7C3AED" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
