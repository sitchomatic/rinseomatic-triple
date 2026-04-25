// Export test results in CSV or JSON format

export function resultsToCSV(results, testRun) {
  if (!results || results.length === 0) return '';

  const headers = ['Username', 'Site', 'Status', 'Attempts', 'Final URL', 'Success Marker', 'Elapsed (ms)'];
  const rows = results.map(r => [
    r.username,
    r.site_key,
    r.status,
    r.attempts || 0,
    r.final_url || '',
    r.success_marker_found ? 'Yes' : 'No',
    r.elapsed_ms || 0,
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

  return csv;
}

export function resultsToJSON(results, testRun) {
  return JSON.stringify({
    run: {
      id: testRun?.id,
      label: testRun?.label,
      site_key: testRun?.site_key,
      status: testRun?.status,
      created_date: testRun?.created_date,
      elapsed_ms: testRun?.elapsed_ms,
      total_count: testRun?.total_count,
      working_count: testRun?.working_count,
      failed_count: testRun?.failed_count,
      error_count: testRun?.error_count,
    },
    results: results.map(r => ({
      id: r.id,
      username: r.username,
      site_key: r.site_key,
      status: r.status,
      attempts: r.attempts,
      final_url: r.final_url,
      success_marker_found: r.success_marker_found,
      elapsed_ms: r.elapsed_ms,
      error_message: r.error_message,
    })),
  }, null, 2);
}

export function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}