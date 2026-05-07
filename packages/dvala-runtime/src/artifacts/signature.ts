export type CoseAlgorithm = 'EdDSA' | 'ES256' | 'ES384'

export type CoseSignatureEnvelope = {
  format: 'cose-sign1'
  keyId?: string
  algorithm?: CoseAlgorithm
  bytes: Uint8Array
}
