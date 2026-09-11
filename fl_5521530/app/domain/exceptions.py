from __future__ import annotations


class DomainError(Exception):
    """Base domain error with a user-facing message."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class AccessDeniedError(DomainError):
    pass


class ValidationError(DomainError):
    pass


class ProductNotFoundError(DomainError):
    pass


class ContentNotFoundError(DomainError):
    pass


class PublicationNotFoundError(DomainError):
    pass


class DuplicatePublicationError(DomainError):
    pass


class ChannelNotConfiguredError(DomainError):
    pass


class ImageProcessingError(DomainError):
    pass


class AIGenerationError(DomainError):
    pass


class CatalogImportError(DomainError):
    pass
