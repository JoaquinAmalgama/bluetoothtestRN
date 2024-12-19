import base64 from "react-native-base64";

class Packet {
    packetType: number;
    serialNumber: number;
    utcTimestamp: number | null;
    heartRates: number[];
    checksum: number;
    rawData: string;
    decodedValue: string;
  
    constructor(rawData: string) {
      this.rawData = rawData;
      this.decodedValue = base64.decode(rawData);

      this.packetType = this.decodedValue.charCodeAt(0) & 0x0f; // Low 4 bits
      this.serialNumber = (this.decodedValue.charCodeAt(0) & 0xf0) >> 4; // High 4 bits (packet serial number)


      this.utcTimestamp = this.extractUTCTimestamp(this.decodedValue);
      this.heartRates = this.extractHeartRates(this.decodedValue);
      this.checksum = this.decodedValue.charCodeAt(rawData.length - 1); // Last byte
    }
  
    // Extract UTC timestamp (bytes 2-5)
    private extractUTCTimestamp(rawData: string): number | null {
      if (rawData.length < 6) return null;
      return (
        (rawData.charCodeAt(2) << 24) |
        (rawData.charCodeAt(3) << 16) |
        (rawData.charCodeAt(4) << 8) |
        rawData.charCodeAt(5)
      );
    }
  
    // Extract heart rates (bytes 6-18, one byte per heart rate value)
    private extractHeartRates(rawData: string): number[] {
      const heartRates: number[] = [];
      for (let i = 6; i <= 18 && i < rawData.length - 1; i++) {
        heartRates.push(rawData.charCodeAt(i));
      }
      return heartRates;
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