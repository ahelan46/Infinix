"""
URL configuration for codex project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse

def api_status(request):
    return JsonResponse({
        "status": "online",
        "backend": "Django 6.1.2",
        "message": "Hello from Django Codex Backend!",
        "cors_enabled": True
    })

from evacuation.views import open_sms_redirect

urlpatterns = [
    path('admin/', admin.site.urls),
    path('sms/', open_sms_redirect, name='direct_sms_redirect'),
    path('api/status/', api_status, name='api_status'),
    path('api/evacuation/', include('evacuation.urls')),
]


