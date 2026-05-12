import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { serverEnv } from '@/config/env';

type Body = {
  email: string;
  password: string;
  metadata?: Record<string, unknown>;
};

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return new Response(JSON.stringify({ error: 'Not allowed in production' }), { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  if (!body?.email || !body?.password) {
    return new Response(JSON.stringify({ error: 'Missing email or password' }), { status: 400 });
  }

  try {
    const supabase = createClient(serverEnv.supabaseUrl(), serverEnv.supabaseServiceRoleKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await supabase.auth.admin.createUser({
      email: body.email,
      password: body.password,
      user_metadata: body.metadata as Record<string, unknown> | undefined,
      email_confirm: true,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, user: data?.user ?? null }), { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('force-create error', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}
