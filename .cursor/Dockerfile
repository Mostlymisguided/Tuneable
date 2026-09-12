# Base image for the Tuneable Cloud Agent environment.
# Provides the stable system toolchain: Node.js 22, MongoDB 8.0, and the
# native build dependencies required by npm packages such as bcrypt and sharp.
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Core OS packages + build toolchain for native node modules.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gnupg \
        git \
        build-essential \
        python3 \
        tmux \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22 (matches the runtime the project is developed against).
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# MongoDB 8.0 Community Server (local database for the backend).
RUN curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc \
        | gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor \
    && echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" \
        > /etc/apt/sources.list.d/mongodb-org-8.0.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends mongodb-org \
    && rm -rf /var/lib/apt/lists/*

# The `ubuntu` user (uid 1000) ships with the Ubuntu 24.04 base image and is the
# default user Cloud Agents run as.
USER ubuntu
