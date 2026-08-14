export function markNotificationReadForNavigation(apiClient, notificationId, onChanged) {
  return apiClient.post(`/notifications/${notificationId}/read`, {})
    .then(() => {
      onChanged?.();
      return true;
    })
    .catch(() => false);
}
