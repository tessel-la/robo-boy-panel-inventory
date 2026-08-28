# Robo-Boy Panel Inventory

This repository is the discoverable catalog of independently maintained Robo-Boy panels. It intentionally does
not contain panel source or compiled bundles.

## Structure

```text
catalog.json                         Ordered list of inventory entries
panels/<reverse-domain-id>.json      Repository, release, compatibility, and capability metadata
schema/panel-entry.schema.json       Machine-readable entry schema
scripts/validate.mjs                 Dependency-free CI validation
```

Run `npm run validate` before opening a change.

## Register a panel

1. Maintain the panel in its own repository.
2. Publish an immutable release containing `roboboy.panel.json` and its ESM bundle.
3. Compute the exact bundle's SHA-256 SRI value (`sha256-<base64 digest>`) and add it to the distribution metadata.
4. Add one file under `panels/` using the panel's stable reverse-domain ID.
5. Add that file to `catalog.json` and run validation.

An inventory entry is not installed code. Robo-Boy deployments or a future installer consume its release URLs,
copy the selected artifact into a versioned path in the deployment's same-origin `panels/` area, verify its
integrity and compatibility, and update the deployment-local `installed.json` registry. This separation lets the
catalog scale without becoming a monorepo and lets removal/update policy remain deployment-owned.

The optional `icon` and `preview` fields may reference HTTPS assets. Authors should keep release URLs immutable;
SHA-256 integrity is required, while publisher signatures, transactional staging/rollback, revocation, and an
inventory review policy remain prerequisites for automated one-click installation.

This directory is the proposed standalone inventory structure used by the current vertical slice. Example release
URLs are publication targets and may not exist until the example repositories are published.
