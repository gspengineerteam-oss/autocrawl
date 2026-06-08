/**
 * Minimal ambient typings for `d3-geo-projection`. The official package
 * does not ship types and there is no `@types/d3-geo-projection` on
 * npm. We re-export `GeoProjection` from `d3-geo` and declare the
 * subset of factory functions Atlas uses (Robinson, Natural Earth,
 * Winkel Tripel are all in scope for v2).
 */
declare module 'd3-geo-projection' {
  import { GeoProjection } from 'd3-geo'
  export function geoRobinson(): GeoProjection
  export function geoNaturalEarth1(): GeoProjection
  export function geoNaturalEarth2(): GeoProjection
  export function geoWinkel3(): GeoProjection
  export function geoEckert4(): GeoProjection
  export function geoMollweide(): GeoProjection
  export function geoBaker(): GeoProjection
}
