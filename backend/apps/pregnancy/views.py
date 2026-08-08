"""Pregnancy web views."""
from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.shortcuts import redirect, get_object_or_404
from django.views.generic import ListView, DetailView
from django.views import View

from apps.pregnancy.models import PregnancyEpisode, PregnancyObservation, PregnancyAssessment
from apps.pregnancy.forms import ObservationForm


class PregnancyListView(LoginRequiredMixin, ListView):
    model = PregnancyEpisode
    template_name = "pregnancy/list.html"
    context_object_name = "episodes"
    paginate_by = 25
    login_url = "/login/"

    def get_queryset(self):
        qs = super().get_queryset().select_related("woman").order_by("-created_at")
        q = self.request.GET.get("q")
        if q:
            qs = qs.filter(woman__full_name__icontains=q)
        return qs


class PregnancyDetailView(LoginRequiredMixin, DetailView):
    model = PregnancyEpisode
    template_name = "pregnancy/detail.html"
    context_object_name = "episode"
    login_url = "/login/"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["observations"] = self.object.observations.all()[:10]
        ctx["assessments"] = self.object.assessments.all()[:5]
        ctx["obs_form"] = ObservationForm()
        return ctx


class PregnancyObserveView(LoginRequiredMixin, View):
    login_url = "/login/"

    def post(self, request, pk):
        episode = get_object_or_404(PregnancyEpisode, pk=pk)
        form = ObservationForm(request.POST)
        if form.is_valid():
            obs = form.save(commit=False)
            obs.episode = episode
            obs.recorded_by = request.user.username
            obs.save()

            # Run assessment
            from apps.pregnancy.services import run_pregnancy_assessment
            result = run_pregnancy_assessment(episode)
            episode.current_urgency = result["disposition"]
            episode.save()

            PregnancyAssessment.objects.create(
                episode=episode,
                disposition=result["disposition"],
                fired_rules=result["fired_rules"],
                recommended_action=result["recommended_action"],
            )

            messages.success(request, f"Observation recorded. Assessment: {result['disposition']}")
        else:
            messages.error(request, "Form errors — please correct and resubmit.")
        return redirect("pregnancy_detail", pk=pk)
