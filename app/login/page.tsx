'use client';

import { FormEvent, Suspense, useState } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { GoogleButton, OrDivider } from '@/components/auth/GoogleButton';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { signInAccount } from '@/lib/auth';

const fieldClass =
  'h-12 w-full rounded-lg border border-border bg-white px-4 font-normal text-foreground outline-none placeholder:text-muted-foreground focus:border-[#8E1F2C] focus:ring-2 focus:ring-[#8E1F2C]/20';


const googleErrors: Record<string, string> = {
  google_cancelled: 'Google sign-in was cancelled.',
  google_failed: 'We could not sign you in with Google. Please try again.',
  google_unavailable: 'Google sign-in is not available right now. Use your email and password.',
  google_owner: 'Business owners sign in with email and password.',
};

function LoginForm() {
  const router = useRouter();
  const googleError = googleErrors[useSearchParams().get('error') ?? ''] ?? '';
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    if (!email || !password) {
      setError('Enter your email and password to continue.');
      return;
    }
    setPending(true);
    setError('');
    const result = await signInAccount({ email, password });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace(result.user.role === 'owner' ? '/owner/dashboard' : '/customer/inquiry');
  }

  return (
    <AuthShell>
        <section className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10" aria-labelledby="login-heading">
          <h1 id="login-heading" className="text-center font-heading text-4xl font-bold uppercase tracking-tight text-[#2A1B1F] sm:text-5xl">Welcome back</h1>
          <p className="mt-3 text-center text-base leading-7 text-muted-foreground">Sign in to plan your events and manage your meals.</p>

          {googleError && <p role="alert" className="mt-6 rounded-lg bg-primary-soft px-4 py-3 text-sm text-[#8E1F2C]">{googleError}</p>}

          <div className="mt-8"><GoogleButton /></div>
          <OrDivider />

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label htmlFor="email" className="flex flex-col gap-2 text-sm font-semibold">
              Email address
              <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" className={fieldClass} />
            </label>
            <label htmlFor="password" className="flex flex-col gap-2 text-sm font-semibold">
              Password
              <span className="relative">
                <input id="password" name="password" type={showPassword ? 'text' : 'password'} required autoComplete="current-password" placeholder="Enter your password" className={`${fieldClass} pr-20`} />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#8E1F2C] hover:underline">
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={pending} className="mt-2 h-12 w-full justify-center rounded-lg bg-[#9B1C2C] text-base font-semibold text-white shadow-none hover:bg-[#7F1623]">
              {pending ? 'Signing in…' : 'Continue'}
            </Button>
          </form>

                      <p className="mt-8 text-center text-sm text-muted-foreground">
              New to CaterFlex? <Link href="/signup" className="font-semibold text-[#8E1F2C] underline underline-offset-4">Create an account</Link>
            </p>
        </section>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-white" aria-busy="true" />}>
      <LoginForm />
    </Suspense>
  );
}