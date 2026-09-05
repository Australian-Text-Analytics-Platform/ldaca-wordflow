from __future__ import annotations
import pytest
from pydantic import ValidationError
from ldaca_wordflow.models.provider_credentials import (
    AnnotationProviderConfigurationCreate,
)


@pytest.mark.parametrize(
    ("base_url", "normalized"),
    [
        ("https://models.example.test/v1/", "https://models.example.test/v1"),
        ("http://10.0.0.8:8000/api/v1///", "http://10.0.0.8:8000/api/v1"),
        ("http://localhost:9999/v1/", "http://localhost:9999/v1"),
        ("http://127.0.0.1:9999/v1", "http://127.0.0.1:9999/v1"),
    ],
)
def test_custom_provider_accepts_and_normalizes_trusted_http_destinations(
    base_url: str,
    normalized: str,
) -> None:
    command = AnnotationProviderConfigurationCreate(
        name="Custom",
        provider="custom",
        base_url=base_url,
    )

    assert command.base_url == normalized
    assert command.api_key is None


@pytest.mark.parametrize(
    "base_url",
    [
        "ftp://models.example.test/v1",
        "https:///v1",
        "https://user:password@models.example.test/v1",
        "https://models.example.test/v1?token=secret",
        "https://models.example.test/v1#models",
    ],
)
def test_custom_provider_rejects_invalid_or_credential_bearing_urls(
    base_url: str,
) -> None:
    with pytest.raises(ValidationError):
        AnnotationProviderConfigurationCreate(
            name="Custom",
            provider="custom",
            base_url=base_url,
        )
