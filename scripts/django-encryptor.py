#!/usr/bin/env python3
# Enhanced single-file Django encryption server with CORS and three endpoints:
#   GET  /api/key       -> {"key": "<base64_fernet_key>"}
#   POST /api/encrypt   -> multipart: file, key  => encrypted bytes
#   POST /api/decrypt   -> multipart: file, key  => decrypted bytes
#
# Run:  python scripts/django-encryptor.py runserver 0.0.0.0:8000
# Or simply: python scripts/django-encryptor.py   (defaults to runserver 0.0.0.0:8000)

import os
import sys
import json
import time
import logging
from io import BytesIO

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Minimal Django bootstrap
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
    # File upload settings
    FILE_UPLOAD_MAX_MEMORY_SIZE=100 * 1024 * 1024,  # 100MB
    DATA_UPLOAD_MAX_MEMORY_SIZE=100 * 1024 * 1024,  # 100MB
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
  response = HttpResponse(status=200)
  return add_cors_headers(response)


@require_http_methods(["GET"])
def api_key(request: HttpRequest) -> HttpResponse:
  try:
    key = Fernet.generate_key().decode("utf-8")
    logger.info("Generated new encryption key")
    response = JsonResponse({"key": key, "status": "success"})
    return add_cors_headers(response)
  except Exception as e:
    logger.error(f"Failed to generate key: {e}")
    response = JsonResponse({"error": "Failed to generate key"}, status=500)
    return add_cors_headers(response)


@require_http_methods(["GET"])
def api_status(request: HttpRequest) -> HttpResponse:
  try:
    # quick crypto self-test
    tkey = Fernet.generate_key()
    f = Fernet(tkey)
    test = b"ok"
    dec = f.decrypt(f.encrypt(test))
    healthy = dec == test
    response = JsonResponse(
      {
        "status": "ok" if healthy else "error",
        "service": "bulletproof-p2p-encryption-server",
        "version": "1.0.0",
        "timestamp": int(time.time()),
      }
    )
    return add_cors_headers(response)
  except Exception as e:
    logger.error(f"Status failed: {e}")
    response = JsonResponse({"status": "error", "error": str(e)}, status=500)
    return add_cors_headers(response)


@require_http_methods(["GET"])
def health_check(request: HttpRequest) -> HttpResponse:
  try:
    test_key = Fernet.generate_key()
    f = Fernet(test_key)
    data = b"health check"
    ok = f.decrypt(f.encrypt(data)) == data
    response = JsonResponse(
      {
        "status": "healthy" if ok else "unhealthy",
        "service": "bulletproof-p2p-encryption-server",
        "version": "1.0.0",
        "encryption": "working" if ok else "error",
        "timestamp": int(time.time()),
      }
    )
    return add_cors_headers(response)
  except Exception as e:
    logger.error(f"Health check failed: {e}")
    response = JsonResponse({"status": "unhealthy", "error": str(e)}, status=500)
    return add_cors_headers(response)


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def api_encrypt(request: HttpRequest) -> HttpResponse:
  if request.method == "OPTIONS":
    return handle_preflight(request)
  try:
    uploaded_file = request.FILES.get("file")
    key_str = request.POST.get("key")

    if not uploaded_file:
      logger.warning("No file provided in encrypt request")
      return add_cors_headers(JsonResponse({"error": "No file provided"}, status=400))
    if not key_str:
      logger.warning("No encryption key provided in encrypt request")
      return add_cors_headers(JsonResponse({"error": "No encryption key provided"}, status=400))

    try:
      fernet = Fernet(key_str.encode("utf-8"))
    except Exception as e:
      logger.error(f"Invalid encryption key format: {e}")
      return add_cors_headers(JsonResponse({"error": "Invalid encryption key format"}, status=400))

    max_size = 100 * 1024 * 1024  # 100MB
    if uploaded_file.size > max_size:
      logger.warning(f"File too large: {uploaded_file.size} bytes (max: {max_size})")
      return add_cors_headers(
        JsonResponse({"error": f"File too large (max: {max_size // (1024*1024)}MB)"}, status=400)
      )

    file_data = uploaded_file.read()
    logger.info(f"Encrypting file: {uploaded_file.name} ({len(file_data)} bytes)")

    try:
      encrypted_data = fernet.encrypt(file_data)
    except Exception as e:
      logger.error(f"Encryption failed for {uploaded_file.name}: {e}")
      return add_cors_headers(JsonResponse({"error": f"Encryption failed: {str(e)}"}, status=500))

    response = HttpResponse(encrypted_data, content_type="application/octet-stream")
    response["Content-Disposition"] = f'attachment; filename="{uploaded_file.name}.enc"'
    response["Content-Length"] = str(len(encrypted_data))
    logger.info(f"Successfully encrypted file: {uploaded_file.name} -> {len(encrypted_data)} bytes")
    return add_cors_headers(response)

  except Exception as e:
    logger.error(f"Encryption failed: {e}")
    return add_cors_headers(JsonResponse({"error": f"Encryption failed: {str(e)}"}, status=500))


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def api_decrypt(request: HttpRequest) -> HttpResponse:
  if request.method == "OPTIONS":
    return handle_preflight(request)
  try:
    uploaded_file = request.FILES.get("file")
    key_str = request.POST.get("key")

    if not uploaded_file:
      logger.warning("No file provided in decrypt request")
      return add_cors_headers(JsonResponse({"error": "No file provided"}, status=400))
    if not key_str:
      logger.warning("No decryption key provided in decrypt request")
      return add_cors_headers(JsonResponse({"error": "No decryption key provided"}, status=400))

    try:
      fernet = Fernet(key_str.encode("utf-8"))
    except Exception as e:
      logger.error(f"Invalid decryption key format: {e}")
      return add_cors_headers(JsonResponse({"error": "Invalid decryption key format"}, status=400))

    max_size = 100 * 1024 * 1024  # 100MB
    if uploaded_file.size > max_size:
      logger.warning(f"File too large: {uploaded_file.size} bytes (max: {max_size})")
      return add_cors_headers(
        JsonResponse({"error": f"File too large (max: {max_size // (1024*1024)}MB)"}, status=400)
      )

    encrypted_data = uploaded_file.read()
    logger.info(f"Decrypting file: {uploaded_file.name} ({len(encrypted_data)} bytes)")

    try:
      decrypted_data = fernet.decrypt(encrypted_data)
    except Exception as e:
      logger.error(f"Decryption failed for {uploaded_file.name}: {e}")
      return add_cors_headers(
        JsonResponse({"error": "Decryption failed - invalid key or corrupted data"}, status=400)
      )

    response = HttpResponse(decrypted_data, content_type="application/octet-stream")
    original_name = uploaded_file.name[:-4] if uploaded_file.name.endswith(".enc") else uploaded_file.name
    response["Content-Disposition"] = f'attachment; filename="{original_name}"'
    response["Content-Length"] = str(len(decrypted_data))
    logger.info(f"Successfully decrypted file: {uploaded_file.name} -> {len(decrypted_data)} bytes")
    return add_cors_headers(response)

  except Exception as e:
    logger.error(f"Decryption failed: {e}")
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
  # OPTIONS handlers
  path("api/key", handle_preflight),
  path("api/encrypt", handle_preflight),
  path("api/decrypt", handle_preflight),
]

if __name__ == "__main__":
  os.environ.setdefault("DJANGO_SETTINGS_MODULE", __name__)
  # Default to runserver if no command provided
  if len(sys.argv) == 1:
    port = os.environ.get("PORT", "8000")
    host = os.environ.get("HOST", "0.0.0.0")
    sys.argv.extend(["runserver", f"{host}:{port}"])
    logger.info(f"🔐 Starting Django encryption server on {host}:{port}")
    logger.info("🔐 Available endpoints:")
    logger.info(f"   GET  http://{host}:{port}/health/          - Health check")
    logger.info(f"   GET  http://{host}:{port}/api/key          - Generate encryption key")
    logger.info(f"   GET  http://{host}:{port}/api/status/      - Status")
    logger.info(f"   POST http://{host}:{port}/api/encrypt      - Encrypt file")
    logger.info(f"   POST http://{host}:{port}/api/decrypt      - Decrypt file")
  execute_from_command_line(sys.argv)
