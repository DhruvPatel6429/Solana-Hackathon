import { validateBaselineServerEnv } from "@/config/env";

export async function GET() {
  try {
    validateBaselineServerEnv();
    return Response.json({ ok: true, service: "borderless-payroll-copilot" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health check failed.";
    return Response.json({ ok: false, service: "borderless-payroll-copilot", error: message }, { status: 500 });
  }
}
