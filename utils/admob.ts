// eslint-disable-next-line import/no-unresolved
import mobileAds, { AdsConsent } from 'react-native-google-mobile-ads';

let hasInitialized = false;
let initializationPromise: Promise<void> | null = null;

export async function initAdMob(): Promise<void> {
  if (hasInitialized) {
    return;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      const consentInfo = await AdsConsent.gatherConsent();

      if (consentInfo.canRequestAds) {
        await mobileAds().initialize();
      }
    } catch (error) {
      console.error('AdMob consent gathering failed. Attempting initialization anyway.', error);
      await mobileAds().initialize();
    } finally {
      hasInitialized = true;
    }
  })();

  return initializationPromise;
}
