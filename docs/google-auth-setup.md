# Google Sign-In Setup for Shaggy-Dogg DEX

This guide configures the Google button on the Shaggy-Dogg DEX admin page to sign in through Supabase Auth.

The local admin page runs at:

```text
http://localhost:5173/admin
```

The Supabase project used by this app is:

```text
Project ref: kedtpoczmattmsagnpkp
Project URL: https://kedtpoczmattmsagnpkp.supabase.co
OAuth callback URL: https://kedtpoczmattmsagnpkp.supabase.co/auth/v1/callback
```

## How the Flow Works

The app starts Google sign-in from the admin page with Supabase Auth. Supabase redirects the browser to Google, Google redirects back to Supabase, and Supabase returns the user to:

```text
http://localhost:5173/admin
```

That means there are two different redirect settings:

- Google Cloud must allow Supabase's OAuth callback URL.
- Supabase must allow the app's local admin URL.

Do not put `http://localhost:5173/admin` in Google OAuth redirect URIs. That URL belongs in Supabase.

## 1. Create the Google OAuth Client

Open Google Cloud Console:

```text
https://console.cloud.google.com/apis/credentials
```

Make sure the selected project is:

```text
lucid-arc-171620
```

Create an OAuth client:

1. Go to **APIs & Services -> Credentials**.
2. Click **Create Credentials**.
3. Choose **OAuth client ID**.
4. Set **Application type** to **Web application**.
5. Set **Name** to:

```text
Shaggy-Dogg
```

Under **Authorized JavaScript origins**, add:

```text
http://localhost:5173
```

Under **Authorized redirect URIs**, add:

```text
https://kedtpoczmattmsagnpkp.supabase.co/auth/v1/callback
```

Click **Create**.

Google will give you:

- Client ID
- Client Secret

For this app, the current Google OAuth client ID is:

```text
711227544056-78o8o3bedflr88ms1e1imk14dibfe7pt.apps.googleusercontent.com
```

Do not commit the client secret to this repository. Store it only in Supabase provider settings.

## 2. Configure the Supabase Google Provider

Open the Supabase dashboard:

```text
https://supabase.com/dashboard/project/kedtpoczmattmsagnpkp
```

Then go to:

```text
Authentication -> Sign In / Providers -> Google
```

Configure Google:

1. Enable **Sign in with Google**.
2. In **Client IDs**, paste the Google OAuth client ID.
3. In **Client Secret**, paste the Google OAuth client secret.
4. Leave **Skip nonce checks** off.
5. Leave **Allow users without an email** off.
6. Confirm the displayed callback URL is:

```text
https://kedtpoczmattmsagnpkp.supabase.co/auth/v1/callback
```

Click **Save**.

## 3. Configure Supabase Redirect URLs

In the Supabase dashboard, go to:

```text
Authentication -> URL Configuration
```

Set **Site URL** to:

```text
http://localhost:5173
```

Add this to **Redirect URLs** or **Additional Redirect URLs**:

```text
http://localhost:5173/admin
```

Click **Save**.

## 4. Confirm Local Environment Variables

The frontend needs the Supabase project URL and publishable key in `.env.local`.

Expected values:

```text
VITE_SUPABASE_URL=https://kedtpoczmattmsagnpkp.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

Restart the Vite dev server after changing `.env.local`.

## 5. Test the Google Button

Start the local app if it is not already running:

```bash
npm run dev
```

Open:

```text
http://localhost:5173/admin
```

Click the Google sign-in button.

Expected result:

1. Browser opens Google's OAuth consent/sign-in page.
2. Google returns to Supabase.
3. Supabase returns to `http://localhost:5173/admin`.
4. A Supabase Auth user is created or reused for the Google account.

## 6. Promote the Signed-In User to Admin

After signing in once with Google, Supabase should have a user and a matching profile row.

Open:

```text
supabase/promote-admin.sql
```

Replace:

```text
your-google-email@example.com
```

with the email address used for Google sign-in.

Run the SQL in:

```text
Supabase Dashboard -> SQL Editor
```

Then sign out and sign back in at:

```text
http://localhost:5173/admin
```

## Troubleshooting

If Google says `redirect_uri_mismatch`, check Google Cloud:

```text
Authorized redirect URIs:
https://kedtpoczmattmsagnpkp.supabase.co/auth/v1/callback
```

If Supabase refuses to redirect back to the admin page, check Supabase:

```text
Authentication -> URL Configuration -> Redirect URLs:
http://localhost:5173/admin
```

If the Google button does nothing, confirm the Vite dev server is running at:

```text
http://localhost:5173
```

If sign-in works but the admin page says the user is not authorized, run `supabase/promote-admin.sql` for the Google email address used to sign in.

## Secret Rotation Note

If the Google OAuth client secret was pasted into chat, screenshots, logs, or any other shared place, rotate it:

1. Go to **Google Cloud Console -> APIs & Services -> Credentials**.
2. Open the `Shaggy-Dogg` OAuth client.
3. Click **Add secret**.
4. Copy the new secret immediately.
5. Paste the new secret into **Supabase -> Authentication -> Sign In / Providers -> Google**.
6. Save Supabase provider settings.
7. Disable or delete the old exposed secret in Google Cloud.

