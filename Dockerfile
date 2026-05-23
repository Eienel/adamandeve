FROM node:22-slim

# System deps + Foundry (forge/anvil) via direct release download (no api.github.com needed)
RUN apt-get update && apt-get install -y curl ca-certificates git \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /root/.foundry/bin \
  && curl -L https://github.com/foundry-rs/foundry/releases/download/stable/foundry_stable_linux_amd64.tar.gz \
     | tar xz -C /root/.foundry/bin forge cast anvil chisel
ENV PATH="/root/.foundry/bin:${PATH}"

RUN npm install -g pnpm@10

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile \
  && (cd contracts && forge build)

# Local embedded-chain defaults (override RPC_URL etc. to target Arc).
ENV RPC_URL=http://127.0.0.1:8545
ENV DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
ENV DEPLOYMENTS_FILE=/app/deployments.local.json
ENV ARENA_DATA_FILE=/app/arena-data.json
ENV FLEET_SIZE=3
ENV APP_NAME="Forecast Arena"

# Railway provides $PORT for the web (dashboard/API).
CMD ["pnpm", "exec", "tsx", "scripts/serve.ts"]
