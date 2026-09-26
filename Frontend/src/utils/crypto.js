// Frontend/src/utils/crypto.js
// Utility for End-to-End Encryption using the native Web Crypto API

/**
 * ArrayBuffer <-> Base64 Helpers
 */
export const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const base64ToArrayBuffer = (base64) => {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
};

/**
 * Generate a completely random Salt or IV
 */
export const generateRandomBytes = (length = 16) => {
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  return arrayBufferToBase64(array.buffer);
};

/**
 * Step 1: Generate the user's ECDH Key Pair
 */
export const generateKeyPair = async () => {
  return await window.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true, // extractable so we can export it and encrypt it
    ["deriveKey", "deriveBits"]
  );
};

/**
 * Step 2: Derive a Symmetric Key (AES-GCM) from the user's login password
 */
export const deriveWrappingKey = async (password, saltBase64) => {
  const enc = new TextEncoder();
  const passwordKey = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const saltBuffer = base64ToArrayBuffer(saltBase64);

  return await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: 10000,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

/**
 * Step 3: Wrap (Encrypt) the Private Key using the derived Wrapping Key
 */
export const wrapPrivateKey = async (privateKey, wrappingKey) => {
  // Export private key to raw format (PKCS8)
  const exported = await window.crypto.subtle.exportKey("pkcs8", privateKey);
  
  // Generate a random IV for the AES-GCM encryption
  const ivBuffer = new Uint8Array(12);
  window.crypto.getRandomValues(ivBuffer);

  // Encrypt the exported key
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBuffer },
    wrappingKey,
    exported
  );

  return {
    encryptedPrivateKey: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(ivBuffer.buffer),
  };
};

/**
 * Step 4: Unwrap (Decrypt) the Private Key using the password-derived key
 */
export const unwrapPrivateKey = async (encryptedPrivateKeyBase64, ivBase64, wrappingKey) => {
  const encryptedBuffer = base64ToArrayBuffer(encryptedPrivateKeyBase64);
  const ivBuffer = base64ToArrayBuffer(ivBase64);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBuffer },
    wrappingKey,
    encryptedBuffer
  );

  return await window.crypto.subtle.importKey(
    "pkcs8",
    decryptedBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    false, // NOT extractable — raw bytes can never be read from JS
    ["deriveKey", "deriveBits"]
  );
};

/**
 * Export Public Key to Base64 (to send to server)
 */
export const exportPublicKey = async (publicKey) => {
  const exported = await window.crypto.subtle.exportKey("spki", publicKey);
  return arrayBufferToBase64(exported);
};

/**
 * Import Public Key from Base64 (fetched from server)
 */
export const importPublicKey = async (publicKeyBase64) => {
  const buffer = base64ToArrayBuffer(publicKeyBase64);
  return await window.crypto.subtle.importKey(
    "spki",
    buffer,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
};

/**
 * Step 5: Derive a Shared Secret between Alice's Private Key and Bob's Public Key
 */
export const deriveSharedSecret = async (myPrivateKey, theirPublicKey) => {
  return await window.crypto.subtle.deriveKey(
    { name: "ECDH", public: theirPublicKey },
    myPrivateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

/**
 * Step 6: Encrypt a Message string using the Shared Secret
 */
export const encryptMessage = async (text, sharedSecretKey) => {
  const enc = new TextEncoder();
  const encoded = enc.encode(text);
  
  const iv = new Uint8Array(12);
  window.crypto.getRandomValues(iv);

  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    sharedSecretKey,
    encoded
  );

  // Combine IV and Ciphertext for easy storage
  const combined = new Uint8Array(iv.length + ciphertextBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertextBuffer), iv.length);

  return arrayBufferToBase64(combined.buffer);
};

/**
 * Step 7: Decrypt a Message string using the Shared Secret
 */
export const decryptMessage = async (encryptedBase64, sharedSecretKey) => {
  try {
    const combinedBuffer = base64ToArrayBuffer(encryptedBase64);
    const combined = new Uint8Array(combinedBuffer);
    
    // Extract IV (first 12 bytes) and ciphertext (the rest)
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      sharedSecretKey,
      ciphertext
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
  } catch (error) {
    console.error("Failed to decrypt message:", error);
    return "[Encrypted message - could not decrypt]";
  }
};

/**
 * --- GROUP CHAT E2EE HELPERS ---
 */

/**
 * Generate a random AES-GCM key for a Group Chat
 */
export const generateGroupKey = async () => {
  return await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable so we can encrypt it and send to others
    ["encrypt", "decrypt"]
  );
};

/**
 * Encrypt the AES Group Key using a pairwise shared secret
 */
export const encryptGroupKey = async (groupKey, sharedSecretKey) => {
  // Export the group key to raw bytes
  const rawGroupKey = await window.crypto.subtle.exportKey("raw", groupKey);
  
  const iv = new Uint8Array(12);
  window.crypto.getRandomValues(iv);

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    sharedSecretKey,
    rawGroupKey
  );

  const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedBuffer), iv.length);

  return arrayBufferToBase64(combined.buffer);
};

/**
 * Decrypt the AES Group Key using a pairwise shared secret
 */
export const decryptGroupKey = async (encryptedGroupKeyBase64, sharedSecretKey) => {
  const combinedBuffer = base64ToArrayBuffer(encryptedGroupKeyBase64);
  const combined = new Uint8Array(combinedBuffer);
  
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const rawGroupKeyBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    sharedSecretKey,
    ciphertext
  );

  return await window.crypto.subtle.importKey(
    "raw",
    rawGroupKeyBuffer,
    { name: "AES-GCM", length: 256 },
    true, // Must be extractable so admins can re-encrypt it for new members
    ["encrypt", "decrypt"]
  );
};

/**
 * --- FILE E2EE HELPERS ---
 */

/**
 * Encrypt a File/Blob (returns encrypted Blob + exported Key + IV)
 */
export const encryptFile = async (fileBlob) => {
  // Generate an ephemeral AES-GCM key specifically for this file
  const fileKey = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const iv = new Uint8Array(12);
  window.crypto.getRandomValues(iv);

  const arrayBuffer = await fileBlob.arrayBuffer();

  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    fileKey,
    arrayBuffer
  );

  const rawKey = await window.crypto.subtle.exportKey("raw", fileKey);

  return {
    encryptedBlob: new Blob([ciphertextBuffer]),
    fileKeyBase64: arrayBufferToBase64(rawKey),
    ivBase64: arrayBufferToBase64(iv.buffer)
  };
};

/**
 * Decrypt a File/Blob using its exported Key and IV
 */
export const decryptFile = async (encryptedArrayBuffer, fileKeyBase64, ivBase64, mimeType) => {
  try {
    const rawKeyBuffer = base64ToArrayBuffer(fileKeyBase64);
    const fileKey = await window.crypto.subtle.importKey(
      "raw",
      rawKeyBuffer,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    const ivBuffer = base64ToArrayBuffer(ivBase64);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBuffer },
      fileKey,
      encryptedArrayBuffer
    );

    return new Blob([decryptedBuffer], { type: mimeType });
  } catch (error) {
    console.error("Failed to decrypt file:", error);
    throw error;
  }
};
