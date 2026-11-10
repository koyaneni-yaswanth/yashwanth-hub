import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase';
import { CapacitorService } from '../native/capacitorService';
import type { Session, User } from '@supabase/supabase-js';

export interface AuthState {
  configured: boolean;
  loading: boolean;
  user: User | null;
  session: Session | null;
}

class SupabaseAuthManager {
  private listeners: Set<(state: AuthState) => void> = new Set();
  private state: AuthState = {
    configured: isSupabaseConfigured(),
    loading: true,
    user: null,
    session: null,
  };
  private initialized = false;

  public async init(): Promise<AuthState> {
    this.state.configured = isSupabaseConfigured();
    const client = getSupabaseClient();

    if (!client) {
      this.state = { configured: false, loading: false, user: null, session: null };
      this.notify();
      return this.state;
    }

    if (!this.initialized) {
      this.initialized = true;
      client.auth.onAuthStateChange((_event, session) => {
        this.state = {
          configured: true,
          loading: false,
          user: session?.user ?? null,
          session: session ?? null,
        };
        this.notify();
      });
    }

    try {
      const { data, error } = await client.auth.getSession();
      if (error) {
        console.warn('[SupabaseAuth] getSession warning:', error.message);
      }
      this.state = {
        configured: true,
        loading: false,
        user: data?.session?.user ?? null,
        session: data?.session ?? null,
      };
    } catch (err: any) {
      console.warn('[SupabaseAuth] init error:', err?.message || err);
      this.state = { configured: true, loading: false, user: null, session: null };
    }

    this.notify();
    return this.state;
  }

  public getState(): AuthState {
    return { ...this.state };
  }

  public subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const snapshot = this.getState();
    this.listeners.forEach((cb) => cb(snapshot));
  }

  public async getAccessToken(): Promise<string | null> {
    const client = getSupabaseClient();
    if (!client) return null;
    try {
      const { data } = await client.auth.getSession();
      return data?.session?.access_token ?? null;
    } catch {
      return null;
    }
  }

  public getRedirectToUrl(): string {
    if (CapacitorService.isNative()) {
      return 'com.yaswanth.hub://auth/callback';
    }
    if (typeof window === 'undefined') {
      return 'https://yashwanth-hub.vercel.app';
    }
    return window.location.origin;
  }

  public async signInWithGoogleOAuth(): Promise<{ url?: string; error?: string }> {
    const client = getSupabaseClient();
    if (!client) {
      return {
        error: 'Supabase is not configured (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required).',
      };
    }

    const redirectTo = this.getRedirectToUrl();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) {
      return { error: error.message };
    }
    return { url: data?.url };
  }

  public async signInWithEmail(email: string, password: string): Promise<{ error?: string; user?: User | null }> {
    const client = getSupabaseClient();
    if (!client) {
      return { error: 'Supabase is not configured.' };
    }
    const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { error: error.message };
    return { user: data.user };
  }

  public async signUpWithEmail(email: string, password: string): Promise<{ error?: string; message?: string }> {
    const client = getSupabaseClient();
    if (!client) {
      return { error: 'Supabase is not configured.' };
    }
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: this.getRedirectToUrl() },
    });
    if (error) return { error: error.message };
    if (data?.user && !data.session) {
      return { message: 'Account created! Check your email for the confirmation link before signing in.' };
    }
    return { message: 'Account created and signed in.' };
  }

  public async sendMagicLink(email: string): Promise<{ error?: string; message?: string }> {
    const client = getSupabaseClient();
    if (!client) {
      return { error: 'Supabase is not configured.' };
    }
    const { error } = await client.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: this.getRedirectToUrl() },
    });
    if (error) return { error: error.message };
    return { message: `Magic sign-in link sent to ${email.trim()}.` };
  }

  public async signOut(): Promise<{ error?: string }> {
    const client = getSupabaseClient();
    if (!client) return {};
    const { error } = await client.auth.signOut();
    this.state = {
      configured: true,
      loading: false,
      user: null,
      session: null,
    };
    this.notify();
    return error ? { error: error.message } : {};
  }
}

export const SupabaseAuthService = new SupabaseAuthManager();
