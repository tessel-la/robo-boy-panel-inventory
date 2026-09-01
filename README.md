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
   Copy the manifest's capabilities and least-privilege `permissions` into the inventory entry; `ros` and `network`
   capabilities require their corresponding explicit permission block.
4. Add one file under `panels/` using the panel's stable reverse-domain ID.
5. Add that file to `catalog.json` and run validation.

An inventory entry is not installed code. Robo-Boy deployments or a future installer consume its release URLs,
copy the selected artifact into a versioned path in the deployment's same-origin `panels/` area, verify its
integrity and compatibility, and update the deployment-local `installed.json` registry. This separation lets the
catalog scale without becoming a monorepo and lets removal/update policy remain deployment-owned.

Organizations may host a private inventory using the same schema and combine it with the official inventory in
deployment configuration. Private source code never needs to enter Robo-Boy or this public catalog: only the
organization's authenticated inventory and immutable release service need to be reachable by the deployment
installer. Panel IDs should use a reverse-domain namespace controlled by the organization. Duplicate IDs across
configured inventories are rejected instead of allowing a private entry to override an official release.

The optional `icon` and `preview` fields may reference HTTPS assets. Authors should keep release URLs immutable;
SHA-256 integrity is required, while publisher signatures, transactional staging/rollback, revocation, and an
inventory review policy remain prerequisites for automated one-click installation.

The official inventory is consumed directly by Robo-Boy's remote panel installer. Catalog entries must be merged
only after their release URLs are anonymously reachable and their recorded integrity matches the exact published
bundle bytes.
