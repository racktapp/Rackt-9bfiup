import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
// eslint-disable-next-line import/no-unresolved
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

const productionUnitId = Platform.select({
  ios: 'ca-app-pub-4447766624305417/1320697081',
  android: 'ca-app-pub-4447766624305417/8577194983',
  default: TestIds.BANNER,
});

const unitId = __DEV__ ? TestIds.BANNER : productionUnitId;

export function AdMobBanner() {
  if (!unitId) {
    return null;
  }

  return (
    <View style={styles.container}>
      <BannerAd unitId={unitId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
