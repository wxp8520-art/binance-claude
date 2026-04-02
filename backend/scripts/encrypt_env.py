#!/usr/bin/env python3
"""CLI tool to encrypt/decrypt API keys in .env files.

Usage:
  python scripts/encrypt_env.py encrypt --master-key YOUR_PASSWORD
  python scripts/encrypt_env.py decrypt --master-key YOUR_PASSWORD
  python scripts/encrypt_env.py verify  --master-key YOUR_PASSWORD
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.crypto import encrypt, decrypt, is_encrypted

SENSITIVE_KEYS = {"BINANCE_API_KEY", "BINANCE_API_SECRET"}
ENV_PATH = os.path.join(os.path.dirname(__file__), "..", ".env")


def load_env(path: str) -> list[str]:
    with open(path) as f:
        return f.readlines()


def save_env(path: str, lines: list[str]):
    with open(path, "w") as f:
        f.writelines(lines)


def cmd_encrypt(master_key: str):
    lines = load_env(ENV_PATH)
    changed = 0
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if "=" in stripped and not stripped.startswith("#"):
            key, _, value = stripped.partition("=")
            if key in SENSITIVE_KEYS and not is_encrypted(value):
                enc_value = encrypt(value, master_key)
                new_lines.append(f"{key}={enc_value}\n")
                print(f"  Encrypted: {key}")
                changed += 1
                continue
        new_lines.append(line)
    if changed:
        save_env(ENV_PATH, new_lines)
        print(f"\n{changed} value(s) encrypted in .env")
    else:
        print("Nothing to encrypt (already encrypted or no sensitive keys found)")


def cmd_decrypt(master_key: str):
    lines = load_env(ENV_PATH)
    changed = 0
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if "=" in stripped and not stripped.startswith("#"):
            key, _, value = stripped.partition("=")
            if key in SENSITIVE_KEYS and is_encrypted(value):
                dec_value = decrypt(value, master_key)
                new_lines.append(f"{key}={dec_value}\n")
                print(f"  Decrypted: {key}")
                changed += 1
                continue
        new_lines.append(line)
    if changed:
        save_env(ENV_PATH, new_lines)
        print(f"\n{changed} value(s) decrypted in .env")
    else:
        print("Nothing to decrypt")


def cmd_verify(master_key: str):
    lines = load_env(ENV_PATH)
    for line in lines:
        stripped = line.strip()
        if "=" in stripped and not stripped.startswith("#"):
            key, _, value = stripped.partition("=")
            if key in SENSITIVE_KEYS:
                if is_encrypted(value):
                    try:
                        dec = decrypt(value, master_key)
                        print(f"  {key}: encrypted, decrypts to ...{dec[-6:]}")
                    except Exception:
                        print(f"  {key}: encrypted, WRONG MASTER KEY!")
                else:
                    print(f"  {key}: PLAINTEXT (run encrypt first)")


def main():
    parser = argparse.ArgumentParser(description="Encrypt/decrypt .env API keys")
    parser.add_argument("action", choices=["encrypt", "decrypt", "verify"])
    parser.add_argument("--master-key", required=True, help="Master encryption password")
    args = parser.parse_args()

    if args.action == "encrypt":
        cmd_encrypt(args.master_key)
    elif args.action == "decrypt":
        cmd_decrypt(args.master_key)
    elif args.action == "verify":
        cmd_verify(args.master_key)


if __name__ == "__main__":
    main()
