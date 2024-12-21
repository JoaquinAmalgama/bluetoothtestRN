import { useMemo, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import * as ExpoDevice from "expo-device";
import base64 from "react-native-base64";
import Packet from "./packet"
import {
  BleError,
  BleManager,
  Characteristic,
  Device,
} from "react-native-ble-plx";

const bleManager = new BleManager();


interface ProcessedPackets {
  [serialNumber: number]: Packet;
}

function useBLE() {

  const processedPackets: Packet[] = [];

  const [userInformationSynced, setUserInformationSynced] = useState(false);
  const [utcTimeSynced, setUtcTimeSynced] = useState(false);
  const [isLoadingHistorical, setIsLoadingHistorical] = useState<boolean>(false);
  const [historicalData, setHistoricalData] = useState<number[]>([]); // Stores historical heart rate data
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [color, setColor] = useState("white");
  const [heartRate, setHeartRate] = useState<number | null>(null); // Heart rate state now inside useBLE
  const [battery, setBattery] = useState<number | null>(null); // Heart rate state now inside useBLE

  const sendUserInformation = async (device: Device, devicePacket: Packet) => {
    try {
      const weight = 70 * 10; // Weight in 0.1kg units
      const age = 30; // Age in years
      const height = 175; // Height in cm
      const stepLength = 75; // Step length in cm
      const gender = 1; // 1: Male, 0: Female
      const serialNumber = devicePacket.serialNumber

      const packet = [
        0xE1, // Command Word
        serialNumber, // Packet serial number
        (weight >> 8) & 0xff, // Weight high byte
        weight & 0xff,        // Weight low byte
        age,                  // Age
        height,               // Height
        stepLength,           // Step length
        gender,               // Gender
      ];

      console.log("Packet " + packet)

      const checksum = packet.reduce((sum, byte) => sum + byte, 0) & 0xff;
      packet.push(checksum);



      console.log("Packet before being encoded: " + packet)
      const command = base64.encode(String.fromCharCode(...packet));
      console.log("After encoding:", command);
      await device.writeCharacteristicWithoutResponseForService(
        "0000fc00-0000-1000-8000-00805f9b34fb",
        "0000fc21-0000-1000-8000-00805f9b34fb",
        command
      );

      // console.log("User Information Sent. Sending Acknowledgment...");

      // // Immediately send acknowledgment (E0)
      // const ackPacket = [0xE0, 0x00]; // E0 + packet serial number
      // const ackCommand = base64.encode(String.fromCharCode(...ackPacket));

      // await device.writeCharacteristicWithoutResponseForService(
      //   "0000fc00-0000-1000-8000-00805f9b34fb",
      //   "0000fc21-0000-1000-8000-00805f9b34fb",
      //   ackCommand
      // );

      console.log("Acknowledgment Sent Successfully!");
    } catch (error) {
      console.error("Failed to send user information or acknowledgment:", error);
    }
  };

  const sendUnchangedUserInformation = async (device: Device, devicePacket: Packet) => {
    const packet = [
      0xe0, // Command word
      devicePacket.serialNumber, // Packet serial number
      0x00, // Acknowledge packet as correct
    ];
    const checksum = packet.reduce((sum, byte) => sum + byte, 0) & 0xff;
    packet.push(checksum);
    const command = base64.encode(String.fromCharCode(...packet));

    try {
      await device.writeCharacteristicWithoutResponseForService(
        "0000fc00-0000-1000-8000-00805f9b34fb",
        "0000fc21-0000-1000-8000-00805f9b34fb",
        command,
      );
    } catch (error) {
      console.error("Failed to send user information or acknowledgment:", error);
    }
  }


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



  const retrieveHistoricalData = async (device: Device) => {

    try {
      console.log("Requesting historical data...");

      // Discover all services and characteristics first
      await device.discoverAllServicesAndCharacteristics();

      // Listen for incoming packets on the notify characteristic
      device.monitorCharacteristicForService(
        "0000fc00-0000-1000-8000-00805f9b34fb", // Service UUID
        "0000fc20-0000-1000-8000-00805f9b34fb", // Notify characteristic
        async (error, characteristic) => {
          if (error) {
            console.error("Error receiving notification:", error);
            return;
          }

          if (characteristic?.value) {
            const packet = new Packet(characteristic.value)

            console.log(`Received Packet Type: ${packet.packetType}, Serial Number: ${packet.serialNumber}, PacketSerial:  ${packet.packetSerial}`);

            if (packet.packetType == 1) {
              console.log("requesting user Information")
              // sendUserInformation(device, packet)
              sendUnchangedUserInformation(device, packet)
            } else if (packet.packetType == 2) {
              console.log("Requesting UTC")
              // sendUTCTime(device)
              sendUnchangedUserInformation(device, packet)
            } else if (packet.packetType == 6) {
              console.log("Packet 6 found. Dying")
            } else if (packet.packetType == 8) {
              processedPackets.push(packet)

              if (packet.packetSerial == 5) {
                // Construct and send acknowledgment
                const ackPacket = [
                  0xe0, // Command word
                  packet.serialNumber, // Packet serial number
                  0x00, // Acknowledge packet as correct
                ];
                const checksum = ackPacket.reduce((sum, byte) => sum + byte, 0) & 0xff; // Compute checksum
                ackPacket.push(checksum);

                const encodedAck = base64.encode(String.fromCharCode(...ackPacket));

                try {
                  await device.writeCharacteristicWithoutResponseForService(
                    "0000fc00-0000-1000-8000-00805f9b34fb", // Service UUID
                    "0000fc21-0000-1000-8000-00805f9b34fb", // Write Characteristic UUID
                    encodedAck
                  );
                  console.log("Acknowledgment sent successfully for Serial Number:", packet.serialNumber);
                } catch (writeError) {
                  console.error("Failed to send acknowledgment:", writeError);
                }
              }
            } else if (packet.packetType == 6) {
              console.log("Type 6 dont know what to do")
            } else {
              console.log(packet.packetType)
            }

          }
        }
      );

      device.onDisconnected(() => {
        // console.warn("Device disconnected. Resetting states.");
        // setUserInformationSynced(false);
        // setUtcTimeSynced(false);
        // setProcessedSerials(new Set()); // Clear processed serial numbers
        console.log("On disconnect")
        console.log(processedPackets)
      });
    } catch (error) {
      console.error("Failed to retrieve historical data:", error);
    } finally {
      console.log("finally: ")
      console.log(processedPackets)
    }
  };




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
            setHeartRate(heartRateValue); // Update the state
          }
        }
      );
    } catch (error) {
      console.error("Failed to monitor heart rate:", error);
    }
  };


  const startBatteryStreaming = async (device: Device) => {
    try {
      await device.monitorCharacteristicForService(
        "0000180f-0000-1000-8000-00805f9b34fb", // Battery Service
        "00002a19-0000-1000-8000-00805f9b34fb", // Battery Measurement Characteristic UUID
        (error, characteristic) => {
          if (error) {
            console.error("Battery Monitor Error:", error);
            return;
          }
          if (characteristic?.value) {
            const rawValue = base64.decode(characteristic.value);
            const battery = rawValue.charCodeAt(0); // Extract heart rate value
            setBattery(battery); // Update the state
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
      bleManager.stopDeviceScan();

      startHeartRateStreaming(device)
      startBatteryStreaming(device)

      // Reset state
      setUserInformationSynced(false);
      const services = await device.services();
      for (const service of services) {
        // console.log(`Service UUID: ${service.uuid}`);
        const characteristics = await service.characteristics();
        for (const characteristic of characteristics) {
          // console.log(`  Characteristic UUID: ${characteristic.uuid}`);
          // console.log(`    Is Notifiable: ${characteristic.isNotifiable}`);
          // console.log(`    Is Readable: ${characteristic.isReadable}`);
          // console.log(`    Is Writable: ${characteristic.isWritableWithResponse}`);
        }
      }

      // Monitor notifications for handshake
      // deviceConnection.monitorCharacteristicForService(
      //   "0000fc00-0000-1000-8000-00805f9b34fb", // Service UUID
      //   "0000fc20-0000-1000-8000-00805f9b34fb", // Notify characteristic
      //   async (error, characteristic) => {
      //     if (error) {
      //       console.error("Error receiving notification:", error);
      //       return;
      //     }

      //     if (characteristic?.value) {
      //       const decodedValue = base64.decode(characteristic.value);
      //       const packetType = decodedValue.charCodeAt(0) & 0x0f; // Low 4 bits
      //       const serialNumber = (decodedValue.charCodeAt(0) & 0xf0) >> 4; // Serial number

      //       console.log(`Received Packet Type: ${packetType}, Serial: ${serialNumber}`);

      //       // Handle user information packet (0x1)
      //       if (packetType === 1 && !userInformationSynced) {
      //         console.log("Received User Information Packet. Sending User Info...");
      //         await sendUserInformation(deviceConnection);
      //       }
      //       // Handle acknowledgment (0xE0)
      //       else if (packetType === 0xE0) {
      //         console.log("Received Acknowledgment. User Information Synced.");
      //         setUserInformationSynced(true); // Mark user info as synced
      //       }
      //       // Handle UTC packet (0x2)
      //       else if (packetType === 2 && !utcTimeSynced) {
      //         console.log("Received UTC Request. Sending UTC Time...");
      //         await sendUTCTime(deviceConnection);
      //       }
      //     }
      //   }
      // );

    } catch (error) {
      console.error("Failed to connect and set up device:", error);
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
    startBatteryStreaming,
    startHeartRateStreaming, // Expose the function
    heartRate, // Expose heart rate value
    battery,
    retrieveHistoricalData,
    isLoadingHistorical,
    historicalData
  };
}

export default useBLE;