# P2P File Sharing App – Working Document

## 1. High-Level Overview
Decentralized peer-to-peer system for locating and exchanging file chunks among peers without needing a central file server. A lightweight coordination (tracker or DHT) layer helps peers discover each other. Integrity and resuming are enabled via chunk hashes.

## 2. Architecture (Conceptual)
```
+-----------+          +-----------+
|   Peer A  |<-------->|   Peer B  |
+-----------+    ^     +-----------+
      ^          |           ^
      |          v           |
   +-----------------------------+
   |        Other Peers          |
   +-----------------------------+
            (Overlay)
        (Optional Tracker)
        
```

## 3. Core Components
- Peer Node: Runs listener + outbound dialer.
- Discovery Layer: Tracker API OR DHT (Kademlia-style buckets).
- Metadata Index: Maps fileID -> chunk hashes, sizes.
- Chunker: Splits/merges files into fixed-size blocks.
- Transfer Engine: Parallel chunk requests, rate limiting, retry logic.
- Verification: Per-chunk hash + root (Merkle or concatenated hash list).
- Persistence: Local manifest of known files, partial downloads.
- CLI / UI: User commands (share, search, download, list, stats).
- Connection Manager: Maintains active sessions (keep-alive + timeouts).

## 4. Key Data Structures
- FileDescriptor: { fileId, filename, totalSize, chunkSize, chunkCount, chunkHashes[] }
- PeerInfo: { peerId, addr, lastSeen, capabilities }
- Session State: { inFlightChunks, bandwidthStats, retryCounters }

## 5. File Lifecycle Workflows
1. Join:
   - Start listener (TCP / QUIC / WebRTC).
   - Register with tracker OR bootstrap DHT nodes.
2. Share (Publish):
   - Chunk file, compute hashes.
   - Store descriptor locally.
   - Announce availability (fileId + availability bitmap).
3. Search:
   - Send SEARCH(query|fileId) to tracker / DHT iterative lookups.
   - Receive SEARCH_RESULT with candidate peers + descriptor summary.
4. Download:
   - Fetch descriptor (if missing).
   - Build priority queue of needed chunks (e.g., rarest-first).
   - Open parallel connections; send CHUNK_REQUEST(index).
   - Validate CHUNK_RESPONSE via hash; write to temp store.
5. Integrity & Completion:
   - After final chunk, verify aggregate (optional Merkle root).
   - Move temp -> final path; mark seeding.
6. Resume:
   - On restart, scan partial file + verify existing chunks; request missing ones.
7. Leave:
   - Optional LEAVE message OR passive timeout by others.

## 6. Message Types (Example)
- HELLO(peerId, version)
- PING / PONG (liveness)
- SEARCH(query|fileId, limit)
- SEARCH_RESULT(fileId, peers[], descriptorDigest)
- DESCRIPTOR_REQUEST(fileId)
- DESCRIPTOR_RESPONSE(descriptor)
- HAVE(fileId, bitfieldDelta)
- CHUNK_REQUEST(fileId, index, wantHash=bool)
- CHUNK_RESPONSE(fileId, index, data [, hash])
- CANCEL(fileId, index)
- LEAVE(peerId)

(Actual encoding: JSON / protobuf / custom binary.)

## 7. Chunking Strategy
- Fixed size (e.g. 1 MiB) except final remainder.
- Trade-offs: Larger => fewer messages; smaller => better swarm parallelism.
- Adaptive option: Switch size based on total file size thresholds.

## 8. Hash & Integrity
- Per-chunk SHA-256.
- Optional Merkle tree for faster partial verification (root stored in descriptor).
- If Merkle unused: descriptor includes ordered list of chunk hashes.
- Fast corrupt detection: discard + re-request chunk.

## 9. Peer Selection & Scheduling
- Maintain RTT + throughput metrics.
- Rarest-first to avoid chunk scarcity.
- End-game mode: duplicate remaining requests to multiple peers; keep first valid response.

## 10. Concurrency Model
- Event loop (async I/O) OR thread pool (listener, disk, hashing).
- Bounded worker queue for hashing/chunk writes.
- Backpressure: limit in-flight chunks per peer.

## 11. Timeouts & Retries
- CHUNK_REQUEST timeout => exponential backoff (cap).
- Drop peer after N consecutive failures.
- Periodic PING; remove stale entries.

## 12. NAT Traversal (Optional)
- UPnP / NAT-PMP port mapping attempt.
- STUN to learn public endpoint.
- TURN / relay fallback if direct fails (configurable).

## 13. Security Considerations
- Integrity via hashes (prevents corruption).
- Optional TLS / Noise handshake for channel encryption.
- Peer authentication (future): signed descriptors.
- Rate limiting + ban list to mitigate abuse.
- Avoid executing any received data; treat as opaque bytes.

## 14. Performance Optimizations
- Zero-copy send (buffer pooling).
- Parallel hashing with incremental pipeline (read -> hash -> dispatch).
- Adaptive chunk request window based on observed bandwidth.
- Compression negotiation (skip if already compressed format).
- Persistent connection reuse.

## 15. Persistence Layout (Example)
```
data/
  descriptors/<fileId>.json
  temp/<fileId>.part
  complete/<originalFilename>
  state/peers.json
```

## 16. CLI Example (Hypothetical)
```
share myvideo.mp4
search "myvideo"
download <fileId>
list
stats
```

## 17. Error Handling Examples
- Descriptor mismatch: abort + re-fetch descriptor.
- Hash mismatch: increment peer strike; after threshold, blacklist temporarily.
- Disk full: pause downloads; notify user.
- Network partition: keep queue; retry discovery after interval.

## 18. Quick Start (Concept)
1. Install dependencies.
2. Run node: p2p-node --listen :7000 --bootstrap host:7000
3. Share file: p2p-cli share ./file.iso
4. Search: p2p-cli search file.iso
5. Download: p2p-cli get <fileId>
6. Monitor: p2p-cli stats

## 19. Future Enhancements
- Plug-in encryption layer.
- Swarm-level reputation.
- Streaming mode (prioritize sequential early chunks).
- Web UI.
- Partial file preview (progressive hashing).
- Dynamic chunk size adaptation.

## 20. Glossary
- Chunk: Fixed-size segment of a file.
- Descriptor: Metadata describing a file and its chunks.
- Swarm: Set of peers sharing a file.
- Rarest-first: Strategy prioritizing least available chunks.
- In-flight: Requested but not yet received.

## 21. Minimal State Machine (Download)
States: INIT -> FETCH_DESCRIPTOR -> SCHEDULING -> DOWNLOADING -> VERIFYING -> COMPLETE | ERROR -> (optionally RESUME)
Transitions triggered by events (descriptor_ok, chunk_ok, chunk_fail, all_chunks_received, hash_fail, user_cancel).

## 22. Testing Pointers
- Unit: hashing, descriptor parsing, bitmap diff.
- Integration: multi-peer chunk exchange.
- Adversarial: corrupt chunk injection, slow peer, disappearing peer.

## 23. Metrics (Examples)
- chunks/sec, bytes/sec (per peer + aggregate)
- activePeers, failedPeers
- retransmissions
- integrityFailures
- averageRTT

## 24. Comparison to Existing Systems (Expanded)

### 24.1 Summary Snapshot

| System | Primary Focus | Discovery | Integrity Model | Incentives | Privacy/Anonymity | Browser Friendly | Extensibility |
|--------|---------------|-----------|-----------------|-----------|-------------------|------------------|---------------|
| Our System | Lean, modular high-performance transfers | Tracker or pluggable DHT | Per-chunk SHA-256 + optional Merkle | Not yet | Optional TLS/Noise (no anonymity) | Optional (future WebRTC) | High (pluggable layers) |
| BitTorrent (v1/v2) | Swarm efficiency + incentives | Trackers + DHT | Piece hashes (v2 adds Merkle) | Tit-for-tat | Low | Via WebTorrent variant | Medium (BEPs) |
| IPFS | Global content-addressed DAG | DHT (Kademlia) | Merkle DAG CIDs | None intrinsic | Moderate (content addressing) | Gateway-dependent | High (protocol libs) |
| GNUnet | Privacy, censorship resistance | Private routing layers | Various per subsystem | Resource economics | High | No | High (modular stack) |
| Gnutella (legacy) | Decentralized search | Query flooding / ultrapeers | File-level / hash | None | Low | No | Low (legacy) |
| eDonkey/eMule | Hybrid discovery + credits | Servers + Kad | Chunk hashes | Credit/queue system | Low | No | Low/Legacy |
| WebTorrent | Browser P2P | WebRTC tracker/WS | Piece hashes | None | Low | Yes (browser-first) | Medium |
| Resilio Sync | Encrypted folder sync | Trackers / LAN / relay | Encrypted chunks | Proprietary | Encrypted (no anonymity) | Limited | Low (closed) |

### 24.2 Detailed Pros / Cons

#### Our System (Current)
Pros:
- Modular: pluggable discovery (tracker or DHT), security, scheduling strategies.
- Optional Merkle hashing from inception (prepared for BitTorrent v2–style integrity).
- Rarest-first + end-game strategies built in early.
- Metrics-first (RTT, throughput, integrity failures) enabling adaptive policies.
- Simplicity: lower cognitive load vs IPFS DAG complexity for plain file transfers.
- Clean persistence model (descriptors, temp, final separation).
Cons:
- No incentive/fairness layer (risk of freeloaders).
- Limited privacy/anonymity; only optional encryption, no routing obfuscation.
- No content-addressed multi-file graphs (single-file centric).
- No browser-native UX yet (WebRTC not default).
- No access control / group encryption.
- No reputation or anti-abuse scoring beyond strikes/blacklist.

#### BitTorrent
Pros: Mature swarm economics (tit-for-tat), massive ecosystem, efficient piece distribution, BEP extensibility.
Cons: Incentive logic complexity; interoperability constraints if deviating; anonymity lacking.

#### IPFS
Pros: Global addressing (CIDs), Merkle DAG enabling dedup + composability, broad tooling ecosystem.
Cons: Overhead for simple one-off file transfers; DAG pin/set management complexity; variable performance for large sequential downloads.

#### GNUnet
Pros: Strong privacy, censorship resistance, research-grade architecture.
Cons: Higher latency/complexity; heavier stack; overkill for straightforward file swarming.

#### Gnutella
Pros: Historical fully decentralized discovery (no central trackers).
Cons: Inefficient flooding; outdated integrity approach; scalability issues.

#### eDonkey / eMule
Pros: Hybrid resilience (servers + DHT), credit system discourages freeloaders.
Cons: Legacy protocols; slower evolution; higher barrier to modern extension.

#### WebTorrent
Pros: Browser accessibility (no install), WebRTC NAT traversal built-in.
Cons: Browser throughput/CPU constraints; dependency on trackers/web seeds; less flexible transports.

#### Resilio Sync
Pros: Encrypted device-to-device sync, production polish, delta sync efficiency.
Cons: Closed source; not a general open P2P sharing protocol; limited extensibility.

### 24.3 Our Current Strengths (Differentiators)
- Early Merkle integration readiness (future-proof for v2-like hashing).
- Unified abstraction boundary for discovery → easy swap between tracker and DHT.
- Scheduling hooks (rarest-first, end-game) exposed for future incentive insertion.
- Metrics & telemetry baked into design (enables adaptive congestion / window control).
- Clear separation of transfer, verification, and persistence to simplify testing.
- Lightweight descriptor model (fast to parse, low metadata overhead).

### 24.4 Improvements Already Incorporated (vs Initial Concept)
- Added explicit end-game duplicate request strategy.
- Defined structured session state (inFlightChunks, retry counters) enabling adaptive logic.
- Included bandwidth + RTT metrics for smarter peer scoring.
- Clarified NAT traversal optional paths (UPnP/STUN/TURN).
- Provided standardized error handling scenarios (hash mismatch, disk full, partition).
- Future-aligned Merkle optionality (not an afterthought).
- Backpressure design (in-flight per-peer limits) to avoid overload.
- Persistence layout finalized (descriptors/temp/complete/state separation).

### 24.5 Gaps Remaining (Actionable)
1. Incentives / Fairness:
   - Add upload credit accounting and reciprocal bandwidth weighting.
2. Privacy / Anonymity:
   - Introduce optional onion-style relay or pluggable mixnet adapter.
3. Access Control:
   - Implement shared secret or per-file public key signature + encrypted chunk payloads.
4. Multi-File / Collections:
   - Bundle multiple descriptors under a collection manifest (toward DAG-lite).
5. Browser & Mobile Reach:
   - WebRTC transport bridge + service worker caching path.
6. Reputation & Trust:
   - Persist peer reliability scores (hash fail rate, responsiveness).
7. Adaptive Chunk Sizing (Dynamic):
   - Real-time adjustment based on throughput and latency variance.
8. Streaming / Preview Mode:
   - Prioritize sequential early chunks + partial hash verification window.
9. Compression / Content Negotiation:
   - Heuristic: skip compression for already compressed MIME types; negotiate dictionary reuse.
10. Observability Enhancements:
    - Expose Prometheus / OpenTelemetry endpoints; structured logging correlation IDs.

### 24.6 Prioritized Roadmap (Suggested Order)
1. Observability + reputation foundation (metrics we already collect → scoring).
2. Incentive layer (lightweight reciprocal bandwidth weighting).
3. Encrypted access-controlled sharing (file key distribution mechanism).
4. Streaming/preview scheduling mode.
5. WebRTC transport module (broadens peer surface).
6. Adaptive chunk sizing (driven by collected metrics).
7. Collection manifests / mini-DAG.
8. Optional anonymity overlay adapter.
9. Compression negotiation & advanced pipeline optimizations.

### 24.7 Success Metrics For Upcoming Improvements
- Incentives: Reduction in pure leech peers (%) and increase in average reciprocal upload/download ratio.
- Reputation: Drop in integrityFailures from malicious peers after scoring deployment.
- Streaming Mode: Time-to-first-playable-chunk (p95).
- WebRTC Module: Additional reachable peers behind symmetric NAT (% increase).
- Adaptive Chunking: Throughput variance reduction and improved average throughput (% gain vs static).
- Access Control: Zero unauthorized descriptor decrypt attempts (audit log).

### 24.8 Narrative Summary
Our design positions itself between high-performance swarm protocols (BitTorrent) and generalized content graphs (IPFS) by emphasizing modularity, integrity rigor, and instrumentation without inheriting full complexity or legacy constraints. The next evolutionary leap requires layering incentives, privacy options, and richer addressing while preserving the lean transfer core.

End of document.
