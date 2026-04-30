#!/usr/bin/env bash

set -Eeuo pipefail

IFS=$'\n\t'

PROJECT_DIR="${PROJECT_DIR:-/home/opentalentpool}"
REPO_URL="${REPO_URL:-https://github.com/opentalentpool/open-talent-pool.git}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-opentalentpool}"
export COMPOSE_PROJECT_NAME

COMPOSE=(docker compose --profile production)

log() {
  printf '[deploy] %s\n' "$*"
}

fail() {
  printf '[deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

require_root() {
  if [ "${EUID}" -ne 0 ]; then
    fail "run this script as root on the VPS"
  fi
}

install_base_packages() {
  if command -v git >/dev/null 2>&1 && command -v curl >/dev/null 2>&1 && command -v openssl >/dev/null 2>&1; then
    return
  fi

  command -v apt-get >/dev/null 2>&1 || fail "apt-get is required to install missing deployment prerequisites"

  log "Installing base deployment prerequisites"
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git openssl
}

install_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    command -v curl >/dev/null 2>&1 || fail "curl is required to install Docker"
    log "Installing Docker Engine"
    curl -fsSL https://get.docker.com -o /tmp/open-talent-pool-get-docker.sh
    sh /tmp/open-talent-pool-get-docker.sh
    rm -f /tmp/open-talent-pool-get-docker.sh
  fi

  if command -v systemctl >/dev/null 2>&1; then
    systemctl enable --now docker >/dev/null 2>&1 || true
  fi

  docker info >/dev/null 2>&1 || fail "Docker Engine is not running"

  if ! docker compose version >/dev/null 2>&1; then
    command -v apt-get >/dev/null 2>&1 || fail "Docker Compose plugin is not available"
    log "Installing Docker Compose plugin"
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y docker-compose-plugin
  fi

  docker compose version >/dev/null 2>&1 || fail "Docker Compose plugin is not available"
}

sync_repository() {
  mkdir -p "$(dirname "$PROJECT_DIR")"

  if [ ! -d "$PROJECT_DIR/.git" ]; then
    if [ -e "$PROJECT_DIR" ] && [ -n "$(find "$PROJECT_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
      fail "$PROJECT_DIR exists but is not an empty git checkout"
    fi

    log "Cloning ${REPO_URL} into ${PROJECT_DIR}"
    git clone --branch "$DEPLOY_BRANCH" "$REPO_URL" "$PROJECT_DIR"
  fi

  cd "$PROJECT_DIR"

  if ! git diff --quiet || ! git diff --cached --quiet; then
    fail "working tree is dirty; commit or discard local changes before deployment"
  fi

  git remote set-url origin "$REPO_URL"
  git fetch origin "$DEPLOY_BRANCH"
  git checkout "$DEPLOY_BRANCH"
  git pull --ff-only origin "$DEPLOY_BRANCH"
}

reexec_after_pull() {
  if [ "${OPEN_TALENT_POOL_DEPLOY_REEXECUTED:-0}" = "1" ]; then
    return
  fi

  export OPEN_TALENT_POOL_DEPLOY_REEXECUTED=1
  exec "$PROJECT_DIR/deploy.sh" "$@"
}

normalize_domain() {
  local value="$1"
  value="${value#http://}"
  value="${value#https://}"
  value="${value%%/*}"
  printf '%s' "$value"
}

prompt_required() {
  local __target="$1"
  local label="$2"
  local default_value="${3:-}"
  local value

  while true; do
    if [ -n "$default_value" ]; then
      printf '%s [%s]: ' "$label" "$default_value" > /dev/tty
    else
      printf '%s: ' "$label" > /dev/tty
    fi

    IFS= read -r value < /dev/tty
    value="${value:-$default_value}"

    if [ -n "$value" ]; then
      printf -v "$__target" '%s' "$value"
      return
    fi
  done
}

prompt_secret() {
  local __target="$1"
  local label="$2"
  local value

  while true; do
    printf '%s: ' "$label" > /dev/tty
    IFS= read -rs value < /dev/tty
    printf '\n' > /dev/tty

    if [ -n "$value" ]; then
      printf -v "$__target" '%s' "$value"
      return
    fi
  done
}

prompt_bool() {
  local __target="$1"
  local label="$2"
  local default_value="$3"
  local value

  while true; do
    printf '%s [%s]: ' "$label" "$default_value" > /dev/tty
    IFS= read -r value < /dev/tty
    value="${value:-$default_value}"

    case "$value" in
      true|false)
        printf -v "$__target" '%s' "$value"
        return
        ;;
      *)
        printf 'Use true or false.\n' > /dev/tty
        ;;
    esac
  done
}

generate_secret() {
  openssl rand -base64 48 | tr '+/' '-_' | tr -d '=' | cut -c 1-64
}

escape_env_value() {
  local value="$1"
  value="${value//$'\r'/}"
  value="${value//$'\n'/}"
  value="${value//\'/\'\\\'\'}"
  printf "'%s'" "$value"
}

write_env_var() {
  local key="$1"
  local value="$2"

  printf '%s=' "$key"
  escape_env_value "$value"
  printf '\n'
}

ensure_production_env() {
  cd "$PROJECT_DIR"

  if [ -f .env ]; then
    chmod 600 .env
    log "Using existing .env"
    return
  fi

  [ -t 0 ] || [ -r /dev/tty ] || fail ".env is missing and interactive prompts are unavailable"

  local app_domain acme_email turnstile_site_key turnstile_secret_key
  local internal_account_email_domain internal_operations_admin_email
  local smtp_server smtp_port smtp_secure smtp_auth_required smtp_user smtp_pass smtp_from
  local postgres_password auth_code_pepper redis_password tmp_env

  log "Creating production .env"

  prompt_required app_domain "Public domain without scheme"
  app_domain="$(normalize_domain "$app_domain")"
  prompt_required acme_email "ACME certificate e-mail"
  prompt_required turnstile_site_key "Cloudflare Turnstile site key"
  prompt_secret turnstile_secret_key "Cloudflare Turnstile secret key"
  prompt_required internal_account_email_domain "Internal account e-mail domain" "$app_domain"
  prompt_required internal_operations_admin_email "Internal operations admin e-mail" "administrator@${internal_account_email_domain}"
  prompt_required smtp_server "SMTP server"
  prompt_required smtp_port "SMTP port" "465"
  prompt_bool smtp_secure "SMTP secure" "true"
  prompt_bool smtp_auth_required "SMTP auth required" "true"
  prompt_required smtp_user "SMTP user"
  prompt_secret smtp_pass "SMTP password"
  prompt_required smtp_from "SMTP from" "OpenTalentPool <${smtp_user}>"

  postgres_password="$(generate_secret)"
  auth_code_pepper="$(generate_secret)"
  redis_password="$(generate_secret)"

  umask 077
  tmp_env="$(mktemp .env.XXXXXX)"

  {
    printf '# Generated by deploy.sh. Do not commit this file.\n'
    write_env_var APP_DOMAIN "$app_domain"
    write_env_var ACME_EMAIL "$acme_email"
    write_env_var VITE_API_URL ""
    write_env_var VITE_TURNSTILE_SITE_KEY "$turnstile_site_key"
    write_env_var APP_BASE_URL "https://${app_domain}"
    write_env_var TRUSTED_ORIGINS "https://${app_domain}"
    write_env_var WEB_PUBLISHED_PORT "8080"
    write_env_var HTTP_PUBLISHED_PORT "80"
    write_env_var HTTPS_PUBLISHED_PORT "443"
    write_env_var POSTGRES_PUBLISHED_PORT "5432"
    write_env_var POSTGRES_HOST "db"
    write_env_var POSTGRES_PORT "5432"
    write_env_var POSTGRES_DB "otp"
    write_env_var POSTGRES_USER "otp"
    write_env_var POSTGRES_PASSWORD "$postgres_password"
    write_env_var AUTH_CODE_PEPPER "$auth_code_pepper"
    write_env_var TURNSTILE_SECRET_KEY "$turnstile_secret_key"
    write_env_var TRUST_PROXY "true"
    write_env_var COOKIE_DOMAIN ""
    write_env_var COOKIE_SECURE "true"
    write_env_var AUTH_SESSION_IDLE_HOURS "24"
    write_env_var AUTH_SESSION_MAX_DAYS "7"
    write_env_var INTERNAL_OPERATIONS_ADMIN_EMAIL "$internal_operations_admin_email"
    write_env_var INTERNAL_ACCOUNT_EMAIL_DOMAIN "$internal_account_email_domain"
    write_env_var ALERTS_DISPATCH_INTERVAL_SECONDS "900"
    write_env_var REDIS_USERNAME "otp_mail"
    write_env_var REDIS_PASSWORD "$redis_password"
    write_env_var MAIL_QUEUE_PREFIX "otp:mail"
    write_env_var MAIL_WORKER_CONCURRENCY "4"
    write_env_var MAIL_OUTBOX_POLL_INTERVAL_MS "5000"
    write_env_var MAIL_OUTBOX_BATCH_SIZE "25"
    write_env_var MAIL_RETRY_MAX_ATTEMPTS "5"
    write_env_var MAIL_RETRY_BASE_DELAY_MS "60000"
    write_env_var SMTP_SERVER "$smtp_server"
    write_env_var SMTP_PORT "$smtp_port"
    write_env_var SMTP_USER "$smtp_user"
    write_env_var SMTP_PASS "$smtp_pass"
    write_env_var SMTP_SECURE "$smtp_secure"
    write_env_var SMTP_AUTH_REQUIRED "$smtp_auth_required"
    write_env_var SMTP_FROM "$smtp_from"
    write_env_var DEBUG "false"
    write_env_var OTP_IN_MEMORY_DB "false"
    write_env_var ENABLE_TEST_ROUTES "false"
  } > "$tmp_env"

  mv "$tmp_env" .env
  chmod 600 .env
}

load_env_for_smoke_checks() {
  set -a
  # shellcheck disable=SC1091
  . "$PROJECT_DIR/.env"
  set +a
}

run_rollout() {
  cd "$PROJECT_DIR"

  log "Validating production Compose configuration"
  docker compose --profile production config --quiet

  log "Building and starting production Compose stack"
  docker compose --profile production up -d --build
}

wait_for_url() {
  local label="$1"
  local url="$2"
  local attempts="${3:-30}"
  local delay_seconds="${4:-5}"

  for attempt in $(seq 1 "$attempts"); do
    if curl -fsS --max-time 10 "$url" >/dev/null; then
      log "${label} is healthy"
      return
    fi

    log "Waiting for ${label} (${attempt}/${attempts})"
    sleep "$delay_seconds"
  done

  "${COMPOSE[@]}" logs --tail=200 server web proxy >&2 || true
  fail "${label} did not become healthy at ${url}"
}

run_smoke_checks() {
  cd "$PROJECT_DIR"
  load_env_for_smoke_checks

  local web_port="${WEB_PUBLISHED_PORT:-8080}"
  local public_domain="${APP_DOMAIN:?APP_DOMAIN must be configured}"

  wait_for_url "local API healthcheck" "http://127.0.0.1:${web_port}/api/health" 30 5
  wait_for_url "public API healthcheck" "https://${public_domain}/api/health" 30 10

  if ! curl -fsSI --max-time 10 "https://${public_domain}/" | grep -qi '^content-security-policy:'; then
    fail "public frontend response is missing the Content-Security-Policy header"
  fi

  log "Frontend security headers are present"
  "${COMPOSE[@]}" ps
}

main() {
  require_root
  install_base_packages
  sync_repository
  reexec_after_pull "$@"
  install_docker
  ensure_production_env
  run_rollout
  run_smoke_checks
  log "Deployment completed"
}

main "$@"
