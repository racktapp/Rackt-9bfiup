
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AdMobBanner, AdMobInterstitial, AdMobRewarded } from 'react-native-admob';

interface AdMobBannerProps {
  bannerSize: string;
  adUnitID: string;
  testDevices?: string[];
  onAdFailedToLoad?: (error: any) => void;
  onAdLoaded?: () => void;
  onSizeChange?: () => void;
}

const AdMobBannerComponent: React.FC<AdMobBannerProps> = ({
  bannerSize,
  adUnitID,
  testDevices,
  onAdFailedToLoad,
  onAdLoaded,
  onSizeChange,
}) => {
  return (
    <View style={styles.bannerContainer}>
      <AdMobBanner
        bannerSize={bannerSize}
        adUnitID={adUnitID}
        testDevices={testDevices}
        onAdFailedToLoad={onAdFailedToLoad}
        onAdLoaded={onAdLoaded}
        onSizeChange={onSizeChange}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  bannerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
});

export default AdMobBannerComponent;
