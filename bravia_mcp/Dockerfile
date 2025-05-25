FROM node:22-bookworm-slim

ARG USERNAME=node

RUN apt update && \
    apt -y install --reinstall ca-certificates && \
    apt -y install software-properties-common && \
    apt -y install git jq curl procps && \
    apt clean && \
    rm -rf /var/lib/apt/lists/* 

RUN curl -s https://api.github.com/repos/cli/cli/releases/latest | jq .assets[].browser_download_url | grep linux_amd64.deb | xargs -I '{}' curl -sL -o /tmp/ghcli.deb '{}' && \
    dpkg -i /tmp/ghcli.deb && \
    rm /tmp/ghcli.deb

USER $USERNAME
WORKDIR /app


COPY --chown=${USERNAME}:${USERNAME} ../bravia_mcp/package.json ./
COPY --chown=${USERNAME}:${USERNAME} ../bravia_mcp/index.ts ./
COPY --chown=${USERNAME}:${USERNAME} ../bravia_mcp/tsconfig.json ./
COPY --chown=${USERNAME}:${USERNAME} ../bravia_mcp/.env ./
COPY --chown=${USERNAME}:${USERNAME} ../bravia_mcp/README.md ./
COPY --chown=${USERNAME}:${USERNAME} --chmod=755 ../bravia_mcp/entrypoint.sh /app/entrypoint.sh

RUN npm install
RUN npm run build

EXPOSE 3000
ENTRYPOINT [ "/app/entrypoint.sh" ]    