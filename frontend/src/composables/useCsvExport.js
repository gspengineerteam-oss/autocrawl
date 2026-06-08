function escape(value) {
    if (value == null)
        return '';
    const s = Array.isArray(value) ? value.join('|') : String(value);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}
export function exportCsv(filename, items, columns) {
    const headers = columns.map((c) => c.label).join(',');
    const rows = items
        .map((row) => columns
        .map((c) => {
        const value = typeof c.key === 'function' ? c.key(row) : row[c.key];
        return escape(value);
    })
        .join(','))
        .join('\n');
    const csv = `${headers}\n${rows}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
