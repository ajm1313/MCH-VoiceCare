"""Report web URLs."""
from django.urls import path
from .views import ReportListView, ReportDetailView, ReportGenerateView

urlpatterns = [
    path("", ReportListView.as_view(), name="report_list"),
    path("generate/", ReportGenerateView.as_view(), name="report_generate"),
    path("<uuid:pk>/", ReportDetailView.as_view(), name="report_detail"),
]
