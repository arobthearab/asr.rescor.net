# Encryption at Rest — Operational Guide

**Date:** 2026-03-21
**Platform:** ASR (asr.rescor.net)
**Database:** Neo4j 5.15 Community Edition, Docker-hosted on Linux

---

## Current State

- Neo4j Community Edition does **not** support Transparent Data Encryption (TDE).
- All graph data, transaction logs, and indexes are stored as plain files inside the Docker volume on the host filesystem.
- Database backups (`neo4j-admin dump`) produce unencrypted archive files.
- Without host-level encryption, any user or process with read access to the volume can inspect raw data.

---

## Recommended Approach: LUKS Volume Encryption

LUKS (Linux Unified Key Setup) encrypts the block device beneath the filesystem. Neo4j reads and writes normally; the kernel encrypts/decrypts transparently.

### Prerequisites

- Linux host with `dm-crypt` and `cryptsetup` (standard on Ubuntu/RHEL).
- An unused block device or partition (e.g., `/dev/sdX`) sized for the Neo4j data directory.
- Root or sudo access on the host.

### Setup Steps

```bash
# 1. Format the partition with LUKS (destroys existing data)
sudo cryptsetup luksFormat /dev/sdX

# 2. Open the encrypted volume
sudo cryptsetup open /dev/sdX neo4j-data

# 3. Create a filesystem on the mapped device
sudo mkfs.ext4 /dev/mapper/neo4j-data

# 4. Mount
sudo mkdir -p /opt/neo4j/data
sudo mount /dev/mapper/neo4j-data /opt/neo4j/data
```

5. **Update the Docker container** to bind-mount the encrypted path:

```yaml
volumes:
  - /opt/neo4j/data:/data
```

6. **Configure auto-unlock** for headless servers (do NOT rely on interactive passphrase):

```bash
# Generate a keyfile
sudo dd if=/dev/urandom of=/root/.luks-keyfile bs=4096 count=1
sudo chmod 0400 /root/.luks-keyfile

# Add the keyfile to the LUKS slot
sudo cryptsetup luksAddKey /dev/sdX /root/.luks-keyfile

# Add entry to /etc/crypttab for boot-time unlock
echo "neo4j-data /dev/sdX /root/.luks-keyfile luks" | sudo tee -a /etc/crypttab

# Add entry to /etc/fstab for auto-mount
echo "/dev/mapper/neo4j-data /opt/neo4j/data ext4 defaults 0 2" | sudo tee -a /etc/fstab
```

### Backup Encryption

Encrypt backups independently so they remain protected off-host.

```bash
# Pipe dump directly through GPG (no plaintext intermediate file)
docker exec asr-neo4j neo4j-admin database dump neo4j --to-stdout \
  | gpg --encrypt --recipient ops@rescor.net \
  > /backups/asr-$(date +%F).dump.gpg

# Restore: decrypt then load
gpg --decrypt /backups/asr-2026-03-21.dump.gpg \
  | docker exec -i asr-neo4j neo4j-admin database load neo4j --from-stdin --overwrite-destination
```

Alternative: store backups in an S3 bucket with SSE-KMS enabled.

### Verification

```bash
# Confirm LUKS device is active and using AES
sudo cryptsetup status neo4j-data

# Show filesystem layout (TYPE should be "crypto_LUKS" on the partition)
lsblk -f /dev/sdX

# Functional test: write a node, stop Neo4j, attempt to read raw volume
#   1. Create a node with a known string via Cypher
#   2. docker stop asr-neo4j
#   3. sudo strings /dev/sdX | grep "<known string>"  -> should return nothing
#   4. docker start asr-neo4j
```

---

## Neo4j Enterprise Alternative

Neo4j Enterprise Edition supports native TDE. If the platform migrates to Enterprise:

1. Set in `neo4j.conf`:
   ```properties
   dbms.security.encryption_at_rest.enabled=true
   dbms.security.encryption_at_rest.key_file=/path/to/keystore
   ```
2. LUKS becomes optional (but still recommended for defense-in-depth).
3. Enterprise TDE encrypts individual store files; LUKS encrypts the entire block device including temp files and swap.

---

## Compliance Notes

- **FERPA, HIPAA, GLBA** do not universally mandate encryption at rest. Each requires a documented risk analysis to determine necessity. EAR is a safeguard, not a blanket requirement.
- **Single-tenant fleet isolation**: EAR provides defense-in-depth against physical host access or stolen disks. Recommended when each tenant has a dedicated database instance.
- **Multi-tenant shared database**: EAR protects against host-level compromise but does **not** replace application-layer tenant isolation (IDOR prevention, tenant-scoped queries). Both layers are complementary.
- **Recommendation**: Enable LUKS on all production hosts. The performance overhead on modern hardware with AES-NI is negligible (typically under 2%).

---

## References

- [cryptsetup manual](https://man7.org/linux/man-pages/man8/cryptsetup.8.html)
- [Neo4j Backup and Restore](https://neo4j.com/docs/operations-manual/current/backup-restore/)
- [NIST SP 800-111 — Guide to Storage Encryption](https://csrc.nist.gov/publications/detail/sp/800-111/final)
