'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/components/auth/AuthShell';
import { GoogleButton, OrDivider } from '@/components/auth/GoogleButton';
import { Button } from '@/components/ui/button';
import { signUpAccount } from '@/lib/auth';

const fieldClass =
  'h-12 w-full rounded-lg border border-border bg-white px-4 font-normal text-foreground outline-none placeholder:text-muted-foreground focus:border-[#8E1F2C] focus:ring-2 focus:ring-[#8E1F2C]/20';

export default function SignupPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    const confirm = String(form.get('confirmPassword') || '');

    if (!email || password.length < 6) {
      setError('Enter your email and a password with at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setPending(true);
    setError('');
    const result = await signUpAccount({ email, password });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace('/customer/inquiry');
  }

  return (
    <AuthShell>
      <section className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10" aria-labelledby="signup-heading">
        <h1 id="signup-heading" className="text-center font-heading text-4xl font-bold uppercase tracking-tight text-[#2A1B1F] sm:text-5xl">Create your account</h1>
        <p className="mt-3 text-center text-base leading-7 text-muted-foreground">Plan your events and order your meals in one place.</p>

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
              <input id="password" name="password" type={showPassword ? 'text' : 'password'} required minLength={6} autoComplete="new-password" placeholder="At least 6 characters" className={`${fieldClass} pr-20`} />
              <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#8E1F2C] hover:underline">
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>
          <label htmlFor="confirmPassword" className="flex flex-col gap-2 text-sm font-semibold">
            Confirm password
            <input id="confirmPassword" name="confirmPassword" type={showPassword ? 'text' : 'password'} required minLength={6} autoComplete="new-password" placeholder="Repeat your password" className={fieldClass} />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending} className="mt-2 h-12 w-full justify-center rounded-lg bg-[#9B1C2C] text-base font-semibold text-white shadow-none hover:bg-[#7F1623]">
            {pending ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Already have an account? <Link href="/login" className="font-semibold text-[#8E1F2C] underline underline-offset-4">Sign in</Link>
        </p>
      </section>
    </AuthShell>
  );
}