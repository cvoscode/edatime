export function generateSinusoidalCsv(): string {
  const rows = ['timestamp,temperature,humidity,pressure'];
  const start = new Date('2024-01-01T00:00:00Z').getTime();
  const end = new Date('2024-01-08T00:00:00Z').getTime();
  const interval = 15 * 60 * 1000;
  for (let t = start; t < end; t += interval) {
    const temp = 20 + 5 * Math.sin((t - start) / (3600 * 1000)) + (Math.random() - 0.5) * 0.5;
    const hum = 50 + 20 * Math.sin((t - start) / (7200 * 1000)) + (Math.random() - 0.5) * 2;
    const pres = 1013 + 5 * Math.sin((t - start) / (5400 * 1000)) + (Math.random() - 0.5) * 0.3;
    rows.push(`${new Date(t).toISOString()},${temp.toFixed(3)},${hum.toFixed(3)},${pres.toFixed(3)}`);
  }
  return rows.join('\n');
}

export function generateWeatherCsv(): string {
  const rows = ['timestamp,temperature,humidity,pressure,wind_speed'];
  const start = new Date('2024-03-01T00:00:00Z').getTime();
  const end = new Date('2024-03-08T00:00:00Z').getTime();
  const interval = 10 * 60 * 1000;
  for (let t = start; t < end; t += interval) {
    const hour = new Date(t).getUTCHours();
    const dayFactor = Math.sin((t - start) / (86400 * 1000));
    const temp = 15 + 8 * dayFactor + 3 * Math.sin(hour * Math.PI / 12) + (Math.random() - 0.5) * 0.5;
    const hum = 60 + 15 * Math.cos((t - start) / (43200 * 1000)) + (Math.random() - 0.5) * 3;
    const pres = 1010 + 8 * dayFactor + (Math.random() - 0.5) * 0.5;
    const wind = 5 + 3 * Math.abs(Math.sin((t - start) / (21600 * 1000))) + (Math.random() - 0.5) * 1;
    rows.push(`${new Date(t).toISOString()},${temp.toFixed(3)},${hum.toFixed(3)},${pres.toFixed(3)},${wind.toFixed(3)}`);
  }
  return rows.join('\n');
}

export function createFileFromCsv(csvContent: string, filename: string): File {
  return new File([csvContent], filename, { type: 'text/csv' });
}