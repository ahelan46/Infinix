from django.urls import path
from . import views

urlpatterns = [
    path('preset/', views.get_preset, name='evacuation_preset'),
    path('simulate/', views.run_simulation, name='evacuation_simulate'),
    path('compare/', views.compare_scenarios, name='evacuation_compare'),
    path('routes/', views.calculate_routes, name='evacuation_routes'),
    path('save/', views.save_layout, name='evacuation_save'),
    path('load/', views.load_layout, name='evacuation_load'),
    path('alert-phone/', views.alert_phone, name='evacuation_alert_phone'),
    path('send-sms/', views.alert_phone, name='evacuation_send_sms'),
    path('sms-logs/', views.get_sms_logs, name='evacuation_sms_logs'),
    path('open-sms/', views.open_sms_redirect, name='evacuation_open_sms'),
    path('latest-alert/', views.get_latest_alert, name='evacuation_latest_alert'),
    path('clear-alert/', views.clear_alert, name='evacuation_clear_alert'),
    path('tactical-rescue/', views.tactical_rescue_plan, name='evacuation_tactical_rescue'),
]
