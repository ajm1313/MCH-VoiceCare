"""Newborn web URLs."""
from django.urls import path

from .views import NewbornListView, NewbornDetailView, NewbornObserveView

urlpatterns = [
    path("", NewbornListView.as_view(), name="newborn_list"),
    path("<uuid:pk>/", NewbornDetailView.as_view(), name="newborn_detail"),
    path("<uuid:pk>/observe/", NewbornObserveView.as_view(), name="newborn_observe"),
]
