
import { AdEventType, TestIds, RewardedAd, RewardedAdLoadError } from '@react-native-firebase/admob';
import { Platform } from 'react-native';

const ADMOB_UNIT_ID_REWARDED = Platform.select({
  ios: __DEV__ ? TestIds.REWARDED : 'ca-app-pub-xxxxxxxxxxxxxxxx', // Replace with your iOS rewarded ad unit ID
  android: __DEV__ ? TestIds.REWARDED : 'ca-app-pub-xxxxxxxxxxxxxxxx', // Replace with your Android rewarded ad unit ID
}) as string;

export const createAndLoadRewardedAd = (onAdLoaded: () => void, onAdFailedToLoad: (error: RewardedAdLoadError) => void, onAdRewarded: (reward: any) => void) => {
  const rewardedAd = RewardedAd.createForAdRequest(ADMOB_UNIT_ID_REWARDED);

  rewardedAd.onAdEvent((type, error, reward) => {
    if (type === AdEventType.LOADED) {
      onAdLoaded();
    }
    if (type === AdEventType.EARNED_REWARD) {
      if (reward) {
        onAdRewarded(reward);
      }
    }
    if (type === AdEventType.FAILED_TO_LOAD) {
      if (error) {
        onAdFailedToLoad(error);
      }
    }
  });

  rewardedAd.load();
  return rewardedAd;
};
