"""Growth web views."""
from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic import ListView, DetailView, CreateView
from django.urls import reverse_lazy

from apps.growth.models import GrowthMeasurement


class GrowthListView(LoginRequiredMixin, ListView):
    model = GrowthMeasurement
    template_name = "growth/list.html"
    context_object_name = "measurements"
    paginate_by = 25
    login_url = "/login/"

    def get_queryset(self):
        qs = super().get_queryset().select_related("child").order_by("-measurement_date")
        q = self.request.GET.get("q")
        if q:
            qs = qs.filter(child__full_name__icontains=q)
        return qs


class GrowthDetailView(LoginRequiredMixin, DetailView):
    model = GrowthMeasurement
    template_name = "growth/detail.html"
    context_object_name = "measurement"
    login_url = "/login/"


class GrowthRecordView(LoginRequiredMixin, CreateView):
    model = GrowthMeasurement
    template_name = "growth/form.html"
    fields = [
        "child", "measurement_date", "weight_kg", "length_cm", "height_cm",
        "measurement_position", "muac_mm", "feeding_status", "recent_illness",
        "measurement_quality", "scale_id", "length_board_id",
    ]
    success_url = reverse_lazy("growth_list")
    login_url = "/login/"
