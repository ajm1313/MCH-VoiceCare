"""Production settings."""
from .base import *  # noqa: F401,F403
import environ

env = environ.Env()

DEBUG = False
SECRET_KEY = env("SECRET_KEY")
ALLOWED_HOSTS = env("ALLOWED_HOSTS", default="").split(",")

# ── Transport security (spec §22.3) ──
# TLS 1.2+ minimum; TLS 1.3 preferred. Certificate validation MUST NOT be bypassed.
# The TLS minimum version is enforced at the reverse-proxy/load-balancer layer
# (Railway terminates TLS). These Django settings enforce HTTPS-only behaviour.

# Trust proxy headers from Railway
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Redirect all HTTP requests to HTTPS
# Can be disabled via env var for healthcheck compatibility
SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)

# HSTS — tell browsers to only use HTTPS for 1 year
SECURE_HSTS_SECONDS = 31536000  # 1 year
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Additional security headers
SECURE_CONTENT_TYPE_NOSNIFF = True
# Note: SECURE_BROWSER_XSS_FILTER was removed in Django 4+ (X-XSS-Protection
# header is no longer honored by modern browsers). Kept for documentation
# purposes — SecurityMiddleware no longer reads this setting.
SECURE_BROWSER_XSS_FILTER = True

# Secure cookies — only transmitted over HTTPS
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# Enforce TLS via custom middleware (spec §22.3) — additional layer beyond
# SecurityMiddleware's SECURE_SSL_REDIRECT. Ensures no content is served
# over plain HTTP even if proxy headers are missing.
MIDDLEWARE = MIDDLEWARE + ["config.middleware.EnforceTLSMiddleware"]  # noqa: F405

# CSRF trusted origins — include Railway domain and allow env override
_extra_csrf = env("CSRF_TRUSTED_ORIGINS", default="")
if _extra_csrf:
    CSRF_TRUSTED_ORIGINS = [
        origin.strip() for origin in _extra_csrf.split(",") if origin.strip()
    ]
# Auto-add Railway public domain
_railway_domain = env("RAILWAY_PUBLIC_DOMAIN", default="")
if _railway_domain:
    CSRF_TRUSTED_ORIGINS = list(getattr(__import__("config.settings.base", fromlist=["CSRF_TRUSTED_ORIGINS"]), "CSRF_TRUSTED_ORIGINS", [])) + [
        f"https://{_railway_domain}",
        f"http://{_railway_domain}",
    ]

# Log errors to stderr so they appear in Railway logs
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "ERROR",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
        "django.request": {
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
    },
}
