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

  const sendUserInformation = async (device: Device) => {
    try {
      // Example user information: Customize these values
      const weight = 70 * 10; // in 0.1kg units, e.g., 70kg -> 700
      const age = 30; // Age in years
      const height = 175; // Height in cm
      const stepLength = 75; // Step length in cm
      const gender = 1; // 0: Female, 1: Male
  
      // Packet format: [0xE1, packetSerialNo, weight, age, height, stepLength, gender, checksum]
      const packet = [
        0xE1, // Command Word
        0x00, // Packet serial number (set to 0 for now)
        (weight >> 8) & 0xff, // Weight high byte
        weight & 0xff, // Weight low byte
        age, // Age
        height, // Height
        stepLength, // Step length
        gender, // Gender
      ];
  
      // Add Checksum: Sum of all bytes modulo 256
      const checksum = packet.reduce((sum, byte) => sum + byte, 0) & 0xff;
      packet.push(checksum);
  
      // Convert packet to base64
      const command = base64.encode(String.fromCharCode(...packet));
  
      // Write packet to the device
      console.log("Sending User Information:", packet);
      await device.writeCharacteristicWithoutResponseForService(
        "0000fc00-0000-1000-8000-00805f9b34fb", // Service UUID
        "0000fc21-0000-1000-8000-00805f9b34fb", // Write Characteristic UUID
        command
      );
      console.log("User information sent successfully!");
    } catch (error) {
      console.error("Failed to send user information:", error);
    }
  };

  const sendUTCTime = async (device: Device) => {
    try {
      const currentUTC = Math.floor(new Date().getTime() / 1000); // Current UTC time in seconds
  
      // Packet format: [0xE2, packetSerialNo, UTC (4 bytes), checksum]
      const packet = [
        0xE2, // Command Word
        0x00, // Packet serial number (set to 0 for now)
        (currentUTC >> 24) & 0xff, // UTC high byte
        (currentUTC >> 16) & 0xff,
        (currentUTC >> 8) & 0xff,
        currentUTC & 0xff, // UTC low byte
      ];
  
      // Add Checksum: Sum of all bytes modulo 256
      const checksum = packet.reduce((sum, byte) => sum + byte, 0) & 0xff;
      packet.push(checksum);
  
      // Convert packet to base64
      const command = base64.encode(String.fromCharCode(...packet));
  
      // Write packet to the device
      console.log("Sending UTC Time:", packet);
      await device.writeCharacteristicWithoutResponseForService(
        "0000fc00-0000-1000-8000-00805f9b34fb", // Service UUID
        "0000fc21-0000-1000-8000-00805f9b34fb", // Write Characteristic UUID
        command
      );
      console.log("UTC time sent successfully!");
    } catch (error) {
      console.error("Failed to send UTC time:", error);
    }
  };
  
  

  const sendAcknowledgment = async (
    device: Device,
    characteristicUUID: string,
    packetNumber: number
  ) => {
    try {
      // Command structure: "E0" + Packet Serial Number
      const acknowledgmentCommand = String.fromCharCode(0xe0, packetNumber);
      const encodedCommand = base64.encode(acknowledgmentCommand);
  
      console.log(`Sending ACK for Packet Serial: ${packetNumber}`);
      await device.writeCharacteristicWithResponseForService(
        "0000fc00-0000-1000-8000-00805f9b34fb", // Service UUID
        characteristicUUID,                   // Characteristic UUID
        encodedCommand
      );
    } catch (error) {
      console.error("Failed to send acknowledgment:", error);
    }
  };



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
              characteristic.isWritableWithoutResponse
            ) {
              // Send command to request historical data
              const command = base64.encode("\x01"); // Example command
              await characteristic.writeWithoutResponse(command);
              console.log("Historical data command sent successfully.");
            }
          }
        }
      }
  
      // Listen for incoming packets on the notify characteristic
      device.monitorCharacteristicForService(
        "0000fc00-0000-1000-8000-00805f9b34fb",
        "0000fc20-0000-1000-8000-00805f9b34fb",
        async (error, characteristic) => {
          if (error) {
            console.error("Error receiving historical data:", error);
            return;
          }
      
          if (characteristic?.value) {
            const rawValue = characteristic.value;
            const decodedValue = base64.decode(rawValue);
      
            const packetType = decodedValue.charCodeAt(0) & 0x0f; // Low 4 bits
            const serialNumber = (decodedValue.charCodeAt(0) & 0xf0) >> 4; // High 4 bits
            console.log(
              `Packet Type: ${packetType}, Serial Number: ${serialNumber}`
            );
      
            // Log full decoded packet
            // console.log(
            //   "Full Decoded Packet:",
            //   decodedValue
            //     .split("")
            //     .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
            //     .join(" ")
            // );
      
            if (packetType >= 1 && packetType <= 4) {
              // Extract heart rate values
              const heartRateValues: number[] = [];
              for (let i = 6; i < decodedValue.length - 1; i++) {
                heartRateValues.push(decodedValue.charCodeAt(i));
              }
              // console.log("Heart Rate Values:", heartRateValues);
      
              setHistoricalData((prev) => [...prev, ...heartRateValues]);
      
              // Acknowledge the packet
              await sendAcknowledgment(device, "0000fc21-0000-1000-8000-00805f9b34fb", serialNumber);
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
      console.log("Connected to device:", deviceConnection);
      setConnectedDevice(deviceConnection);
  
      await deviceConnection.discoverAllServicesAndCharacteristics();


          // Retrieve all services
    const services = await deviceConnection.services();
    console.log("Discovered Services:");

    for (const service of services) {
      console.log(`Service UUID: ${service.uuid}`);

      // Retrieve characteristics for each service
      // const characteristics = await service.characteristics();
      // for (const characteristic of characteristics) {
      //   console.log(`  Characteristic UUID: ${characteristic.uuid}`);
      //   console.log(`    - Is Readable: ${characteristic.isReadable}`);
      //   console.log(`    - Is Writable (With Response): ${characteristic.isWritableWithResponse}`);
      //   console.log(`    - Is Writable (Without Response): ${characteristic.isWritableWithoutResponse}`);
      //   console.log(`    - Is Notifiable: ${characteristic.isNotifiable}`);
      //   console.log(`    - Is Indicatable: ${characteristic.isIndicatable}`);
      // }
    }

  
      // Stop scanning for other devices
      bleManager.stopDeviceScan();
  
      // Send UTC and User Information
      await sendUTCTime(deviceConnection);
      await sendUserInformation(deviceConnection);
  
      // Proceed to retrieve historical data
      // retrieveHistoricalData(deviceConnection);
    } catch (error) {
      console.error("Connection failed:", error);
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