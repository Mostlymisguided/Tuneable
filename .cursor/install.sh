#!/usr/bin/env bash
# Idempotent repository bootstrap for the Tuneable Cloud Agent environment.
# Installs JS dependencies and writes development .env files (with placeholder
# secrets) for the backend and web frontend. Safe to run repeatedly.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Installing backend dependencies"
( cd tuneable-backend && npm install --no-audit --no-fund )

echo "==> Installing frontend (v2) dependencies"
( cd tuneable-frontend-v2 && npm install --no-audit --no-fund )

# Backend development environment. Placeholder values let optional integrations
# (Stripe, Resend email, Cloudflare R2, OAuth) initialize without real
# credentials; those features are inert in development but the server boots.
BACKEND_ENV="tuneable-backend/.env"
if [ ! -f "$BACKEND_ENV" ]; then
  echo "==> Writing $BACKEND_ENV"
  cat > "$BACKEND_ENV" <<'EOF'
# Local development environment (Cursor Cloud Agent)
MONGO_URI=mongodb://127.0.0.1:27017/tuneable
NODE_ENV=development
PORT=8000

# Secrets (development-only placeholders)
JWT_SECRET=dev-jwt-secret-change-me
SESSION_SECRET=dev-session-secret-change-me

# Frontend URL for links/CORS
FRONTEND_URL=http://localhost:5173

# Stripe (test placeholders — payments disabled without real keys)
STRIPE_SECRET_KEY_TEST=sk_test_placeholder
STRIPE_PUBLISHABLE_KEY_TEST=pk_test_placeholder

# Email (Resend) — placeholder key so the client initializes; sending is inert in dev
RESEND_API_KEY=re_placeholder_dev_key
EMAIL_FROM=onboarding@resend.dev
ADMIN_EMAIL=admin@example.com

# Cloudflare R2 — placeholders so upload modules initialize.
# Label/collective logo uploads require real R2 credentials; other features run fine.
R2_ENDPOINT=https://placeholder.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=placeholder
R2_SECRET_ACCESS_KEY=placeholder
R2_BUCKET_NAME=tuneable-uploads-dev
R2_PUBLIC_URL=http://localhost:8000/uploads

# OAuth / third-party integrations are optional and remain unconfigured in dev.
EOF
else
  echo "==> $BACKEND_ENV already exists, leaving untouched"
fi

# Frontend development environment.
FRONTEND_ENV="tuneable-frontend-v2/.env"
if [ ! -f "$FRONTEND_ENV" ]; then
  echo "==> Writing $FRONTEND_ENV"
  cat > "$FRONTEND_ENV" <<'EOF'
VITE_BACKEND_URL=http://localhost:8000
VITE_WEBSOCKET_URL=ws://localhost:8000
EOF
else
  echo "==> $FRONTEND_ENV already exists, leaving untouched"
fi

# MongoDB data directory (kept outside the repository checkout).
mkdir -p "$HOME/.tuneable/mongodb" "$HOME/.tuneable/log"

echo "==> Install complete"
