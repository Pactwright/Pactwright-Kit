# Facilitator API & Integration Guide (Pact Scheme)

This document specifies the HTTP endpoints implemented by the Accensa Facilitator for the `pact` scheme (ROADMAP X-07, ARCH §6.4).

## OpenAPI 3.1 Specification Summary

### 1. `POST /verify`
Validates that an unsigned or signed transaction conforms to the `pact` scheme.

**Request Body:**
```json
{
  "scheme": "pact",
  "contractId": "CDUXJJUNQG7Q5C42N5E5QG7Q5C42N5E5QG7Q5C42N5E5QG7Q5C42N5E5",
  "payTo": "GA...",
  "amount": "1.00",
  "pactId": "c3ab...",
  "condition": { "kind": "document.translation" },
  "conditionHash": "e3b0c442..."
}
```

**Response (200 OK):**
```json
{
  "valid": true,
  "scheme": "pact",
  "pactId": "c3ab..."
}
```

---

### 2. `POST /settle`
Submits the verified `pact.open` transaction to the Stellar network with fee sponsorship.

**Request Body:**
```json
{
  "scheme": "pact",
  "txEnvelope": "AAAA..."
}
```

**Response (200 OK):**
```json
{
  "pact_id": "c3ab...",
  "tx_hash": "a4d9..."
}
```

---

### 3. `POST /pact/submit`
Allow-listed gateway for terminal pact transitions with fee sponsorship.

**Request Body:**
```json
{
  "action": "settle" | "release" | "close_meter" | "extend_pact_ttl",
  "pact_id": "c3ab...",
  "actual": "1.00",
  "units": 10,
  "signature": "AAAA..."
}
```

**Response (200 OK):**
```json
{
  "tx_hash": "f8a1...",
  "status": "success"
}
```
