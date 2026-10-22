# LDaCA Wordflow server image (issue 411): a hosted, multi-user Wordflow.
# Built by .github/workflows/server-image.yml (manual dispatch) from the wheel
# of the chosen ref. Settings and secrets come from the environment at run
# time (docs/runbooks/server-image.md); nothing secret is baked into the image.
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # Models fetched at build time live here, readable by any uid and written
    # by none: at run time new downloads go under DATA_ROOT (issue 425).
    HF_HOME=/opt/wordflow/models/huggingface \
    XDG_CACHE_HOME=/opt/wordflow/cache \
    LINDERA_DICT_PATH=/opt/wordflow/cache/lindera \
    # The container may run as any uid, with no passwd entry or home folder.
    HOME=/tmp \
    DATA_ROOT=/data

RUN apt-get update \
    && apt-get install -y --no-install-recommends tini ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --no-create-home --uid 10001 --home-dir /tmp wordflow

# Dependencies at exactly the versions in backend/uv.lock, which CI tested
# (deploy/docker/lock-constraints.sh writes dist/constraints.txt; issue 427).
COPY dist/*.whl dist/constraints.txt deploy/docker/check_pins.py /tmp/wheels/
RUN pip install -c /tmp/wheels/constraints.txt /tmp/wheels/*.whl \
    && pip check \
    && python /tmp/wheels/check_pins.py /tmp/wheels/constraints.txt \
    && rm -rf /tmp/wheels

COPY deploy/docker/prefetch_models.py /opt/wordflow/prefetch_models.py
RUN python /opt/wordflow/prefetch_models.py \
    && mkdir -p /opt/wordflow/cache/lindera /data \
    && chmod -R a+rX,go-w /opt/wordflow \
    && chown wordflow:wordflow /data

# The default user; a cluster may run the image as any uid/gid instead
# (docs/runbooks/server-image.md, "Running as another user").
USER wordflow
WORKDIR /tmp
VOLUME ["/data"]
EXPOSE 8001

# tini forwards SIGTERM to the backend only; the backend stops its own
# Analysis workers and marks them interrupted (as KillMode=mixed in systemd).
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["ldaca-wordflow", "--multi-user", "--host", "0.0.0.0", "--port", "8001"]
