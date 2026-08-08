"""
Client web views — person list, detail, create, edit, unified registration.
"""
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.contrib.auth.mixins import LoginRequiredMixin
from django.db import transaction
from django.views.decorators.http import require_http_methods
from django.http import HttpResponseRedirect
from django.shortcuts import render, redirect, get_object_or_404
from django.urls import reverse_lazy, reverse
from django.views.generic import ListView, DetailView, CreateView, UpdateView

from apps.clients.models import Person, Household
from apps.clients.forms import PersonForm, HouseholdForm


class PersonListView(LoginRequiredMixin, ListView):
    model = Person
    template_name = "clients/person_list.html"
    context_object_name = "persons"
    paginate_by = 25
    login_url = "/login/"

    def get_queryset(self):
        qs = super().get_queryset().order_by("-created_at")
        q = self.request.GET.get("q")
        if q:
            qs = qs.filter(full_name__icontains=q)
        return qs

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["q"] = self.request.GET.get("q", "")
        return ctx


class PersonDetailView(LoginRequiredMixin, DetailView):
    model = Person
    template_name = "clients/person_detail.html"
    context_object_name = "person"
    login_url = "/login/"


class PersonCreateView(LoginRequiredMixin, CreateView):
    model = Person
    form_class = PersonForm
    template_name = "clients/person_form.html"
    success_url = reverse_lazy("person_list")
    login_url = "/login/"


class PersonEditView(LoginRequiredMixin, UpdateView):
    model = Person
    form_class = PersonForm
    template_name = "clients/person_form.html"
    success_url = reverse_lazy("person_list")
    login_url = "/login/"


# ── Unified Registration ──

@login_required
@require_http_methods(["GET", "POST"])
def unified_register(request):
    """Unified registration page — register a person and enrol into a care pathway."""
    from apps.pregnancy.forms import PregnancyRegistrationForm
    from apps.newborn.forms import BirthEpisodeForm, NewbornEpisodeForm
    from apps.immunisation.forms import ChildRegistrationForm

    person_form = PersonForm(request.POST or None, prefix="person")
    pregnancy_form = PregnancyRegistrationForm(request.POST or None, prefix="pregnancy")
    birth_form = BirthEpisodeForm(request.POST or None, prefix="birth")
    newborn_form = NewbornEpisodeForm(request.POST or None, prefix="newborn")
    immunisation_form = ChildRegistrationForm(request.POST or None, prefix="immunisation")

    if request.method == "POST":
        registration_type = request.POST.get("registration_type", "pregnancy")

        if person_form.is_valid():
            with transaction.atomic():
                person = person_form.save()

                if registration_type == "pregnancy":
                    pregnancy_form.instance.woman = person
                    if pregnancy_form.is_valid():
                        episode = pregnancy_form.save()
                        try:
                            from apps.rules.services import run_pregnancy_assessment
                            run_pregnancy_assessment(episode)
                        except Exception:
                            pass
                        messages.success(request, f"Pregnancy registered for {person.full_name}.")
                        return redirect("pregnancy_detail", pk=episode.pk)
                elif registration_type == "newborn":
                    newborn_form.instance.child = person
                    if birth_form.is_valid() and newborn_form.is_valid():
                        birth = birth_form.save()
                        newborn_form.instance.birth_episode = birth
                        episode = newborn_form.save()
                        try:
                            from apps.newborn.services import run_newborn_assessment
                            run_newborn_assessment(episode)
                        except Exception:
                            pass
                        messages.success(request, f"Newborn registered: {person.full_name}.")
                        return redirect("newborn_detail", pk=episode.pk)
                elif registration_type == "immunisation":
                    immunisation_form.instance.child = person
                    if immunisation_form.is_valid():
                        record = immunisation_form.save()
                        messages.success(request, f"Child enrolled in immunisation: {person.full_name}.")
                        return redirect("immunisation_child_detail", pk=record.pk)

        return render(request, "clients/unified_register.html", {
            "person_form": person_form,
            "pregnancy_form": pregnancy_form,
            "birth_form": birth_form,
            "newborn_form": newborn_form,
            "immunisation_form": immunisation_form,
            "registration_type": request.POST.get("registration_type", "pregnancy"),
        })

    return render(request, "clients/unified_register.html", {
        "person_form": person_form,
        "pregnancy_form": pregnancy_form,
        "birth_form": birth_form,
        "newborn_form": newborn_form,
        "immunisation_form": immunisation_form,
        "registration_type": "pregnancy",
    })
