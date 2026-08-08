"""Report web views."""
from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic import ListView, DetailView, CreateView, TemplateView
from django.urls import reverse_lazy

from apps.reports.models import Report, ScheduledReport


class ReportListView(LoginRequiredMixin, ListView):
    model = Report
    template_name = "reports/list.html"
    context_object_name = "reports"
    paginate_by = 25
    login_url = "/login/"


class ReportDetailView(LoginRequiredMixin, DetailView):
    model = Report
    template_name = "reports/detail.html"
    context_object_name = "report"
    login_url = "/login/"


class ReportGenerateView(LoginRequiredMixin, CreateView):
    model = Report
    template_name = "reports/generate.html"
    fields = ["title", "report_type", "period_start", "period_end"]
    success_url = reverse_lazy("report_list")
    login_url = "/login/"
