#!/usr/bin/env python3
# Single-file Django compression server with CORS:
#   GET  /api/status    -> {"status": "ok"}
#   POST /api/compress   -> multipart: file, algorithm (optional) => compressed bytes
#   POST /api/decompress -> multipart: file => decompressed bytes
#
# Run:  python scripts/django-compressor.py runserver 0.0.0.0:8001
# Or:   python scripts/django-compressor.py

import os
import sys
import time
import gzip
import bz2
import lzma
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from django.conf import settings

if not settings.configured:
  settings.configure(
    DEBUG=True,
    SECRET_KEY="bulletproof-p2p-compression-server-key-2024",
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
    FILE_UPLOAD_MAX_MEMORY_SIZE=200 * 1024 * 1024,
    DATA_UPLOAD_MAX_MEMORY_SIZE=200 * 1024 * 1024,
  )

from django.core.management import execute_from_command_line
from django.http import JsonResponse, HttpResponse, HttpRequest
from django.urls import path
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods


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
def api_status(request: HttpRequest) -> HttpResponse:
  try:
    # Test compression/decompression
    test_data = b"compression test data"
    compressed_gzip = gzip.compress(test_data)
    decompressed = gzip.decompress(compressed_gzip)
    ok = decompressed == test_data
    return add_cors_headers(JsonResponse({
      "status": "ok" if ok else "error", 
      "service": "bulletproof-p2p-compression-server", 
      "timestamp": int(time.time()),
      "algorithms": ["gzip", "bzip2", "lzma"]
    }))
  except Exception as e:
    logger.error(f"Status failed: {e}")
    return add_cors_headers(JsonResponse({"status": "error", "error": str(e)}, status=500))


@require_http_methods(["GET"])
def health_check(request: HttpRequest) -> HttpResponse:
  try:
    test_data = b"health"
    compressed = gzip.compress(test_data)
    ok = gzip.decompress(compressed) == test_data
    return add_cors_headers(JsonResponse({
      "status": "healthy" if ok else "unhealthy", 
      "service": "bulletproof-p2p-compression-server", 
      "timestamp": int(time.time())
    }))
  except Exception as e:
    logger.error(f"Health check failed: {e}")
    return add_cors_headers(JsonResponse({"status": "unhealthy", "error": str(e)}, status=500))


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def api_compress(request: HttpRequest) -> HttpResponse:
  if request.method == "OPTIONS":
    return handle_preflight(request)
  try:
    uploaded = request.FILES.get("file")
    algorithm = request.POST.get("algorithm", "gzip").lower()
    if not uploaded:
      return add_cors_headers(JsonResponse({"error": "No file provided"}, status=400))

    # Algorithm validation
    if algorithm not in ["gzip", "bzip2", "lzma"]:
      return add_cors_headers(JsonResponse({"error": "Invalid algorithm. Use: gzip, bzip2, lzma"}, status=400))

    max_size = 300 * 1024 * 1024
    if uploaded.size > max_size:
      return add_cors_headers(JsonResponse({"error": "File too large (max: 300MB)"}, status=400))

    data = uploaded.read()
    original_size = len(data)
    start_time = time.time()
    
    try:
      if algorithm == "gzip":
        # Use compresslevel=1 for fastest compression (speed over compression ratio)
        compressed = gzip.compress(data, compresslevel=1)
        extension = ".gz"
      elif algorithm == "bzip2":
        # Use compresslevel=1 for fastest bzip2 compression
        compressed = bz2.compress(data, compresslevel=1)
        extension = ".bz2"
      elif algorithm == "lzma":
        # Use preset=0 for fastest LZMA compression
        compressed = lzma.compress(data, preset=0)
        extension = ".xz"
      
      compress_time = time.time() - start_time
      compressed_size = len(compressed)
      ratio = round(compressed_size / original_size * 100, 2)
      savings = round((1 - compressed_size / original_size) * 100, 2)
      
      logger.info(f"Compressed {uploaded.name} with {algorithm}: {original_size} -> {compressed_size} bytes ({savings}% saved)")
      
    except Exception as e:
      logger.error(f"Compression failed: {e}")
      return add_cors_headers(JsonResponse({"error": "Compression failed"}, status=500))

    resp = HttpResponse(compressed, content_type="application/octet-stream")
    resp["Content-Disposition"] = f'attachment; filename="{uploaded.name}{extension}"'
    resp["Content-Length"] = str(compressed_size)
    resp["X-Algorithm"] = algorithm
    resp["X-Original-Size"] = str(original_size)
    resp["X-Compressed-Size"] = str(compressed_size)
    resp["X-Compression-Ratio"] = str(ratio)
    resp["X-Space-Saved"] = str(savings)
    resp["X-Compression-Time"] = str(round(compress_time, 3))
    return add_cors_headers(resp)
  except Exception as e:
    logger.error(f"Compression error: {e}")
    return add_cors_headers(JsonResponse({"error": f"Compression failed: {str(e)}"}, status=500))


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def api_decompress(request: HttpRequest) -> HttpResponse:
  if request.method == "OPTIONS":
    return handle_preflight(request)
  try:
    uploaded = request.FILES.get("file")
    if not uploaded:
      return add_cors_headers(JsonResponse({"error": "No file provided"}, status=400))

    max_size = 300 * 1024 * 1024
    if uploaded.size > max_size:
      return add_cors_headers(JsonResponse({"error": "File too large (max: 300MB)"}, status=400))

    compressed_data = uploaded.read()
    start_time = time.time()
    
    # Auto-detect compression format by magic bytes
    algorithm = None
    if compressed_data.startswith(b'\x1f\x8b'):
      algorithm = "gzip"
    elif compressed_data.startswith(b'BZ'):
      algorithm = "bzip2"
    elif compressed_data.startswith(b'\xfd7zXZ\x00'):
      algorithm = "lzma"
    
    if not algorithm:
      return add_cors_headers(JsonResponse({"error": "Unknown compression format"}, status=400))
    
    try:
      if algorithm == "gzip":
        decompressed = gzip.decompress(compressed_data)
      elif algorithm == "bzip2":
        decompressed = bz2.decompress(compressed_data)
      elif algorithm == "lzma":
        decompressed = lzma.decompress(compressed_data)
      
      decompress_time = time.time() - start_time
      logger.info(f"Decompressed {uploaded.name} with {algorithm}: {len(compressed_data)} -> {len(decompressed)} bytes")
      
    except Exception:
      return add_cors_headers(JsonResponse({"error": "Decompression failed - corrupted data or wrong format"}, status=400))

    # Remove compression extension from filename
    name = uploaded.name
    if name.endswith(".gz") or name.endswith(".bz2") or name.endswith(".xz"):
      name = name.rsplit(".", 1)[0]
    
    resp = HttpResponse(decompressed, content_type="application/octet-stream")
    resp["Content-Disposition"] = f'attachment; filename="{name}"'
    resp["Content-Length"] = str(len(decompressed))
    resp["X-Algorithm"] = algorithm
    resp["X-Compressed-Size"] = str(len(compressed_data))
    resp["X-Decompressed-Size"] = str(len(decompressed))
    resp["X-Decompression-Time"] = str(round(decompress_time, 3))
    return add_cors_headers(resp)
  except Exception as e:
    logger.error(f"Decompression error: {e}")
    return add_cors_headers(JsonResponse({"error": f"Decompression failed: {str(e)}"}, status=500))


urlpatterns = [
  path("", health_check, name="health"),
  path("health/", health_check, name="health_check"),
  path("api/", api_status, name="api_status"),
  path("api/status/", api_status, name="api_status_alt"),
  path("api/compress", api_compress, name="api_compress"),
  path("api/compress/", api_compress, name="api_compress_alt"),
  path("api/decompress", api_decompress, name="api_decompress"),
  path("api/decompress/", api_decompress, name="api_decompress_alt"),
  # OPTIONS preflight
  path("api/compress", handle_preflight),
  path("api/decompress", handle_preflight),
]

if __name__ == "__main__":
  os.environ.setdefault("DJANGO_SETTINGS_MODULE", __name__)
  if len(sys.argv) == 1:
    port = os.environ.get("PORT", "8001")
    host = os.environ.get("HOST", "0.0.0.0")
    sys.argv.extend(["runserver", f"{host}:{port}"])
    logger.info(f"🗜️  Starting Django compression server on {host}:{port}")
    logger.info(f"→ GET  http://{host}:{port}/api/status/   (status)")
    logger.info(f"→ POST http://{host}:{port}/api/compress   (multipart: file, algorithm)")
    logger.info(f"→ POST http://{host}:{port}/api/decompress (multipart: file)")
    logger.info(f"📦 Algorithms: gzip (fast), bzip2 (balanced), lzma (best compression)")
  execute_from_command_line(sys.argv)