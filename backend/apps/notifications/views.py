"""Notification web views."""
from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic import ListView, DetailView

from apps.notifications.models import Notification


class NotificationListView(LoginRequiredMixin, ListView):
    model = Notification
    template_name = "notifications/list.html"
    context_object_name = "notifications"
    paginate_by = 25
    login_url = "/login/"

    def get_queryset(self):
        qs = super().get_queryset().order_by("-created_at")
        status = self.request.GET.get("status", "OPEN")
        if status:
            qs = qs.filter(status=status)
        return qs


class NotificationDetailView(LoginRequiredMixin, DetailView):
    model = Notification
    template_name = "notifications/detail.html"
    context_object_name = "notification"
    login_url = "/login/"
