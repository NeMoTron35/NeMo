# Changelog

Notable changes are recorded using [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions and semantic versioning. Entries describe code state, not proof of a published release.

## [Unreleased]

### Added

- GitHub CI, security checks, dependency updates, issue/PR templates and contributor policies.
- Repository hygiene checks, first-party browser auth and privacy-preserving local error reporting.

### Changed

- Dependency audit now matches advisory ranges against exact locked versions; high/critical advisories reduced to zero via fixed releases, a first-party `bigint-buffer` replacement and removal of unused UI/database packages.
- Shared hooks, contexts and launch-draft helpers moved out of component modules so fast refresh rules pass without warnings.

- Direct first-party Vite/TanStack/Nitro configuration and public-registry dependency resolutions.
- Repository documentation, licensing-status guidance and repeatable release checklist.

## [0.1.0] - 2026-10-10

Baseline version marker for the existing implementation; not a claim that a release was deployed.

### Added

- Classic desktop workspace with operation and public market/vault surfaces.
- Seven-stage DBC planning, reviewed signing, reference identity/proof tools and real local PQ workbench.
- First-party 27-topic help catalog and versioned 20-section technical white paper with print export.

### Known limitations

- Live launch deployment, unattended signer and deployed PQ vault verifier are not provided.
- WOTS leaf coordination and public service history are not globally durable.