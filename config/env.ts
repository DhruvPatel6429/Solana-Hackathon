type ReadEnvOptions = {
  required?: boolean;
  defaultValue?: string;
};

type EnvIssue = {
  name: string;
  message: string;
};

type EnvField = {
  required?: boolean;
  defaultValue?: string;
  validate?: (value: string) => boolean;
  redact?: boolean;
};

const urlField = (required = true): EnvField => ({
  required,
  validate: (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },
});

const publicKeyField: EnvField = {
  required: true,
  validate: (value) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value),
};

const productionEnvSchema: Record<string, EnvField> = {
  DATABASE_URL: { required: true, redact: true },
  NEXT_PUBLIC_SUPABASE_URL: urlField(true),
  SUPABASE_SERVICE_ROLE_KEY: { required: true, redact: true },
  NEXT_PUBLIC_SOLANA_RPC_URL: urlField(true),
  TREASURY_WALLET_SECRET_KEY: { required: true, redact: true },
  TREASURY_WALLET_ADDRESS: publicKeyField,
  ESCROW_PROGRAM_ID: publicKeyField,
  HELIUS_WEBHOOK_SECRET: { required: true, redact: true },
  DODO_WEBHOOK_SECRET: { required: true, redact: true },
  DODO_API_KEY: { required: true, redact: true },
  DODO_BASE_URL: urlField(true),
  NEXT_PUBLIC_APP_URL: urlField(true),
  APP_ORIGIN: urlField(true),
};

export function readEnv(name: string, options: ReadEnvOptions = {}): string {
  const value = process.env[name] ?? options.defaultValue;

  if (options.required && (!value || !value.trim())) {
    throw new Error(`[env] Missing required environment variable: ${name}`);
  }

  return (value ?? "").trim();
}

export function getRequiredEnv(name: string): string {
  return readEnv(name, { required: true });
}

export const serverEnv = {
  databaseUrl: () => getRequiredEnv("DATABASE_URL"),
  supabaseUrl: () => getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceRoleKey: () => getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  appOrigin: () => readEnv("APP_ORIGIN", { defaultValue: "http://localhost:3000" }),
  treasuryWalletAddress: () => readEnv("TREASURY_WALLET_ADDRESS"),
};

export function validateBaselineServerEnv(): void {
  serverEnv.databaseUrl();
  serverEnv.supabaseUrl();
}

export function validateProductionEnv(env = process.env): {
  ok: boolean;
  issues: EnvIssue[];
  config: Record<string, string>;
} {
  const issues: EnvIssue[] = [];
  const config: Record<string, string> = {};

  for (const [name, field] of Object.entries(productionEnvSchema)) {
    const value = (env[name] ?? field.defaultValue ?? "").trim();

    if (field.required && !value) {
      issues.push({ name, message: "is required" });
      continue;
    }

    if (value && field.validate && !field.validate(value)) {
      issues.push({ name, message: "has an invalid format" });
    }

    config[name] = field.redact && value ? "[redacted]" : value;
  }

  return {
    ok: issues.length === 0,
    issues,
    config,
  };
}

export function assertValidProductionEnv(): void {
  const isNextProductionBuild =
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build";

  if (process.env.NODE_ENV !== "production" || isNextProductionBuild) {
    return;
  }

  const result = validateProductionEnv();
  if (!result.ok) {
    const details = result.issues
      .map((issue) => `${issue.name} ${issue.message}`)
      .join("; ");
    throw new Error(`[env] Invalid production configuration: ${details}`);
  }
}
