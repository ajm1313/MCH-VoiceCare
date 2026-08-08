"""Growth web URLs."""
from django.urls import path
from .views import GrowthListView, GrowthDetailView, GrowthRecordView

urlpatterns = [
    path("", GrowthListView.as_view(), name="growth_list"),
    path("record/", GrowthRecordView.as_view(), name="growth_record"),
    path("<uuid:pk>/", GrowthDetailView.as_view(), name="growth_detail"),
]
