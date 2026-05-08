type ReadEnvOptions = {
  required?: boolean;
  defaultValue?: string;
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
};

export function validateBaselineServerEnv(): void {
  serverEnv.databaseUrl();
  serverEnv.supabaseUrl();
}
