# Build context is the verified Linux server package directory, not the repository.
FROM debian:trixie-slim
ARG WORDFLOW_VERSION=8.0.0
LABEL org.wordflow.version=$WORDFLOW_VERSION org.wordflow.protocol="1"
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libstdc++6 && rm -rf /var/lib/apt/lists/*
COPY wordflow-server /usr/local/bin/wordflow-server
COPY licenses /opt/wordflow/licenses
# Container root maps to the unprivileged service UID under the required rootless daemon.
USER 0:0
ENTRYPOINT ["/usr/local/bin/wordflow-server"]
