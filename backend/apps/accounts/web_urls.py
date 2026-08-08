"""Accounts web URL routing — user and role-scope management."""
from django.urls import path

from apps.accounts.web_views import (
    UserListView,
    UserDetailView,
    UserCreateView,
    UserEditView,
    RoleScopeAssignView,
    RoleScopeDeleteView,
)

urlpatterns = [
    path("users/", UserListView.as_view(), name="user_list"),
    path("users/create/", UserCreateView.as_view(), name="user_create"),
    path("users/<uuid:pk>/", UserDetailView.as_view(), name="user_detail"),
    path("users/<uuid:pk>/edit/", UserEditView.as_view(), name="user_edit"),
    path("users/<uuid:user_pk>/scopes/assign/", RoleScopeAssignView.as_view(), name="role_scope_assign"),
    path("users/scopes/<uuid:pk>/delete/", RoleScopeDeleteView.as_view(), name="role_scope_delete"),
]
