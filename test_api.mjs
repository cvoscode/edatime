import fs from 'fs';

(async () => {
  try {
    const res = await fetch('http://127.0.0.1:3000/api/metadata');
    const meta = await res.json();
    console.log("Metadata:", JSON.stringify(meta, null, 2));
    
    // Now let's fetch a chunk of data
    const query = {
      start_ms: 0,
      end_ms: 4000000000000,
      max_points: 10,
      columns: ["HUFL"]
    };
    const dataRes = await fetch('http://127.0.0.1:3000/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query)
    });
    const data = await dataRes.arrayBuffer();
    console.log("Query returned bytes:", data.byteLength);
  } catch(e) {
    console.error(e);
  }
})();
