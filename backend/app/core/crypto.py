"""AES-256 encryption for sensitive config values.

Encrypted values are stored as 'ENC:<base64>' in .env files.
Decrypted at runtime using MASTER_KEY environment variable.
MASTER_KEY is never written to disk.
"""

import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ENC_PREFIX = "ENC:"


def _derive_key(master_key: str) -> bytes:
    """Derive a 256-bit AES key from the master password."""
    return hashlib.sha256(master_key.encode()).digest()


def encrypt(plaintext: str, master_key: str) -> str:
    """Encrypt a string and return 'ENC:<base64(nonce+ciphertext)>'."""
    key = _derive_key(master_key)
    nonce = os.urandom(12)  # 96-bit nonce for AES-GCM
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)
    encoded = base64.b64encode(nonce + ciphertext).decode()
    return f"{ENC_PREFIX}{encoded}"


def decrypt(encrypted: str, master_key: str) -> str:
    """Decrypt an 'ENC:<base64>' value back to plaintext."""
    if not encrypted.startswith(ENC_PREFIX):
        return encrypted  # not encrypted, return as-is
    raw = base64.b64decode(encrypted[len(ENC_PREFIX):])
    nonce = raw[:12]
    ciphertext = raw[12:]
    key = _derive_key(master_key)
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, None).decode()


def is_encrypted(value: str) -> bool:
    return value.startswith(ENC_PREFIX)
