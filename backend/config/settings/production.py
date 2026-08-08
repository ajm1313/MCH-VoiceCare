"""Production settings."""
from .base import *  # noqa: F401,F403
import environ

env = environ.Env()

DEBUG = False
SECRET_KEY = env("SECRET_KEY")
ALLOWED_HOSTS = env("ALLOWED_HOSTS", default="").split(",")

# Trust proxy headers from Railway
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

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
