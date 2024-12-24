import base64 from "react-native-base64";

class Packet {
  packetType: number;
  serialNumber: number;
  packetSerial: number;
  utcTimestamp: number | null = null; // For packet type 1
  heartRates: number[] = []; // For packet types 1-4
  totalPackets: number | null = null; // For packet type 5
  checksum: number;
  rawData: string;
  decodedValue: string;

  constructor(rawData: string) {
    this.rawData = rawData;
    this.decodedValue = base64.decode(rawData);

    this.packetType = this.decodedValue.charCodeAt(0) & 0x0f; // Low 4 bits
    this.serialNumber = (this.decodedValue.charCodeAt(0) & 0xf0) >> 4; // High 4 bits (packet serial number)
    this.packetSerial = this.decodedValue.charCodeAt(1);

    this.checksum = this.decodedValue.charCodeAt(rawData.length - 1); // Last byte

    this.processPacketData(); // Process data based on packet type
  }

  // Process the packet data according to its type
  private processPacketData(): void {
    switch (this.packetSerial) {
      case 1:
        this.utcTimestamp = this.extractUTCTimestamp(this.decodedValue);
        this.heartRates = this.extractHeartRates(this.decodedValue);
        break;
      case 2:
      case 3:
      case 4:
        this.heartRates = this.extractHeartRates(this.decodedValue);
        break;
      case 5:
        this.totalPackets = this.extractTotalPackets(this.decodedValue)
        break;
      default:
        // console.warn(`Unknown packet type: ${this.packetType}`);
    }
  }

  // Extract UTC timestamp (bytes 2-5)
  private extractUTCTimestamp(rawData: string): number | null {
    if (rawData.length < 6) {
      console.log("Raw data is too short to extract UTC timestamp: " + rawData.length);
      return null;
    }
  
    // Interpret bytes 2-5 as a 4-byte integer (big-endian)
    const extractedValue =
      (rawData.charCodeAt(2) << 24) |
      (rawData.charCodeAt(3) << 16) |
      (rawData.charCodeAt(4) << 8) |
      rawData.charCodeAt(5);
  
    // Optional: Adjust based on your data's encoding
    // For example, if the value represents seconds since the Unix epoch:
    const utcTimestamp = extractedValue > 0 ? extractedValue : null;
    // Validate that the extracted value is within a plausible range
    const currentTimestamp = Math.floor(Date.now() / 1000); // Current Unix time in seconds
    if (utcTimestamp && utcTimestamp < currentTimestamp && utcTimestamp > 0) {
      return utcTimestamp;
    } else {
      console.warn("Extracted UTC timestamp is invalid or out of range:", extractedValue);
      return null;
    }
  }

  // Extract heart rates (bytes 6-18, one byte per heart rate value)
  private extractHeartRates(rawData: string): number[] {
    const heartRates: number[] = [];
  
    // Determine range based on packetSerial
    let startByte: number | null = null;
  
    if (this.packetSerial === 1) {
      startByte = 6;
    } else if (this.packetSerial === 2 || this.packetSerial === 3 || this.packetSerial === 4) {
      startByte = 2;
    }

    if (startByte !== null) {
      for (let i = startByte; i <= 18 && i < rawData.length - 1; i++) { 
        heartRates.push(rawData.charCodeAt(i));
      }
    }
  
    return heartRates;
  }

  // Extract total number of packets from packet type 5 (byte 2)
  private extractTotalPackets(rawData: string): number | null {
    if (rawData.length < 3) return null;
    return rawData.charCodeAt(2);
  }

  // Validate the checksum
  validateChecksum(): boolean {
    const computedChecksum = Array.from(this.rawData.slice(0, -1))
      .map((char) => char.charCodeAt(0))
      .reduce((sum, byte) => sum + byte, 0) & 0xff;

    return computedChecksum === this.checksum;
  }
}

export default Packet;