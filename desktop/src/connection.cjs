// Browser script; no Electron or Node APIs are exposed to either renderer.
if (location.hash === '#local-test') {
  document.getElementById('retry').href = 'http://localhost:3003/offline?path=%2Fdashboard';
}
