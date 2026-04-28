#!/bin/sh
set -eu

: "${REDIS_USERNAME:?REDIS_USERNAME is required}"
: "${REDIS_PASSWORD:?REDIS_PASSWORD is required}"
: "${MAIL_QUEUE_PREFIX:?MAIL_QUEUE_PREFIX is required}"

if [ "$REDIS_USERNAME" = "default" ]; then
  echo "REDIS_USERNAME must not be default" >&2
  exit 1
fi

case "$REDIS_PASSWORD" in
  change_me|change_this_in_production|replace_me|example|"")
    echo "REDIS_PASSWORD must not be a placeholder" >&2
    exit 1
    ;;
esac

mkdir -p /usr/local/etc/redis/generated

cat > /usr/local/etc/redis/generated/users.acl <<EOF
user default off
user ${REDIS_USERNAME} on >${REDIS_PASSWORD} ~${MAIL_QUEUE_PREFIX}:* +@all -@admin -FLUSHALL -FLUSHDB -CONFIG -SHUTDOWN -ACL -MODULE -DEBUG -MONITOR
EOF

cat > /usr/local/etc/redis/generated/redis.conf <<EOF
bind 0.0.0.0
protected-mode yes
port 6379
dir /data
appendonly yes
appendfsync everysec
aclfile /usr/local/etc/redis/generated/users.acl
maxmemory-policy noeviction
save 900 1
save 300 10
save 60 10000
EOF

exec redis-server /usr/local/etc/redis/generated/redis.conf
