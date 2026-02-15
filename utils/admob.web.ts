// Web platform does not support AdMob
// This is a no-op implementation for web compatibility

let hasInitialized = false;

export async function initAdMob(): Promise<void> {
  if (hasInitialized) {
    return;
  }

  // No-op for web platform
  console.log('[AdMob] Not available on web platform');
  hasInitialized = true;
}
