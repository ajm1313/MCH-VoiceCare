"""Staging settings — extends production with relaxed limits for testing (spec §29.1).

Uses a separate database (RAILWAY_STAGING_DB_URL) and relaxed rate limiting
so QA and automated tests can exercise endpoints without hitting production
throttles.
"""
from .production import *  # noqa: F401,F403

import environ

env = environ.Env()

DEBUG = False

# Staging database — separate from production
DATABASES = {
    "default": env.db_url(
        "RAILWAY_STAGING_DB_URL",
        default=env.db_url("DATABASE_URL", default="sqlite:///" + str(BASE_DIR / "db_staging.sqlite3")),  # noqa: F405
    ),
}

# Staging allowed hosts
ALLOWED_HOSTS = env("ALLOWED_HOSTS", default="").split(",")

# Relaxed rate limiting for staging / load testing (spec §29.1)
# Production may enforce stricter limits; staging allows higher throughput.
REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"] = [  # noqa: F405
    "rest_framework.throttling.AnonRateThrottle",
    "rest_framework.throttling.UserRateThrottle",
]
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {  # noqa: F405
    "anon": "1000/day",
    "user": "5000/day",
}

# Staging-specific logging — more verbose than production
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
        "level": "INFO",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "django.request": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
        "apps": {
            "handlers": ["console"],
            "level": "DEBUG",
            "propagate": False,
        },
    },
}
