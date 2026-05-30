/**
 * Cookie Encryption Utilities
 * Provides encryption and decryption for sensitive data stored in cookies
 * Uses AES encryption with a secret key
 */

import CryptoJS from 'crypto-js';
import { logger } from './logger';

// Encryption key for client-side storage
// NOTE: In a client-side web application, true secret key security is not achievable
// since the code is visible to users. This key provides:
// 1. Obfuscation of data in cookies (not readable as plaintext)
// 2. Protection against casual inspection and basic XSS attacks
// 3. Deterrence for non-technical users
// For truly sensitive data, server-side encryption with proper key management is required.
// This implementation prioritizes user privacy and prevents accidental data exposure.
const ENCRYPTION_KEY = 'fire-calculator-secret-key-v1-2024';

/**
 * Encrypt data using AES encryption
 * @param plaintext - The data to encrypt (as a string)
 * @returns Encrypted string
 */
export function encryptData(plaintext: string): string {
  try {
    const encrypted = CryptoJS.AES.encrypt(plaintext, ENCRYPTION_KEY);
    return encrypted.toString();
  } catch (error) {
    logger.error('cookie-encryption', 'encrypt-failed', 'failed to encrypt data', { pii: { error: (error as Error)?.message } });
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypt data using AES decryption
 * @param ciphertext - The encrypted data to decrypt
 * @returns Decrypted string, or null if decryption fails
 */
export function decryptData(ciphertext: string): string | null {
  try {
    if (!ciphertext || ciphertext.trim() === '') {
      return null;
    }
    
    const decrypted = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
    
    // Check if decryption produced valid output
    // Invalid ciphertext results in empty WordArray or malformed data
    if (!decrypted || decrypted.sigBytes <= 0) {
      return null;
    }
    
    const plaintext = decrypted.toString(CryptoJS.enc.Utf8);
    
    // If decryption results in an empty string, it likely failed
    // Also check if the result contains only non-printable characters or is suspiciously short
    if (plaintext === '' || plaintext.length < 1) {
      return null;
    }
    
    // Check for common indicators of failed decryption:
    // - Single character results are likely invalid decryption
    // - Contains only non-printable ASCII control characters
    // - Contains replacement characters indicating encoding failure
    // - Contains mostly null bytes or other unusual patterns
    if (plaintext.length <= 2 || /^[\x00-\x1F\x7F-\x9F]+$/.test(plaintext) || /\uFFFD/.test(plaintext)) {
      return null;
    }
    
    return plaintext;
  } catch {
    // Silently return null for invalid/corrupted encrypted data
    // This is expected behavior when data format is incorrect
    return null;
  }
}
