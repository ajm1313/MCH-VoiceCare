"""
Django settings — base configuration.
"""
import os
from pathlib import Path
from datetime import timedelta

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env(
    DEBUG=(bool, True),
    SECRET_KEY=(str, "django-insecure-change-me-in-production"),
    ALLOWED_HOSTS=(str, "localhost,127.0.0.1"),
)

# Read .env if it exists
env_file = BASE_DIR / ".env"
if env_file.exists():
    environ.Env.read_env(str(env_file))

SECRET_KEY = env("SECRET_KEY")
DEBUG = env("DEBUG")
ALLOWED_HOSTS = env("ALLOWED_HOSTS").split(",")

# CSRF trusted origins — needed for browser preview proxy and local dev
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:3586",
    "http://localhost:3586",
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.humanize",

    # Third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "drf_spectacular",

    # Local apps
    "apps.core",
    "apps.accounts",
    "apps.organisations",
    "apps.clients",
    "apps.pregnancy",
    "apps.newborn",
    "apps.immunisation",
    "apps.growth",
    "apps.referrals",
    "apps.audit",
    "apps.notifications",
    "apps.communication",
    "apps.reports",
    "apps.integrations",
    "apps.fhir",
    "apps.rules",
    "apps.tests",

    # ML research infrastructure (spec §13, §14, §30)
    "ml",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# Database — use SQLite by default, override with DATABASE_URL
DATABASES = {
    "default": env.db_url(
        "DATABASE_URL",
        default="sqlite:///" + str(BASE_DIR / "db.sqlite3"),
    )
}

AUTH_USER_MODEL = "accounts.UserAccount"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ── DRF ──
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

# ── OpenAPI schema generation (drf-spectacular) ──
SPECTACULAR_SETTINGS = {
    "TITLE": "MCH VoiceCare API",
    "DESCRIPTION": (
        "Maternal and Child Health VoiceCare platform API for Northern Ghana. "
        "Supports offline-first clinical capture, danger-sign rules, closed-loop "
        "referrals, FHIR R4 interoperability, OCR scanning, telephony (IVR/USSD), "
        "and server-side clinical ML."
    ),
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "CONTACT": {
        "name": "MCH VoiceCare Team",
        "url": "https://github.com/ajm1313/MCH-VoiceCare",
    },
    "LICENSE": {
        "name": "Proprietary",
    },
    "TAGS": [
        {"name": "auth", "description": "Authentication and MFA"},
        {"name": "organisations", "description": "Organisation units and facilities"},
        {"name": "clients", "description": "Patient (Person) records"},
        {"name": "pregnancy", "description": "Pregnancy episodes and ANC visits"},
        {"name": "newborn", "description": "Newborn episodes and care"},
        {"name": "immunisation", "description": "Immunisation records"},
        {"name": "growth", "description": "Growth monitoring"},
        {"name": "referrals", "description": "Referral workflow and slips"},
        {"name": "ocr", "description": "OCR scanning and templates"},
        {"name": "telephony", "description": "IVR, USSD, and audio assets"},
        {"name": "ml", "description": "ML inference and monitoring"},
        {"name": "core", "description": "Config, rule packages, monitoring"},
        {"name": "audit", "description": "Audit trail events"},
        {"name": "fhir", "description": "FHIR R4 resources"},
    ],
    "SECURITY": [{"jwtAuth": []}, {"cookieAuth": []}],
    "AUTHENTICATION_WHITELIST": [],
}

# ── JWT ──
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=env.int("JWT_ACCESS_TOKEN_LIFETIME_MINUTES", 60)
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=env.int("JWT_REFRESH_TOKEN_LIFETIME_DAYS", 7)
    ),
    "SIGNING_KEY": env("JWT_SIGNING_KEY", default=SECRET_KEY),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "TOKEN_OBTAIN_SERIALIZER": "apps.accounts.api.auth_views.LoginSerializer",
}

# ── Login redirects ──
LOGIN_URL = "/login/"
LOGIN_REDIRECT_URL = "/"
LOGOUT_REDIRECT_URL = "/login/"
