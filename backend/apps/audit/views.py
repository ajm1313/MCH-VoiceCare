"""Audit web views."""
from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic import ListView

from apps.audit.models import AuditEvent


class AuditListView(LoginRequiredMixin, ListView):
    model = AuditEvent
    template_name = "audit/list.html"
    context_object_name = "events"
    paginate_by = 50
    login_url = "/login/"

    def get_queryset(self):
        qs = super().get_queryset().order_by("-occurred_at")
        action = self.request.GET.get("action")
        if action:
            qs = qs.filter(action__icontains=action)
        return qs
