#!/bin/bash

set -a

if [ -f .env ]; then
  . ./.env
fi

set +a

pnpm run dev
