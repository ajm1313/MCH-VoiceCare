"""
Security middleware for MCH VoiceCare (spec §22.3).

Enforces TLS 1.2+ minimum and rejects non-HTTPS requests in production
(unless behind a trusted proxy that sets X-Forwarded-Proto).
"""
from django.conf import settings
from django.http import HttpResponsePermanentRedirect


class EnforceTLSMiddleware:
    """
    Middleware that enforces HTTPS/TLS for all requests in production.

    If the request arrives over HTTP (and is not behind a trusted proxy
    that already set SECURE_PROXY_SSL_HEADER), it redirects to HTTPS.

    The actual TLS version (1.2+/1.3) is enforced at the reverse-proxy /
    load-balancer layer (Railway terminates TLS). This middleware ensures
    Django never serves content over plain HTTP.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Only enforce in production (DEBUG=False)
        if not getattr(settings, "DEBUG", True):
            # Check if the request is secure
            if not request.is_secure():
                # Build the HTTPS URL and redirect
                host = request.get_host()
                path = request.get_full_path()
                https_url = f"https://{host}{path}"
                return HttpResponsePermanentRedirect(https_url)

        response = self.get_response(request)
        return response
