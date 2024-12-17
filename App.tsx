import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import DeviceModal from "./DeviceConnectionModal";
import useBLE from "./useBLE";

const App = () => {
  const {
    allDevices,
    connectedDevice,
    connectToDevice,
    color,
    requestPermissions,
    scanForPeripherals,
    startHeartRateStreaming,
    heartRate,
    retrieveHistoricalData, // Add this
    isLoadingHistorical, // Loading state
    historicalData, // Retrieved historical data
  } = useBLE();
  const [isModalVisible, setIsModalVisible] = useState<boolean>(false);

  const scanForDevices = async () => {
    const isPermissionsEnabled = await requestPermissions();
    if (isPermissionsEnabled) {
      scanForPeripherals();
    }
  };

  const hideModal = () => {
    setIsModalVisible(false);
  };

  const openModal = async () => {
    scanForDevices();
    setIsModalVisible(true);
  };

  useEffect(() => {
    if (connectedDevice) {
      startHeartRateStreaming(connectedDevice);
    }
  }, [connectedDevice]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: color }]}>
      <View style={styles.heartRateTitleWrapper}>
        {connectedDevice ? (
          <>
            <Text style={styles.heartRateTitleText}>Connected</Text>
            <Text style={styles.heartRateText}>
              Heart Rate: {heartRate !== null ? `${heartRate} BPM` : "Loading..."}
            </Text>

            {/* Button to retrieve historical data */}
            <TouchableOpacity
              onPress={() => retrieveHistoricalData(connectedDevice)}
              style={styles.ctaButton}
            >
              <Text style={styles.ctaButtonText}>Retrieve Historical Data</Text>
            </TouchableOpacity>

            {/* Loading indicator */}
            {isLoadingHistorical && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#FF6060" />
                <Text style={styles.loadingText}>Loading historical data...</Text>
              </View>
            )}

            {/* Display historical data */}
            {!isLoadingHistorical && historicalData.length > 0 && (
              <ScrollView style={styles.dataContainer}>
                <Text style={styles.dataTitle}>Historical Heart Rate Data:</Text>
                {historicalData.map((value, index) => (
                  <Text key={index} style={styles.dataText}>
                    {`Measurement ${index + 1}: ${value} BPM`}
                  </Text>
                ))}
              </ScrollView>
            )}
          </>
        ) : (
          <Text style={styles.heartRateTitleText}>
            Please connect the Heart Rate Monitor
          </Text>
        )}
      </View>
      <TouchableOpacity onPress={openModal} style={styles.ctaButton}>
        <Text style={styles.ctaButtonText}>Connect</Text>
      </TouchableOpacity>
      <DeviceModal
        closeModal={hideModal}
        visible={isModalVisible}
        connectToPeripheral={connectToDevice}
        devices={allDevices}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f2f2f2",
  },
  heartRateTitleWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  heartRateTitleText: {
    fontSize: 30,
    fontWeight: "bold",
    textAlign: "center",
    marginHorizontal: 20,
    color: "black",
  },
  heartRateText: {
    fontSize: 25,
    marginTop: 15,
    color: "black",
  },
  ctaButton: {
    backgroundColor: "#FF6060",
    justifyContent: "center",
    alignItems: "center",
    height: 50,
    marginHorizontal: 20,
    marginBottom: 5,
    borderRadius: 8,
  },
  ctaButtonText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "white",
  },
  loadingContainer: {
    marginTop: 20,
    alignItems: "center",
  },
  loadingText: {
    fontSize: 18,
    marginTop: 10,
    color: "black",
  },
  dataContainer: {
    marginTop: 20,
    maxHeight: 200,
    paddingHorizontal: 20,
  },
  dataTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  dataText: {
    fontSize: 16,
    color: "black",
  },
});

export default App;