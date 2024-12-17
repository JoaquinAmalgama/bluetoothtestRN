import React, { FC, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import useBLE from "./useBLE";

const HeartRateScreen: FC = () => {
  const { connectedDevice, startHeartRateStreaming, heartRate } = useBLE();

  useEffect(() => {
    if (connectedDevice) {
      startHeartRateStreaming(connectedDevice);
    }
  }, [connectedDevice]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Heart Rate Monitor</Text>
      <View style={styles.heartRateContainer}>
        <Text style={styles.heartRateLabel}>Current Heart Rate:</Text>
        <Text style={styles.heartRateValue}>
          {heartRate !== null ? `${heartRate} BPM` : "No Data"}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f2f2f2",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 20,
  },
  heartRateContainer: {
    backgroundColor: "#FF6060",
    padding: 20,
    borderRadius: 10,
  },
  heartRateLabel: {
    fontSize: 18,
    color: "#fff",
  },
  heartRateValue: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#fff",
    marginTop: 10,
  },
});

export default HeartRateScreen;