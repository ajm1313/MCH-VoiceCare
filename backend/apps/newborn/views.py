"""Newborn web views."""
from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.shortcuts import redirect, get_object_or_404
from django.views.generic import ListView, DetailView
from django.views import View

from apps.newborn.models import NewbornEpisode, NewbornObservation, NewbornAssessment
from apps.newborn.forms import NewbornObservationForm


class NewbornListView(LoginRequiredMixin, ListView):
    model = NewbornEpisode
    template_name = "newborn/list.html"
    context_object_name = "episodes"
    paginate_by = 25
    login_url = "/login/"

    def get_queryset(self):
        qs = super().get_queryset().select_related("child", "mother").order_by("-created_at")
        q = self.request.GET.get("q")
        if q:
            qs = qs.filter(child__full_name__icontains=q)
        return qs


class NewbornDetailView(LoginRequiredMixin, DetailView):
    model = NewbornEpisode
    template_name = "newborn/detail.html"
    context_object_name = "episode"
    login_url = "/login/"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["observations"] = self.object.observations.all()[:10]
        ctx["assessments"] = self.object.assessments.all()[:5]
        ctx["obs_form"] = NewbornObservationForm()
        return ctx


class NewbornObserveView(LoginRequiredMixin, View):
    login_url = "/login/"

    def post(self, request, pk):
        episode = get_object_or_404(NewbornEpisode, pk=pk)
        form = NewbornObservationForm(request.POST)
        if form.is_valid():
            obs = form.save(commit=False)
            obs.newborn = episode
            obs.recorded_by = request.user.username
            obs.save()

            from apps.newborn.services import run_newborn_assessment
            result = run_newborn_assessment(episode)
            episode.current_urgency = result["disposition"]
            episode.save()

            NewbornAssessment.objects.create(
                episode=episode,
                disposition=result["disposition"],
                fired_rules=result["fired_rules"],
                recommended_action=result["recommended_action"],
            )

            messages.success(request, f"Observation recorded. Assessment: {result['disposition']}")
        else:
            messages.error(request, "Form errors — please correct and resubmit.")
        return redirect("newborn_detail", pk=pk)
