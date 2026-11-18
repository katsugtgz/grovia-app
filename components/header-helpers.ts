export async function submitLogoutRequest(
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  try {
    const response = await fetchImpl('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    });
    return response.ok;
  } catch {
    return false;
  }
}
