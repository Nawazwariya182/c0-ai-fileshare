#!/usr/bin/env python3
# Single-file Django encryption server with CORS and three endpoints:
#   GET  /api/key       -> {"key": "<base64_fernet_key>"}
#   POST /api/encrypt   -> multipart: file, key  => encrypted bytes
#   POST /api/decrypt   -> multipart: file, key  => decrypted bytes
#
# Run:  python scripts/django-encryptor.py runserver 0.0.0.0:8000
# Or simply: python scripts/django-encryptor.py   (defaults to runserver 0.0.0.0:8000)
import os, sys, json
from io import BytesIO

# Minimal Django bootstrap
from django.conf import settings
if not settings.configured:
  settings.configure(
      DEBUG=True,
      SECRET_KEY="replace-me",
      ROOT_URLCONF=__name__,
      ALLOWED_HOSTS=["*"],
      MIDDLEWARE=[],
      INSTALLED_APPS=[
          "django.contrib.contenttypes",
          "django.contrib.staticfiles",
      ],
      DEFAULT_CHARSET="utf-8",
      STATIC_URL="/static/",  # <-- added this line
  )

from django.core.management import execute_from_command_line
from django.http import JsonResponse, HttpResponse, HttpRequest
from django.urls import path
from django.views.decorators.csrf import csrf_exempt
from cryptography.fernet import Fernet

def add_cors(resp: HttpResponse) -> HttpResponse:
  resp["Access-Control-Allow-Origin"] = "*"
  resp["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
  resp["Access-Control-Allow-Headers"] = "Content-Type"
  return resp

def options_ok(_req: HttpRequest) -> HttpResponse:
  return add_cors(HttpResponse(status=200))

def api_key(_req: HttpRequest) -> HttpResponse:
  key = Fernet.generate_key().decode("utf-8")
  return add_cors(JsonResponse({"key": key}))

@csrf_exempt
def api_encrypt(request: HttpRequest) -> HttpResponse:
  if request.method == "OPTIONS":
      return options_ok(request)
  if request.method != "POST":
      return add_cors(HttpResponse("Method Not Allowed", status=405))
  up = request.FILES.get("file")
  key = request.POST.get("key")
  if not up or not key:
      return add_cors(JsonResponse({"error": "file and key required"}, status=400))
  try:
      f = Fernet(key.encode("utf-8"))
  except Exception:
      return add_cors(JsonResponse({"error": "invalid key"}, status=400))
  data = up.read()
  enc = f.encrypt(data)
  resp = HttpResponse(enc, content_type="application/octet-stream")
  return add_cors(resp)

@csrf_exempt
def api_decrypt(request: HttpRequest) -> HttpResponse:
  if request.method == "OPTIONS":
      return options_ok(request)
  if request.method != "POST":
      return add_cors(HttpResponse("Method Not Allowed", status=405))
  up = request.FILES.get("file")
  key = request.POST.get("key")
  if not up or not key:
      return add_cors(JsonResponse({"error": "file and key required"}, status=400))
  try:
      f = Fernet(key.encode("utf-8"))
  except Exception:
      return add_cors(JsonResponse({"error": "invalid key"}, status=400))
  data = up.read()
  try:
      dec = f.decrypt(data)
  except Exception:
      return add_cors(JsonResponse({"error": "decryption failed"}, status=400))
  resp = HttpResponse(dec, content_type="application/octet-stream")
  return add_cors(resp)

def index(_req):
  return add_cors(JsonResponse({"ok": True}))

urlpatterns = [
  path("", index),  # root health
  path("api/key", api_key),
  path("api/encrypt", api_encrypt),
  path("api/decrypt", api_decrypt),
  path("api/key/", api_key),
  path("api/encrypt/", api_encrypt),
  path("api/decrypt/", api_decrypt),
  path("api/", options_ok),
]

if __name__ == "__main__":
  os.environ.setdefault("DJANGO_SETTINGS_MODULE", __name__)
  if len(sys.argv) == 1:
      port = os.environ.get("PORT", "8000")
      sys.argv += ["runserver", f"0.0.0.0:{port}"]
  execute_from_command_line(sys.argv)
