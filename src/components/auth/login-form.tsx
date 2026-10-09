"use client";

import { getFieldPlaceholder } from "@/components/ui/field-placeholder";
import { useActionState, useState } from "react";
import Link from "next/link";
import { ViewIcon, ViewOffSlashIcon, LockPasswordIcon, Mail01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginAction } from "@/app/auth/actions";

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [state, action, isPending] = useActionState(loginAction, {});

  return (
    <form className="space-y-5" action={action}>
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-slate-700">Email address</label>
        <div className="relative">
          <HugeiconsIcon icon={Mail01Icon} size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input id="email" name="email" type="email" autoComplete="email" placeholder={getFieldPlaceholder("Email address", { type: "email" })} required className="pl-11" />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-slate-700">Password</label>
        <div className="relative">
          <HugeiconsIcon icon={LockPasswordIcon} size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder={getFieldPlaceholder("Password", { type: showPassword ? "text" : "password" })} minLength={6} required className="px-11" />
          <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
            <HugeiconsIcon icon={showPassword ? ViewOffSlashIcon : ViewIcon} size={18} />
          </button>
        </div>
      </div>

      <div className="text-right"><Link href="/auth/forgot-password" className="text-xs font-semibold text-cyan-700 hover:underline">Forgot password?</Link></div>
      {state.message && <p role="alert" className="text-sm font-medium text-red-600">{state.message}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={isPending} aria-busy={isPending}>{isPending ? <><span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />Signing in</> : "Sign in"}</Button>
    </form>
  );
}
