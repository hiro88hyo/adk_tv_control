FROM python:3.12-slim-bookworm

ARG USERNAME=vscode
ARG USER_UID=1000
ARG USER_GID=$USER_UID

RUN apt update && \
    apt -y install --reinstall ca-certificates && \
    apt -y install software-properties-common && \
    apt -y install git jq curl sudo && \
    apt clean && \
    rm -rf /var/lib/apt/lists/* 

RUN groupadd --gid $USER_GID $USERNAME \
    && useradd -s /bin/bash --uid $USER_UID --gid $USER_GID -m $USERNAME \
    && echo $USERNAME ALL=\(ALL\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME 

USER $USERNAME
WORKDIR /app

RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/home/${USERNAME}/.local/bin:${PATH}"

COPY --chown=${USERNAME}:${USERNAME} ../tv_control_agent/tv_control_agent/ /app/tv_control_agent/
COPY --chown=${USERNAME}:${USERNAME} ../tv_control_agent/pyproject.toml /app/pyproject.toml
COPY --chown=${USERNAME}:${USERNAME} ../tv_control_agent/uv.lock /app/uv.lock
COPY --chown=${USERNAME}:${USERNAME} --chmod=755 ../tv_control_agent/entrypoint.sh /app/entrypoint.sh

RUN uv sync --frozen --no-cache

ENTRYPOINT ["/app/entrypoint.sh"]