from __future__ import annotations

import json
import math
import os
import re
import socket
import threading
import time
import urllib.error
import urllib.request
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from ipaddress import ip_address
from typing import Any, Callable, Mapping
from urllib.parse import urlencode, urlsplit, urlunsplit


DEFAULT_BASE_URL = "https://vamsys.io/api/v3/operations"
DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024
TRANSIENT_STATUSES = frozenset({408, 429, 500, 502, 503, 504})
_MISSING = object()


class VamsysError(Exception):
    """Base error whose message is safe for sanitized diagnostics."""

    code = "vamsys_error"


class ConfigurationError(VamsysError):
    code = "configuration_error"


class TransportError(VamsysError):
    code = "transport_error"


class ResponseError(VamsysError):
    code = "http_error"

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class ResponseValidationError(VamsysError):
    code = "response_validation_error"


def redact(text: str, secrets: tuple[str, ...] | list[str]) -> str:
    """Redact supplied values and Bearer credentials without logging the input."""

    result = str(text)
    for secret in sorted((value for value in secrets if value), key=len, reverse=True):
        result = result.replace(secret, "[REDACTED]")
    return re.sub(r"(?i)Bearer\s+[^\s,;]+", "Bearer [REDACTED]", result)


def _is_loopback(hostname: str | None) -> bool:
    if hostname == "localhost":
        return True
    try:
        return ip_address(hostname or "").is_loopback
    except ValueError:
        return False


def _validate_url(url: str, allow_loopback_http: bool, label: str) -> str:
    if not isinstance(url, str) or not url.strip():
        raise ConfigurationError(f"{label} is required")
    try:
        split = urlsplit(url.strip())
        _ = split.port
    except ValueError as error:
        raise ConfigurationError(f"{label} is invalid") from None
    if split.scheme == "http":
        if not (allow_loopback_http and _is_loopback(split.hostname)):
            raise ConfigurationError(f"{label} must use HTTPS")
    elif split.scheme != "https":
        raise ConfigurationError(f"{label} must use HTTPS")
    if not split.hostname or split.username or split.password:
        raise ConfigurationError(f"{label} must not contain user information")
    if split.query or split.fragment:
        raise ConfigurationError(f"{label} must not contain a query or fragment")
    if any(ord(character) < 32 for character in url):
        raise ConfigurationError(f"{label} contains invalid characters")
    return url.strip().rstrip("/")


def _bounded_number(value: Any, name: str, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ConfigurationError(f"{name} must be numeric")
    value = float(value)
    if not math.isfinite(value) or not minimum <= value <= maximum:
        raise ConfigurationError(f"{name} is outside its permitted bounds")
    return value


def _bounded_integer(value: Any, name: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise ConfigurationError(f"{name} is outside its permitted bounds")
    return value


@dataclass(frozen=True)
class ClientConfig:
    base_url: str
    client_id: str = field(repr=False)
    client_secret: str = field(repr=False)
    token_url: str | None = None
    timeout: float = 10.0
    total_timeout: float = 60.0
    max_response_bytes: int = DEFAULT_MAX_RESPONSE_BYTES
    max_retries: int = 2
    backoff_base: float = 0.25
    max_retry_delay: float = 5.0
    max_pages: int = 100
    max_items: int = 10_000
    allow_loopback_http: bool = False

    def __post_init__(self) -> None:
        if not isinstance(self.client_id, str) or not self.client_id:
            raise ConfigurationError("VAMSYS_CLIENT_ID is required")
        if not isinstance(self.client_secret, str) or not self.client_secret:
            raise ConfigurationError("VAMSYS_CLIENT_SECRET is required")
        if not isinstance(self.allow_loopback_http, bool):
            raise ConfigurationError("allow_loopback_http must be Boolean")
        normalized_base = _validate_url(self.base_url, self.allow_loopback_http, "VAMSYS_BASE_URL")
        object.__setattr__(self, "base_url", normalized_base)
        if self.token_url is None:
            split = urlsplit(normalized_base)
            derived = urlunsplit((split.scheme, split.netloc, "/oauth/token", "", ""))
            object.__setattr__(self, "token_url", derived)
        else:
            object.__setattr__(
                self,
                "token_url",
                _validate_url(self.token_url, self.allow_loopback_http, "token URL"),
            )
        _bounded_number(self.timeout, "timeout", 0.01, 120.0)
        _bounded_number(self.total_timeout, "total_timeout", 0.01, 300.0)
        if self.total_timeout < self.timeout:
            raise ConfigurationError("total_timeout must be at least timeout")
        _bounded_integer(self.max_response_bytes, "max_response_bytes", 64, 16 * 1024 * 1024)
        _bounded_integer(self.max_retries, "max_retries", 0, 5)
        _bounded_number(self.backoff_base, "backoff_base", 0.0, 60.0)
        _bounded_number(self.max_retry_delay, "max_retry_delay", 0.0, 60.0)
        if self.max_retry_delay < self.backoff_base:
            raise ConfigurationError("max_retry_delay must be at least backoff_base")
        _bounded_integer(self.max_pages, "max_pages", 1, 1000)
        _bounded_integer(self.max_items, "max_items", 1, 100_000)

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> "ClientConfig":
        env = os.environ if environ is None else environ
        return cls(
            base_url=env.get("VAMSYS_BASE_URL", ""),
            client_id=env.get("VAMSYS_CLIENT_ID", ""),
            client_secret=env.get("VAMSYS_CLIENT_SECRET", ""),
            token_url=env.get("VAMSYS_TOKEN_URL") or None,
            allow_loopback_http=env.get("VAMSYS_ALLOW_LOOPBACK_HTTP") == "1",
        )


class RateLimiter:
    """Rolling-window limiter; defaults to vAMSYS's 100 requests per minute."""

    def __init__(
        self,
        limit: int = 100,
        period: float = 60.0,
        clock: Callable[[], float] = time.monotonic,
        sleeper: Callable[[float], None] = time.sleep,
    ) -> None:
        _bounded_integer(limit, "rate limit", 1, 100)
        _bounded_number(period, "rate period", 0.001, 60.0)
        self.limit = limit
        self.period = float(period)
        self._clock = clock
        self._sleeper = sleeper
        self._requests: deque[float] = deque()
        self._lock = threading.Lock()

    def wait(self) -> None:
        with self._lock:
            while True:
                now = self._clock()
                while self._requests and self._requests[0] <= now - self.period:
                    self._requests.popleft()
                if len(self._requests) < self.limit:
                    self._requests.append(now)
                    return
                delay = max(0.0, self._requests[0] + self.period - now)
                self._sleeper(delay)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> None:
        return None


def _json_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ResponseValidationError("JSON response contains a duplicate key")
        result[key] = value
    return result


def _reject_constant(value: str) -> None:
    raise ResponseValidationError("JSON response contains a non-finite number")


def _parse_json(body: bytes) -> Any:
    try:
        text = body.decode("utf-8")
    except UnicodeDecodeError:
        raise ResponseValidationError("JSON response is not valid UTF-8") from None
    try:
        return json.loads(text, object_pairs_hook=_json_pairs, parse_constant=_reject_constant)
    except ResponseValidationError:
        raise
    except (json.JSONDecodeError, RecursionError):
        raise ResponseValidationError("response body is malformed JSON") from None


class VamsysClient:
    def __init__(
        self,
        config: ClientConfig,
        *,
        clock: Callable[[], float] = time.monotonic,
        wall_clock: Callable[[], float] = time.time,
        sleeper: Callable[[float], None] = time.sleep,
        limiter: RateLimiter | None = None,
        opener: Any = None,
    ) -> None:
        self.config = config
        self._clock = clock
        self._wall_clock = wall_clock
        self._sleeper = sleeper
        self._limiter = limiter or RateLimiter(clock=clock, sleeper=sleeper)
        self._opener = opener or urllib.request.build_opener(_NoRedirect())
        self._access_token: str | None = None
        self._token_expires_at = 0.0
        self._token_refresh_skew = 0.0
        self._token_lock = threading.Lock()

    def _resource_url(self, path: str, query: Mapping[str, Any] | None) -> str:
        if not isinstance(path, str) or not path.startswith("/") or path.startswith("//"):
            raise ConfigurationError("resource path must be relative to the Operations API")
        if any(character in path for character in ("\\", "?", "#")):
            raise ConfigurationError("resource path contains unsupported characters")
        split = urlsplit(path)
        if split.scheme or split.netloc or any(segment in (".", "..") for segment in split.path.split("/")):
            raise ConfigurationError("resource path is not safe")
        if any(ord(character) < 32 for character in path):
            raise ConfigurationError("resource path contains invalid characters")
        encoded_query = urlencode(query or {}, doseq=True)
        return self.config.base_url + path + (("?" + encoded_query) if encoded_query else "")

    def _read_response(self, response: Any) -> tuple[int, Any, bytes | None]:
        status = int(response.status)
        headers = response.headers
        try:
            if status != 200:
                return status, headers, None
            content_type = headers.get_content_type() if hasattr(headers, "get_content_type") else "application/json"
            if content_type != "application/json" and not content_type.endswith("+json"):
                raise ResponseValidationError("response Content-Type is not JSON")
            encoding = headers.get("Content-Encoding", "identity").lower()
            if encoding != "identity":
                raise ResponseValidationError("compressed responses are not accepted")
            length = headers.get("Content-Length")
            if length is not None:
                try:
                    declared = int(length)
                except ValueError:
                    raise ResponseValidationError("response Content-Length is invalid") from None
                if declared < 0 or declared > self.config.max_response_bytes:
                    raise ResponseValidationError("response size exceeds the configured bound")
            body = response.read(self.config.max_response_bytes + 1)
            if len(body) > self.config.max_response_bytes:
                raise ResponseValidationError("response size exceeds the configured bound")
            return status, headers, body
        finally:
            response.close()

    def _single_attempt(self, request: urllib.request.Request, timeout: float) -> tuple[int, Any, bytes | None]:
        try:
            response = self._opener.open(request, timeout=timeout)
        except urllib.error.HTTPError as error:
            status = int(error.code)
            headers = error.headers
            error.close()
            return status, headers, None
        return self._read_response(response)

    def _retry_delay(self, headers: Any, attempt: int) -> float:
        value = headers.get("Retry-After") if headers is not None else None
        delay: float | None = None
        if value:
            try:
                delay = float(value)
                if not math.isfinite(delay) or delay < 0:
                    delay = None
            except ValueError:
                try:
                    parsed = parsedate_to_datetime(value)
                    if parsed.tzinfo is None:
                        parsed = parsed.replace(tzinfo=timezone.utc)
                    delay = max(0.0, parsed.timestamp() - self._wall_clock())
                except (TypeError, ValueError, OverflowError):
                    delay = None
        if delay is None:
            delay = self.config.backoff_base * (2**attempt)
        return min(delay, self.config.max_retry_delay)

    def _request_json(
        self,
        method: str,
        url: str,
        *,
        body: bytes | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> Any:
        if method not in ("GET", "POST"):
            raise ConfigurationError("only OAuth POST and resource GET are supported")
        self._limiter.wait()
        started = self._clock()
        request_headers = {
            "Accept": "application/json",
            "Accept-Encoding": "identity",
            "User-Agent": "crossroads-vamsys-readonly/1",
        }
        if headers:
            request_headers.update(headers)
        last_transport_failure = False
        for attempt in range(self.config.max_retries + 1):
            elapsed = self._clock() - started
            remaining = self.config.total_timeout - elapsed
            if remaining <= 0:
                raise TransportError(f"{method} request exceeded its total time bound")
            request = urllib.request.Request(
                url,
                data=body,
                headers=request_headers,
                method=method,
            )
            try:
                status, response_headers, response_body = self._single_attempt(
                    request, min(self.config.timeout, remaining)
                )
                last_transport_failure = False
            except (urllib.error.URLError, TimeoutError, socket.timeout, OSError):
                last_transport_failure = True
                status = None
                response_headers = None
                response_body = None
            transient_network = last_transport_failure
            transient_status = status in TRANSIENT_STATUSES
            if (transient_network or transient_status) and attempt < self.config.max_retries:
                delay = self._retry_delay(response_headers, attempt)
                if self._clock() - started + delay > self.config.total_timeout:
                    raise TransportError(f"{method} retry would exceed its total time bound")
                self._sleeper(delay)
                self._limiter.wait()
                continue
            if transient_network:
                raise TransportError(f"{method} request failed after bounded retries")
            if status != 200:
                raise ResponseError(f"{method} request returned HTTP {status}", status)
            return _parse_json(response_body or b"")
        raise TransportError(f"{method} request failed")

    def _acquire_token(self) -> tuple[str, float]:
        form = urlencode(
            {
                "grant_type": "client_credentials",
                "client_id": self.config.client_id,
                "client_secret": self.config.client_secret,
                "scope": "ops:read",
            }
        ).encode("ascii")
        payload = self._request_json(
            "POST",
            self.config.token_url or "",
            body=form,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if not isinstance(payload, dict):
            raise ResponseValidationError("token response must be a JSON object")
        token = payload.get("access_token")
        token_type = payload.get("token_type")
        expires_in = payload.get("expires_in")
        if not isinstance(token, str) or not token.strip():
            raise ResponseValidationError("token response has no valid access_token")
        if not isinstance(token_type, str) or token_type.lower() != "bearer":
            raise ResponseValidationError("token response has an unsupported token_type")
        if isinstance(expires_in, bool) or not isinstance(expires_in, (int, float)):
            raise ResponseValidationError("token response has no valid expires_in")
        lifetime = float(expires_in)
        if not math.isfinite(lifetime) or lifetime <= 0 or lifetime > 31 * 24 * 3600:
            raise ResponseValidationError("token expiry is outside its permitted bounds")
        return token, lifetime

    def _bearer_token(self) -> str:
        with self._token_lock:
            now = self._clock()
            if self._access_token is None or now >= self._token_expires_at - self._token_refresh_skew:
                token, lifetime = self._acquire_token()
                self._access_token = token
                self._token_refresh_skew = min(30.0, lifetime * 0.1)
                self._token_expires_at = now + lifetime
            return self._access_token

    def get_json(self, path: str, query: Mapping[str, Any] | None = None) -> Any:
        resource_url = self._resource_url(path, query)
        token = self._bearer_token()
        payload = self._request_json(
            "GET",
            resource_url,
            headers={"Authorization": f"Bearer {token}"},
        )
        if not isinstance(payload, (dict, list)):
            raise ResponseValidationError("resource response must be a JSON object or array")
        return payload

    def get_collection(self, path: str, query: Mapping[str, Any] | None = None) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        cursor: str | None = None
        seen_cursors: set[str] = set()
        base_query = dict(query or {})
        for _page in range(self.config.max_pages):
            page_query = dict(base_query)
            if cursor is not None:
                page_query["page[cursor]"] = cursor
            payload = self.get_json(path, page_query)
            if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
                raise ResponseValidationError("collection response requires a data array")
            if not isinstance(payload.get("links"), list) or not isinstance(payload.get("meta"), dict):
                raise ResponseValidationError("collection response requires links and meta objects")
            for item in payload["data"]:
                if not isinstance(item, dict):
                    raise ResponseValidationError("collection items must be JSON objects")
                items.append(item)
                if len(items) > self.config.max_items:
                    raise ResponseValidationError("collection exceeds the configured item bound")
            next_cursor = payload["meta"].get("next_cursor")
            if next_cursor is None:
                return items
            if not isinstance(next_cursor, str) or not next_cursor or next_cursor in seen_cursors:
                raise ResponseValidationError("collection cursor is invalid or repeated")
            seen_cursors.add(next_cursor)
            cursor = next_cursor
        raise ResponseValidationError("collection exceeds the configured page bound")
