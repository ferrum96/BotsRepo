from __future__ import annotations


class MaxApiError(Exception):
    """HTTP error from MAX Platform API."""

    def __init__(self, status_code: int, message: str, *, retry_after: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.retry_after = retry_after


class MaxBadRequestError(MaxApiError):
    pass


class MaxAuthError(MaxApiError):
    pass


class MaxNotFoundError(MaxApiError):
    pass


class MaxRateLimitError(MaxApiError):
    pass


class MaxUnavailableError(MaxApiError):
    pass


class MaxPermissionError(MaxApiError):
    pass


_PERMISSION_MARKERS = (
    "permission",
    "forbidden",
    "not enough rights",
    "недостаточно прав",
    "нет прав",
    "access denied",
    "administrator",
)


def classify_max_error(
    status_code: int, body_text: str, *, retry_after: int | None = None
) -> MaxApiError:
    lowered = body_text.lower()
    if status_code == 401:
        return MaxAuthError(status_code, "MAX API 401: access token invalid or revoked")
    if status_code == 404:
        return MaxNotFoundError(status_code, f"MAX API 404: {body_text or 'not found'}")
    if status_code == 429:
        return MaxRateLimitError(
            status_code,
            "MAX API 429: rate limit exceeded",
            retry_after=retry_after,
        )
    if status_code == 503:
        return MaxUnavailableError(status_code, "MAX API 503: service unavailable")
    if status_code in {400, 403} and any(marker in lowered for marker in _PERMISSION_MARKERS):
        return MaxPermissionError(
            status_code,
            "MAX API: bot has no permission to post in the channel. "
            "Add the bot as channel admin with publish rights and retry.",
        )
    if status_code == 400:
        return MaxBadRequestError(status_code, f"MAX API 400: {body_text or 'bad request'}")
    return MaxApiError(status_code, f"MAX API {status_code}: {body_text or 'unexpected error'}")
