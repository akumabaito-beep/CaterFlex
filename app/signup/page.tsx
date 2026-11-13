'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/components/auth/AuthShell';
import { GoogleButton, OrDivider } from '@/components/auth/GoogleButton';
import { Button } from '@/components/ui/button';
import { resendVerification, signUpAccount } from '@/lib/auth';

const fieldClass =
  'h-12 w-full rounded-lg border border-border bg-white px-4 font-normal text-foreground outline-none placeholder:text-muted-foreground focus:border-[#C8431B] focus:ring-2 focus:ring-[#C8431B]/20';

export default function SignupPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  // The form is inert until React has loaded, so an early submit can never fall back to a plain
  // browser GET that would put the email and password in the address bar.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [sentTo, setSentTo] = useState('');
  const [resendNote, setResendNote] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '').trim();
    const contact = String(form.get('contact') || '').replace(/[\s-]/g, '');
    const password = String(form.get('password') || '');
    const confirm = String(form.get('confirmPassword') || '');

    if (!email || password.length < 8) {
      setError('Enter your email and a password with at least 6 characters.');
      return;
    }
    if (!/^(09|\+639)\d{9}$/.test(contact)) {
      setError('Enter a valid mobile number, like 09171234567.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setPending(true);
    setError('');
    const result = await signUpAccount({ email, password, contact });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSentTo(result.email);
  }

  async function handleResend() {
    setResendNote('');
    const result = await resendVerification(sentTo);
    setResendNote(result.ok ? 'We sent you a new link.' : result.error);
  }

  if (sentTo) {
    return (
      <AuthShell>
        <section className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10 text-center" aria-live="polite">
          <h1 className="font-heading text-4xl font-bold uppercase tracking-tight text-[#2B1D16] sm:text-5xl">Check your email</h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">We sent a confirmation link to <span className="font-semibold text-foreground">{sentTo}</span>. Open it to activate your account. The link expires in 24 hours.</p>
          <button type="button" onClick={handleResend} className="mt-8 h-12 w-full rounded-lg border border-border bg-white text-base font-semibold text-[#2B1D16] hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B]">Resend email</button>
          {resendNote && <p role="status" className="mt-3 text-sm text-muted-foreground">{resendNote}</p>}
          <p className="mt-8 text-sm text-muted-foreground">Wrong email? <button type="button" onClick={() => setSentTo('')} className="font-semibold text-[#C8431B] underline underline-offset-4">Go back</button> · <Link href="/login" className="font-semibold text-[#C8431B] underline underline-offset-4">Sign in</Link></p>
        </section>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <section className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10" aria-labelledby="signup-heading">
        <h1 id="signup-heading" className="text-center font-heading text-4xl font-bold uppercase tracking-tight text-[#2B1D16] sm:text-5xl">Create your account</h1>
        <p className="mt-3 text-center text-base leading-7 text-muted-foreground">Plan your events and order your meals in one place.</p>

        <div className="mt-8"><GoogleButton /></div>
        <OrDivider />

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label htmlFor="email" className="flex flex-col gap-2 text-sm font-semibold">
            Email address
            <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" className={fieldClass} />
          </label>
          <label htmlFor="contact" className="flex flex-col gap-2 text-sm font-semibold">
            Contact number
            <input id="contact" name="contact" type="tel" required inputMode="tel" autoComplete="tel" placeholder="09171234567" className={fieldClass} />
          </label>
          <label htmlFor="password" className="flex flex-col gap-2 text-sm font-semibold">
            Password
            <span className="relative">
              <input id="password" name="password" type={showPassword ? 'text' : 'password'} required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" className={`${fieldClass} pr-20`} />
              <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#C8431B] hover:underline">
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>
          <label htmlFor="confirmPassword" className="flex flex-col gap-2 text-sm font-semibold">
            Confirm password
            <input id="confirmPassword" name="confirmPassword" type={showPassword ? 'text' : 'password'} required minLength={8} autoComplete="new-password" placeholder="Repeat your password" className={fieldClass} />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending || !ready} className="mt-2 h-12 w-full justify-center rounded-lg bg-[#C8431B] text-base font-semibold text-white shadow-none hover:bg-[#A93615]">
            {pending ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Already have an account? <Link href="/login" className="font-semibold text-[#C8431B] underline underline-offset-4">Sign in</Link>
        </p>
      </section>
    </AuthShell>
  );
}