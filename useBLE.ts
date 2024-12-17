/* eslint-disable no-bitwise */
import { useMemo, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import * as ExpoDevice from "expo-device";
import base64 from "react-native-base64";
import {
  BleError,
  BleManager,
  Characteristic,
  Device,
} from "react-native-ble-plx";

const bleManager = new BleManager();

function useBLE() {

  const [isLoadingHistorical, setIsLoadingHistorical] = useState<boolean>(false);
  const [historicalData, setHistoricalData] = useState<number[]>([]); // Stores historical heart rate data
  
  const retrieveHistoricalData = async (device: Device) => {
    setIsLoadingHistorical(true);
    setHistoricalData([]); // Clear old data
  
    try {
      console.log("Requesting historical data...");
  
      // Discover all services and characteristics first
      await device.discoverAllServicesAndCharacteristics();
      const services = await device.services();
  
      for (const service of services) {
        if (service.uuid === "0000fc00-0000-1000-8000-00805f9b34fb") {
          const characteristics = await service.characteristics();
          for (const characteristic of characteristics) {
            console.log(
              `Characteristic UUID: ${characteristic.uuid}, Writable: ${characteristic.isWritableWithResponse}`
            );
  
            if (
              characteristic.uuid === "0000fc21-0000-1000-8000-00805f9b34fb" &&
              characteristic.isWritableWithResponse
            ) {
              // Send command to request historical data
              const command = base64.encode("\x01"); // Example command
              await characteristic.writeWithResponse(command);
              console.log("Historical data command sent successfully.");
            }
          }
        }
      }
  
      // Listen for incoming packets on the notify characteristic
      device.monitorCharacteristicForService(
        "0000fc00-0000-1000-8000-00805f9b34fb",
        "0000fc20-0000-1000-8000-00805f9b34fb",
        (error, characteristic) => {
          if (error) {
            console.error("Error receiving historical data:", error);
            return;
          }
  
          if (characteristic?.value) {
            const rawValue = characteristic.value;
            const decodedValue = base64.decode(rawValue);
  
            // console.log("Received Packet raw:", decodedValue);
  
            // Process packet
            const packetType = decodedValue.charCodeAt(0) & 0x0f; // Low 4 bits
            const serialNumber = (decodedValue.charCodeAt(0) & 0xf0) >> 4; // High 4 bits
            console.log(`Packet Type: ${packetType}, Serial Number: ${serialNumber}`);
  
            if (packetType >= 1 && packetType <= 4) {
              // Extract heart rate values (starting at byte 6)
              const heartRateValues: number[] = [];
              for (let i = 6; i < decodedValue.length - 1; i++) {
                heartRateValues.push(decodedValue.charCodeAt(i)); // Heart rate is 1 byte per value
              }
              console.log("Heart Rate Values:", heartRateValues);
  
              // Update state
              setHistoricalData((prev) => [...prev, ...heartRateValues]);
            } else if (packetType === 5) {
              console.log("End of historical data transmission.");
              setIsLoadingHistorical(false);
            } else if (decodedValue.includes("done")) {
              console.log("Data Transfer Completed.");
              setIsLoadingHistorical(false);
            }
          }
        }
      );
    } catch (error) {
      console.error("Failed to retrieve historical data:", error);
    } finally {
      setIsLoadingHistorical(false);
    }
  };


  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [color, setColor] = useState("white");
  const [heartRate, setHeartRate] = useState<number | null>(null); // Heart rate state now inside useBLE

  const startHeartRateStreaming = async (device: Device) => {
    try {
      await device.monitorCharacteristicForService(
        "0000180d-0000-1000-8000-00805f9b34fb", // Heart Rate Service UUID
        "00002a37-0000-1000-8000-00805f9b34fb", // Heart Rate Measurement Characteristic UUID
        (error, characteristic) => {
          if (error) {
            console.error("Heart Rate Monitor Error:", error);
            return;
          }

          if (characteristic?.value) {
            const rawValue = base64.decode(characteristic.value);
            const heartRateValue = rawValue.charCodeAt(1); // Extract heart rate value
            // console.log("Heart Rate:", heartRateValue);
            setHeartRate(heartRateValue); // Update the state
          }
        }
      );
    } catch (error) {
      console.error("Failed to monitor heart rate:", error);
    }
  };

  const requestAndroid31Permissions = async () => {
    const bluetoothScanPermission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      {
        title: "Location Permission",
        message: "Bluetooth Low Energy requires Location",
        buttonPositive: "OK",
      }
    );
    const bluetoothConnectPermission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      {
        title: "Location Permission",
        message: "Bluetooth Low Energy requires Location",
        buttonPositive: "OK",
      }
    );
    const fineLocationPermission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: "Location Permission",
        message: "Bluetooth Low Energy requires Location",
        buttonPositive: "OK",
      }
    );

    return (
      bluetoothScanPermission === "granted" &&
      bluetoothConnectPermission === "granted" &&
      fineLocationPermission === "granted"
    );
  };

  const requestPermissions = async () => {
    if (Platform.OS === "android") {
      if ((ExpoDevice.platformApiLevel ?? -1) < 31) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "Location Permission",
            message: "Bluetooth Low Energy requires Location",
            buttonPositive: "OK",
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        const isAndroid31PermissionsGranted =
          await requestAndroid31Permissions();

        return isAndroid31PermissionsGranted;
      }
    } else {
      return true;
    }
  };

  const connectToDevice = async (device: Device) => {
    try {
      const deviceConnection = await bleManager.connectToDevice(device.id);
      console.log("deviceConnection: " + deviceConnection);
      setConnectedDevice(deviceConnection);
      await deviceConnection.discoverAllServicesAndCharacteristics();
      bleManager.stopDeviceScan();

      // Start streaming heart rate data
      startHeartRateStreaming(deviceConnection);
    } catch (e) {
      console.log("FAILED TO CONNECT", e);
    }
  };

  const isDuplicteDevice = (devices: Device[], nextDevice: Device) =>
    devices.findIndex((device) => nextDevice.id === device.id) > -1;

  const scanForPeripherals = () =>
    bleManager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.log(error);
      }
      if (device && device.name !== "") {
        setAllDevices((prevState: Device[]) => {
          if (!isDuplicteDevice(prevState, device)) {
            return [...prevState, device];
          }
          return prevState;
        });
      }
    });

  return {
    connectToDevice,
    allDevices,
    connectedDevice,
    color,
    requestPermissions,
    scanForPeripherals,
    startHeartRateStreaming, // Expose the function
    heartRate, // Expose heart rate value
    retrieveHistoricalData,
    isLoadingHistorical,
    historicalData
  };
}

export default useBLE;