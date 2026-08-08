"""Production settings."""
from .base import *  # noqa: F401,F403
import environ

env = environ.Env()

DEBUG = False
SECRET_KEY = env("SECRET_KEY")
ALLOWED_HOSTS = env("ALLOWED_HOSTS", default="").split(",")

# Trust proxy headers from Railway
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
