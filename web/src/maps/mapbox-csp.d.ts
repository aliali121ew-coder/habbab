// The CSP build of Mapbox GL has the same API as the main entry.
declare module 'mapbox-gl/dist/mapbox-gl-csp.js' {
  import mapboxgl from 'mapbox-gl';
  export default mapboxgl;
}
