#!/usr/bin/env python3
# Single-file Django encryption server with CORS:
#   GET  /api/key       -> {"key": "<base64_fernet_key>"}
#   GET  /api/status    -> {"status": "ok"}
#   POST /api/encrypt   -> multipart: file, key  => encrypted bytes
#   POST /api/decrypt   -> multipart: file, key  => decrypted bytes
#
# Run:  python scripts/django-encryptor.py runserver 0.0.0.0:8000
# Or:   python scripts/django-encryptor.py

import os
import sys
import time
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from django.conf import settings

if not settings.configured:
  settings.configure(
    DEBUG=True,
    SECRET_KEY="bulletproof-p2p-encryption-server-key-2024",
    ROOT_URLCONF=__name__,
    ALLOWED_HOSTS=["*"],
    MIDDLEWARE=[
      "django.middleware.security.SecurityMiddleware",
      "django.middleware.common.CommonMiddleware",
    ],
    INSTALLED_APPS=[
      "django.contrib.contenttypes",
      "django.contrib.staticfiles",
    ],
    DEFAULT_CHARSET="utf-8",
    STATIC_URL="/static/",
    USE_TZ=True,
    FILE_UPLOAD_MAX_MEMORY_SIZE=100 * 1024 * 1024,
    DATA_UPLOAD_MAX_MEMORY_SIZE=100 * 1024 * 1024,
  )

from django.core.management import execute_from_command_line
from django.http import JsonResponse, HttpResponse, HttpRequest
from django.urls import path
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from cryptography.fernet import Fernet


def add_cors_headers(response: HttpResponse) -> HttpResponse:
  response["Access-Control-Allow-Origin"] = "*"
  response["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
  response["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
  response["Access-Control-Max-Age"] = "86400"
  return response


@require_http_methods(["OPTIONS"])
def handle_preflight(request: HttpRequest) -> HttpResponse:
  return add_cors_headers(HttpResponse(status=200))


@require_http_methods(["GET"])
def api_key(request: HttpRequest) -> HttpResponse:
  try:
    key = Fernet.generate_key().decode("utf-8")
    return add_cors_headers(JsonResponse({"key": key, "status": "success"}))
  except Exception as e:
    logger.error(f"Failed to generate key: {e}")
    return add_cors_headers(JsonResponse({"error": "Failed to generate key"}, status=500))


@require_http_methods(["GET"])
def api_status(request: HttpRequest) -> HttpResponse:
  try:
    tk = Fernet.generate_key()
    f = Fernet(tk)
    sample = b"ok"
    ok = f.decrypt(f.encrypt(sample)) == sample
    return add_cors_headers(JsonResponse({"status": "ok" if ok else "error", "service": "bulletproof-p2p-encryption-server", "timestamp": int(time.time())}))
  except Exception as e:
    logger.error(f"Status failed: {e}")
    return add_cors_headers(JsonResponse({"status": "error", "error": str(e)}, status=500))


@require_http_methods(["GET"])
def health_check(request: HttpRequest) -> HttpResponse:
  try:
    tk = Fernet.generate_key()
    f = Fernet(tk)
    data = b"health"
    ok = f.decrypt(f.encrypt(data)) == data
    return add_cors_headers(JsonResponse({"status": "healthy" if ok else "unhealthy", "service": "bulletproof-p2p-encryption-server", "timestamp": int(time.time())}))
  except Exception as e:
    logger.error(f"Health check failed: {e}")
    return add_cors_headers(JsonResponse({"status": "unhealthy", "error": str(e)}, status=500))


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def api_encrypt(request: HttpRequest) -> HttpResponse:
  if request.method == "OPTIONS":
    return handle_preflight(request)
  try:
    uploaded = request.FILES.get("file")
    key_str = request.POST.get("key")
    if not uploaded:
      return add_cors_headers(JsonResponse({"error": "No file provided"}, status=400))
    if not key_str:
      return add_cors_headers(JsonResponse({"error": "No encryption key provided"}, status=400))

    try:
      f = Fernet(key_str.encode("utf-8"))
    except Exception:
      return add_cors_headers(JsonResponse({"error": "Invalid encryption key format"}, status=400))

    max_size = 100 * 1024 * 1024
    if uploaded.size > max_size:
      return add_cors_headers(JsonResponse({"error": "File too large (max: 100MB)"}, status=400))

    data = uploaded.read()
    try:
      encrypted = f.encrypt(data)
    except Exception as e:
      logger.error(f"Encrypt failed: {e}")
      return add_cors_headers(JsonResponse({"error": "Encryption failed"}, status=500))

    resp = HttpResponse(encrypted, content_type="application/octet-stream")
    resp["Content-Disposition"] = f'attachment; filename="{uploaded.name}.enc"'
    resp["Content-Length"] = str(len(encrypted))
    return add_cors_headers(resp)
  except Exception as e:
    logger.error(f"Encryption error: {e}")
    return add_cors_headers(JsonResponse({"error": f"Encryption failed: {str(e)}"}, status=500))


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def api_decrypt(request: HttpRequest) -> HttpResponse:
  if request.method == "OPTIONS":
    return handle_preflight(request)
  try:
    uploaded = request.FILES.get("file")
    key_str = request.POST.get("key")
    if not uploaded:
      return add_cors_headers(JsonResponse({"error": "No file provided"}, status=400))
    if not key_str:
      return add_cors_headers(JsonResponse({"error": "No decryption key provided"}, status=400))

    try:
      f = Fernet(key_str.encode("utf-8"))
    except Exception:
      return add_cors_headers(JsonResponse({"error": "Invalid decryption key format"}, status=400))

    max_size = 100 * 1024 * 1024
    if uploaded.size > max_size:
      return add_cors_headers(JsonResponse({"error": "File too large (max: 100MB)"}, status=400))

    enc = uploaded.read()
    try:
      dec = f.decrypt(enc)
    except Exception:
      return add_cors_headers(JsonResponse({"error": "Decryption failed - invalid key or corrupted data"}, status=400))

    resp = HttpResponse(dec, content_type="application/octet-stream")
    name = uploaded.name[:-4] if uploaded.name.endswith(".enc") else uploaded.name
    resp["Content-Disposition"] = f'attachment; filename="{name}"'
    resp["Content-Length"] = str(len(dec))
    return add_cors_headers(resp)
  except Exception as e:
    logger.error(f"Decryption error: {e}")
    return add_cors_headers(JsonResponse({"error": f"Decryption failed: {str(e)}"}, status=500))


urlpatterns = [
  path("", health_check, name="health"),
  path("health/", health_check, name="health_check"),
  path("api/", api_status, name="api_status"),
  path("api/status/", api_status, name="api_status_alt"),
  path("api/key", api_key, name="api_key"),
  path("api/key/", api_key, name="api_key_alt"),
  path("api/encrypt", api_encrypt, name="api_encrypt"),
  path("api/encrypt/", api_encrypt, name="api_encrypt_alt"),
  path("api/decrypt", api_decrypt, name="api_decrypt"),
  path("api/decrypt/", api_decrypt, name="api_decrypt_alt"),
  # OPTIONS preflight (duplicates are OK here; Django matches first)
  path("api/key", handle_preflight),
  path("api/encrypt", handle_preflight),
  path("api/decrypt", handle_preflight),
]

if __name__ == "__main__":
  os.environ.setdefault("DJANGO_SETTINGS_MODULE", __name__)
  if len(sys.argv) == 1:
    port = os.environ.get("PORT", "8000")
    host = os.environ.get("HOST", "0.0.0.0")
    sys.argv.extend(["runserver", f"{host}:{port}"])
    logger.info(f"🔐 Starting Django encryption server on {host}:{port}")
    logger.info(f"→ GET  http://{host}:{port}/api/status/   (status)")
    logger.info(f"→ GET  http://{host}:{port}/api/key       (key)")
    logger.info(f"→ POST http://{host}:{port}/api/encrypt   (multipart: file, key)")
    logger.info(f"→ POST http://{host}:{port}/api/decrypt   (multipart: file, key)")
  execute_from_command_line(sys.argv)
