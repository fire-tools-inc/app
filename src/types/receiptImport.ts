export interface ReceiptDocument {
  id: number;
  fileName: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  byteLength: number;
  sha256: string;
  status: 'pending' | 'reviewed';
  createdAt: string;
}

export interface ReceiptPairing {
  id: string;
  port: number;
  expiresAt: string;
  urls: string[];
}
