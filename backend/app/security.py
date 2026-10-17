from datetime import datetime, timedelta, timezone

import jwt
from pwdlib import PasswordHash

from app.config import get_settings

password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        return password_hash.verify(password, stored_hash)
    except Exception:
        return False


def create_access_token(user_id: str) -> tuple[str, int]:
    settings = get_settings()
    expires = settings.jwt_access_token_minutes * 60
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {"sub": user_id, "iss": settings.jwt_issuer, "iat": now, "exp": now + timedelta(seconds=expires)},
        settings.jwt_secret_key.get_secret_value(),
        algorithm="HS256",
    )
    return token, expires


def decode_access_token(token: str) -> str:
    settings = get_settings()
    payload = jwt.decode(token, settings.jwt_secret_key.get_secret_value(), algorithms=["HS256"], issuer=settings.jwt_issuer)
    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject:
        raise jwt.InvalidTokenError("Token subject is missing")
    return subject
