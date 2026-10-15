from django.db import models

class BuildingLayout(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, default='')
    floors_data = models.JSONField(help_text='Grid layouts, walls, stairs, lifts, and exits for each floor')
    occupants_data = models.JSONField(default=dict, blank=True, help_text='Occupant configuration per floor')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

class SimulationReport(models.Model):
    layout = models.ForeignKey(BuildingLayout, on_delete=models.CASCADE, related_name='reports', null=True, blank=True)
    scenario_name = models.CharField(max_length=150)
    baseline_clearance_time = models.FloatField(help_text='Clearance time without blockage (seconds)')
    blockage_clearance_time = models.FloatField(help_text='Clearance time with emergency blockage (seconds)', null=True, blank=True)
    total_occupants = models.IntegerField(default=0)
    total_evacuated = models.IntegerField(default=0)
    total_reroutes = models.IntegerField(default=0)
    hotspots = models.JSONField(default=list, blank=True)
    event_logs = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.scenario_name} ({self.created_at.strftime('%Y-%m-%d %H:%M')})"
