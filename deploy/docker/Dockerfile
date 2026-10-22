# LDaCA Wordflow server image (issue 411): a hosted, multi-user Wordflow.
# Built by .github/workflows/server-image.yml (manual dispatch) from the wheel
# of the chosen ref. Settings and secrets come from the environment at run
# time (docs/runbooks/server-image.md); nothing secret is baked into the image.
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # Models fetched at build time live here; the app reads them at run time.
    HF_HOME=/opt/wordflow/models/huggingface \
    XDG_CACHE_HOME=/opt/wordflow/cache \
    DATA_ROOT=/data

RUN apt-get update \
    && apt-get install -y --no-install-recommends tini ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --uid 10001 --home-dir /home/wordflow wordflow

COPY dist/*.whl /tmp/wheels/
RUN pip install /tmp/wheels/*.whl && rm -rf /tmp/wheels

COPY deploy/docker/prefetch_models.py /opt/wordflow/prefetch_models.py
RUN python /opt/wordflow/prefetch_models.py \
    && mkdir -p /data \
    && chown -R wordflow:wordflow /opt/wordflow/cache /opt/wordflow/models /data

USER wordflow
WORKDIR /home/wordflow
VOLUME ["/data"]
EXPOSE 8001

# tini forwards SIGTERM to the backend only; the backend stops its own
# Analysis workers and marks them interrupted (as KillMode=mixed in systemd).
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["ldaca-wordflow", "--multi-user", "--host", "0.0.0.0", "--port", "8001"]
