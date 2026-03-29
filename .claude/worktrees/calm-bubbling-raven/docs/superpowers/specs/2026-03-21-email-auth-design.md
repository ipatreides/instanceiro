# Email + Password Authentication

## Goal

Allow users to create accounts with email + password as an alternative to Google OAuth. Email confirmation required.

## Landing Page Changes

Current: single "Entrar com Google" button.

New layout:
- "Entrar com Google" button (existing)
- Divider "ou"
- "Criar conta" button → navigates to /signup
- "Já tem conta? Entrar" link → navigates to /login

## New Pages

### /signup

Form fields:
- Email
- Senha (min 6 chars)
- Confirmar senha

Submit: `supabase.auth.signUp({ email, password })`

After submit: show success message "Verifique seu email para confirmar a conta. Enviamos um link de confirmação."

Validation: email format, password min 6, passwords match.

### /login

Form fields:
- Email
- Senha

Submit: `supabase.auth.signInWithPassword({ email, password })`

On success: redirect to /dashboard (or /onboarding if not completed).

Links:
- "Esqueceu a senha?" → /forgot-password
- "Criar conta" → /signup
- "Entrar com Google" button also available

Error handling: "Email ou senha incorretos", "Email não confirmado".

### /forgot-password

Single email input. Submit: `supabase.auth.resetPasswordForEmail(email)`.

Show success: "Se o email existir, enviamos um link para redefinir sua senha."

### /reset-password

Password + confirm password form. Shown when user clicks the reset link from email.

Submit: `supabase.auth.updateUser({ password })`.

On success: redirect to /login with success message.

## Profile Trigger

The existing `handle_new_user()` trigger works for both Google and email signups. For email users, `display_name` will be null initially — can be set during onboarding or on the profile page.

## Supabase Config

Confirm Email Auth is enabled in Supabase Dashboard > Authentication > Providers > Email.

## Auth Callback

The existing `/auth/callback` route handles Google OAuth. Email auth doesn't use this route — it goes through direct signIn/signUp API calls.

Password reset uses a different flow: Supabase sends a link that includes a token, which the client exchanges via `supabase.auth.onAuthStateChange`.

## Files

- Modify: `src/app/page.tsx` — add signup/login links
- Create: `src/app/signup/page.tsx`
- Create: `src/app/login/page.tsx`
- Create: `src/app/forgot-password/page.tsx`
- Create: `src/app/reset-password/page.tsx`
- Theme: all pages use the purple Claudinho theme
