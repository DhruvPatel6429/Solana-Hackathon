type Severity = "debug" | "info" | "warn" | "error";

export type LogContext = {
  requestId?: string;
  companyId?: string;
  invoiceId?: string;
  payoutId?: string;
  txSignature?: string;
  wallet?: string;
  webhookId?: string;
  severity?: Severity;
  [key: string]: unknown;
};

function redact(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  if (value.length > 18 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(value)) {
    return `${value.slice(0, 6)}...${value.slice(-4)}`;
  }

  return value;
}

function normalizeContext(context: LogContext = {}): LogContext {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [key, redact(value)]),
  ) as LogContext;
}

function emit(severity: Severity, message: string, context?: LogContext): void {
  const payload = {
    severity,
    message,
    timestamp: new Date().toISOString(),
    ...normalizeContext(context),
  };

  const line = JSON.stringify(payload);
  if (severity === "error") {
    console.error(line);
  } else if (severity === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, context?: LogContext) => emit("error", message, context),
};

export function getRequestId(request: Request): string {
  return (
    request.headers.get("x-request-id") ??
    request.headers.get("x-correlation-id") ??
    crypto.randomUUID()
  );
}

export function jsonWithRequestId(
  body: unknown,
  init: ResponseInit = {},
  requestId?: string,
): Response {
  const headers = new Headers(init.headers);
  if (requestId) {
    headers.set("x-request-id", requestId);
  }
  return Response.json(body, { ...init, headers });
}
