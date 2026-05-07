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
import { monthlySpend, paymentHistory } from "@/lib/mock-data";

const tooltip = { backgroundColor: "#111118", border: "1px solid #1E1E2E", color: "#fff" };

export function Sparkline() {
  return (
    <ResponsiveContainer width="100%" height={48}>
      <AreaChart data={[12, 15, 13, 19, 21, 25, 23].map((value, index) => ({ index, value }))}>
        <Area dataKey="value" stroke="#10B981" fill="#10B98133" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ContractorSpendChart() {
  return (
    <ResponsiveContainer width="100%" height={310}>
      <BarChart data={monthlySpend}>
        <CartesianGrid stroke="#1E1E2E" vertical={false} />
        <XAxis dataKey="month" stroke="#71717a" />
        <YAxis stroke="#71717a" />
        <Tooltip contentStyle={tooltip} />
        <Bar dataKey="Engineering" stackId="a" fill="#7C3AED" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Design" stackId="a" fill="#10B981" />
        <Bar dataKey="Ops" stackId="a" fill="#60A5FA" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CurrencyDonutChart() {
  const data = [
    { name: "USDC", value: 58 },
    { name: "INR", value: 18 },
    { name: "EUR", value: 14 },
    { name: "BRL", value: 10 },
  ];
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

export function ApprovalLineChart() {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={[{ month: "Jan", days: 2.8 }, { month: "Feb", days: 2.2 }, { month: "Mar", days: 1.9 }, { month: "Apr", days: 1.3 }, { month: "May", days: 0.8 }]}>
        <CartesianGrid stroke="#1E1E2E" vertical={false} />
        <XAxis dataKey="month" stroke="#71717a" />
        <YAxis stroke="#71717a" />
        <Tooltip contentStyle={tooltip} />
        <Line dataKey="days" stroke="#10B981" strokeWidth={3} dot={{ fill: "#10B981" }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function TreasuryAreaChart() {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={[{ day: "Mon", value: 132000 }, { day: "Tue", value: 141000 }, { day: "Wed", value: 139000 }, { day: "Thu", value: 156000 }, { day: "Fri", value: 184000 }]}>
        <defs>
          <linearGradient id="violetFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.55} />
            <stop offset="95%" stopColor="#7C3AED" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#1E1E2E" vertical={false} />
        <XAxis dataKey="day" stroke="#71717a" />
        <YAxis stroke="#71717a" />
        <Tooltip contentStyle={tooltip} />
        <Area dataKey="value" stroke="#7C3AED" fill="url(#violetFill)" strokeWidth={3} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PaymentHistoryChart() {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={paymentHistory}>
        <CartesianGrid stroke="#1E1E2E" vertical={false} />
        <XAxis dataKey="month" stroke="#71717a" />
        <YAxis stroke="#71717a" />
        <Tooltip contentStyle={tooltip} />
        <Bar dataKey="received" fill="#7C3AED" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
