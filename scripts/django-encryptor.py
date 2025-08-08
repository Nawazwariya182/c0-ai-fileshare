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
            'django.middleware.security.SecurityMiddleware',
            'django.middleware.common.CommonMiddleware',
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
    """Add CORS headers to response"""
    response["Access-Control-Allow-Origin"] = "*"
    response["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response["Access-Control-Max-Age"] = "86400"
    return response

@require_http_methods(["OPTIONS"])
def handle_preflight(request: HttpRequest) -> HttpResponse:
    """Handle CORS preflight requests"""
    response = HttpResponse(status=200)
    return add_cors_headers(response)

@require_http_methods(["GET"])
def api_key(request: HttpRequest) -> HttpResponse:
    """Generate and return a new Fernet encryption key"""
    try:
        key = Fernet.generate_key().decode("utf-8")
        logger.info("Generated new encryption key")
        response = JsonResponse({"key": key, "status": "success"})
        return add_cors_headers(response)
    except Exception as e:
        logger.error(f"Failed to generate key: {e}")
        response = JsonResponse({"error": "Failed to generate key"}, status=500)
        return add_cors_headers(response)

@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def api_encrypt(request: HttpRequest) -> HttpResponse:
    """Encrypt uploaded file using provided Fernet key"""
    if request.method == "OPTIONS":
        return handle_preflight(request)
    
    try:
        # Get uploaded file and key
        uploaded_file = request.FILES.get("file")
        key_str = request.POST.get("key")
        
        if not uploaded_file:
            response = JsonResponse({"error": "No file provided"}, status=400)
            return add_cors_headers(response)
        
        if not key_str:
            response = JsonResponse({"error": "No encryption key provided"}, status=400)
            return add_cors_headers(response)
        
        # Validate key format
        try:
            fernet = Fernet(key_str.encode("utf-8"))
        except Exception as e:
            logger.error(f"Invalid encryption key: {e}")
            response = JsonResponse({"error": "Invalid encryption key format"}, status=400)
            return add_cors_headers(response)
        
        # Read and encrypt file data
        file_data = uploaded_file.read()
        logger.info(f"Encrypting file: {uploaded_file.name} ({len(file_data)} bytes)")
        
        encrypted_data = fernet.encrypt(file_data)
        
        # Return encrypted data as binary response
        response = HttpResponse(
            encrypted_data,
            content_type="application/octet-stream"
        )
        response["Content-Disposition"] = f'attachment; filename="{uploaded_file.name}.enc"'
        
        logger.info(f"Successfully encrypted file: {uploaded_file.name}")
        return add_cors_headers(response)
        
    except Exception as e:
        logger.error(f"Encryption failed: {e}")
        response = JsonResponse({"error": f"Encryption failed: {str(e)}"}, status=500)
        return add_cors_headers(response)

@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def api_decrypt(request: HttpRequest) -> HttpResponse:
    """Decrypt uploaded file using provided Fernet key"""
    if request.method == "OPTIONS":
        return handle_preflight(request)
    
    try:
        # Get uploaded file and key
        uploaded_file = request.FILES.get("file")
        key_str = request.POST.get("key")
        
        if not uploaded_file:
            response = JsonResponse({"error": "No file provided"}, status=400)
            return add_cors_headers(response)
        
        if not key_str:
            response = JsonResponse({"error": "No decryption key provided"}, status=400)
            return add_cors_headers(response)
        
        # Validate key format
        try:
            fernet = Fernet(key_str.encode("utf-8"))
        except Exception as e:
            logger.error(f"Invalid decryption key: {e}")
            response = JsonResponse({"error": "Invalid decryption key format"}, status=400)
            return add_cors_headers(response)
        
        # Read and decrypt file data
        encrypted_data = uploaded_file.read()
        logger.info(f"Decrypting file: {uploaded_file.name} ({len(encrypted_data)} bytes)")
        
        try:
            decrypted_data = fernet.decrypt(encrypted_data)
        except Exception as e:
            logger.error(f"Decryption failed: {e}")
            response = JsonResponse({"error": "Decryption failed - invalid key or corrupted data"}, status=400)
            return add_cors_headers(response)
        
        # Return decrypted data as binary response
        response = HttpResponse(
            decrypted_data,
            content_type="application/octet-stream"
        )
        
        # Try to determine original filename
        original_name = uploaded_file.name
        if original_name.endswith('.enc'):
            original_name = original_name[:-4]  # Remove .enc extension
        
        response["Content-Disposition"] = f'attachment; filename="{original_name}"'
        
        logger.info(f"Successfully decrypted file: {uploaded_file.name}")
        return add_cors_headers(response)
        
    except Exception as e:
        logger.error(f"Decryption failed: {e}")
        response = JsonResponse({"error": f"Decryption failed: {str(e)}"}, status=500)
        return add_cors_headers(response)

@require_http_methods(["GET"])
def health_check(request: HttpRequest) -> HttpResponse:
    """Health check endpoint"""
    response = JsonResponse({
        "status": "healthy",
        "service": "bulletproof-p2p-encryption-server",
        "version": "1.0.0"
    })
    return add_cors_headers(response)

@require_http_methods(["GET"])
def api_status(request: HttpRequest) -> HttpResponse:
    """API status endpoint"""
    response = JsonResponse({
        "encryption": "available",
        "decryption": "available",
        "key_generation": "available",
        "max_file_size": "100MB"
    })
    return add_cors_headers(response)

# URL patterns
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
    # Handle OPTIONS for all API endpoints
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
        logger.info(f"Starting Django encryption server on {host}:{port}")
    
    execute_from_command_line(sys.argv)
