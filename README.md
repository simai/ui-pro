# SIMAI Pro

Advanced Smart components built on the free [SIMAI Framework](https://ui.simai.io/)
(`simai/ui-source`, Apache-2.0). They are shared by several SIMAI products;
`simai/ui-admin` (an admin interface) is the reference application that shows
them working.

| Element | What it is |
|:---|:---|
| `sf-view-table` | a data table: columns, sorting, selection, row actions |
| `sf-view` | a table with its toolbar, filters, paging and bulk actions |
| `sf-view-properties` | a record view and editor over typed fields |
| `sf-admin-menu` | an admin navigation rail and menu with counters |

The source, tests and build notes are in [`components/`](components/README.md).
The components are published as the component package `pro`; each release
is built over one pinned Framework release and attached, with its sha256 and
receipt, to a release `pro-<12>` of this repository (and, until 2027-01-01,
the same bytes as `larena-<12>` to a release of `simai/larena-ui`, under the
package's former name). Which package goes with which Framework release:
`https://github.com/simai/ui-pro/releases/download/package-index/releases.json`.

Documentation (Russian) is in the «Pro» section of https://ui.simai.io/.

## Licence

Free for small businesses (PolyForm Small Business 1.0.0) and for
non-commercial use (PolyForm Noncommercial 1.0.0); everyone else needs the
SIMAI Commercial License, available on request from SIMAI. Use as part of
Larena is covered by Larena's licence. See [LICENSE.md](LICENSE.md).
